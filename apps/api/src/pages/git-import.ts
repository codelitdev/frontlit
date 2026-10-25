import { gitSiteFolders, gitSiteRoot } from "@frontlit/api-contract";
import path from "node:path/posix";
import { and, eq } from "drizzle-orm";
import {
  parsePageFile,
  parseSiteFile,
  SchemaValidationError,
  type PageDocument,
  type SiteDocument,
} from "@frontlit/page-builder/schema";
import { isReservedPageSlug } from "@frontlit/api-contract";
import {
  diagnostic,
  DocsContentError,
  type DocsDiagnostic,
} from "@frontlit/text-editor/docs";
import { db } from "../db/client";
import {
  documentationGitBindings,
  gitAssets,
  pages,
  siteReleases,
  teamSettings,
  type PageRevisionContent,
  type SiteReleaseSnapshot,
} from "../db/schema";
import type { GitTreeEntry } from "../documentation/github/importer";
import { uploadMediaFile } from "../media/service";
import { getTeamSettings } from "../settings/queries";
import {
  activateRelease,
  ensureRevision,
  getActiveRelease,
  insertRelease,
  pageRevisionFile,
  revisionDraftLayout,
  type ReleasePage,
} from "./releases";
import { getStandardPageBySlug } from "./seed";
import {
  CONTENT_FEED_SOURCES,
  DATA_SLOT_WIDGET_NAME,
  pageRequiresFrontlitContentFeed,
} from "./shared-widgets";
import { slugify } from "../utils/slug";

export const DEFAULT_PAGES_DIRECTORY = "frontlit/pages";
export const PAGES_LIMITS = {
  files: 200,
  bytes: 2 * 1024 * 1024,
  assetBytes: 10 * 1024 * 1024,
};

/** All-or-nothing: any error-severity diagnostic fails the import. */
export class PagesImportError extends Error {
  constructor(readonly diagnostics: DocsDiagnostic[]) {
    super(diagnostics.map((d) => `${d.file ?? ""} ${d.message}`).join("\n"));
    this.name = "PagesImportError";
  }
}

const warning = (code: string, message: string, location: Partial<DocsDiagnostic>) => ({
  ...diagnostic(code, message, location),
  severity: "warning" as const,
  blocksSave: false,
  blocksPublish: false,
});

export interface ImportedPage {
  /** Repo path of the page file. */
  path: string;
  slug: string;
  name: string;
  published: boolean;
  document: PageDocument;
}

export interface PagesManifest {
  commitSha: string;
  directory: string;
  /** `<pages tree sha>:<site.json blob sha>`; unchanged key = nothing to do. */
  sourceKey: string;
  pages: ImportedPage[];
  site: SiteDocument | null;
  /** Warnings only (errors throw). */
  diagnostics: DocsDiagnostic[];
}

export function normalizePagesDirectory(value: string | null | undefined): string {
  const trimmed = (value ?? DEFAULT_PAGES_DIRECTORY).trim().replace(/^\/+|\/+$/g, "");
  if (
    !trimmed ||
    trimmed.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new DocsContentError([
      diagnostic("INVALID_PAGES_DIRECTORY", "Choose a folder inside the repository."),
    ]);
  return trimmed;
}

/** Pages always sync from `<root>/pages` of the connection's site folder. */
export function pagesFolder(binding: { directory: string }) {
  return gitSiteFolders(gitSiteRoot(binding.directory)).pages;
}

/** `site.json` sits next to the pages folder: `frontlit/pages` → `frontlit/site.json`. */
export function siteFilePath(directory: string): string {
  const parent = path.dirname(directory);
  return parent === "." ? "site.json" : `${parent}/site.json`;
}

/** The subtree/blob SHAs a pages import depends on. */
export function pagesSourceKey(
  entries: GitTreeEntry[],
  directory: string,
): string | null {
  const tree = entries.find(
    (entry) => entry.path === directory && entry.type === "tree",
  );
  if (!tree) return null;
  const site = entries.find(
    (entry) => entry.path === siteFilePath(directory) && entry.type === "blob",
  );
  return `${tree.sha}:${site?.sha ?? ""}`;
}

/** `pricing.json` → `pricing`, `index.json` → `` (the homepage). */
export function slugForPageFile(fileName: string): string {
  const base = fileName.replace(/\.json$/, "");
  return base === "index" ? "" : base;
}

function displayName(slug: string, title?: string) {
  const standard = getStandardPageBySlug(slug);
  if (standard) return standard.name;
  const words = slug.replace(/-/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : (title ?? "Homepage");
}

const LINK_KEYS = new Set(["href", "buttonAction", "secondaryButtonAction", "ctaHref"]);

/** Every internal link in block settings (including Markdown links in rich
 * text), with its JSON pointer. */
function internalLinks(
  value: unknown,
  pointer: string,
  out: { href: string; pointer: string }[] = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => internalLinks(item, `${pointer}/${index}`, out));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "link" && typeof (record.attrs as any)?.href === "string") {
      out.push({ href: (record.attrs as any).href, pointer });
    }
    for (const [key, nested] of Object.entries(record)) {
      if (LINK_KEYS.has(key) && typeof nested === "string") {
        out.push({ href: nested, pointer: `${pointer}/${key}` });
      } else {
        internalLinks(nested, `${pointer}/${key}`, out);
      }
    }
  }
  return out.filter(({ href }) => href.startsWith("/") && !href.startsWith("//"));
}

