import { getTeamSettings } from "../settings/queries";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  documents,
  documentationMemberships,
  documentationPublications,
  documentationRevisions,
  documentationSettings,
  docSections,
  themes,
  teams,
} from "../db/schema";
import { DraftConflict, draftReport, getDocsSettings, lockSettings } from "./authoring";
import {
  documentationReadAllowed,
  digest,
  DocumentationAdmissionError,
  publicationError,
  queuePublication,
  readDocumentation,
} from "./publications";
import { publicPublication } from "./projections";

export async function previewDocumentation(
  teamId: string,
  documentId: string,
  version: number,
  canManage = false,
) {
  const row = await db.query.documents.findFirst({
    where: and(
      eq(documents.teamId, teamId),
      eq(documents.kind, "doc"),
      eq(documents.documentId, documentId),
    ),
  });
  if (!row || !(await documentationReadAllowed(teamId, row, canManage))) return null;
  if (row.draftVersion !== version) throw new DraftConflict(row.draftVersion);
  const settings = await getDocsSettings(teamId);
  const live = await readDocumentation(teamId);
  const report = await draftReport(teamId, row, {
    documentId,
    publicationId: settings.activePublicationId,
  });
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  const site = await getTeamSettings(teamId);
  const theme = site.themeId
    ? await db.query.themes.findFirst({
        where: and(eq(themes.teamId, teamId), eq(themes.themeId, site.themeId)),
      })
    : null;
  // Explicit data projection. Never return shared widgets, injected scripts,
  // HTML, tokens or an administrative credential for a tenant origin.
  if (!(await documentationReadAllowed(teamId, row, canManage))) return null;
  return {
    documentId,
    draftVersion: row.draftVersion,
    title: row.draftTitle ?? "",
    slug: row.draftSlug ?? row.slug,
    content: row.draftContent,
    excerpt: row.draftExcerpt,
    markdown: row.draftMarkdown,
    navigation: live.sections.map(({ sectionId, name, slug }: any) => ({
      sectionId,
      name,
      slug,
    })),
    shell: {
      siteName: team?.name ?? "Documentation",
      themeId: site.themeId ?? null,
      themeStyle: theme?.style ?? null,
    },
    unpublished: true as const,
    ...report,
  };
}

export async function listPublicationHistory(
  teamId: string,
  input: { cursor?: string; limit?: number; state?: string },
  canManage = false,
) {
  if (input.cursor) {
    const cursor = await db.query.documentationPublications.findFirst({
      where: and(
        eq(documentationPublications.teamId, teamId),
        eq(documentationPublications.publicationId, input.cursor),
      ),
    });
    if (!cursor) return null;
  }
  const limit = Math.min(input.limit ?? 20, 100);
  const rows = await db.query.documentationPublications.findMany({
    where: and(
      eq(documentationPublications.teamId, teamId),
      input.cursor
        ? sql`(${documentationPublications.createdAt}, ${documentationPublications.publicationId}) < (select created_at, publication_id from documentation_publications where team_id = ${teamId} and publication_id = ${input.cursor})`
        : undefined,
      input.state
        ? eq(documentationPublications.status, input.state as any)
        : undefined,
    ),
    orderBy: [
      desc(documentationPublications.createdAt),
      desc(documentationPublications.publicationId),
    ],
    limit: limit + 1,
  });
  const items = await Promise.all(
    rows.slice(0, limit).map((row) => publicationForReader(teamId, row, canManage)),
  );
  return {
    items,
    nextCursor: rows.length > limit ? items.at(-1)!.publicationId : null,
  };
}

