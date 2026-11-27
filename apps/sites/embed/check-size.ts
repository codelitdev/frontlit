/**
 * Fails when the built embed loader is over its page-speed budget
 * (docs/embedded-support.md §6.8): 5 KB gzipped. Run by CI through
 * `bun run check:embed-size`.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = 5 * 1024;
const file = new URL("../public/embed/chat.js", import.meta.url);
const size = gzipSync(readFileSync(file), { level: 9 }).length;
process.stdout.write(`embed/chat.js: ${size} bytes gzipped (budget ${BUDGET})` + "\n");
if (size > BUDGET) process.exit(1);
