import type { ApiSchema } from "@frontlit/api-contract";
import type { ThemeStyle } from "@frontlit/page-builder/models";
import {
  Badge,
  Caption,
  Collapsible,
  InlineCode,
  Text2,
} from "@frontlit/page-builder/primitives/server";

type Schemas = Record<string, ApiSchema>;
type Json = any;

const MAX_ENUM = 20;
const OPEN_DEPTH = 2;
const MAX_DEPTH = 8;

const refName = (ref: string) => ref.split("/").pop() ?? ref;

function resolve(schemas: Schemas, schema: Json): { schema: Json; ref?: string } {
  if (schema && typeof schema.$ref === "string")
    return { schema: schemas[schema.$ref] ?? {}, ref: schema.$ref };
  return { schema: schema ?? {} };
}

/** `object`, `string (email)`, `array<Contact>`, `string | null`, ... */
export function typeLabel(schemas: Schemas, raw: Json): string {
  const { schema, ref } = resolve(schemas, raw);
  if (ref && (schema.type === "object" || schema.properties || schema.allOf))
    return refName(ref);
  let type = Array.isArray(schema.type)
    ? schema.type.join(" | ")
    : (schema.type as string | undefined);
  if (!type) {
    if (schema.properties || schema.allOf) type = "object";
    else if (schema.oneOf || schema.anyOf) type = "one of";
    else if (schema.enum) type = typeof schema.enum[0];
    else type = "any";
  }
  if (type === "array" && schema.items)
    type = `array<${typeLabel(schemas, schema.items)}>`;
  if (schema.format) type += ` (${schema.format})`;
  if (schema.nullable === true) type += " | null";
  return type;
}

/** Properties of an object schema, merging `allOf`. */
function objectFields(schemas: Schemas, raw: Json, seen: string[] = []) {
  const { schema, ref } = resolve(schemas, raw);
  if (ref && seen.includes(ref)) return { properties: {}, required: [] as string[] };
  const next = ref ? [...seen, ref] : seen;
  const properties: Record<string, Json> = { ...(schema.properties ?? {}) };
  const required: string[] = Array.isArray(schema.required) ? [...schema.required] : [];
  for (const part of Array.isArray(schema.allOf) ? schema.allOf : []) {
    const merged = objectFields(schemas, part, next);
    Object.assign(properties, merged.properties);
    required.push(...merged.required);
  }
  return { properties, required };
}

/** The schema nested under a field, if it has fields of its own. */
function childOf(schemas: Schemas, raw: Json): Json | null {
  const { schema } = resolve(schemas, raw);
  if (schema.properties || schema.allOf) return raw;
  if (schema.items) {
    const item = resolve(schemas, schema.items).schema;
    if (item.properties || item.allOf || item.oneOf || item.anyOf) return schema.items;
  }
  if (schema.oneOf || schema.anyOf) return raw;
  return null;
}

