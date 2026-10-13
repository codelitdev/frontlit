import { publishSingleDocument, rebuildDocumentationRetrieval } from "./publications";
import { reserveDocumentationValidation } from "./admission";
import { gitDraftSource } from "./github/drafts";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { withDbTransaction } from "../db/transaction";
import {
  documents,
  docSections,
  documentationSettings,
  documentationPublications,
  documentationGitFiles,
  media,
} from "../db/schema";
import {
  createDocumentationBodySchema,
  updateDocumentationBodySchema,
  documentationValidationBodySchema,
  updateDocumentationSettingsBodySchema,
} from "@frontlit/api-contract";
import {
  DocsContentError,
  diagnostic,
  sortDiagnostics,
  normalizeDocsSlug,
  parseDocsMarkdown,
  serializeDocsMarkdown,
  hashDocsContent,
  extractDocsHeadings,
  type DocsDiagnostic,
} from "@frontlit/text-editor/docs";
import {
  normalizeDocumentationContent,
  validateDocumentationFeaturedImage,
} from "./content-validation";
import { normalizeFeaturedImage } from "../documents/queries";
import { slugify, uniqueSlug } from "../utils/slug";
import { getMedia } from "../media/service";

export class DraftConflict extends DocsContentError {
  constructor(public currentDraftVersion: number) {
    super([
      diagnostic(
        "STALE_DOCS_DRAFT",
        "This draft changed elsewhere. Reload and compare your local edits before saving.",
      ),
    ]);
  }
}
export async function getDocsSettings(teamId: string) {
  return (
    (await db.query.documentationSettings.findFirst({
      where: eq(documentationSettings.teamId, teamId),
    })) ?? {
      teamId,
      source: "editor" as const,
      draftVersion: 1,
      activePublicationId: null,
      policyEpoch: 0,
      requestedGeneration: 0,
      purgeGeneration: 0,
      indexing: { enabled: true },
    }
  );
}
export async function lockSettings(tx: any, teamId: string) {
  await tx.insert(documentationSettings).values({ teamId }).onConflictDoNothing();
  const [settings] = await tx
    .update(documentationSettings)
    .set({ draftVersion: sql`${documentationSettings.draftVersion}` })
    .where(eq(documentationSettings.teamId, teamId))
    .returning();
  return settings;
}
const scope = (teamId: string, documentId: string) =>
  and(
    eq(documents.teamId, teamId),
    eq(documents.kind, "doc"),
    eq(documents.documentId, documentId),
  );
