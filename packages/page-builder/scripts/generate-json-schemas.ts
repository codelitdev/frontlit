import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatJsonSchema, generateJsonSchemas } from "../src/schema/json-schema";

const outDir = path.resolve(import.meta.dirname, "../schema");
mkdirSync(outDir, { recursive: true });
for (const [file, schema] of Object.entries(generateJsonSchemas())) {
  writeFileSync(path.join(outDir, file), formatJsonSchema(schema));
  // eslint-disable-next-line no-console -- build script status output
  console.log(`wrote schema/${file}`);
}
