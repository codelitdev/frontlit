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

  return [
    { label: "cURL", lang: "shell", source: curl.join(" \\\n") },
    { label: "JavaScript", lang: "javascript", source: javascript },
    { label: "Python", lang: "python", source: python },
  ];
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
