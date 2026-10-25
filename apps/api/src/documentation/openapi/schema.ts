/** Internal `$ref` handling and example generation for OpenAPI 3.0/3.1. */

type Json = any;

export function resolvePointer(root: Json, ref: string): Json {
  if (!ref.startsWith("#")) return undefined;
  let node = root;
  for (const raw of ref.slice(1).split("/").slice(1)) {
    const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

/** Follows `$ref` chains of non-schema objects (parameters, bodies, responses). */
export function deref(root: Json, value: Json, depth = 0): Json {
  if (
    value &&
    typeof value === "object" &&
    typeof value.$ref === "string" &&
    depth < 20
  )
    return deref(root, resolvePointer(root, value.$ref), depth + 1);
  return value;
}

/** Every `#/components/schemas/*` the value references, transitively. */
export function collectSchemaRefs(
  root: Json,
  value: Json,
  into = new Map<string, Json>(),
) {
  const visit = (node: Json) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (
      typeof node.$ref === "string" &&
      node.$ref.startsWith("#/components/schemas/")
    ) {
      if (into.has(node.$ref)) return;
      const target = resolvePointer(root, node.$ref);
      into.set(node.$ref, target ?? {});
      visit(target);
    }
    for (const [key, child] of Object.entries(node)) if (key !== "$ref") visit(child);
  };
  visit(value);
  return into;
}

const typeOf = (schema: Json): string | undefined => {
  const type = schema?.type;
  if (Array.isArray(type)) return type.find((t: string) => t !== "null") ?? type[0];
  return type;
};

function stringExample(format: string | undefined) {
  switch (format) {
    case "date-time":
      return "2026-01-01T00:00:00Z";
    case "date":
      return "2026-01-01";
    case "email":
      return "user@example.com";
    case "uri":
    case "url":
      return "https://example.com";
    case "uuid":
      return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    case "binary":
      return "<file>";
    default:
      return "string";
  }
}

/** A plausible example value for a schema: the spec's own example, default,
 * const or first enum value when present, else built from the types. */
export function sampleSchema(
  root: Json,
  schema: Json,
  options: { direction: "request" | "response" },
  seen: string[] = [],
): Json {
  if (!schema || typeof schema !== "object" || seen.length > 8) return null;
  if (typeof schema.$ref === "string") {
    if (seen.includes(schema.$ref)) return null;
    return sampleSchema(root, resolvePointer(root, schema.$ref), options, [
      ...seen,
      schema.$ref,
    ]);
  }
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length)
    return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((part: Json) =>
      sampleSchema(root, part, options, seen),
    );
    return parts.every(
      (part: Json) => part && typeof part === "object" && !Array.isArray(part),
    )
      ? Object.assign({}, ...parts)
      : (parts[0] ?? null);
  }
  for (const key of ["oneOf", "anyOf"])
    if (Array.isArray(schema[key]) && schema[key].length)
      return sampleSchema(root, schema[key][0], options, seen);
  const type = typeOf(schema) ?? (schema.properties ? "object" : undefined);
  switch (type) {
    case "object": {
      const result: Record<string, Json> = {};
      for (const [name, property] of Object.entries<Json>(schema.properties ?? {})) {
        const resolved = property?.$ref
          ? resolvePointer(root, property.$ref)
          : property;
        if (options.direction === "request" && resolved?.readOnly) continue;
        if (options.direction === "response" && resolved?.writeOnly) continue;
        result[name] = sampleSchema(root, property, options, seen);
      }
      return result;
    }
    case "array":
      return schema.items ? [sampleSchema(root, schema.items, options, seen)] : [];
    case "string":
      return stringExample(schema.format);
    case "integer":
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : 0;
    case "boolean":
      return true;
    default:
      return null;
  }
}

/** The media type's own example if it has one, else one generated from its schema. */
export function mediaExample(
  root: Json,
  media: Json,
  direction: "request" | "response",
): Json {
  if (media?.example !== undefined) return media.example;
  const first = media?.examples && Object.values<Json>(media.examples)[0];
  const value = deref(root, first);
  if (value?.value !== undefined) return value.value;
  return media?.schema ? sampleSchema(root, media.schema, { direction }) : undefined;
}

/** Top-level properties of an object schema, following `$ref` and `allOf`. */
export function objectProperties(
  root: Json,
  schema: Json,
  seen: string[] = [],
): { properties: Record<string, Json>; required: string[] } {
  if (!schema || typeof schema !== "object" || seen.length > 8)
    return { properties: {}, required: [] };
  if (typeof schema.$ref === "string") {
    if (seen.includes(schema.$ref)) return { properties: {}, required: [] };
    return objectProperties(root, resolvePointer(root, schema.$ref), [
      ...seen,
      schema.$ref,
    ]);
  }
  const result = {
    properties: { ...(schema.properties ?? {}) } as Record<string, Json>,
    required: [...(Array.isArray(schema.required) ? schema.required : [])] as string[],
  };
  for (const part of Array.isArray(schema.allOf) ? schema.allOf : []) {
    const merged = objectProperties(root, part, seen);
    Object.assign(result.properties, merged.properties);
    result.required.push(...merged.required);
  }
  return result;
}

export function isBinarySchema(root: Json, schema: Json): boolean {
  const resolved = schema?.$ref ? resolvePointer(root, schema.$ref) : schema;
  if (!resolved) return false;
  if (resolved.format === "binary" || resolved.format === "base64") return true;
  if (resolved.contentMediaType || resolved.contentEncoding) return true;
  return typeOf(resolved) === "array" && isBinarySchema(root, resolved.items);
}

export function enumValues(root: Json, schema: Json): string[] | undefined {
  const resolved = schema?.$ref ? resolvePointer(root, schema.$ref) : schema;
  return Array.isArray(resolved?.enum) ? resolved.enum.map(String) : undefined;
}