/** Routes a release serves beyond its pages: content feeds' children and
 * the site's own static routes. */
const DYNAMIC_PREFIXES = ["/blog/", "/docs/", "/changelog/", "/help/"];

export function routeExists(href: string, routes: Set<string>): boolean {
  const target = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (routes.has(target)) return true;
  if (DYNAMIC_PREFIXES.some((prefix) => target.startsWith(prefix))) return true;
  return isReservedPageSlug(target.slice(1));
}

/** Media objects (`{ url, alt? }`) anywhere in a document. */
export function mediaRefs(
  value: unknown,
  pointer: string,
  out: { media: { url: string }; pointer: string }[] = [],
) {
  if (Array.isArray(value))
    value.forEach((item, i) => mediaRefs(item, `${pointer}/${i}`, out));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      const next = `${pointer}/${key}`;
      if (
        (key === "media" || key === "socialImage") &&
        nested &&
        typeof (nested as any).url === "string"
      )
        out.push({ media: nested as { url: string }, pointer: next });
      else mediaRefs(nested, next, out);
    }
  }
  return out;
}

/** A repo-relative media URL as a repository path: relative to the file,
 * or to the repository root when it starts with "/". */
export function resolveRepoPath(file: string, url: string) {
  return url.startsWith("/")
    ? url.slice(1)
    : path.normalize(path.join(path.dirname(file), url));
}

export const isRepoPath = (url: string) =>
  !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/**
 * Reads `<directory>/*.json` (and `site.json` beside it) from a commit's
 * tree into a validated manifest. Repo-relative images are uploaded to
 * MediaLit (once per blob). Throws `PagesImportError` with every error.
 */
