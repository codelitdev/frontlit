import { createServer, searchForWorkspaceRoot } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import { loadSite, localAsset, repositoryRoot } from "./site.mjs";

export async function startPreview(folder, { port = 4310, context } = {}) {
  folder = resolve(folder);
  if (!existsSync(join(folder, "pages")))
    throw new Error(`No pages directory in ${folder}`);
  const packageRoot = dirname(fileURLToPath(import.meta.url));
  const root = repositoryRoot(folder);
  const contextFile = context ? resolve(context) : join(folder, "preview.context.json");
  if (context && !existsSync(contextFile))
    throw new Error(`Context file not found: ${contextFile}`);
  const server = await createServer({
    configFile: false,
    envFile: false,
    root: join(packageRoot, "client"),
    appType: "spa",
    resolve: { dedupe: ["react", "react-dom"] },
    // Installed from npm, the client lives in node_modules, where Vite does not
    // discover the automatic JSX runtime; it would be served as raw CommonJS.
    optimizeDeps: { include: ["react/jsx-dev-runtime"] },
    esbuild: { jsx: "automatic" },
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      // Fonts referenced by page-builder's stylesheet live outside this package
      // when installed from npm.
      fs: {
        allow: [
          searchForWorkspaceRoot(packageRoot),
          dirname(
            fileURLToPath(import.meta.resolve("@frontlit/page-builder/styles.css")),
          ),
        ],
      },
    },
    plugins: [
      {
        name: "frontlit-local-files",
        configureServer(vite) {
          vite.watcher.add([folder, contextFile]);
          let timer;
          const refresh = (file) => {
            if (file === contextFile || file.startsWith(folder + "/")) {
              clearTimeout(timer);
              timer = setTimeout(() => vite.ws.send({ type: "full-reload" }), 80);
            }
          };
          vite.watcher.on("all", (_, file) => refresh(file));
          vite.httpServer?.once("close", () => clearTimeout(timer));
          vite.middlewares.use((req, res, next) => {
            const url = new URL(req.url, "http://localhost");
            if (url.pathname === "/__frontlit/data") {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              try {
                res.end(
                  JSON.stringify(
                    loadSite(folder, url.searchParams.get("path") ?? "/", contextFile),
                  ),
                );
              } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: error.message }));
              }
              return;
            }
            if (url.pathname.startsWith("/__frontlit/assets/")) {
              try {
                const file = localAsset(
                  root,
                  decodeURIComponent(url.pathname.slice("/__frontlit/assets/".length)),
                );
                const mime = {
                  ".svg": "image/svg+xml",
                  ".png": "image/png",
                  ".jpg": "image/jpeg",
                  ".jpeg": "image/jpeg",
                  ".webp": "image/webp",
                  ".avif": "image/avif",
                  ".gif": "image/gif",
                };
                res.setHeader("Cache-Control", "no-store");
                res.setHeader(
                  "Content-Type",
                  mime[file.slice(file.lastIndexOf(".")).toLowerCase()],
                );
                createReadStream(file)
                  .on("error", () => res.destroy())
                  .pipe(res);
              } catch {
                res.statusCode = 404;
                res.end("Image not found");
              }
              return;
            }
            next();
          });
        },
      },
    ],
  });
  try {
    await server.listen();
  } catch (error) {
    // Vite's file watcher would otherwise keep the process alive.
    await server.close();
    throw error;
  }
  return server;
}
