/** Writes schema/content.v1.json from the documentation profile. */
import { writeFileSync } from "node:fs";
import { contentFormat } from "../src/docs/format";

const file = new URL("../schema/content.v1.json", import.meta.url);
writeFileSync(file, `${JSON.stringify(contentFormat(), null, 2)}\n`);
process.stdout.write(`Wrote ${file.pathname}\n`);