export async function importPagesTree(input: {
  teamId: string;
  commitSha: string;
  directory: string;
  entries: GitTreeEntry[];
  readBlob: (sha: string) => Promise<Uint8Array>;
  /** Uploads a repo image; injected in tests. */
  uploadAsset?: (
    bytes: Uint8Array,
    fileName: string,
    mimeType: string,
  ) => Promise<string>;
  /** Validate only: repo images are checked but not uploaded. */
  dryRun?: boolean;
}): Promise<PagesManifest> {
  const directory = normalizePagesDirectory(input.directory);
  const sourceKey = pagesSourceKey(input.entries, directory);
  if (!sourceKey)
    throw new PagesImportError([
      diagnostic(
        "PAGES_DIRECTORY_MISSING",
        `The folder ${directory}/ doesn't exist on this branch.`,
        {
          file: directory,
        },
      ),
    ]);
  const errors: DocsDiagnostic[] = [];
  const warnings: DocsDiagnostic[] = [];
  const decoder = new TextDecoder();
  const byPath = new Map(input.entries.map((entry) => [entry.path, entry]));
  const files = input.entries.filter((entry) => entry.path.startsWith(`${directory}/`));
  if (files.length > PAGES_LIMITS.files)
    throw new PagesImportError([
      diagnostic(
        "PAGES_LIMIT",
        `More than ${PAGES_LIMITS.files} files in ${directory}/.`,
      ),
    ]);

  const imported: ImportedPage[] = [];
  const fileRoutes = new Set<string>();
  for (const entry of files) {
    const relative = entry.path.slice(directory.length + 1);
    if (entry.mode === "120000" || entry.type === "commit") {
      errors.push(
        diagnostic("UNSUPPORTED_ENTRY", "Symlinks and submodules aren't supported.", {
          file: entry.path,
        }),
      );
      continue;
    }
    if (!relative.endsWith(".json") || entry.type !== "blob") {
      if (entry.type === "tree")
        errors.push(
          diagnostic(
            "NESTED_PAGES",
            "Pages must sit directly in the pages folder; nested folders aren't supported yet.",
            { file: entry.path },
          ),
        );
      continue;
    }
    if (relative.includes("/")) continue;
    const slug = slugForPageFile(relative);
    if (slug && slugify(slug) !== slug) {
      errors.push(
        diagnostic(
          "INVALID_PAGE_PATH",
          "Page file names are lowercase letters, numbers and hyphens, e.g. pricing.json.",
          { file: entry.path },
        ),
      );
      continue;
    }
    if (isReservedPageSlug(slug)) {
      errors.push(
        diagnostic("RESERVED_ROUTE", `/${slug} is reserved by the site.`, {
          file: entry.path,
        }),
      );
      continue;
    }
    if ((entry.size ?? 0) > PAGES_LIMITS.bytes) {
      errors.push(
        diagnostic("PAGE_TOO_LARGE", "Page files must be under 2 MB.", {
          file: entry.path,
        }),
      );
      continue;
    }
    // Counts as a route even if it fails to parse, so links to it don't
    // add noise to that file's own error.
    fileRoutes.add(slug ? `/${slug}` : "/");
    let document: PageDocument;
    try {
      document = parsePageFile(decoder.decode(await input.readBlob(entry.sha)));
    } catch (error) {
      if (!(error instanceof SchemaValidationError)) throw error;
      for (const d of error.diagnostics)
        errors.push(
          diagnostic("INVALID_PAGE", d.message, {
            file: entry.path,
            fieldPath: d.path,
            line: d.line,
            column: d.column,
          }),
        );
      continue;
    }
    const feeds = document.layout.filter(
      (block) => block.name === DATA_SLOT_WIDGET_NAME,
    );
    if (pageRequiresFrontlitContentFeed(slug) && feeds.length !== 1) {
      errors.push(
        diagnostic(
          "CONTENT_FEED_REQUIRED",
          `/${slug} needs exactly one { "name": "content-feed" } block.`,
          { file: entry.path, fieldPath: "/layout" },
        ),
      );
      continue;
    }
    if (!pageRequiresFrontlitContentFeed(slug) && feeds.length) {
      errors.push(
        diagnostic(
          "CONTENT_FEED_NOT_ALLOWED",
          "Only the blog, docs and changelog pages can have a content-feed block.",
          { file: entry.path, fieldPath: "/layout" },
        ),
      );
      continue;
    }
    for (const feed of feeds) {
      feed.settings = {
        slot: "content-feed",
        source: CONTENT_FEED_SOURCES[slug as keyof typeof CONTENT_FEED_SOURCES],
      };
    }
    const { published = true, ...content } = document;
    if (!content.description)
      warnings.push(
        warning(
          "SEO_DESCRIPTION_MISSING",
          "Add a description for search results and link previews.",
          { file: entry.path, fieldPath: "/description" },
        ),
      );
    if ((content.title?.length ?? 0) > 60)
      warnings.push(
        warning(
          "SEO_TITLE_LONG",
          "Titles over 60 characters get cut off in search results.",
          { file: entry.path, fieldPath: "/title" },
        ),
      );
    if ((content.description?.length ?? 0) > 160)
      warnings.push(
        warning(
          "SEO_DESCRIPTION_LONG",
          "Descriptions over 160 characters get cut off in search results.",
          { file: entry.path, fieldPath: "/description" },
        ),
      );
    imported.push({
      path: entry.path,
      slug,
      name: displayName(slug, content.title),
      published,
      document: content,
    });
  }

  let site: SiteDocument | null = null;
  const sitePath = siteFilePath(directory);
  const siteEntry = byPath.get(sitePath);
  if (siteEntry?.type === "blob") {
    try {
      site = parseSiteFile(decoder.decode(await input.readBlob(siteEntry.sha)));
    } catch (error) {
      if (!(error instanceof SchemaValidationError)) throw error;
      for (const d of error.diagnostics)
        errors.push(
          diagnostic("INVALID_SITE", d.message, {
            file: sitePath,
            fieldPath: d.path,
            line: d.line,
            column: d.column,
          }),
        );
    }
  }

  // Links resolve against what this release will serve.
  const routes = new Set(fileRoutes);
  for (const page of imported)
    if (!page.published) routes.delete(page.slug ? `/${page.slug}` : "/");
  for (const redirect of site?.redirects ?? [])
    routes.add(redirect.from.replace(/\/+$/, "") || "/");
  if (site) {
    for (const part of ["header", "footer"] as const) {
      for (const link of internalLinks(site[part], `/${part}`)) {
        if (!routeExists(link.href, routes))
          errors.push(
            diagnostic(
              "LINK_TARGET_MISSING",
              `${link.href} isn't a page in this release.`,
              { file: sitePath, fieldPath: link.pointer },
            ),
          );
      }
    }
  }
  for (const page of imported) {
    for (const link of internalLinks(page.document.layout, "/layout")) {
      if (!routeExists(link.href, routes))
        warnings.push(
          warning("LINK_TARGET_MISSING", `${link.href} isn't a page in this release.`, {
            file: page.path,
            fieldPath: link.pointer,
          }),
        );
    }
  }

  // Repo images → MediaLit, once per blob.
  const upload =
    input.uploadAsset ??
    (async (bytes: Uint8Array, fileName: string, mimeType: string) =>
      (await uploadMediaFile({ bytes, fileName, mimeType, group: input.teamId })).file);
  const sources: { file: string; target: unknown }[] = [
    ...imported.map((page) => ({ file: page.path, target: page.document })),
    ...(site ? [{ file: sitePath, target: site }] : []),
  ];
  for (const source of sources) {
    for (const ref of mediaRefs(source.target, "")) {
      if (!isRepoPath(ref.media.url)) {
        if (!/^https:\/\//i.test(ref.media.url))
          errors.push(
            diagnostic(
              "ASSET_URL",
              "Images must be an https:// URL or a path in the repository.",
              { file: source.file, fieldPath: ref.pointer },
            ),
          );
        continue;
      }
      const repoPath = resolveRepoPath(source.file, ref.media.url);
      const blob = byPath.get(repoPath);
      const mimeType = MIME[path.extname(repoPath).toLowerCase()];
      if (!blob || blob.type !== "blob" || !mimeType) {
        errors.push(
          diagnostic(
            "ASSET_MISSING",
            `${ref.media.url} isn't an image in the repository.`,
            { file: source.file, fieldPath: ref.pointer },
          ),
        );
        continue;
      }
      if ((blob.size ?? 0) > PAGES_LIMITS.assetBytes) {
        errors.push(
          diagnostic("ASSET_TOO_LARGE", "Images must be under 10 MB.", {
            file: source.file,
            fieldPath: ref.pointer,
          }),
        );
        continue;
      }
      if (errors.length || input.dryRun) continue;
      ref.media.url = await assetUrl(input.teamId, blob.sha, async () =>
        upload(await input.readBlob(blob.sha), path.basename(repoPath), mimeType),
      );
    }
  }

  if (errors.length) throw new PagesImportError(errors);
  return {
    commitSha: input.commitSha,
    directory,
    sourceKey,
    pages: imported,
    site,
    diagnostics: warnings,
  };
}

async function assetUrl(
  teamId: string,
  blobSha: string,
  upload: () => Promise<string>,
) {
  const existing = await db.query.gitAssets.findFirst({
    where: and(eq(gitAssets.teamId, teamId), eq(gitAssets.blobSha, blobSha)),
  });
  if (existing) return existing.url;
  const url = await upload();
  await db.insert(gitAssets).values({ teamId, blobSha, url }).onConflictDoNothing();
  return url;
}

/**
 * Writes an imported manifest: page rows mirror the repo (drafts = files),
 * and an inactive release holds the published pages plus site chrome
 * (`site.json`, or the live chrome when there's none). The caller activates it.
 */
export async function createPagesRelease(
  teamId: string,
  manifest: PagesManifest,
  options: {
    docsPublicationId?: string | null;
    /** A pull request preview: no page rows or drafts are touched. */
    preview?: { number: number };
    /** Run inside the caller's transaction; `settings` must then be read
     * beforehand (it would wait on the open transaction otherwise). */
    executor?: any;
    settings?: Awaited<ReturnType<typeof getTeamSettings>>;
  } = {},
) {
  const settings = options.settings ?? (await getTeamSettings(teamId));
  const run = async (tx: any) => {
    const active = await getActiveRelease(teamId, tx);
    const liveSite: SiteReleaseSnapshot = active?.site ?? {
      header: settings.draftSharedWidgets.header.settings ?? {},
      footer: settings.draftSharedWidgets.footer.settings ?? {},
    };
    const site: SiteReleaseSnapshot = manifest.site
      ? {
          header: manifest.site.header ?? {},
          footer: manifest.site.footer ?? {},
          ...(manifest.site.theme
            ? { theme: manifest.site.theme as unknown as Record<string, unknown> }
            : {}),
          ...(manifest.site.redirects ? { redirects: manifest.site.redirects } : {}),
        }
      : { header: liveSite.header, footer: liveSite.footer };

    const releasePages: ReleasePage[] = [];
    for (const page of manifest.pages) {
      const draft = {
        draftLayout: revisionDraftLayout(
          page.document as PageRevisionContent,
          page.slug,
        ),
        draftTitle: page.document.title ?? null,
        draftDescription: page.document.description ?? null,
        draftSocialImage:
          (page.document.socialImage as Record<string, unknown>) ?? null,
        draftRobotsAllowed: page.document.robotsAllowed ?? null,
        updatedAt: new Date(),
      };
      if (options.preview) {
        if (!page.published) continue;
        const revision = await ensureRevision(tx, teamId, page.document);
        releasePages.push({
          pageId: null,
          slug: page.slug,
          name: page.name,
          revisionId: revision.id,
        });
        continue;
      }
      const existing = await tx.query.pages.findFirst({
        where: and(eq(pages.teamId, teamId), eq(pages.slug, page.slug)),
      });
      // Only pages whose file changed take the repo's version as their
      // draft, so builder edits on other pages survive unrelated pushes.
      const live = active?.pages.find(
        (entry: { slug: string }) => entry.slug === page.slug,
      );
      const changed =
        !live || live.revision.hash !== pageRevisionFile(page.document).hash;
      const [row] = existing
        ? changed
          ? await tx
              .update(pages)
              .set(draft)
              .where(eq(pages.id, existing.id))
              .returning()
          : [existing]
        : await tx
            .insert(pages)
            .values({
              teamId,
              slug: page.slug,
              name: page.name,
              deletable: !getStandardPageBySlug(page.slug),
              ...draft,
            })
            .returning();
      if (!page.published) continue;
      const revision = await ensureRevision(tx, teamId, page.document);
      releasePages.push({
        pageId: row.id,
        slug: page.slug,
        name: row.name,
        revisionId: revision.id,
      });
    }
    const chromeChanged =
      JSON.stringify([site.header, site.footer]) !==
      JSON.stringify([active?.site.header, active?.site.footer]);
    if (manifest.site && !options.preview && chromeChanged) {
      await tx
        .update(teamSettings)
        .set({
          draftSharedWidgets: {
            header: { ...settings.draftSharedWidgets.header, settings: site.header },
            footer: { ...settings.draftSharedWidgets.footer, settings: site.footer },
          },
          updatedAt: new Date(),
        })
        .where(eq(teamSettings.id, settings.id));
    }
    return insertRelease(tx, {
      teamId,
      source: options.preview ? "preview" : "git",
      site,
      pages: releasePages,
      commitSha: manifest.commitSha,
      sourceKey: manifest.sourceKey,
      docsPublicationId: options.docsPublicationId ?? null,
      summary: options.preview
        ? `Preview of pull request #${options.preview.number}`
        : `Synced ${manifest.commitSha.slice(0, 7)} from Git`,
    });
  };
  return options.executor ? run(options.executor) : db.transaction(run);
}

/** Activates a Git pages release and records what's now live. */
export async function activatePagesRelease(
  teamId: string,
  release: typeof siteReleases.$inferSelect,
  executor: any = db,
) {
  // Pages were handed back to the builder while this sync was running.
  const binding = await executor.query.documentationGitBindings.findFirst({
    where: eq(documentationGitBindings.teamId, teamId),
  });
  if (!binding?.pagesDirectory) return;
  await activateRelease(executor, release);
  await executor
    .update(documentationGitBindings)
    .set({ pagesSourceKey: release.sourceKey, updatedAt: new Date() })
    .where(eq(documentationGitBindings.teamId, teamId));
}

/** The Git release built from the same commit as a docs publication goes
 * live with it. Called inside the docs activation transaction. */
export async function activateGitRelease(
  tx: any,
  teamId: string,
  publicationId: string,
) {
  const release = await tx.query.siteReleases.findFirst({
    where: and(
      eq(siteReleases.teamId, teamId),
      eq(siteReleases.docsPublicationId, publicationId),
    ),
  });
  if (release) await activatePagesRelease(teamId, release, tx);
  return Boolean(release);
}
