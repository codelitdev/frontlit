import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { MediaLit } from "medialit";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * A tiny stand-in for a host backend. It holds the MediaLit API key and
 * exposes the two calls the browser needs:
 *
 * - `POST /api/media/signature`: a short-lived upload signature; the browser
 *   then uploads straight to MediaLit over tus.
 * - `POST /api/media/:id/seal`: keeps an upload (uploads expire until sealed)
 *   and returns its public URL.
 */
function mediaLitApi(env: Record<string, string>): Plugin {
  return {
    name: "medialit-api",
    configureServer(server) {
      const apiKey = env.MEDIALIT_APIKEY;
      const endpoint = env.MEDIALIT_SERVER || "https://api.medialit.cloud";
      const medialit = apiKey ? new MediaLit({ apiKey, endpoint }) : null;
      server.middlewares.use("/api/media", async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return send(405, { error: "Method not allowed" });
        if (!medialit)
          return send(503, {
            error: "Set MEDIALIT_APIKEY in examples/text-editor-blocks/.env",
          });
        try {
          if (req.url === "/signature") {
            const signature = await medialit.getSignature({
              group: "text-editor-example",
            });
            return send(200, { signature, endpoint });
          }
          const seal = req.url?.match(/^\/([\w-]+)\/seal$/);
          if (seal) {
            const media = await medialit.seal(seal[1]);
            return send(200, {
              mediaId: media.mediaId,
              url: media.file,
              name: media.originalFileName,
              mimeType: media.mimeType,
            });
          }
          return send(404, { error: "Not found" });
        } catch (error) {
          return send(502, {
            error: error instanceof Error ? error.message : "MediaLit failed",
          });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), mediaLitApi(loadEnv(mode, root, "MEDIALIT_"))],
  server: { port: 5174, open: false },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(root, "node_modules/react"),
      "react-dom": path.resolve(root, "node_modules/react-dom"),
    },
  },
}));
