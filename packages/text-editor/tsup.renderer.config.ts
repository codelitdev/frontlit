import { defineConfig } from "tsup";
import path from "node:path";
import pkg from "./package.json" with { type: "json" };

const externalDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

const srcDir = path.resolve("src");
// Modules that must run in the browser; bundled on their own with a
// "use client" banner and imported (not bundled) by the renderer entry.
const islands: Record<string, string> = {
  "components/copy-code-button": "copy-code-button",
};

const shared = {
  outDir: "dist/renderer",
  format: ["esm" as const],
  sourcemap: true,
  // The main build owns cleaning `dist/`.
  clean: false,
  splitting: false,
  // esbuild already tree-shakes; tsup's rollup pass would drop the banner.
  treeshake: false,
  external: externalDeps,
  injectStyle: false,
  esbuildOptions(options: { jsx?: string }) {
    options.jsx = "automatic";
  },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/renderer.ts" },
    dts: true,
    esbuildPlugins: [
      {
        name: "client-islands",
        setup(build) {
          build.onResolve({ filter: /^\./ }, async (args) => {
            if (args.pluginData?.skipIslands) return undefined;
            const resolved = await build.resolve(args.path, {
              kind: args.kind,
              resolveDir: args.resolveDir,
              pluginData: { skipIslands: true },
            });
            if (resolved.errors.length > 0) return undefined;
            const source = path
              .relative(srcDir, resolved.path)
              .replace(/\.[cm]?[jt]sx?$/, "")
              .split(path.sep)
              .join("/");
            const island = islands[source];
            if (!island) return undefined;
            return { path: `./islands/${island}.js`, external: true };
          });
        },
      },
    ],
  },
  {
    ...shared,
    entry: Object.fromEntries(
      Object.entries(islands).map(([source, name]) => [
        `islands/${name}`,
        path.join(srcDir, `${source}.tsx`),
      ]),
    ),
    dts: false,
    banner: { js: '"use client";' },
  },
]);