function parseInput(raw: unknown, create = false) {
  const input = raw as any;
  if (
    (typeof input?.markdown === "string" &&
      Buffer.byteLength(input.markdown) > 1048576) ||
    (input?.content !== undefined &&
      Buffer.byteLength(JSON.stringify(input.content)) > 2097152)
  )
    throw new DocsContentError([
      diagnostic(
        "DOCUMENT_TOO_LARGE",
        "Markdown is limited to 1 MiB and document JSON to 2 MiB.",
      ),
    ]);
  let nodes = 0;
  function plain(value: any, depth = 0): void {
    if (++nodes > 25000 || depth > 64)
      throw new DocsContentError([
        diagnostic("INVALID_REQUEST", "Request exceeds structural limits."),
      ]);
    if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw new DocsContentError([
            diagnostic("INVALID_REQUEST", "Reserved object key."),
          ]);
        plain(child, depth + 1);
      }
  }
  plain(raw);
  const parsed = (
    create ? createDocumentationBodySchema : updateDocumentationBodySchema
  ).safeParse(raw);
  if (!parsed.success)
    throw new DocsContentError(
      parsed.error.issues.map((issue) =>
        diagnostic("INVALID_REQUEST", issue.message, {
          fieldPath: issue.path.join("."),
        }),
      ),
    );
  const patch: any = parsed.data;
  if (patch.content !== undefined && patch.markdown !== undefined)
    throw new DocsContentError([
      diagnostic("INVALID_REQUEST", "Supply content or markdown, never both."),
    ]);
  if (patch.markdown !== undefined) {
    const { content, frontmatter } = parseDocsMarkdown(patch.markdown, {
      frontmatter: patch.markdown.trimStart().startsWith("---"),
    });
    const fields: Record<string, string> = {
      title: "title",
      description: "excerpt",
      slug: "slug",
    };
    for (const [key, field] of Object.entries(fields))
      if (frontmatter?.[key] !== undefined) {
        if (patch[field] !== undefined && patch[field] !== frontmatter[key])
          throw new DocsContentError([
            diagnostic(
              "CONFLICTING_METADATA",
              `Frontmatter ${key} conflicts with ${field}.`,
            ),
          ]);
        patch[field] = frontmatter[key];
      }
    if (frontmatter) {
      for (const key of ["indexable", "order", "sectionId"])
        if (frontmatter[key] !== undefined) {
          if (patch.meta?.[key] !== undefined && patch.meta[key] !== frontmatter[key])
            throw new DocsContentError([
              diagnostic(
                "CONFLICTING_METADATA",
                `Frontmatter ${key} conflicts with meta.${key}.`,
              ),
            ]);
          patch.meta = { ...patch.meta, [key]: frontmatter[key] };
        }
      patch.meta = { ...patch.meta, frontmatter };
    }
    patch.content = content;
  }
  if (JSON.stringify(patch.meta ?? {}).length > 32768)
    throw new DocsContentError([
      diagnostic("INVALID_REQUEST", "Metadata exceeds size limit."),
    ]);
  delete patch.markdown;
  return patch;
}
function proposed(existing: any, patch: any) {
  const content = normalizeDocumentationContent(
    patch.content ?? existing?.draftContent ?? { type: "doc", content: [] },
  );
  const featured =
    patch.featuredImage !== undefined
      ? normalizeFeaturedImage(patch.featuredImage)
      : (existing?.draftFeaturedImage ?? null);
  validateDocumentationFeaturedImage(featured);
  return {
    draftTitle: patch.title ?? existing?.draftTitle ?? "",
    draftSlug: normalizeDocsSlug(
      patch.slug ?? existing?.draftSlug ?? existing?.slug ?? slugify(patch.title),
    ),
    draftContent: content,
    draftExcerpt:
      patch.excerpt !== undefined ? patch.excerpt : (existing?.draftExcerpt ?? null),
    draftFeaturedImage: featured,
    draftMeta: { ...(existing?.draftMeta ?? {}), ...(patch.meta ?? {}) },
  };
}
function managedHost(url: string) {
  const configured = (process.env.MEDIALIT_DELIVERY_HOSTS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (process.env.MEDIALIT_SERVER) {
    const host = new URL(process.env.MEDIALIT_SERVER).hostname;
    configured.push(host, host.replace(/^api\./, "cdn."));
  }
  return configured.includes(new URL(url).hostname);
}
export async function draftReport(
  teamId: string,
  draft: any,
  options: {
    documentId?: string;
    fresh?: boolean;
    candidates?: any[];
    publicationId?: string | null;
    sections?: any[];
    executor?: typeof db;
  } = {},
) {
  const diagnostics: DocsDiagnostic[] = [];
  const add = (code: string, message: string, fieldPath: string, warning = false) =>
    diagnostics.push(
      diagnostic(code, message, {
        fieldPath,
        documentId: options.documentId,
        blocksSave: false,
        blocksPublish: !warning,
        severity: warning ? "warning" : "error",
      }),
    );
  if (!draft.draftTitle.trim())
    add("MISSING_TITLE", "A title is required before publication.", "title");
  const sections =
    options.sections ??
    (await (options.executor ?? db).query.docSections.findMany({
      where: eq(docSections.teamId, teamId),
    }));
  if (
    draft.draftMeta.sectionId &&
    !sections.some((x) => x.sectionId === draft.draftMeta.sectionId)
  )
    throw new DocsContentError([
      diagnostic("INVALID_REFERENCE", "Invalid section reference.", {
        fieldPath: "meta.sectionId",
      }),
    ]);
  const rows =
    options.candidates ??
    (await (options.executor ?? db).query.documents.findMany({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    }));
  const route = draft.draftSlug;
  if (
    rows.some(
      (x) =>
        x.documentId !== options.documentId &&
        ((x.draftSlug ?? x.slug) === route ||
          (!options.candidates && x.publishedAt && x.slug === route)),
    )
  )
    add("DUPLICATE_ROUTE", "Another draft uses this route.", "slug");
  const assets = await (options.executor ?? db).query.media.findMany({
    where: eq(media.teamId, teamId),
  });
  const imageUrls: { url: string; path: string }[] = [];
  const links: { href: string; path: string }[] = [];
  let text = "";
  function walk(node: any, path: string) {
    text += node.text ?? "";
    if (node.type === "image") {
      imageUrls.push({ url: node.attrs.src, path });
      if (!node.attrs.alt?.trim())
        add("MISSING_ALT", "Add alt text to this image.", `${path}.attrs.alt`, true);
    }
    for (const mark of node.marks ?? [])
      if (mark.type === "link") links.push({ href: mark.attrs.href, path });
    for (const [i, child] of (node.content ?? []).entries())
      walk(child, `${path}.content[${i}]`);
  }
  walk(draft.draftContent, "content");
  if (!text.trim() && !imageUrls.length)
    add("EMPTY_ARTICLE", "This article is empty.", "content", true);
  if (draft.draftFeaturedImage) {
    const image = draft.draftFeaturedImage;
    const providerId = image.mediaLitId;
    const assetId =
      typeof image.mediaId === "string" && image.mediaId.startsWith("med_")
        ? image.mediaId
        : undefined;
    if (
      (providerId || assetId) &&
      !assets.some(
        (x) =>
          x.url === image.url &&
          (!providerId || x.mediaLitId === providerId) &&
          (!assetId || x.mediaId === assetId) &&
          x.verifiedAt &&
          x.access === "public",
      )
    )
      throw new DocsContentError([
        diagnostic("UNVERIFIED_MEDIA", "Invalid media reference.", {
          fieldPath: "featuredImage",
        }),
      ]);
  }
  if (draft.draftFeaturedImage?.url)
    imageUrls.push({ url: draft.draftFeaturedImage.url, path: "featuredImage.url" });
  for (const link of links)
    if (/^https:/i.test(link.href) && managedHost(link.href))
      imageUrls.push({ url: link.href, path: link.path });
  for (const { url, path } of imageUrls) {
    const asset = assets.find((x) => x.url === url);
    if (!asset && managedHost(url))
      throw new DocsContentError([
        diagnostic(
          "UNVERIFIED_MEDIA",
          "Select a verified public asset from this team's library.",
          { fieldPath: path },
        ),
      ]);
    if (asset && (!asset.verifiedAt || asset.access !== "public"))
      throw new DocsContentError([
        diagnostic(
          "UNVERIFIED_MEDIA",
          "This asset's public ownership has not been verified.",
          { fieldPath: path },
        ),
      ]);
    if (!asset)
      add(
        "EXTERNAL_MEDIA",
        "External image availability and tracking are unverified.",
        path,
        true,
      );
    if (asset && options.fresh) {
      try {
        const provider = await getMedia(asset.mediaLitId);
        if (
          provider.mediaId !== asset.mediaLitId ||
          provider.access.toLowerCase() !== "public" ||
          provider.group !== asset.providerGroup ||
          provider.file !== asset.url
        )
          add(
            "UNVERIFIED_MEDIA",
            "The provider no longer confirms this public asset.",
            path,
          );
      } catch {
        add(
          "MEDIA_UNAVAILABLE",
          "The provider could not verify this asset. Retry before publishing.",
          path,
        );
      }
    }
  }
  for (const { href, path } of links) {
    if (
      /^https:/i.test(href) &&
      managedHost(href) &&
      !assets.some((x) => x.url === href && x.verifiedAt && x.access === "public")
    )
      throw new DocsContentError([
        diagnostic("UNVERIFIED_MEDIA", "Invalid managed-media link reference.", {
          fieldPath: path,
        }),
      ]);
    if (/^https?:|^mailto:/i.test(href)) continue;
    const base = new URL(`/docs/${route}`, "https://docs.invalid");
    const target = new URL(href, base);
    if (!target.pathname.startsWith("/docs/")) continue;
    const slug = target.pathname.slice(6).replace(/\/$/, "");
    const doc =
      slug === route
        ? draft
        : rows.find(
            (x) =>
              (options.candidates
                ? (x.draftSlug ?? x.slug)
                : x.publishedAt
                  ? x.slug
                  : (x.draftSlug ?? x.slug)) === slug,
          );
    if (!doc) {
      add("BROKEN_LINK", "The target documentation page does not exist.", path);
      continue;
    }
    if (
      target.hash &&
      !extractDocsHeadings(doc.draftContent ?? doc.content).some(
        (h: any) => h.id === decodeURIComponent(target.hash.slice(1)),
      )
    )
      add("BROKEN_ANCHOR", "The target heading does not exist.", path);
  }
  return {
    saved: false,
    publishable: !diagnostics.some((x) => x.blocksPublish),
    diagnostics: sortDiagnostics(diagnostics),
    validatedAgainstPublicationId: options.publicationId ?? null,
  };
}
async function derived(draft: any) {
  return {
    draftMarkdown: serializeDocsMarkdown(draft.draftContent),
    draftHash: await hashDocsContent({
      content: draft.draftContent,
      metadata: {
        title: draft.draftTitle,
        slug: draft.draftSlug,
        description: draft.draftExcerpt,
        ...draft.draftMeta,
      },
      embeddingConfigurationVersion: "authoring-v1",
    }),
  };
}
export async function saveDocumentation(
  teamId: string,
  documentId: string | null,
  raw: unknown,
  authorAccountId?: string,
  executor?: typeof db,
) {
  if (
    documentId &&
    !(await (executor ?? db).query.documents.findFirst({
      where: scope(teamId, documentId),
    }))
  )
    return null;
  const patch = parseInput(raw, !documentId);
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const existing = documentId
      ? await tx.query.documents.findFirst({ where: scope(teamId, documentId) })
      : null;
    if (documentId && !existing) return null;
    if (existing && patch.expectedDraftVersion !== existing.draftVersion)
      throw new DraftConflict(existing.draftVersion);
    if (settings.source === "editor" && patch.gitSourcePath !== undefined)
      throw new DocsContentError([
        diagnostic(
          "SOURCE_REQUIRES_GIT",
          "Source paths apply to Git-owned documentation.",
        ),
      ]);
    const draft = proposed(existing, patch);
    const source =
      settings.source === "git"
        ? await gitDraftSource(tx, teamId, existing, patch.gitSourcePath)
        : null;
    const report = await draftReport(teamId, draft, {
      documentId: existing?.documentId,
      executor: tx,
      publicationId: settings.activePublicationId,
    });
    const computed = await derived(draft);
    let row: any;
    if (existing)
      [row] = await tx
        .update(documents)
        .set({
          ...draft,
          ...computed,
          draftGitSource: source,
          draftVersion: existing.draftVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            scope(teamId, documentId!),
            eq(documents.draftVersion, patch.expectedDraftVersion),
          ),
        )
        .returning();
    else {
      const slug = await uniqueSlug(slugify(draft.draftTitle), async (candidate) =>
        Boolean(
          await tx.query.documents.findFirst({
            where: and(
              eq(documents.teamId, teamId),
              eq(documents.kind, "doc"),
              eq(documents.slug, candidate),
            ),
          }),
        ),
      );
      [row] = await tx
        .insert(documents)
        .values({
          teamId,
          kind: "doc",
          slug,
          authorAccountId,
          ...draft,
          ...computed,
          draftGitSource: source,
        })
        .returning();
    }
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, teamId));
    return { ...row, ...report, source: settings.source, saved: true };
  }, executor);
}
export async function validateDocumentation(
  teamId: string,
  input: any,
  principal?: string | null,
) {
  const parsed = documentationValidationBodySchema.safeParse(input);
  if (!parsed.success)
    throw new DocsContentError(
      parsed.error.issues.map((issue) =>
        diagnostic("INVALID_REQUEST", issue.message, {
          fieldPath: issue.path.join("."),
        }),
      ),
    );
  input = parsed.data;
  if (principal)
    await db.transaction(async (tx) => {
      await lockSettings(tx, teamId);
      await reserveDocumentationValidation(tx, teamId, principal);
    });
  const settings = await getDocsSettings(teamId);
  if (input.mode === "document") {
    const existing = input.documentId
      ? await db.query.documents.findFirst({ where: scope(teamId, input.documentId) })
      : null;
    if (input.documentId && !existing) return null;
    return draftReport(
      teamId,
      proposed(existing, parseInput({ expectedDraftVersion: 1, ...input.draft })),
      { documentId: input.documentId, publicationId: settings.activePublicationId },
    );
  }
  const rows = await db.query.documents.findMany({
    where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
  });
  const candidates = rows
    .filter((x) => x.publishedAt && !input.removals.includes(x.documentId))
    .map((x) => ({
      ...x,
      draftSlug: x.slug,
      draftTitle: x.title,
      draftContent: x.content,
      draftMeta: x.meta,
      draftFeaturedImage: x.featuredImage,
    }));
  for (const selected of input.selected) {
    const row = rows.find((x) => x.documentId === selected.documentId);
    if (!row) return null;
    if (row.draftVersion !== selected.expectedDraftVersion)
      throw new DraftConflict(row.draftVersion);
    const i = candidates.findIndex((x) => x.documentId === row.documentId);
    if (i >= 0) candidates.splice(i, 1);
    candidates.push(row as any);
  }
  for (const id of input.removals)
    if (!rows.some((x) => x.documentId === id)) return null;
  const active =
    input.includeSectionChanges === false && settings.activePublicationId
      ? await db.query.documentationPublications.findFirst({
          where: eq(
            documentationPublications.publicationId,
            settings.activePublicationId,
          ),
        })
      : null;
  const sections =
    input.includeSectionChanges === false
      ? (active?.navigation ?? [])
      : await db.query.docSections.findMany({ where: eq(docSections.teamId, teamId) });
  if (
    input.includeSectionChanges === false &&
    candidates.some(
      (row) =>
        row.draftMeta.sectionId &&
        !sections.some((s: any) => s.sectionId === row.draftMeta.sectionId),
    )
  )
    return {
      saved: false,
      publishable: false,
      diagnostics: [
        diagnostic(
          "SECTION_NOT_PUBLISHED",
          "Include Section changes for documents in new Sections.",
          { blocksSave: false, blocksPublish: true },
        ),
      ],
      validatedAgainstPublicationId: settings.activePublicationId,
    };
  const reports = await Promise.all(
    candidates.map((row) =>
      draftReport(
        teamId,
        { ...row, draftSlug: row.draftSlug ?? row.slug },
        {
          documentId: row.documentId,
          candidates,
          sections,
          fresh: true,
          publicationId: settings.activePublicationId,
        },
      ),
    ),
  );
  return {
    saved: false,
    publishable: reports.every((x) => x.publishable),
    diagnostics: sortDiagnostics(reports.flatMap((x) => x.diagnostics)),
    validatedAgainstPublicationId: settings.activePublicationId,
  };
}
export async function updateDocsSettings(teamId: string, input: any) {
  const parsed = updateDocumentationSettingsBodySchema.safeParse(input);
  if (!parsed.success)
    throw new DocsContentError(
      parsed.error.issues.map((issue) =>
        diagnostic("INVALID_REQUEST", issue.message, {
          fieldPath: issue.path.join("."),
        }),
      ),
    );
  input = parsed.data;
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    if (input.expectedDocsDraftVersion !== settings.draftVersion)
      throw new DraftConflict(settings.draftVersion);
    const [row] = await tx
      .update(documentationSettings)
      .set({ indexing: input.indexing, draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, teamId))
      .returning();
    await rebuildDocumentationRetrieval(teamId, tx);
    return row;
  });
}

