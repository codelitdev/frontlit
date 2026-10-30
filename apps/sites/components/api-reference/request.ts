import type { ApiPlaygroundAuth, ApiPlaygroundModel } from "@frontlit/api-contract";

/** What the reader typed into the playground. */
export interface PlaygroundInput {
  serverIndex: number;
  serverVariables: Record<string, string>;
  parameters: Record<string, string>;
  /** Raw body for JSON and text bodies. */
  body: string;
  /** Text values of form fields. */
  fields: Record<string, string>;
  files: Record<string, File | null>;
  /** Index into `model.auth`. */
  authOption: number;
  /** Credentials by scheme key: `value`, or `username`/`password` for basic. */
  credentials: Record<string, { value?: string; username?: string; password?: string }>;
}

export interface BuiltRequest {
  url: string;
  init: RequestInit;
  /** Header names sent, for explaining CORS failures. */
  headerNames: string[];
}

export function resolveServer(
  url: string,
  variables: { name: string; default: string }[],
  values: Record<string, string>,
) {
  return url
    .replace(/\{([^}]+)\}/g, (match, name: string) => {
      const variable = variables.find((v) => v.name === name);
      return values[name]?.trim() || variable?.default || match;
    })
    .replace(/\/+$/, "");
}

const paramKey = (location: string, name: string) => `${location}:${name}`;
export { paramKey };

/** Required values that are still empty, as readable labels. */
export type PlaygroundSection = { id: string; label: string; editable?: boolean };

/** The form's collapsible sections, in order. The request panel renders the
 * same list before the form loads, so nothing shifts when it mounts. */
export function playgroundSections(model: ApiPlaygroundModel): PlaygroundSection[] {
  const server = model.servers[0];
  return [
    ...(server
      ? [
          {
            id: "server",
            label: "Server",
            editable: model.servers.length > 1 || server.variables.length > 0,
          },
        ]
      : []),
    ...(model.auth.length ? [{ id: "auth", label: "Authentication" }] : []),
    ...(["path", "query", "header"] as const)
      .filter((location) => model.parameters.some((p) => p.in === location))
      .map((location) => ({
        id: location,
        label: `${location[0].toUpperCase()}${location.slice(1)} parameters`,
      })),
    ...(model.body ? [{ id: "body", label: "Body" }] : []),
  ];
}

/** Sections holding a required input that is still empty. */
export function sectionsWithMissing(model: ApiPlaygroundModel, input: PlaygroundInput) {
  const ids = new Set(
    model.parameters
      .filter((p) => p.required && !input.parameters[paramKey(p.in, p.name)]?.trim())
      .map((p) => p.in as string),
  );
  if (model.body?.required) {
    const empty =
      model.body.kind === "json" || model.body.kind === "text"
        ? !input.body.trim()
        : model.body.fields.some(
            (field) =>
              field.required &&
              !(field.binary
                ? input.files[field.name]
                : input.fields[field.name]?.trim()),
          );
    if (empty) ids.add("body");
  }
  return ids;
}

export function missingInputs(model: ApiPlaygroundModel, input: PlaygroundInput) {
  const missing = model.parameters
    .filter((p) => p.required && !input.parameters[paramKey(p.in, p.name)]?.trim())
    .map((p) => p.name);
  if (model.body?.required && model.body.kind !== "json" && model.body.kind !== "text")
    for (const field of model.body.fields)
      if (
        field.required &&
        !(field.binary ? input.files[field.name] : input.fields[field.name]?.trim())
      )
        missing.push(field.name);
  if (
    model.body?.required &&
    (model.body.kind === "json" || model.body.kind === "text")
  )
    if (!input.body.trim()) missing.push("request body");
  return missing;
}

