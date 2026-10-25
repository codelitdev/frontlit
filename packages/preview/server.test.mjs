import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPreview } from "./server.mjs";

test("serves pages and assets, blocks other files and recovers after invalid edits", async () => {
  const root = mkdtempSync(join(tmpdir(), "preview-http-"));
  let server;
  try {
    const folder = join(root, "frontlit");
    mkdirSync(join(folder, "pages"), { recursive: true });
    mkdirSync(join(folder, "assets"));
    writeFileSync(
      join(folder, "assets/photo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const file = join(folder, "pages/index.json");
    const save = (title) =>
      writeFileSync(
        file,
        JSON.stringify({
          title,
          layout: [
            {
              name: "hero",
              settings: { title, media: { url: "../assets/photo.svg" } },
            },
          ],
        }),
      );
    save("Before");
    server = await startPreview(folder, { port: 0 });
    const base = "http://127.0.0.1:" + server.httpServer.address().port;
    const get = () => fetch(base + "/__frontlit/data?path=/");
    assert.equal((await (await get()).json()).title, "Before");
    const img = await fetch(base + "/__frontlit/assets/frontlit/assets/photo.svg");
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/svg+xml");
    assert.equal(
      (await fetch(base + "/__frontlit/assets/frontlit/pages/index.json")).status,
      404,
    );
    assert.equal((await fetch(base + "/blog")).status, 200);
    let changed = false;
    const send = server.ws.send.bind(server.ws);
    server.ws.send = (...args) => {
      if (args[0]?.type === "full-reload") changed = true;
      return send(...args);
    };
    await new Promise((r) => setTimeout(r, 150));
    save("After");
    for (let i = 0; i < 30 && !changed; i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.equal(changed, true, "file edits trigger a browser reload");
    assert.equal((await (await get()).json()).title, "After");
    writeFileSync(file, "{");
    assert.equal((await get()).status, 400);
    save("Recovered");
    assert.equal((await (await get()).json()).title, "Recovered");
    assert.equal((await fetch(base + "/__frontlit/data?path=/missing")).status, 400);
  } finally {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