export async function getRetainedRevision(
  teamId: string,
  documentId: string,
  revisionId: string,
  canManage = false,
) {
  const revision = await db.query.documentationRevisions.findFirst({
    where: and(
      eq(documentationRevisions.teamId, teamId),
      eq(documentationRevisions.documentId, documentId),
      eq(documentationRevisions.revisionId, revisionId),
    ),
  });
  if (
    !revision ||
    !(await documentationReadAllowed(
      teamId,
      { documentId, slug: revision.snapshot.draftSlug, ...revision.snapshot },
      canManage,
    ))
  )
    return null;
  // Candidates that never activated are not revision history, even with read authority.
  const retained = await db
    .select({ publicationId: documentationPublications.publicationId })
    .from(documentationMemberships)
    .innerJoin(
      documentationPublications,
      eq(
        documentationMemberships.publicationId,
        documentationPublications.publicationId,
      ),
    )
    .where(
      and(
        eq(documentationMemberships.revisionId, revisionId),
        eq(documentationPublications.teamId, teamId),
        eq(documentationPublications.status, "active"),
      ),
    )
    .limit(1);
  const archived = retained.length
    ? retained
    : await db
        .select({ publicationId: documentationPublications.publicationId })
        .from(documentationMemberships)
        .innerJoin(
          documentationPublications,
          eq(
            documentationMemberships.publicationId,
            documentationPublications.publicationId,
          ),
        )
        .where(
          and(
            eq(documentationMemberships.revisionId, revisionId),
            eq(documentationPublications.teamId, teamId),
            eq(documentationPublications.status, "archived"),
          ),
        )
        .limit(1);
  if (!archived.length) return null;
  return {
    revisionId,
    documentId,
    publicationId: archived[0].publicationId,
    revisionHash: revision.hash,
    title: revision.snapshot.draftTitle ?? "",
    slug: revision.snapshot.draftSlug ?? "",
    excerpt: revision.snapshot.draftExcerpt ?? null,
    featuredImage: revision.snapshot.draftFeaturedImage ?? null,
    meta: revision.snapshot.draftMeta,
    content: revision.snapshot.draftContent,
    markdown: revision.markdown,
    createdAt: revision.createdAt.toISOString(),
  };
}

export async function listDocumentRevisions(
  teamId: string,
  documentId: string,
  canManage = false,
) {
  const revisions = await db.query.documentationRevisions.findMany({
    where: and(
      eq(documentationRevisions.teamId, teamId),
      eq(documentationRevisions.documentId, documentId),
    ),
    orderBy: desc(documentationRevisions.createdAt),
    limit: 100,
  });
  const items = [];
  for (const row of revisions) {
    const revision = await getRetainedRevision(
      teamId,
      documentId,
      row.revisionId,
      canManage,
    );
    if (revision) {
      const { content, markdown, ...receipt } = revision;
      items.push(receipt);
    }
  }
  return { items };
}

export async function unpublishDocumentation(
  teamId: string,
  documentId: string,
  input: {
    expectedPublicationId: string | null;
    expectedDocsDraftVersion: number;
    idempotencyKey: string;
  },
) {
  return queuePublication(teamId, {
    ...input,
    selected: [],
    removals: [documentId],
    includeSectionChanges: false,
  });
}

