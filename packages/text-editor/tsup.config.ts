import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

const externalDeps = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
    entry: {
        index: "src/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    treeshake: true,
    external: externalDeps,
    injectStyle: false,
    esbuildOptions(options) {
        options.jsx = "automatic";
    },
});
