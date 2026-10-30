import { createHash } from "node:crypto";
import {
  diagnostic,
  parseDocsMarkdown,
  type DocsDiagnostic,
} from "@frontlit/text-editor/docs";
import type {
  ApiCodeSample,
  ApiMediaContent,
  ApiOperationSlice,
  ApiParameter,
  ApiParameterLocation,
  ApiPlaygroundAuth,
  ApiPlaygroundField,
  ApiPlaygroundModel,
  ApiReferenceInfo,
  ApiResponse,
  ApiRichText,
  ApiSecurityScheme,
  ApiServer,
} from "@frontlit/api-contract";
import {
  locateDiagnostics,
  OPENAPI_LIMITS,
  OpenApiImportError,
  parseSpecText,
  pointer,
} from "./parse";
import {
  collectSchemaRefs,
  deref,
  enumValues,
  isBinarySchema,
  mediaExample,
  objectProperties,
  resolvePointer,
} from "./schema";
import { generateCodeSamples, resolveServerUrl } from "./samples";

type Json = any;
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

export interface ApiChunk {
  heading: string | null;
  anchor: string | null;
  content: string;
}
export interface ImportedOperation {
  route: string;
  title: string;
  group: string;
  order: number;
  method: string;
  path: string;
  deprecated: boolean;
  slice: ApiOperationSlice;
  chunks: ApiChunk[];
}
export interface ImportedSpec {
  info: ApiReferenceInfo;
  operations: ImportedOperation[];
  /** The served `/openapi.json`: the committed spec as JSON, hidden operations removed. */
  spec: string;
  specHash: string;
  warnings: DocsDiagnostic[];
}

