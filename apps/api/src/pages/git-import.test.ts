import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db } from "../db/client";
import type { GitTreeEntry } from "../documentation/github/importer";
import {
  createPagesRelease,
  importPagesTree,
  PagesImportError,
  pagesSourceKey,
} from "./git-import";
import { activateRelease, getActiveRelease } from "./releases";
import { getPublishedPageBySlug, listPages } from "./queries";

function repo(files: Record<string, string>) {
  const blobs = new Map<string, Uint8Array>();
  const entries: GitTreeEntry[] = [];
  const dirs = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    const sha = `${path.replace(/[^a-z0-9]/gi, "")}sha`;
    blobs.set(sha, new TextEncoder().encode(text));
    entries.push({ path, mode: "100644", type: "blob", sha, size: text.length });
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  for (const dir of dirs)
    entries.push({ path: dir, mode: "040000", type: "tree", sha: `tree-${dir}` });
  return { entries, readBlob: async (sha: string) => blobs.get(sha)! };
}

const page = (layout: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ title: "T", description: "D", layout, ...extra });

async function importRepo(teamId: string, files: Record<string, string>) {
  const { entries, readBlob } = repo(files);
  return importPagesTree({
    teamId,
    commitSha: "a".repeat(40),
    directory: "frontlit/pages",
    entries,
    readBlob,
    uploadAsset: async (_bytes, fileName) => `https://cdn.test/${fileName}`,
  });
}

async function diagnosticsOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PagesImportError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected PagesImportError");
}

describe("importPagesTree", () => {
  let teamId: string;
  beforeEach(async () => {
    teamId = (await seedTeam(db as any)).team.id;
  });

  it("maps file paths to routes and parses site.json", async () => {
    const manifest = await importRepo(teamId, {
      "frontlit/pages/index.json": page([
        { name: "hero", settings: { title: "Home" } },
      ]),
      "frontlit/pages/pricing.json": page([{ name: "pricing" }]),
      "frontlit/pages/blog.json": page([{ name: "content-feed" }]),
      "frontlit/site.json": JSON.stringify({
        header: { links: [{ label: "Pricing", href: "/pricing" }] },
      }),
      "frontlit/pages/README.md": "ignored",
    });
    expect(manifest.pages.map((p) => p.slug).sort()).toEqual(["", "blog", "pricing"]);
    expect(manifest.site?.header).toEqual({
      links: [{ id: "1", label: "Pricing", href: "/pricing" }],
    });
    expect(manifest.pages.find((p) => p.slug === "blog")?.document.layout[0]).toEqual({
      name: "data-slot",
      settings: { slot: "content-feed", source: "articles" },
    });
    expect(manifest.sourceKey).toBe("tree-frontlit/pages:frontlitsitejsonsha");
  });

  it("fails the whole import with file + pointer diagnostics", async () => {
    const diagnostics = await diagnosticsOf(
      importRepo(teamId, {
        "frontlit/pages/index.json": page([{ name: "hero", settings: { titel: "x" } }]),
        "frontlit/pages/Bad_Name.json": page([]),
        "frontlit/pages/embed.json": page([]),
        "frontlit/pages/about.json": page([{ name: "content-feed" }]),
        "frontlit/pages/nested/x.json": page([]),
      }),
    );
    expect(diagnostics.map((d) => [d.code, d.file, d.fieldPath ?? null])).toEqual(
      expect.arrayContaining([
        ["INVALID_PAGE", "frontlit/pages/index.json", "/layout/0/settings"],
        ["INVALID_PAGE_PATH", "frontlit/pages/Bad_Name.json", null],
        ["RESERVED_ROUTE", "frontlit/pages/embed.json", null],
        ["CONTENT_FEED_NOT_ALLOWED", "frontlit/pages/about.json", "/layout"],
        ["NESTED_PAGES", "frontlit/pages/nested", null],
      ]),
    );
  });

  it("fails when a header link points at a missing page, warns for page links", async () => {
    const diagnostics = await diagnosticsOf(
      importRepo(teamId, {
        "frontlit/pages/index.json": page([]),
        "frontlit/site.json": JSON.stringify({
          header: {
            ctaHref: "/signup",
            links: [{ label: "Docs", href: "/docs/intro" }],
          },
        }),
      }),
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "LINK_TARGET_MISSING",
        fieldPath: "/header/ctaHref",
      }),
    ]);
    const manifest = await importRepo(teamId, {
      "frontlit/pages/index.json": page([
        { name: "hero", settings: { buttonAction: "/nowhere#x" } },
      ]),
    });
    expect(manifest.diagnostics.map((d) => [d.code, d.severity])).toContainEqual([
      "LINK_TARGET_MISSING",
      "warning",
    ]);
  });

  it("uploads repo images once per blob and rewrites their URLs", async () => {
    const manifest = await importRepo(teamId, {
      "frontlit/pages/index.json": page([
        {
          name: "hero",
          settings: { media: { url: "../images/hero.png", alt: "Hero" } },
        },
        { name: "media", settings: { media: { url: "/frontlit/images/hero.png" } } },
      ]),
      "frontlit/images/hero.png": "png-bytes",
    });
    expect(manifest.pages[0].document.layout.map((b) => b.settings?.media)).toEqual([
      { url: "https://cdn.test/hero.png", alt: "Hero" },
      { url: "https://cdn.test/hero.png" },
    ]);
  });

  it("warns about missing SEO descriptions", async () => {
    const manifest = await importRepo(teamId, {
      "frontlit/pages/index.json": JSON.stringify({ layout: [] }),
    });
    expect(manifest.diagnostics.map((d) => d.code)).toContain(
      "SEO_DESCRIPTION_MISSING",
    );
  });

  it("publishes a release with Git-owned page rows; drafts stay out", async () => {
    const manifest = await importRepo(teamId, {
      "frontlit/pages/index.json": page([
        { name: "hero", settings: { title: "From Git" } },
      ]),
      "frontlit/pages/later.json": page([], { published: false }),
    });
    const release = await createPagesRelease(teamId, manifest);
    await activateRelease(db as any, release);
    const live = await getPublishedPageBySlug(teamId, "");
    expect(live?.layout.find((w) => w.name === "hero")?.settings).toEqual({
      title: "From Git",
    });
    expect(await getPublishedPageBySlug(teamId, "later")).toBeNull();
    const rows = await listPages({ teamId });
    expect(rows.find((row) => row.slug === "later")?.status).toBe("draft");
    expect((await getActiveRelease(teamId))?.source).toBe("git");
  });

  it("keys the source by the pages tree and site.json blob", () => {
    const { entries } = repo({ "x/pages/a.json": "{}" });
    expect(pagesSourceKey(entries, "x/pages")).toBe("tree-x/pages:");
    expect(pagesSourceKey(entries, "missing")).toBeNull();
  });
});
