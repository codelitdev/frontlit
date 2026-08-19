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
    // Don't wipe dist/ on watch: the CSS is emitted by a later tailwind
    // step, and apps that import `./styles.css` crash if it's missing.
    clean: !process.argv.includes("--watch"),
    splitting: true,
    treeshake: true,
    external: externalDeps,
    injectStyle: false,
    esbuildOptions(options) {
        options.jsx = "automatic";
    },
});
