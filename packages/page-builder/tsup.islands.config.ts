import { defineConfig } from "tsup";
import path from "node:path";
import pkg from "./package.json" with { type: "json" };
import { islands, srcDir } from "./tsup.islands";

const externalDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

// Client islands for the server entry (see tsup.islands.ts). Built after the
// main bundle, which owns cleaning `dist/`.
export default defineConfig({
  entry: Object.fromEntries(
    Object.entries(islands).map(([source, name]) => [
      `islands/${name}`,
      path.join(srcDir, `${source}.tsx`),
    ]),
  ),
  outDir: "dist/server",
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: false,
  // Each island must be self-contained so its "use client" directive covers
  // all of its code (esbuild drops directives when it splits shared chunks).
  splitting: false,
  // esbuild already tree-shakes; tsup's extra rollup pass would drop the
  // "use client" banner.
  treeshake: false,
  external: externalDeps,
  injectStyle: false,
  banner: { js: '"use client";' },
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
