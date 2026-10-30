import type {
  ApiCodeSample,
  ApiPlaygroundAuth,
  ApiPlaygroundModel,
} from "@frontlit/api-contract";

/** Base URL for samples: the first server with variable defaults filled in. */
export function sampleBaseUrl(model: ApiPlaygroundModel) {
  const server = model.servers[0];
  if (!server || !/^https?:\/\//i.test(resolveServerUrl(server.url, server.variables)))
    return "{baseUrl}";
  return resolveServerUrl(server.url, server.variables).replace(/\/+$/, "");
}

export function resolveServerUrl(
  url: string,
  variables: { name: string; default: string }[],
  values: Record<string, string> = {},
) {
  return url.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const variable = variables.find((v) => v.name === name);
    return values[name] ?? variable?.default ?? match;
  });
}

function authHeaders(auth: ApiPlaygroundAuth[]) {
  const headers: [string, string][] = [];
  const query: [string, string][] = [];
  for (const scheme of auth) {
    if (scheme.kind === "bearer") headers.push(["Authorization", "Bearer $API_TOKEN"]);
    else if (scheme.kind === "basic")
      headers.push(["Authorization", "Basic $BASE64_CREDENTIALS"]);
    else if (scheme.kind === "apiKey") {
      const placeholder = `$${scheme.name.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
      (scheme.in === "query" ? query : headers).push([scheme.name, placeholder]);
    }
  }
  return { headers, query };
}

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/** curl, JavaScript and Python samples for the operation's first auth option. */
export function generateCodeSamples(model: ApiPlaygroundModel): ApiCodeSample[] {
  const auth = authHeaders(model.auth[0] ?? []);
  const required = model.parameters.filter((p) => p.required || p.in === "path");
  const query = [
    ...required
      .filter((p) => p.in === "query")
      .map((p) => [p.name, p.example ?? `{${p.name}}`] as [string, string]),
    ...auth.query,
  ];
  const headers = [
    ...required
      .filter((p) => p.in === "header")
      .map((p) => [p.name, p.example ?? `{${p.name}}`] as [string, string]),
    ...auth.headers,
  ];
  const search = query.length
    ? `?${query.map(([k, v]) => `${encodeURIComponent(k)}=${v}`).join("&")}`
    : "";
  const url = `${sampleBaseUrl(model)}${model.path}${search}`;
  const method = model.method.toUpperCase();
  const body = model.body;
  const json = body?.kind === "json" && body.example ? body.example : undefined;
  if (json) headers.push(["Content-Type", body!.mediaType]);
  const formFields =
    body && (body.kind === "multipart" || body.kind === "form")
      ? body.fields.filter((f) => f.required).length
        ? body.fields.filter((f) => f.required)
        : body.fields.slice(0, 3)
      : [];

  const curl = [`curl -X ${method} ${quote(url)}`];
  for (const [name, value] of headers) curl.push(`  -H ${quote(`${name}: ${value}`)}`);
  if (json) curl.push(`  -d ${quote(json)}`);
  for (const field of formFields)
    curl.push(
      body!.kind === "multipart"
        ? `  -F ${quote(`${field.name}=${field.binary ? "@file" : (field.example ?? "value")}`)}`
        : `  --data-urlencode ${quote(`${field.name}=${field.example ?? "value"}`)}`,
    );

  const jsHeaders = headers.length
    ? `  headers: {\n${headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}\n  },\n`
    : "";
  let jsBody = "";
  let jsPrelude = "";
  if (json) jsBody = `  body: JSON.stringify(${json.replace(/\n/g, "\n  ")}),\n`;
  else if (formFields.length && body!.kind === "multipart") {
    jsPrelude = `const form = new FormData();\n${formFields
      .map((f) =>
        f.binary
          ? `form.append(${JSON.stringify(f.name)}, file);`
          : `form.append(${JSON.stringify(f.name)}, ${JSON.stringify(f.example ?? "value")});`,
      )
      .join("\n")}\n\n`;
    jsBody = "  body: form,\n";
  } else if (formFields.length) {
    jsBody = `  body: new URLSearchParams(${JSON.stringify(
      Object.fromEntries(formFields.map((f) => [f.name, f.example ?? "value"])),
    )}),\n`;
  }
  const javascript = `${jsPrelude}const response = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(method)},\n${jsHeaders}${jsBody}});\nconst data = await response.json();`;

  const pyHeaders = headers.length
    ? `    headers={\n${headers.map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}\n    },\n`
    : "";
  let pyBody = "";
  if (json) pyBody = `    json=${toPython(json)},\n`;
  else if (formFields.length) {
    const plain = formFields.filter((f) => !f.binary);
    const files = formFields.filter((f) => f.binary);
    if (plain.length)
      pyBody += `    data={${plain.map((f) => `${JSON.stringify(f.name)}: ${JSON.stringify(f.example ?? "value")}`).join(", ")}},\n`;
    if (files.length)
      pyBody += `    files={${files.map((f) => `${JSON.stringify(f.name)}: open("file", "rb")`).join(", ")}},\n`;
  }
  const python = `import requests\n\nresponse = requests.request(\n    ${JSON.stringify(method)},\n    ${JSON.stringify(url)},\n${pyHeaders}${pyBody})\ndata = response.json()`;

  const sample = { method, url, headers, json, formFields, kind: body?.kind };
  return [
    { label: "cURL", lang: "shell", source: curl.join(" \\\n") },
    { label: "JavaScript", lang: "javascript", source: javascript },
    { label: "Python", lang: "python", source: python },
    { label: "Go", lang: "go", source: goSample(sample) },
    { label: "Java", lang: "java", source: javaSample(sample) },
    { label: "C#", lang: "csharp", source: csharpSample(sample) },
  ];
}

type FormField = { name: string; binary?: boolean; example?: string };
type Sample = {
  method: string;
  url: string;
  headers: [string, string][];
  json?: string;
  formFields: FormField[];
  kind?: string;
};

const str = (value: string) => JSON.stringify(value);
const fieldValue = (field: FormField) => field.example ?? "value";

/** Go with net/http only. */
function goSample({ method, url, headers, json, formFields, kind }: Sample) {
  const imports = new Set(["fmt", "io", "net/http"]);
  const setup: string[] = [];
  let bodyArg = "nil";
  let contentType: string | null = null;
  if (json) {
    imports.add("strings");
    setup.push(
      json.includes("`")
        ? `body := strings.NewReader(${str(json)})`
        : `body := strings.NewReader(\`${json}\`)`,
    );
    bodyArg = "body";
  } else if (formFields.length && kind === "multipart") {
    ["bytes", "mime/multipart", "os"].forEach((i) => imports.add(i));
    setup.push("var body bytes.Buffer", "form := multipart.NewWriter(&body)");
    let files = 0;
    for (const field of formFields) {
      // Unique names so several file fields still compile.
      const n = field.binary ? (++files > 1 ? String(files) : "") : "";
      setup.push(
        field.binary
          ? `file${n}, _ := os.Open("file")\ndefer file${n}.Close()\npart${n}, _ := form.CreateFormFile(${str(field.name)}, "file")\nio.Copy(part${n}, file${n})`
          : `form.WriteField(${str(field.name)}, ${str(fieldValue(field))})`,
      );
    }
    setup.push("form.Close()");
    bodyArg = "&body";
    contentType = "form.FormDataContentType()";
  } else if (formFields.length) {
    ["net/url", "strings"].forEach((i) => imports.add(i));
    setup.push(
      `body := strings.NewReader(url.Values{${formFields
        .map((f) => `${str(f.name)}: {${str(fieldValue(f))}}`)
        .join(", ")}}.Encode())`,
    );
    bodyArg = "body";
    contentType = str("application/x-www-form-urlencoded");
  }
  const lines = [
    "package main",
    "",
    `import (\n${[...imports]
      .sort()
      .map((i) => `\t${str(i)}`)
      .join("\n")}\n)`,
    "",
    "func main() {",
    ...setup.flatMap((line) => line.split("\n")).map((line) => `\t${line}`),
    `\treq, _ := http.NewRequest(${str(method)}, ${str(url)}, ${bodyArg})`,
    ...headers.map(([k, v]) => `\treq.Header.Set(${str(k)}, ${str(v)})`),
    ...(contentType ? [`\treq.Header.Set("Content-Type", ${contentType})`] : []),
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer res.Body.Close()",
    "\tdata, _ := io.ReadAll(res.Body)",
    "\tfmt.Println(string(data))",
    "}",
  ];
  return lines.join("\n");
}

