#!/usr/bin/env node
import { startPreview } from "./server.mjs";
const usage =
  "Usage: frontlit-preview [site-folder] [--port 4310] [--context snapshot.json]";
try {
  let folder,
    port = 4310,
    context;
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port") {
      port = Number(args[++i]);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("Invalid port");
    } else if (args[i] === "--context") {
      context = args[++i];
      if (!context || context.startsWith("--"))
        throw new Error("--context requires a file");
    } else if (args[i].startsWith("-") || folder) throw new Error(usage);
    else folder = args[i];
  }
  const server = await startPreview(folder ?? "frontlit", { port, context });
  console.log(`FrontLit local preview — ${folder ?? "frontlit"}`);
  server.printUrls();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
