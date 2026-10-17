import { zodToJsonSchema } from "zod-to-json-schema";
import {
  fileBlockDefaults,
  pageFileSchema,
  PAGE_SCHEMA_URL,
  siteFileSchema,
  SITE_SCHEMA_URL,
} from "./files";

type JsonObject = Record<string, any>;

/** Annotates each block's settings with its defaults, so editors show them. */
function addBlockDefaults(settingsSchema: JsonObject | undefined, name: string) {
  const defaults = (fileBlockDefaults as Record<string, JsonObject>)[name];
  if (!settingsSchema?.properties || !defaults) return;
  for (const [key, value] of Object.entries(defaults)) {
    if (settingsSchema.properties[key]) settingsSchema.properties[key].default = value;
  }
}

/** JSON Schemas for page and site files (`$schema` targets). Generated from
 * the zod schemas and committed under `schema/`. */
export function generateJsonSchemas(): Record<string, JsonObject> {
  const page = zodToJsonSchema(pageFileSchema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  }) as JsonObject;
  for (const variant of page.properties.layout.items.anyOf) {
    addBlockDefaults(variant.properties.settings, variant.properties.name.const);
  }
  const site = zodToJsonSchema(siteFileSchema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  }) as JsonObject;
  addBlockDefaults(site.properties.header, "header");
  addBlockDefaults(site.properties.footer, "footer");
  return {
    "page.v1.json": {
      $schema: page.$schema,
      $id: PAGE_SCHEMA_URL,
      title: "FrontLit page",
      ...page,
    },
    "site.v1.json": {
      $schema: site.$schema,
      $id: SITE_SCHEMA_URL,
      title: "FrontLit site",
      ...site,
    },
  };
}

export function formatJsonSchema(schema: JsonObject): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
