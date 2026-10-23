import { defineConfig } from "tsup";

// The React-free `./schema` entry for servers. zod and jsonc-parser are
// bundled so a server can ship this one file without the builder's UI
// dependencies; the docs Markdown profile comes from @frontlit/text-editor.
export default defineConfig({
  entry: { schema: "src/schema/index.ts" },
  outDir: "dist/server",
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: false,
  noExternal: ["zod", "jsonc-parser"],
  external: ["@frontlit/text-editor", "@frontlit/text-editor/docs"],
});