export async function retryDocumentationPublication(
  teamId: string,
  publicationId: string,
  idempotencyKey: string,
) {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    publicationError(
      "RESTORE_PENDING",
      "Reconcile the deletion ledger before publishing.",
    );
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const job = await tx.query.documentationPublications.findFirst({
      where: and(
        eq(documentationPublications.teamId, teamId),
        eq(documentationPublications.publicationId, publicationId),
      ),
    });
    if (!job) return null;
    const inputHash = digest({ retryOf: publicationId });
    const replay = await tx.query.documentationPublications.findFirst({
      where: and(
        eq(documentationPublications.teamId, teamId),
        eq(documentationPublications.idempotencyKey, idempotencyKey),
      ),
    });
    if (replay) {
      if (replay.inputHash !== inputHash)
        publicationError(
          "IDEMPOTENCY_CONFLICT",
          "This retry key was used with another input.",
        );
      return replay;
    }
    if (["queued", "preparing", "prepared"].includes(job.status)) return job;
    if (job.status !== "failed")
      publicationError(
        "PUBLICATION_NOT_RETRYABLE",
        "Only failed publications can be retried.",
      );
    if (
      settings.activePublicationId !== job.basePublicationId ||
      settings.purgeGeneration !== job.purgeGeneration ||
      settings.source !== job.source
    )
      publicationError(
        "STALE_PUBLICATION",
        "The publication base or source changed. Review a new candidate.",
      );
    const recent = await tx.query.documentationPublications.findMany({
      where: eq(documentationPublications.teamId, teamId),
    });
    if (
      recent.filter((p) => ["queued", "preparing", "prepared"].includes(p.status))
        .length >= 2
    )
      throw new DocumentationAdmissionError(
        "PUBLICATION_BUSY",
        "Two publications are pending.",
        5,
      );
    if (
      recent.filter(
        (p) =>
          p.createdAt.getTime() > Date.now() - 3600000 &&
          p.idempotencyKey !== "bootstrap-v1",
      ).length >= 20
    )
      throw new DocumentationAdmissionError(
        "PUBLICATION_RATE_LIMIT",
        "Publication limit reached.",
        3600,
      );
    if (!job.finishedAt || Date.now() - job.finishedAt.getTime() >= 7 * 86400000)
      publicationError(
        "PUBLICATION_EXPIRED",
        "This candidate expired. Review a new candidate.",
      );
    const members = await tx.query.documentationMemberships.findMany({
      where: eq(documentationMemberships.publicationId, publicationId),
    });
    const generation = settings.requestedGeneration + 1;
    const [copy] = await tx
      .insert(documentationPublications)
      .values({
        teamId,
        idempotencyKey,
        inputHash,
        basePublicationId: job.basePublicationId,
        source: job.source,
        generation,
        purgeGeneration: job.purgeGeneration,
        docsDraftVersion: job.docsDraftVersion,
        navigation: job.navigation,
        indexing: job.indexing,
      })
      .returning();
    if (members.length)
      await tx.insert(documentationMemberships).values(
        members.map((m) => ({
          publicationId: copy.publicationId,
          documentId: m.documentId,
          revisionId: m.revisionId,
          route: m.route,
        })),
      );
    await tx
      .update(documentationSettings)
      .set({ requestedGeneration: generation })
      .where(eq(documentationSettings.teamId, teamId));
    return copy;
  });
}

export async function getDocsUiSettings(teamId: string) {
  const settings = await getDocsSettings(teamId);
  const sections = await db.query.docSections.findMany({
    where: eq(docSections.teamId, teamId),
  });
  const active = settings.activePublicationId
    ? await db.query.documentationPublications.findFirst({
        where: and(
          eq(documentationPublications.teamId, teamId),
          eq(documentationPublications.publicationId, settings.activePublicationId),
        ),
      })
    : null;
  const nav = (rows: any[]) =>
    rows
      .map((s) => ({
        sectionId: s.sectionId,
        name: s.name,
        slug: s.slug,
        order: s.order,
      }))
      .sort((a, b) => a.sectionId.localeCompare(b.sectionId));
  return {
    ...settings,
    publishedNavigation: nav(active?.navigation ?? []),
    navigationPending: digest(nav(sections)) !== digest(nav(active?.navigation ?? [])),
  };
}

export async function publicationForReader(
  teamId: string,
  row: typeof documentationPublications.$inferSelect,
  canManage = false,
) {
  const receipt = publicPublication(row);
  if (canManage || !row.diagnostics.length) return receipt;
  const candidates = await db
    .select({
      documentId: documentationMemberships.documentId,
      snapshot: documentationRevisions.snapshot,
    })
    .from(documentationMemberships)
    .innerJoin(
      documentationRevisions,
      eq(documentationMemberships.revisionId, documentationRevisions.revisionId),
    )
    .where(eq(documentationMemberships.publicationId, row.publicationId));
  for (const candidate of candidates)
    if (
      !(await documentationReadAllowed(
        teamId,
        { documentId: candidate.documentId, ...candidate.snapshot },
        false,
      ))
    )
      return { ...receipt, diagnostics: [] };
  return receipt;
}
