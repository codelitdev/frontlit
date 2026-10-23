import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSite, localAsset } from "./site.mjs";
test("normalizes file settings, chrome, branding, fixtures and local images", () => {
  const root = mkdtempSync(join(tmpdir(), "frontlit-preview-"));
  try {
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "frontlit/pages"), { recursive: true });
    mkdirSync(join(root, "frontlit/assets"));
    const folder = join(root, "frontlit");
    writeFileSync(join(folder, "assets/photo.svg"), "<svg/>");
    writeFileSync(
      join(folder, "pages/index.json"),
      JSON.stringify({
        layout: [
          {
            name: "hero",
            settings: {
              title: "Hello",
              description: "**Rich text**",
              media: { url: "../assets/photo.svg", alt: "Photo" },
            },
          },
        ],
      }),
    );
    writeFileSync(
      join(folder, "site.json"),
      JSON.stringify({
        header: { links: [{ label: "Home", href: "/" }], ctaLabel: "", ctaHref: "" },
      }),
    );
    writeFileSync(
      join(folder, "preview.context.json"),
      JSON.stringify({
        branding: { title: "Actual brand" },
        feeds: { "/blog": [{ title: "Fixture" }] },
      }),
    );
    const data = loadSite(folder);
    assert.equal(data.layout[0].name, "header");
    assert.equal(data.layout.at(-1).name, "footer");
    assert.equal(data.pageData.siteTitle, "Actual brand");
    assert.equal(data.layout[1].settings.description.type, "doc");
    assert.equal(
      data.layout[1].settings.media.url,
      "/__frontlit/assets/frontlit/assets/photo.svg",
    );
    assert.deepEqual(data.pages, [{ path: "/", name: "index" }]);
    assert.equal(data.feeds["/blog"][0].title, "Fixture");
    assert.equal(data.pageData.teamId, undefined);
    assert.throws(() => loadSite(folder, "/../secret"));
    assert.throws(() => loadSite(folder, "/missing"));
    writeFileSync(join(folder, "pages/index.json"), "{");
    assert.throws(() => loadSite(folder));
    writeFileSync(join(root, "secret.txt"), "secret");
    assert.throws(() => localAsset(root, "secret.txt"));
    symlinkSync("/etc/passwd", join(folder, "assets/escape.svg"));
    assert.throws(() => localAsset(root, "frontlit/assets/escape.svg"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