/** Java 11+ with java.net.http only. */
function javaSample({ method, url, headers, json, formFields, kind }: Sample) {
  let publisher = "HttpRequest.BodyPublishers.noBody()";
  const notes: string[] = [];
  const extraHeaders: [string, string][] = [];
  if (json) {
    // A text block keeps the JSON readable; backslashes stay literal.
    publisher = `HttpRequest.BodyPublishers.ofString("""\n${json.replace(/\\/g, "\\\\")}\n""")`;
  } else if (formFields.length && kind === "multipart") {
    notes.push(
      "// multipart/form-data: build the body with a library such as OkHttp,",
      `// with the fields ${formFields.map((f) => f.name).join(", ")}.`,
    );
  } else if (formFields.length) {
    publisher = `HttpRequest.BodyPublishers.ofString(${str(
      formFields
        .map(
          (f) => `${encodeURIComponent(f.name)}=${encodeURIComponent(fieldValue(f))}`,
        )
        .join("&"),
    )})`;
    extraHeaders.push(["Content-Type", "application/x-www-form-urlencoded"]);
  }
  return [
    "import java.net.URI;",
    "import java.net.http.HttpClient;",
    "import java.net.http.HttpRequest;",
    "import java.net.http.HttpResponse;",
    "",
    ...notes,
    "HttpRequest request = HttpRequest.newBuilder()",
    `    .uri(URI.create(${str(url)}))`,
    ...[...headers, ...extraHeaders].map(
      ([k, v]) => `    .header(${str(k)}, ${str(v)})`,
    ),
    `    .method(${str(method)}, ${publisher})`,
    "    .build();",
    "HttpResponse<String> response = HttpClient.newHttpClient()",
    "    .send(request, HttpResponse.BodyHandlers.ofString());",
    "System.out.println(response.body());",
  ].join("\n");
}

