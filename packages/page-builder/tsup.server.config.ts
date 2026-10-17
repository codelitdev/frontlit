import { defineConfig } from "tsup";
import path from "node:path";
import pkg from "./package.json" with { type: "json" };
import { islands, srcDir } from "./tsup.islands";

const externalDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

// Server-component entry. No "use client" is added; the client islands it
// imports are built separately (tsup.islands.config.ts) and left external
// here, which is what lets React see the client boundary.
export default defineConfig({
  entry: {
    index: "src/server/index.ts",
    theme: "src/theme/index.ts",
    primitives: "src/server/primitives.ts",
    schema: "src/schema/index.ts",
  },
  outDir: "dist/server",
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: false,
  external: externalDeps,
  injectStyle: false,
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  esbuildPlugins: [
    {
      name: "client-islands",
      setup(build) {
        build.onResolve({ filter: /^\./ }, async (args) => {
          if (args.pluginData?.skipIslands) return undefined;
          // Barrels re-export modules with `export *`, which can't be
          // tree-shaken once the target is external. Bundle through them;
          // the consuming widgets import islands by their own path.
          if (/[\\/]index\.[jt]sx?$/.test(args.importer)) return undefined;
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
});
