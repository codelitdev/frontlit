import fs from "node:fs";
import path from "node:path";

// tsup/esbuild doesn't reliably preserve "use client" directives across
// bundled/shared chunks when mixing client and non-client source modules.
// This package is UI-heavy and meant primarily for client-side use, so we
// simply prepend the directive to every emitted JS file post-build.
const distDir = path.resolve(process.cwd(), "dist");

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full);
        } else if (entry.name.endsWith(".js")) {
            const content = fs.readFileSync(full, "utf8");
            if (!content.startsWith('"use client"')) {
                fs.writeFileSync(full, `"use client";\n${content}`, "utf8");
            }
        }
    }
}

walk(distDir);
// eslint-disable-next-line no-console -- build script status output
console.log('Prepended "use client" to all dist/*.js files.');
