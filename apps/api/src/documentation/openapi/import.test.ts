import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openApiDocument } from "../../openapi";
import { importOpenApiSpec } from "./import";
import { OpenApiImportError } from "./parse";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

function errorsOf(text: string, file = "openapi.yaml") {
  try {
    importOpenApiSpec({ text, file, mount: "api-reference" });
  } catch (error) {
    if (error instanceof OpenApiImportError) return error.diagnostics;
    throw error;
  }
  return [];
}

describe("importOpenApiSpec", () => {
  it("imports MediaLit's committed spec", () => {
    const result = importOpenApiSpec({
      text: fixture("medialit.json"),
      file: "apps/api/src/swagger_output.json",
      mount: "api",
    });
    expect(result.info.title).toBeTruthy();
    expect(result.operations).toHaveLength(11);
    const routes = result.operations.map((o) => o.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((r) => r.startsWith("api/"))).toBe(true);

    const upload = result.operations.find(
      (o) => o.slice.requestBody?.content[0]?.contentType === "multipart/form-data",
    )!;
    expect(upload.slice.playground.body?.kind).toBe("multipart");
    expect(upload.slice.playground.body?.fields.some((f) => f.binary)).toBe(true);
    expect(upload.slice.codeSamples.map((s) => s.label)).toEqual([
      "cURL",
      "JavaScript",
      "Python",
    ]);
    expect(upload.slice.codeSamples[0].source).toContain("https://api.medialit.cloud");

    // Public endpoints (`security: []`) need no auth; signatureAuth is a header key.
    expect(result.operations.some((o) => o.slice.playground.auth.length === 0)).toBe(
      true,
    );
    const withSignature = result.operations.find((o) =>
      o.slice.playground.auth.some((alt) => alt.some((s) => s.key === "signatureAuth")),
    )!;
    expect(
      withSignature.slice.playground.auth.flat().find((s) => s.key === "signatureAuth"),
    ).toMatchObject({ kind: "apiKey", in: "header", name: "x-medialit-signature" });
    expect(result.operations.at(-1)?.group).toBe("Other");
  });

  it("imports SendLit's spec with readable routes from summaries", () => {
    const result = importOpenApiSpec({
      text: fixture("sendlit.json"),
      file: "openapi.json",
      mount: "api-reference",
    });
    expect(result.operations).toHaveLength(137);
    expect(result.operations.map((o) => o.route)).toContain(
      "api-reference/remove-a-tag-from-a-contact",
    );
    const op = result.operations.find(
      (o) => o.route === "api-reference/remove-a-tag-from-a-contact",
    )!;
    expect(op.method).toBe("delete");
    expect(op.slice.playground.servers[0].url).toBe("{protocol}://{host}");
    expect(op.slice.playground.auth).toEqual([
      [{ kind: "apiKey", key: "apiKeyAuth", in: "header", name: "x-sendlit-apikey" }],
      [{ kind: "bearer", key: "bearerAuth" }],
    ]);
    expect(op.slice.codeSamples[0].source).toContain(
      "https://api.sendlit.app/contacts/{contactId}/tags/{tag}",
    );
    expect(op.chunks[0].content).toMatch(
      /^DELETE \/contacts\/\{contactId\}\/tags\/\{tag\}/,
    );
    // Groups follow the spec's tag order.
    expect(result.operations[0].group).toBe("Contacts");
    expect(
      result.warnings.filter((w) => w.code !== "OPENAPI_DESCRIPTION_TEXT"),
    ).toEqual([]);
  });

  it("imports FrontLit's own generated spec", () => {
    const result = importOpenApiSpec({
      text: JSON.stringify(openApiDocument),
      file: "openapi.json",
      mount: "api-reference",
    });
    expect(result.operations.length).toBeGreaterThan(20);
  });

  it("keeps property order and serves the spec without hidden operations", () => {
    const text = `openapi: 3.1.0
info: { title: Demo, version: "1" }
servers: [{ url: https://api.example.com }]
paths:
  /things:
    post:
      summary: Create a thing
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Thing" }
      responses:
        "201": { description: Created }
    get:
      summary: List things
      x-internal: true
      responses: { "200": { description: OK } }
components:
  schemas:
    Thing:
      type: object
      properties:
        zeta: { type: string }
        alpha: { type: integer }
        child: { $ref: "#/components/schemas/Thing" }
`;
    const result = importOpenApiSpec({ text, file: "openapi.yaml", mount: "api" });
    expect(result.operations.map((o) => o.title)).toEqual(["Create a thing"]);
    const schema = result.operations[0].slice.schemas["#/components/schemas/Thing"];
    expect(Object.keys(schema.properties as object)).toEqual([
      "zeta",
      "alpha",
      "child",
    ]);
    expect(result.operations[0].slice.requestBody?.content[0].example).toContain(
      '"zeta"',
    );
    const served = JSON.parse(result.spec);
    expect(served.paths["/things"].get).toBeUndefined();
    expect(served.paths["/things"].post).toBeDefined();
  });

  it("reports blocking problems with locations", () => {
    expect(errorsOf(`swagger: "2.0"\ninfo: { title: Old }\n`)[0]).toMatchObject({
      code: "OPENAPI_UNSUPPORTED",
      fieldPath: "/swagger",
      line: 1,
    });
    const external = errorsOf(`openapi: 3.0.3
info: { title: Demo, version: "1" }
paths:
  /a:
    get:
      responses:
        "200":
          $ref: "./responses.yaml#/ok"
`);
    expect(external[0]).toMatchObject({
      code: "OPENAPI_UNSUPPORTED",
      fieldPath: "/paths/~1a/get/responses/200/$ref",
      line: 8,
    });
    const duplicates = errorsOf(`openapi: 3.0.3
info: { title: Demo, version: "1" }
paths:
  /a:
    get: { operationId: same, responses: {} }
  /b:
    get: { operationId: same, responses: {} }
`);
    expect(duplicates.map((d) => d.code)).toContain("OPENAPI_DUPLICATE_OPERATION");
    expect(
      errorsOf(`openapi: 3.0.3\ninfo: { title: x }\na: &a [1]\nb: *a\n`)[0].code,
    ).toBe("OPENAPI_PARSE");
  });

  it("warns when there is no absolute server and disables Try it", () => {
    const result = importOpenApiSpec({
      text: `openapi: 3.0.3
info: { title: Demo, version: "1" }
servers: [{ url: /v1 }]
paths:
  /a: { get: { summary: A, responses: { "200": { description: OK } } } }
`,
      file: "openapi.yaml",
      mount: "api",
    });
    expect(result.warnings.map((w) => w.code)).toContain("OPENAPI_NO_SERVER");
    expect(result.operations[0].slice.playground.unavailable).toBeTruthy();
    expect(result.operations[0].slice.codeSamples[0].source).toContain("{baseUrl}/a");
  });
});