/** C# with System.Net.Http only. */
function csharpSample({ method, url, headers, json, formFields, kind }: Sample) {
  const verb = method.charAt(0) + method.slice(1).toLowerCase();
  const known = ["Get", "Post", "Put", "Patch", "Delete", "Head", "Options"];
  const lines = [
    "using var client = new HttpClient();",
    `var request = new HttpRequestMessage(${
      known.includes(verb) ? `HttpMethod.${verb}` : `new HttpMethod(${str(method)})`
    }, ${str(url)});`,
    // Content-Type belongs to the content in .NET, not the request headers.
    ...headers
      .filter(([k]) => k.toLowerCase() !== "content-type")
      .map(([k, v]) => `request.Headers.Add(${str(k)}, ${str(v)});`),
  ];
  if (json)
    lines.push(
      `request.Content = new StringContent("""\n${json}\n""", System.Text.Encoding.UTF8, "application/json");`,
    );
  else if (formFields.length && kind === "multipart") {
    lines.push("var form = new MultipartFormDataContent();");
    for (const field of formFields)
      lines.push(
        field.binary
          ? `form.Add(new StreamContent(File.OpenRead("file")), ${str(field.name)}, "file");`
          : `form.Add(new StringContent(${str(fieldValue(field))}), ${str(field.name)});`,
      );
    lines.push("request.Content = form;");
  } else if (formFields.length)
    lines.push(
      `request.Content = new FormUrlEncodedContent(new Dictionary<string, string>\n{\n${formFields
        .map((f) => `    [${str(f.name)}] = ${str(fieldValue(f))},`)
        .join("\n")}\n});`,
    );
  lines.push(
    "var response = await client.SendAsync(request);",
    "Console.WriteLine(await response.Content.ReadAsStringAsync());",
  );
  return lines.join("\n");
}

function toPython(json: string) {
  const literal = (value: unknown, indent: string): string => {
    if (value === null) return "None";
    if (value === true) return "True";
    if (value === false) return "False";
    if (typeof value !== "object") return JSON.stringify(value);
    const inner = `${indent}    `;
    if (Array.isArray(value))
      return value.length
        ? `[\n${value.map((v) => `${inner}${literal(v, inner)},`).join("\n")}\n${indent}]`
        : "[]";
    const entries = Object.entries(value);
    return entries.length
      ? `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${literal(v, inner)},`).join("\n")}\n${indent}}`
      : "{}";
  };
  try {
    return literal(JSON.parse(json), "    ");
  } catch {
    return json;
  }
}