export async function changeDocumentation(
  teamId: string,
  documentId: string,
  expectedDraftVersion: number | undefined,
  action: "publish" | "discard" | "delete",
) {
  if (action === "publish") {
    return publishSingleDocument(teamId, documentId, expectedDraftVersion);
  }
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const existing = await tx.query.documents.findFirst({
      where: scope(teamId, documentId),
    });
    if (!existing) return null;
    if (expectedDraftVersion !== existing.draftVersion)
      throw new DraftConflict(existing.draftVersion);
    if (settings.source !== "editor" && action !== "discard")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (action === "delete") {
      if (existing.publishedAt)
        throw new DocsContentError([
          diagnostic(
            "DOCUMENT_STILL_PUBLISHED",
            "Unpublish documentation before deleting it.",
            { documentId },
          ),
        ]);
      await tx
        .delete(documents)
        .where(
          and(
            scope(teamId, documentId),
            eq(documents.draftVersion, expectedDraftVersion),
          ),
        );
      await tx
        .update(documentationSettings)
        .set({ draftVersion: settings.draftVersion + 1 })
        .where(eq(documentationSettings.teamId, teamId));
      return existing;
    }
    const imported =
      settings.source === "git"
        ? await tx.query.documentationGitFiles.findFirst({
            where: and(
              eq(documentationGitFiles.teamId, teamId),
              eq(documentationGitFiles.documentId, documentId),
              isNull(documentationGitFiles.removedAt),
            ),
          })
        : null;
    if (settings.source === "git" && !imported)
      return {
        ...existing,
        source: settings.source,
        saved: false,
        diagnostics: [
          diagnostic(
            "NO_PUBLISHED_REVISION",
            "This draft has no current accepted Git revision to restore.",
            { severity: "warning", blocksSave: false, blocksPublish: false },
          ),
        ],
      };
    if (action === "discard" && settings.source === "editor" && !existing.publishedAt)
      return {
        ...existing,
        source: settings.source,
        saved: false,
        diagnostics: [
          diagnostic(
            "NO_PUBLISHED_REVISION",
            "This draft has no published revision to restore.",
            { severity: "warning", blocksSave: false, blocksPublish: false },
          ),
        ],
      };
    let patch: any;
    let draft: any;
    {
      draft = imported
        ? {
            draftTitle: imported.snapshot.draftTitle,
            draftSlug: imported.snapshot.draftSlug,
            draftContent: imported.snapshot.draftContent,
            draftExcerpt: imported.snapshot.draftExcerpt,
            draftFeaturedImage: imported.snapshot.draftFeaturedImage,
            draftMeta: imported.snapshot.draftMeta,
          }
        : proposed(existing, {
            title: existing.title,
            slug: existing.slug,
            content: existing.content,
            excerpt: existing.excerpt,
            featuredImage: existing.featuredImage,
            meta: existing.meta,
          });
      if (!imported) draft.draftMeta = existing.meta;
      patch = {
        ...draft,
        ...(imported
          ? {
              draftMarkdown: imported.markdown,
              draftHash: imported.snapshot.draftHash,
              draftGitSource: {
                sourcePath: imported.sourcePath,
                base: {
                  commitSha: imported.commitSha,
                  sourcePath: imported.sourcePath,
                  sourceHash: imported.sourceHash,
                },
              },
            }
          : await derived(draft)),
        draftVersion: existing.draftVersion + 1,
      };
      await tx
        .update(documentationSettings)
        .set({ draftVersion: settings.draftVersion + 1 })
        .where(eq(documentationSettings.teamId, teamId));
    }
    const [row] = await tx
      .update(documents)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          scope(teamId, documentId),
          eq(documents.draftVersion, expectedDraftVersion),
        ),
      )
      .returning();
    return {
      ...row,
      ...(await draftReport(teamId, draft, { documentId })),
      source: settings.source,
      saved: action === "discard",
    };
  });
}