function applyAuth(
  schemes: ApiPlaygroundAuth[],
  input: PlaygroundInput,
  headers: Headers,
  query: URLSearchParams,
) {
  for (const scheme of schemes) {
    const credential = input.credentials[scheme.key] ?? {};
    if (scheme.kind === "apiKey" && credential.value) {
      if (scheme.in === "query") query.set(scheme.name, credential.value);
      else headers.set(scheme.name, credential.value);
    } else if (scheme.kind === "bearer" && credential.value)
      headers.set("Authorization", `Bearer ${credential.value}`);
    else if (scheme.kind === "basic" && (credential.username || credential.password))
      headers.set(
        "Authorization",
        `Basic ${btoa(`${credential.username ?? ""}:${credential.password ?? ""}`)}`,
      );
  }
}

/** The fetch call for the reader's input. Credentials never leave the browser
 * except to the API itself; `credentials: "omit"` keeps the reader's own
 * cookies for that API out of it. */
export function buildRequest(
  model: ApiPlaygroundModel,
  input: PlaygroundInput,
): BuiltRequest {
  const server = model.servers[input.serverIndex] ?? model.servers[0];
  const base = resolveServer(server.url, server.variables, input.serverVariables);
  let path = model.path;
  const query = new URLSearchParams();
  const headers = new Headers();
  for (const parameter of model.parameters) {
    const value = input.parameters[paramKey(parameter.in, parameter.name)]?.trim();
    if (!value) continue;
    if (parameter.in === "path")
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    else if (parameter.in === "query") query.append(parameter.name, value);
    else if (parameter.in === "header") headers.set(parameter.name, value);
  }
  applyAuth(model.auth[input.authOption] ?? [], input, headers, query);
  let body: BodyInit | undefined;
  const kind = model.body?.kind;
  if (kind === "json" || kind === "text") {
    if (input.body.trim()) {
      body = input.body;
      headers.set("Content-Type", model.body!.mediaType);
    }
  } else if (kind === "multipart") {
    const form = new FormData();
    for (const field of model.body!.fields) {
      const file = input.files[field.name];
      if (field.binary && file) form.append(field.name, file);
      else if (!field.binary && input.fields[field.name]?.trim())
        form.append(field.name, input.fields[field.name]);
    }
    body = form;
  } else if (kind === "form") {
    const form = new URLSearchParams();
    for (const field of model.body!.fields)
      if (input.fields[field.name]?.trim())
        form.append(field.name, input.fields[field.name]);
    body = form;
  }
  const search = query.toString();
  return {
    url: `${base}${path}${search ? `?${search}` : ""}`,
    init: {
      method: model.method.toUpperCase(),
      headers,
      body,
      credentials: "omit",
      redirect: "follow",
    },
    headerNames: [...headers.keys()],
  };
}

export interface PlaygroundResult {
  status: number;
  statusText: string;
  durationMs: number;
  headers: [string, string][];
  contentType: string;
  /** Present for text responses; binary ones only report their size. */
  text?: string;
  size: number;
}

export async function sendRequest(request: BuiltRequest): Promise<PlaygroundResult> {
  const started = performance.now();
  const response = await fetch(request.url, request.init);
  const contentType = response.headers.get("content-type") ?? "";
  const textual =
    !contentType ||
    /json|text|xml|javascript|html|x-www-form-urlencoded/i.test(contentType);
  const blob = await response.blob();
  let text: string | undefined;
  if (textual) {
    text = await blob.text();
    if (/json/i.test(contentType))
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Not valid JSON after all; show it as sent.
      }
  }
  return {
    status: response.status,
    statusText: response.statusText,
    durationMs: Math.round(performance.now() - started),
    headers: [...response.headers.entries()],
    contentType,
    text,
    size: blob.size,
  };
}

/** Why a request failed before reaching the API. */
export function explainFailure(
  request: BuiltRequest,
  origin: string,
  pageProtocol: string,
) {
  if (pageProtocol === "https:" && request.url.startsWith("http://"))
    return "The browser blocked this request because the API uses http:// and this page uses https://. Choose an https:// server.";
  const custom = request.headerNames.filter(
    (name) => !["accept", "content-type"].includes(name.toLowerCase()),
  );
  return `The request didn't reach the API. Most likely the API doesn't allow requests from ${origin} (CORS)${
    custom.length ? ` or the headers ${custom.join(", ")}` : ""
  }. The API's owner can allow them; meanwhile, use the code samples from your own machine.`;
}