export function slugify(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function normalizeApiMount(value: string | undefined | null) {
  return slugify(value ?? "") || "api-reference";
}

const isHidden = (operation: Json) =>
  operation?.["x-internal"] === true || operation?.["x-excluded"] === true;

const isObject = (value: unknown): value is Record<string, Json> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function richText(
  markdown: unknown,
  file: string,
  warnings: DocsDiagnostic[],
  at: string,
) {
  const source = text(markdown);
  if (!source) return undefined;
  try {
    const { content } = parseDocsMarkdown(source, { file, frontmatter: false });
    return { kind: "doc", content } as ApiRichText;
  } catch {
    warnings.push({
      ...diagnostic(
        "OPENAPI_DESCRIPTION_TEXT",
        "This description uses Markdown or HTML that docs don't support, so it is shown as plain text.",
        { file, fieldPath: at },
      ),
      severity: "warning",
      blocksSave: false,
      blocksPublish: false,
    });
    return { kind: "text", text: source } as ApiRichText;
  }
}

function plainText(rich: ApiRichText | undefined): string {
  if (!rich) return "";
  if (rich.kind === "text") return rich.text;
  const parts: string[] = [];
  const walk = (node: Json) => {
    if (typeof node?.text === "string") parts.push(node.text);
    for (const child of node?.content ?? []) walk(child);
    if (["paragraph", "heading", "listItem", "codeBlock"].includes(node?.type))
      parts.push("\n");
  };
  walk(rich.content);
  return parts
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function safeUrl(value: unknown) {
  return typeof value === "string" && /^(https?:|mailto:|\/|\{)/i.test(value.trim())
    ? value.trim()
    : undefined;
}

function servers(list: unknown): ApiServer[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((server: Json) => {
    const url = safeUrl(server?.url);
    if (!url) return [];
    return [
      {
        url,
        description: text(server.description) || undefined,
        variables: Object.entries<Json>(
          isObject(server.variables) ? server.variables : {},
        ).map(([name, variable]) => ({
          name,
          default: String(variable?.default ?? ""),
          enum: Array.isArray(variable?.enum) ? variable.enum.map(String) : undefined,
          description: text(variable?.description) || undefined,
        })),
      },
    ];
  });
}

function securitySchemes(root: Json): ApiSecurityScheme[] {
  return Object.entries<Json>(root.components?.securitySchemes ?? {}).flatMap(
    ([key, raw]) => {
      const scheme = deref(root, raw);
      if (!isObject(scheme) || typeof scheme.type !== "string") return [];
      return [
        {
          key,
          type: scheme.type,
          in: scheme.in,
          name: typeof scheme.name === "string" ? scheme.name : undefined,
          scheme:
            typeof scheme.scheme === "string" ? scheme.scheme.toLowerCase() : undefined,
          bearerFormat: text(scheme.bearerFormat) || undefined,
          description: text(scheme.description) || undefined,
        } as ApiSecurityScheme,
      ];
    },
  );
}

function playgroundAuth(
  scheme: ApiSecurityScheme | undefined,
  key: string,
): ApiPlaygroundAuth {
  if (!scheme) return { kind: "unsupported", key, reason: "Unknown security scheme." };
  if (scheme.type === "apiKey") {
    if (scheme.in === "header" || scheme.in === "query")
      return { kind: "apiKey", key, in: scheme.in, name: scheme.name ?? key };
    return {
      kind: "unsupported",
      key,
      reason:
        "Browsers can't set cookies for another site, so this key can't be sent from here.",
    };
  }
  if (scheme.type === "http" && scheme.scheme === "bearer")
    return { kind: "bearer", key };
  if (scheme.type === "http" && scheme.scheme === "basic")
    return { kind: "basic", key };
  if (scheme.type === "oauth2" || scheme.type === "openIdConnect")
    return { kind: "bearer", key };
  return {
    kind: "unsupported",
    key,
    reason: "This authentication type isn't supported here.",
  };
}

const prettyExample = (value: unknown, contentType: string) => {
  if (value === undefined) return undefined;
  if (typeof value === "string" && !/json/i.test(contentType)) return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
};

function mediaContents(root: Json, content: Json, direction: "request" | "response") {
  return Object.entries<Json>(isObject(content) ? content : {}).map(
    ([contentType, media]): ApiMediaContent => ({
      contentType,
      schema: isObject(media?.schema) ? media.schema : undefined,
      example: prettyExample(mediaExample(root, media, direction), contentType),
    }),
  );
}

function bodyKind(mediaType: string): "json" | "multipart" | "form" | "text" {
  if (/json/i.test(mediaType)) return "json";
  if (/multipart\/form-data/i.test(mediaType)) return "multipart";
  if (/x-www-form-urlencoded/i.test(mediaType)) return "form";
  return "text";
}

const exampleString = (value: unknown) =>
  value === undefined || value === null
    ? undefined
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

function chunksFor(operation: ApiOperationSlice, root: Json): ApiChunk[] {
  const header = `${operation.method.toUpperCase()} ${operation.path} — ${operation.title} (${operation.group})`;
  const schemaLines = (schema: Json) => {
    const { properties, required } = objectProperties(root, schema);
    return Object.entries<Json>(properties).map(([name, property]) => {
      const resolved = property?.$ref ? resolvePointer(root, property.$ref) : property;
      const type = Array.isArray(resolved?.type)
        ? resolved.type.join(" | ")
        : (resolved?.type ?? (resolved?.$ref ? "object" : "any"));
      const flags = required.includes(name) ? ", required" : "";
      const description = text(resolved?.description);
      return `${name} (${type}${flags})${description ? `: ${description}` : ""}`;
    });
  };
  const auth = operation.security?.length
    ? `Authentication: ${operation.security
        .map((requirement) =>
          requirement
            .map((key) => {
              const scheme = operation.securitySchemes.find((s) => s.key === key);
              if (!scheme) return key;
              if (scheme.type === "apiKey")
                return `API key in ${scheme.in} "${scheme.name}"`;
              if (scheme.type === "http") return `HTTP ${scheme.scheme}`;
              return scheme.type;
            })
            .join(" and "),
        )
        .join(" or ")}.`
    : "Authentication: none.";
  const chunks: ApiChunk[] = [
    {
      heading: operation.title,
      anchor: null,
      content: [header, plainText(operation.description), auth]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  if (operation.parameters.length)
    chunks.push({
      heading: "Parameters",
      anchor: "parameters",
      content: [
        header,
        ...operation.parameters.map(
          (p) =>
            `${p.name} (${p.in}${p.required ? ", required" : ""})${p.description ? `: ${p.description}` : ""}`,
        ),
      ].join("\n"),
    });
  if (operation.requestBody)
    chunks.push({
      heading: "Request body",
      anchor: "request-body",
      content: [
        header,
        operation.requestBody.description ?? "",
        ...operation.requestBody.content.flatMap((c) => [
          `Content type: ${c.contentType}`,
          ...schemaLines(c.schema),
        ]),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  for (const response of operation.responses)
    chunks.push({
      heading: `Response ${response.status}`,
      anchor: `response-${response.status.toLowerCase()}`,
      content: [
        header,
        `Response ${response.status}${response.description ? `: ${response.description}` : ""}`,
        ...response.content.flatMap((c) => schemaLines(c.schema)),
      ].join("\n"),
    });
  return chunks;
}

/** Walks every `$ref` with its JSON pointer. */
function eachRef(value: Json, visit: (ref: string, at: (string | number)[]) => void) {
  const walk = (node: Json, at: (string | number)[]) => {
    if (Array.isArray(node)) return node.forEach((child, i) => walk(child, [...at, i]));
    if (!isObject(node)) return;
    if (typeof node.$ref === "string") visit(node.$ref, [...at, "$ref"]);
    for (const [key, child] of Object.entries(node)) walk(child, [...at, key]);
  };
  walk(value, []);
}

/** Imports one single-file OpenAPI 3.0/3.1 spec into operation pages. Throws
 * `OpenApiImportError` with every blocking problem found. */
export function importOpenApiSpec(input: {
  text: string;
  file: string;
  mount: string;
}): ImportedSpec {
  const { file } = input;
  const mount = normalizeApiMount(input.mount);
  const fail = (items: DocsDiagnostic[]): never => {
    throw new OpenApiImportError(locateDiagnostics(input.text, items));
  };
  if (Buffer.byteLength(input.text) > OPENAPI_LIMITS.bytes)
    fail([diagnostic("OPENAPI_LIMIT", "The spec is larger than 5 MiB.", { file })]);
  const root = parseSpecText(input.text, file) as Json;
  if (!isObject(root))
    fail([
      diagnostic("OPENAPI_INVALID", "The spec must be a JSON or YAML object.", {
        file,
      }),
    ]);
  if (typeof root.swagger === "string")
    fail([
      diagnostic(
        "OPENAPI_UNSUPPORTED",
        "OpenAPI 2.0 (Swagger) isn't supported. Convert the spec to OpenAPI 3.0 or 3.1.",
        { file, fieldPath: "/swagger" },
      ),
    ]);
  const errors: DocsDiagnostic[] = [];
  const warnings: DocsDiagnostic[] = [];
  if (typeof root.openapi !== "string" || !/^3\.[01]\./.test(root.openapi))
    errors.push(
      diagnostic(
        "OPENAPI_UNSUPPORTED",
        "Only OpenAPI 3.0 and 3.1 specs are supported (the `openapi` field).",
        { file, fieldPath: "/openapi" },
      ),
    );
  if (!text(root.info?.title))
    errors.push(
      diagnostic("OPENAPI_INVALID", "`info.title` is required.", {
        file,
        fieldPath: "/info/title",
      }),
    );
  if (root.paths !== undefined && !isObject(root.paths))
    errors.push(
      diagnostic("OPENAPI_INVALID", "`paths` must be an object.", {
        file,
        fieldPath: "/paths",
      }),
    );
  eachRef(root, (ref, at) => {
    if (!ref.startsWith("#"))
      errors.push(
        diagnostic(
          "OPENAPI_UNSUPPORTED",
          "References to other files aren't supported. Bundle the spec into a single file.",
          { file, fieldPath: pointer(at) },
        ),
      );
    else if (resolvePointer(root, ref) === undefined)
      errors.push(
        diagnostic(
          "OPENAPI_INVALID",
          `\`${ref}\` doesn't point to anything in the spec.`,
          {
            file,
            fieldPath: pointer(at),
          },
        ),
      );
  });
  if (errors.length) fail(errors);

  const schemes = securitySchemes(root);
  const rootServers = servers(root.servers);
  const tagOrder = (Array.isArray(root.tags) ? root.tags : [])
    .map((tag: Json) => text(tag?.name))
    .filter(Boolean) as string[];
  const served = structuredClone(root);
  const operations: ImportedOperation[] = [];
  const operationIds = new Map<string, string>();
  const routes = new Map<string, string>();

  for (const [path, rawItem] of Object.entries<Json>(
    isObject(root.paths) ? root.paths : {},
  )) {
    const item = deref(root, rawItem);
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      const at = ["paths", path, method];
      if (isHidden(operation)) {
        const servedItem = served.paths?.[path];
        delete servedItem?.[method];
        if (isObject(servedItem) && ![...METHODS, "$ref"].some((k) => k in servedItem))
          delete served.paths[path];
        continue;
      }
      const operationId = text(operation.operationId) || undefined;
      if (operationId) {
        const previous = operationIds.get(operationId);
        if (previous)
          errors.push(
            diagnostic(
              "OPENAPI_DUPLICATE_OPERATION",
              `\`operationId\` "${operationId}" is used twice (also at ${previous}).`,
              { file, fieldPath: pointer([...at, "operationId"]) },
            ),
          );
        operationIds.set(operationId, pointer(at));
      }
      const summary = text(operation.summary);
      const title = summary || `${method.toUpperCase()} ${path}`;
      const slug =
        slugify(operationId ?? "") || slugify(summary) || slugify(`${method} ${path}`);
      const route = `${mount}/${slug}`;
      const clash = routes.get(route);
      if (clash)
        errors.push(
          diagnostic(
            "ROUTE_COLLISION",
            `Two operations would be published at /docs/${route} (also ${clash}). Give one a distinct \`operationId\` or summary.`,
            { file, fieldPath: pointer(at), route: `/docs/${route}` },
          ),
        );
      routes.set(route, pointer(at));
      const group =
        text(Array.isArray(operation.tags) ? operation.tags[0] : "") || "Other";

      const merged = new Map<string, Json>();
      for (const list of [item.parameters, operation.parameters])
        for (const raw of Array.isArray(list) ? list : []) {
          const parameter = deref(root, raw);
          if (isObject(parameter) && typeof parameter.name === "string")
            merged.set(`${parameter.in}:${parameter.name}`, parameter);
        }
      const parameters: ApiParameter[] = [...merged.values()].map((p) => ({
        name: p.name,
        in: p.in as ApiParameterLocation,
        required: p.in === "path" ? true : p.required === true,
        deprecated: p.deprecated === true,
        description: text(p.description) || undefined,
        schema: isObject(p.schema)
          ? p.schema
          : isObject(p.content)
            ? (Object.values<Json>(p.content)[0]?.schema ?? undefined)
            : undefined,
      }));
      const requestBodyRaw = deref(root, operation.requestBody);
      const requestBody = isObject(requestBodyRaw)
        ? {
            required: requestBodyRaw.required === true,
            description: text(requestBodyRaw.description) || undefined,
            content: mediaContents(root, requestBodyRaw.content, "request"),
          }
        : undefined;
      const responses: ApiResponse[] = Object.entries<Json>(
        isObject(operation.responses) ? operation.responses : {},
      ).map(([status, raw]) => {
        const response = deref(root, raw);
        return {
          status,
          description: text(response?.description) || undefined,
          content: mediaContents(root, response?.content, "response"),
        };
      });
      // No `security` on the operation or the root: the spec doesn't say,
      // which is not the same as `security: []` (no authentication).
      const authDescribed =
        Array.isArray(operation.security) || Array.isArray(root.security);
      const security = (
        Array.isArray(operation.security)
          ? operation.security
          : Array.isArray(root.security)
            ? root.security
            : []
      )
        .filter(isObject)
        .map((requirement: Json) => Object.keys(requirement));
      // `{}` inside the list means "or no auth at all".
      const optionalAuth = security.some(
        (requirement: string[]) => !requirement.length,
      );
      const requirements = optionalAuth ? [] : security;
      const usedSchemes = schemes.filter((s) =>
        requirements.some((requirement: string[]) => requirement.includes(s.key)),
      );
      const operationServers = servers(operation.servers).length
        ? servers(operation.servers)
        : servers(item.servers).length
          ? servers(item.servers)
          : rootServers;
      const schemas = Object.fromEntries(
        collectSchemaRefs(root, [parameters, requestBody, responses]),
      );

      const firstBody = requestBody?.content[0];
      const bodyFields: ApiPlaygroundField[] = [];
      if (firstBody && bodyKind(firstBody.contentType) !== "json") {
        const { properties, required } = objectProperties(root, firstBody.schema);
        for (const [name, property] of Object.entries<Json>(properties)) {
          const resolved = property?.$ref
            ? resolvePointer(root, property.$ref)
            : property;
          bodyFields.push({
            name,
            required: required.includes(name),
            binary: isBinarySchema(root, property),
            description: text(resolved?.description) || undefined,
            enum: enumValues(root, property),
            example: exampleString(resolved?.example ?? resolved?.default),
          });
        }
      }
      const absolute = operationServers.filter((s) =>
        /^https?:\/\//i.test(resolveServerUrl(s.url, s.variables)),
      );
      const playground: ApiPlaygroundModel = {
        method,
        path,
        servers: absolute,
        unavailable: absolute.length
          ? undefined
          : "This API's spec has no absolute server URL, so requests can't be sent from the docs.",
        parameters: parameters
          .filter((p) => p.in !== "cookie")
          .map((p) => {
            const resolved = p.schema?.$ref
              ? resolvePointer(root, p.schema.$ref as string)
              : p.schema;
            return {
              name: p.name,
              in: p.in,
              required: p.required,
              binary: false,
              description: p.description,
              enum: enumValues(root, p.schema),
              example: exampleString(
                merged.get(`${p.in}:${p.name}`)?.example ??
                  resolved?.example ??
                  resolved?.default,
              ),
            };
          }),
        body: firstBody
          ? {
              mediaType: firstBody.contentType,
              kind: bodyKind(firstBody.contentType),
              required: requestBody!.required,
              example: firstBody.example,
              fields: bodyFields,
            }
          : undefined,
        auth: requirements.map((requirement: string[]) =>
          requirement.map((key) =>
            playgroundAuth(
              schemes.find((s) => s.key === key),
              key,
            ),
          ),
        ),
      };
      const customSamples: ApiCodeSample[] = (
        operation["x-codeSamples"] ??
        operation["x-code-samples"] ??
        []
      )
        .filter((s: Json) => isObject(s) && typeof s.source === "string")
        .map((s: Json) => ({
          label: text(s.label) || text(s.lang) || "Example",
          lang: text(s.lang).toLowerCase() || "text",
          source: s.source,
        }));
      const slice: ApiOperationSlice = {
        method,
        path,
        operationId,
        title,
        description: richText(
          operation.description,
          file,
          warnings,
          pointer([...at, "description"]),
        ),
        group,
        deprecated: operation.deprecated === true,
        parameters,
        requestBody,
        responses,
        security: authDescribed ? requirements : null,
        securitySchemes: usedSchemes,
        servers: operationServers,
        schemas,
        codeSamples: [...generateCodeSamples(playground), ...customSamples],
        playground,
      };
      operations.push({
        route,
        title,
        group,
        order: operations.length,
        method,
        path,
        deprecated: slice.deprecated,
        slice,
        chunks: chunksFor(slice, root),
      });
    }
  }
  if (operations.length > OPENAPI_LIMITS.operations)
    errors.push(
      diagnostic(
        "OPENAPI_LIMIT",
        `The spec has ${operations.length} operations; at most ${OPENAPI_LIMITS.operations} are supported.`,
        { file },
      ),
    );
  if (errors.length) fail(errors);
  if (!operations.length)
    warnings.push({
      ...diagnostic("OPENAPI_EMPTY", "The spec has no public operations to publish.", {
        file,
      }),
      severity: "warning",
      blocksSave: false,
      blocksPublish: false,
    });
  if (
    !rootServers.some((s) => /^https?:\/\//i.test(resolveServerUrl(s.url, s.variables)))
  )
    warnings.push({
      ...diagnostic(
        "OPENAPI_NO_SERVER",
        "The spec has no absolute server URL (like https://api.example.com), so “Try it” is turned off and code samples use {baseUrl}.",
        { file, fieldPath: "/servers" },
      ),
      severity: "warning",
      blocksSave: false,
      blocksPublish: false,
    });

  // Groups follow the spec's `tags` order, then first appearance; "Other" last.
  const groupRank = (group: string) => {
    const index = tagOrder.indexOf(group);
    if (index !== -1) return index;
    if (group === "Other") return Number.MAX_SAFE_INTEGER;
    return tagOrder.length + operations.findIndex((o) => o.group === group);
  };
  operations.sort(
    (a, b) => groupRank(a.group) - groupRank(b.group) || a.order - b.order,
  );
  operations.forEach((operation, index) => (operation.order = index));

  const spec = JSON.stringify(served, null, 2);
  return {
    info: {
      title: text(root.info.title),
      version: text(root.info.version),
      description: richText(root.info.description, file, warnings, "/info/description"),
      servers: rootServers,
      securitySchemes: schemes,
    },
    operations,
    spec,
    specHash: createHash("sha256").update(spec).digest("hex"),
    warnings: locateDiagnostics(input.text, warnings),
  };
}
