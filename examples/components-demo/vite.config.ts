import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        open: false,
    },
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: {
            react: path.resolve(root, "node_modules/react"),
            "react-dom": path.resolve(root, "node_modules/react-dom"),
        },
    },
});