function Field({
  name,
  raw,
  required,
  schemas,
  theme,
  depth,
  seen,
}: {
  name: string;
  raw: Json;
  required: boolean;
  schemas: Schemas;
  theme: ThemeStyle;
  depth: number;
  seen: string[];
}) {
  const { schema, ref } = resolve(schemas, raw);
  const recursive = !!ref && seen.includes(ref);
  const enumValues: unknown[] | undefined = Array.isArray(schema.enum)
    ? schema.enum
    : undefined;
  const header = (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <InlineCode theme={theme}>{name}</InlineCode>
      <InlineCode theme={theme} variant="muted">
        {typeLabel(schemas, raw)}
      </InlineCode>
      {required ? (
        <Badge theme={theme} variant="outline">
          required
        </Badge>
      ) : null}
      {schema.deprecated ? (
        <Badge theme={theme} variant="destructive">
          deprecated
        </Badge>
      ) : null}
    </span>
  );
  const details = (
    <>
      {schema.description ? (
        <Text2 theme={theme} className="text-muted-foreground">
          {String(schema.description)}
        </Text2>
      ) : null}
      {enumValues ? (
        <Caption theme={theme} className="block leading-5">
          One of:{" "}
          {enumValues.slice(0, MAX_ENUM).map((value, index) => (
            <span key={index}>
              {index ? ", " : ""}
              <InlineCode theme={theme}>{JSON.stringify(value)}</InlineCode>
            </span>
          ))}
          {enumValues.length > MAX_ENUM
            ? ` and ${enumValues.length - MAX_ENUM} more`
            : ""}
        </Caption>
      ) : null}
      {schema.default !== undefined ? (
        <Caption theme={theme} className="block leading-5">
          Default:{" "}
          <InlineCode theme={theme}>{JSON.stringify(schema.default)}</InlineCode>
        </Caption>
      ) : null}
      {recursive ? (
        <Caption theme={theme} className="block leading-5">
          Same structure as {refName(ref!)} above.
        </Caption>
      ) : null}
    </>
  );
  const child = recursive || depth >= MAX_DEPTH ? null : childOf(schemas, raw);
  return (
    <li className="flex min-w-0 flex-col gap-1 border-b border-border py-2 last:border-b-0">
      {header}
      {details}
      {child ? (
        <Collapsible
          theme={theme}
          variant="plain"
          defaultOpen={depth + 1 < OPEN_DEPTH}
          summary={<Caption theme={theme}>Show fields</Caption>}
        >
          <SchemaView
            schema={child}
            schemas={schemas}
            theme={theme}
            depth={depth + 1}
            seen={ref ? [...seen, ref] : seen}
          />
        </Collapsible>
      ) : null}
    </li>
  );
}

/** A schema as a field list with nested objects in collapsibles. Expands two
 * levels, stops at recursion and at a fixed depth so HTML stays bounded. */
export function SchemaView({
  schema: raw,
  schemas,
  theme,
  depth = 0,
  seen = [],
}: {
  schema: Json;
  schemas: Schemas;
  theme: ThemeStyle;
  depth?: number;
  seen?: string[];
}) {
  const { schema, ref } = resolve(schemas, raw);
  const nextSeen = ref ? [...seen, ref] : seen;
  const variants: Json[] | undefined = schema.oneOf ?? schema.anyOf;
  if (variants && !schema.properties) {
    return (
      <div className="flex flex-col gap-2">
        <Caption theme={theme}>{schema.oneOf ? "One of:" : "Any of:"}</Caption>
        {variants.map((variant, index) => {
          const resolved = resolve(schemas, variant);
          const label =
            resolved.schema.title ??
            (resolved.ref ? refName(resolved.ref) : `Option ${index + 1}`);
          return (
            <Collapsible
              key={index}
              theme={theme}
              defaultOpen={index === 0 && depth < OPEN_DEPTH}
              summary={
                <Text2 theme={theme} component="span">
                  {label}
                </Text2>
              }
            >
              <SchemaView
                schema={variant}
                schemas={schemas}
                theme={theme}
                depth={depth + 1}
                seen={nextSeen}
              />
            </Collapsible>
          );
        })}
      </div>
    );
  }
  if (schema.type === "array" && schema.items)
    return (
      <div className="flex flex-col gap-2">
        <Caption theme={theme}>Array of {typeLabel(schemas, schema.items)}</Caption>
        {childOf(schemas, schema.items) ? (
          <SchemaView
            schema={schema.items}
            schemas={schemas}
            theme={theme}
            depth={depth}
            seen={nextSeen}
          />
        ) : null}
      </div>
    );
  const { properties, required } = objectFields(schemas, raw, seen);
  const entries = Object.entries(properties);
  if (!entries.length)
    return (
      <Caption theme={theme} className="block leading-5">
        {typeLabel(schemas, raw)}
        {schema.description ? ` — ${schema.description}` : ""}
      </Caption>
    );
  return (
    <ul className="flex min-w-0 flex-col">
      {entries.map(([name, property]) => (
        <Field
          key={name}
          name={name}
          raw={property}
          required={required.includes(name)}
          schemas={schemas}
          theme={theme}
          depth={depth}
          seen={nextSeen}
        />
      ))}
    </ul>
  );
}
