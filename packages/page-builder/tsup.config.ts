import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

const externalDeps = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "models/index": "src/models/index.ts",
        "primitives/index": "src/primitives/index.ts",
        "components/index": "src/components/index.ts",
        "blocks/index": "src/blocks/index.tsx",
        "renderer/index": "src/renderer/index.ts",
        "builder/index": "src/builder/index.ts",
        "data-slots": "src/data-slots.ts",
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
    // Every entry is bundled with esbuild's code-splitting, which merges
    // modules from files that declared "use client" with ones that didn't
    // into shared chunks, silently dropping the directive. Since this
    // package is UI-heavy and largely meant for client-side use (the WYSIWYG
    // builder, in particular, is fully interactive), mark every emitted
    // file as a client boundary instead of trying to split hairs per module.
    esbuildOptions(options) {
        options.jsx = "automatic";
    },
});
