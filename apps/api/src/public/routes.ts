import { readDocumentation } from "../documentation/publications";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { documentationErrorBody } from "../documentation/content-validation";
import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { eq, inArray } from "drizzle-orm";
import { contract } from "@frontlit/api-contract";
import { db } from "../db/client";
import { accounts, authUser } from "../db/schema";
import {
  countPublishedDocuments,
  getPublishedDocumentBySlug,
  listPublishedDocuments,
} from "../documents/queries";
import { searchChunks } from "../documentation/queries";
import { getChatbotSettings } from "../chatbot/queries";
import { findTeamById, findTeamByPublicId } from "../team/queries";
import { runInboxAi } from "../inbox-ai/generate";
import { MAX_MESSAGE_CHARS } from "../inbox-ai/config";
import {
  attachFilesToMessage,
  attachmentsByMessage,
  createChatConversation,
  registerTicketAttachment,
  signatureForTicketAttachments,
  toPublicAttachment,
} from "../tickets/attachments";
import { omitInternal, serializeDates } from "../utils/public";
import { enqueueOutboxJob } from "../email/outbox";
import {
  addTicketMessage,
  createTicket,
  getTicketByTicketId,
  getTicketMessages,
  getTicketNotificationRecipient,
  textTicketMessage,
  verifyTicketAccess,
} from "../tickets/queries";
import { notifyTeamOfRequesterMessage } from "../tickets/notify";
import { resolveHost } from "../domains/queries";
import { getTeamSettings } from "../settings/queries";
import { getPublishedPageBySlug, listPublishedPages } from "../pages/queries";
import { getActiveRelease, getReleaseByReleaseId } from "../pages/releases";
import { verifyPreview } from "../pages/git-preview";
import { getThemeByThemeId } from "../themes/queries";
import { verifyCaptcha } from "../services/captcha";
import {
  clientIp,
  postgresPublicLimit,
  publicTeamIdFromPath,
} from "../inbox-ai/rate-limit";

const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

const chatLimiter = postgresPublicLimit({
  route: "chat",
  limits: (req) => [
    {
      key: `chat:${clientIp(req)}:${publicTeamIdFromPath(req)}`,
      windowMs: MINUTE,
      max: 10,
    },
  ],
  message: "Too many chat requests. Please wait a moment and try again.",
});

const leadLimiter = postgresPublicLimit({
  route: "leads",
  limits: (req) => [
    {
      key: `lead:${clientIp(req)}:${publicTeamIdFromPath(req)}`,
      windowMs: MINUTE,
      max: 5,
    },
    {
      key: `lead-day:${publicTeamIdFromPath(req)}`,
      windowMs: DAY,
      max: 100,
    },
  ],
});

const docsSearchLimiter = postgresPublicLimit({
  route: "docs_search",
  limits: (req) => [
    {
      key: `docs:${clientIp(req)}:${publicTeamIdFromPath(req)}`,
      windowMs: MINUTE,
      max: 60,
    },
  ],
});

const ticketLimiter = postgresPublicLimit({
  route: "tickets",
  limits: (req) => [
    {
      key: `ticket:${clientIp(req)}:${publicTeamIdFromPath(req)}`,
      windowMs: MINUTE,
      max: 5,
    },
    {
      key: `ticket-day:${publicTeamIdFromPath(req)}`,
      windowMs: DAY,
      max: 100,
    },
  ],
});

const publicReadLimiter = postgresPublicLimit({
  route: "public_read",
  limits: (req) => [{ key: `read:${clientIp(req)}`, windowMs: MINUTE, max: 300 }],
});

const ticketThreadLimiter = postgresPublicLimit({
  route: "ticket_thread",
  limits: (req) => {
    const token =
      String(
        (req.query as { token?: string })?.token ||
          (req.body as { token?: string } | undefined)?.token ||
          "",
      ) || "none";
    return [
      {
        key: `thread:${clientIp(req)}:${token}`,
        windowMs: MINUTE,
        max: 30,
      },
    ];
  },
});

/** Unauthenticated, published-only reads for public site rendering
 * (architecture.md \u00a75.4). Resolved by the team's public id \u2014 no
 * session/API key, no `requireAuth`/`requireTeam`. Only published fields
 * are ever selected by the queries this delegates to, so there's no
 * draft-leak risk even without an explicit field-level strip. */
const router = Router();
router.use((req, res, next) => {
  if (req.path.includes("/content/documentation") || req.path.endsWith("/sitemap"))
    res.setHeader("Cache-Control", "no-store");
  next();
});

const s = initServer();

type PublicDocumentFields =
  | "documentId"
  | "slug"
  | "title"
  | "content"
  | "excerpt"
  | "featuredImage"
  | "meta"
  | "createdAt"
  | "publishedAt"
  | "updatedAt";
type PublicDocumentSource<T extends Record<PublicDocumentFields, unknown>> = Pick<
  T,
  PublicDocumentFields
>;
type PublicDocumentProjection<T extends Record<PublicDocumentFields, unknown>> =
  ReturnType<typeof serializeDates<PublicDocumentSource<T>>>;
type PublicArticleAuthor = { name: string; imageUrl: string | null };

function toPublicDocumentProjection<T extends Record<PublicDocumentFields, unknown>>(
  doc: T,
): PublicDocumentProjection<T>;
function toPublicDocumentProjection<T extends Record<PublicDocumentFields, unknown>>(
  doc: T,
  author: PublicArticleAuthor | null,
): PublicDocumentProjection<T> & { author: PublicArticleAuthor | null };
function toPublicDocumentProjection<T extends Record<PublicDocumentFields, unknown>>(
  doc: T,
  author?: PublicArticleAuthor | null,
): PublicDocumentProjection<T> & { author?: PublicArticleAuthor | null } {
  const {
    documentId,
    slug,
    title,
    content,
    excerpt,
    featuredImage,
    meta,
    createdAt,
    publishedAt,
    updatedAt,
  } = doc;
  return serializeDates({
    documentId,
    slug,
    title,
    content,
    excerpt,
    featuredImage,
    meta,
    createdAt,
    publishedAt,
    updatedAt,
    ...("publicationId" in doc
      ? {
          publicationId: doc.publicationId,
          policyEpoch: (doc as any).policyEpoch,
          revisionId: (doc as any).revisionId,
          revisionHash: (doc as any).revisionHash,
        }
      : {}),
    ...(author !== undefined ? { author } : {}),
  }) as PublicDocumentProjection<T> & {
    author?: PublicArticleAuthor | null;
  };
}

function toPublicDocumentationProjection(doc: any) {
  return {
    ...toPublicDocumentProjection(doc),
    publicationId: doc.publicationId as string | null,
    policyEpoch: doc.policyEpoch as number,
    revisionId: doc.revisionId as string,
    revisionHash: doc.revisionHash as string,
  };
}

async function publicAuthorsForDocuments(
  docs: Array<{ authorAccountId?: string | null }>,
  fallbackAccountId: string,
) {
  const accountIds = [
    ...new Set(docs.map((doc) => doc.authorAccountId ?? fallbackAccountId)),
  ];
  const rows = accountIds.length
    ? await db
        .select({
          accountId: accounts.id,
          name: authUser.name,
          imageUrl: authUser.image,
        })
        .from(accounts)
        .leftJoin(authUser, eq(accounts.authUserId, authUser.id))
        .where(inArray(accounts.id, accountIds))
    : [];
  return new Map(
    rows.map((row) => [
      row.accountId,
      row.name?.trim() ? { name: row.name.trim(), imageUrl: row.imageUrl } : null,
    ]),
  );
}

/** The visitor-facing thread view (architecture.md §11.2) — never exposes
 * `accessTokenHash` or internal ids, requester identity is already known
 * to the visitor themselves. */
function toPublicTicketThread(
  ticket: Record<string, unknown>,
  messages: Array<Record<string, unknown> & { id?: string }>,
  byMessage?: Map<string, Array<{ attachmentId: string }>>,
) {
  return {
    ...serializeDates(
      omitInternal(
        ticket,
        "teamId",
        "accessTokenHash",
        "id",
        "aiState",
        "aiGeneration",
        "aiTriggerMessageId",
        "aiStopReason",
        "aiStoppedAt",
      ),
    ),
    messages: messages.map((m) => ({
      ...serializeDates(omitInternal(m, "teamId", "ticketId")),
      attachments: m.id
        ? (byMessage?.get(m.id) ?? []).map((row) => toPublicAttachment(row as any))
        : [],
    })),
  } as any;
}

const impl = s.router(contract.public, {
  resolveHost: {
    middleware: [publicReadLimiter],
    handler: async ({ query }) => {
      const resolved = await resolveHost(query.host);
      if (!resolved) return { status: 404, body: { error: "Unknown host" } };
      const team = await findTeamById(resolved.teamId);
      if (!team) return { status: 404, body: { error: "Unknown host" } };
      return {
        status: 200,
        body: {
          teamId: team.teamId,
          canonicalHost: resolved.canonicalHost,
        },
      };
    },
  },
  getSettings: {
    middleware: [publicReadLimiter],
    handler: async ({ params, query }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const settings = await getTeamSettings(team.id);
      const { title, subtitle, logo, codeInjectionHead, codeInjectionBody, themeId } =
        settings;
      const savedTheme = themeId?.startsWith("thm_")
        ? await getThemeByThemeId(themeId)
        : null;
      // A Git-owned site (site.json) ships its theme in the active release.
      const release =
        query?.release && verifyPreview(query.release, query.token)
          ? await getReleaseByReleaseId(team.id, query.release)
          : await getActiveRelease(team.id);
      const theme =
        release?.site.theme ??
        (savedTheme?.teamId === team.id ? savedTheme.style : null);
      return {
        status: 200,
        body: {
          title,
          subtitle,
          logo: logo as Record<string, unknown> | null,
          themeId,
          theme,
          codeInjectionHead,
          codeInjectionBody,
          redirects: release?.site.redirects ?? [],
        },
      };
    },
  },
  getPageBySlug: {
    middleware: [publicReadLimiter],
    handler: async ({ params, query }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      let preview = null;
      if (query.release) {
        preview = verifyPreview(query.release, query.token)
          ? await getReleaseByReleaseId(team.id, query.release)
          : null;
        if (!preview) return { status: 404, body: { error: "Not found" } };
      }
      const page = await getPublishedPageBySlug(team.id, query.slug ?? "", preview);
      if (!page) return { status: 404, body: { error: "Not found" } };
      const {
        pageId,
        name,
        slug,
        layout,
        title,
        description,
        socialImage,
        robotsAllowed,
        publishedAt,
        updatedAt,
      } = page;
      return {
        status: 200,
        body: serializeDates({
          pageId,
          name,
          slug,
          layout,
          title,
          description,
          socialImage,
          robotsAllowed,
          publishedAt,
          updatedAt,
        }),
      };
    },
  },
  getSitemap: {
    middleware: [publicReadLimiter],
    handler: async ({ params }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const [pagesList, blogs, docs, changelogs] = await Promise.all([
        listPublishedPages(team.id),
        listPublishedDocuments("blog", {
          teamId: team.id,
          itemsPerPage: 10_000,
        }),
        listPublishedDocuments("doc", {
          teamId: team.id,
          itemsPerPage: 10_000,
        }),
        listPublishedDocuments("changelog", {
          teamId: team.id,
          itemsPerPage: 10_000,
        }),
      ]);

      const items: {
        kind: "page" | "blog" | "doc" | "changelog";
        path: string;
        lastmod: string | null;
      }[] = [
        ...pagesList
          .filter((p) => p.robotsAllowed !== false)
          .map((p) => ({
            kind: "page" as const,
            path: `/${p.slug}`,
            lastmod: (p.updatedAt ?? p.publishedAt)?.toISOString() ?? null,
          })),
        ...blogs.map((d) => ({
          kind: "blog" as const,
          path: `/blog/${d.slug}`,
          lastmod: (d.updatedAt ?? d.publishedAt)?.toISOString() ?? null,
        })),
        ...docs.map((d) => ({
          kind: "doc" as const,
          path: `/docs/${d.slug}`,
          lastmod: (d.updatedAt ?? d.publishedAt)?.toISOString() ?? null,
        })),
      ];
      if (changelogs.length > 0) {
        const lastmod = changelogs.reduce<Date | null>(
          (latest, d) =>
            d.publishedAt && (!latest || d.publishedAt > latest)
              ? d.publishedAt
              : latest,
          null,
        );
        items.push({
          kind: "changelog" as const,
          path: "/changelog",
          lastmod: lastmod?.toISOString() ?? null,
        });
      }

      return { status: 200, body: { items } };
    },
  },
  getChatbotSettings: {
    middleware: [publicReadLimiter],
    handler: async ({ params }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const { enabled, name, greeting, accentColor, variant, widgetStyle } =
        await getChatbotSettings(team.id);
      return {
        status: 200,
        body: {
          enabled,
          name,
          greeting,
          accentColor,
          variant,
          widgetStyle,
        },
      };
    },
  },
  listArticles: async ({ params, query }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const [items, total] = await Promise.all([
      listPublishedDocuments("blog", {
        teamId: team.id,
        offset: query.offset,
        itemsPerPage: query.itemsPerPage,
      }),
      countPublishedDocuments("blog", { teamId: team.id }),
    ]);
    const authors = await publicAuthorsForDocuments(items, team.ownerAccountId);
    return {
      status: 200,
      body: {
        items: items.map((item) =>
          toPublicDocumentProjection(
            item,
            authors.get(item.authorAccountId ?? team.ownerAccountId) ??
              authors.get(team.ownerAccountId) ??
              null,
          ),
        ),
        total,
      },
    };
  },
  getArticleBySlug: async ({ params }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const doc = await getPublishedDocumentBySlug("blog", team.id, params.slug);
    if (!doc) return { status: 404, body: { error: "Not found" } };
    const authors = await publicAuthorsForDocuments([doc], team.ownerAccountId);
    return {
      status: 200,
      body: toPublicDocumentProjection(
        doc,
        authors.get(doc.authorAccountId ?? team.ownerAccountId) ??
          authors.get(team.ownerAccountId) ??
          null,
      ),
    };
  },
  listDocumentationSections: async ({ params }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const live = await readDocumentation(team.id);
    const sections = live.sections;
    return {
      status: 200,
      body: {
        items: sections.map((s: any) =>
          serializeDates({
            sectionId: s.sectionId as string,
            name: s.name as string,
            slug: s.slug as string,
            order: s.order as number,
            createdAt: s.createdAt as string | null,
            updatedAt: s.updatedAt as string | null,
          }),
        ),
        publicationId: live.publicationId,
        policyEpoch: live.policyEpoch,
      },
    };
  },
  searchDocumentation: {
    middleware: [docsSearchLimiter as any],
    handler: async ({ params, query }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const chunks = await searchChunks(team.id, query.q, query.k);
      return { status: 200, body: { items: chunks } };
    },
  },
  listDocumentation: async ({ params, query }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const live = await readDocumentation(team.id);
    const start = ((query.offset ?? 1) - 1) * (query.itemsPerPage ?? 20);
    return {
      status: 200,
      body: {
        items: live.items
          .slice(start, start + (query.itemsPerPage ?? 20))
          .map((item) => toPublicDocumentationProjection(item)),
        total: live.items.length,
        publicationId: live.publicationId,
        policyEpoch: live.policyEpoch,
      },
    };
  },
  getDocumentationSnapshot: async ({ params, query }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };
    try {
      const live = await readDocumentation(team.id, {
        publicationId: query.expectedPublicationId,
        policyEpoch: query.expectedPolicyEpoch,
      });
      return {
        status: 200,
        body: {
          publicationId: live.publicationId,
          policyEpoch: live.policyEpoch,
          items: live.items.map(toPublicDocumentationProjection),
          sections: live.sections.map((s: any) => ({
            sectionId: s.sectionId as string,
            name: s.name as string,
            slug: s.slug as string,
            order: s.order as number,
            createdAt: s.createdAt as string | null,
            updatedAt: s.updatedAt as string | null,
          })),
        },
      };
    } catch (error) {
      if (error instanceof DocsContentError)
        return { status: 409, body: documentationErrorBody(error) };
      throw error;
    }
  },
  getDocumentationByPath: async ({ params, query }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };
    try {
      const live = await readDocumentation(team.id, {
        publicationId: query.expectedPublicationId,
        policyEpoch: query.expectedPolicyEpoch,
      });
      const doc = live.items.find((item) => item.slug === query.slug);
      return doc
        ? { status: 200, body: toPublicDocumentationProjection(doc) }
        : { status: 404, body: { error: "Not found" } };
    } catch (error) {
      if (error instanceof DocsContentError)
        return { status: 409, body: documentationErrorBody(error) };
      throw error;
    }
  },
  getDocumentationBySlug: async ({ params }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const doc = await getPublishedDocumentBySlug("doc", team.id, params.slug);
    if (!doc) return { status: 404, body: { error: "Not found" } };
    return { status: 200, body: toPublicDocumentationProjection(doc) };
  },
  listProductUpdates: async ({ params, query }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const [items, total] = await Promise.all([
      listPublishedDocuments("changelog", {
        teamId: team.id,
        offset: query.offset,
        itemsPerPage: query.itemsPerPage,
      }),
      countPublishedDocuments("changelog", { teamId: team.id }),
    ]);
    return {
      status: 200,
      body: { items: items.map((item) => toPublicDocumentProjection(item)), total },
    };
  },
  getProductUpdateBySlug: async ({ params }) => {
    const team = await findTeamByPublicId(params.teamId);
    if (!team) return { status: 404, body: { error: "Team not found" } };

    const doc = await getPublishedDocumentBySlug("changelog", team.id, params.slug);
    if (!doc) return { status: 404, body: { error: "Not found" } };
    return { status: 200, body: toPublicDocumentProjection(doc) };
  },
  presignChatAttachment: {
    middleware: [chatLimiter],
    handler: async ({ params, body }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };
      const settings = await getChatbotSettings(team.id);
      if (!settings.enabled)
        return {
          status: 403,
          body: { error: "Chatbot is not enabled for this team" },
        };

      let conversationId = body.conversationId;
      let conversationToken = body.conversationToken;
      if (conversationId && conversationToken) {
        const ticket = await getTicketByTicketId(team.id, conversationId);
        if (!ticket || ticket.source !== "chatbot") {
          return {
            status: 404,
            body: { error: "Conversation not found" },
          };
        }
        if (!(await verifyTicketAccess(ticket, conversationToken))) {
          return {
            status: 401,
            body: { error: "Invalid conversation token" },
          };
        }
      } else {
        const created = await createChatConversation(team.id);
        conversationId = created.ticket.ticketId;
        conversationToken = created.token;
      }

      try {
        const signed = await signatureForTicketAttachments(team.id);
        return {
          status: 200,
          body: {
            ...signed,
            conversationId,
            conversationToken,
          },
        };
      } catch {
        return {
          status: 400,
          body: { error: "Failed to create upload signature" },
        };
      }
    },
  },
  completeChatAttachment: {
    middleware: [chatLimiter],
    handler: async ({ params, body }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };
      const ticket = await getTicketByTicketId(team.id, body.conversationId);
      if (!ticket || ticket.source !== "chatbot") {
        return {
          status: 404,
          body: { error: "Conversation not found" },
        };
      }
      if (!(await verifyTicketAccess(ticket, body.conversationToken))) {
        return {
          status: 401,
          body: { error: "Invalid conversation token" },
        };
      }
      try {
        const row = await registerTicketAttachment({
          teamId: team.id,
          ticketDbId: ticket.id,
          mediaLitId: body.mediaLitId,
          fileName: body.fileName,
          mimeType: body.mimeType,
          size: body.size,
        });
        return { status: 201, body: toPublicAttachment(row) };
      } catch (error) {
        const code = error instanceof Error ? error.message : "failed";
        return {
          status: 400,
          body: {
            error:
              code === "attachment_too_large"
                ? "File is too large"
                : "Failed to save attachment",
          },
        };
      }
    },
  },
  chat: {
    middleware: [chatLimiter],
    handler: async ({ params, body }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const settings = await getChatbotSettings(team.id);
      if (!settings.enabled)
        return {
          status: 403,
          body: { error: "Chatbot is not enabled for this team" },
        };

      if (Boolean(body.conversationId) !== Boolean(body.conversationToken)) {
        return {
          status: 400,
          body: {
            error: "conversationId and conversationToken must be provided together",
          },
        };
      }

      const message = (body.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
      const attachmentIds = body.attachmentIds ?? [];
      if (!message && attachmentIds.length === 0) {
        return {
          status: 400,
          body: { error: "A message or attachment is required" },
        };
      }

      let ticket: Awaited<ReturnType<typeof getTicketByTicketId>>;
      let conversationToken: string;
      let triggerMessageId: string;

      if (body.conversationId && body.conversationToken) {
        ticket = await getTicketByTicketId(team.id, body.conversationId);
        if (!ticket || ticket.source !== "chatbot") {
          return {
            status: 404,
            body: { error: "Conversation not found" },
          };
        }
        if (!(await verifyTicketAccess(ticket, body.conversationToken))) {
          return {
            status: 401,
            body: { error: "Invalid conversation token" },
          };
        }
        const appended = await addTicketMessage({
          teamId: team.id,
          ticketDbId: ticket.id,
          author: "requester",
          content: textTicketMessage(message || "Sent an attachment"),
        });
        triggerMessageId = appended.id;
        conversationToken = body.conversationToken;
        if (attachmentIds.length) {
          await attachFilesToMessage({
            teamId: team.id,
            ticketDbId: ticket.id,
            messageDbId: appended.id,
            attachmentIds,
          });
        }
      } else {
        const created = await createTicket({
          teamId: team.id,
          subject: message.slice(0, 120) || "Chat conversation",
          message: message || "Sent an attachment",
          requesterEmail: null,
          source: "chatbot",
          scheduleAi: false,
        });
        ticket = created.ticket;
        conversationToken = created.token;
        triggerMessageId = created.firstMessage.id;
        if (attachmentIds.length) {
          await attachFilesToMessage({
            teamId: team.id,
            ticketDbId: ticket.id,
            messageDbId: created.firstMessage.id,
            attachmentIds,
          });
        }
      }

      const result = await runInboxAi({
        teamId: team.id,
        ticketDbId: ticket.id,
        triggerMessageId,
        channel: "chatbot",
        mode: "sync",
      });

      return {
        status: 200,
        body: {
          outcome: result.outcome,
          answer: result.answer,
          sources: result.sources,
          conversationId: ticket.ticketId,
          conversationToken,
          escalate: result.outcome === "escalated",
        },
      };
    },
  },
  captureLead: {
    middleware: [leadLimiter],
    handler: async ({ params, body, req }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      // Honeypot: real visitors never fill this hidden field in. Pretend
      // success so a bot can't learn it was caught.
      if (body.website) return { status: 200, body: { accepted: true } };
      if (!(await verifyCaptcha(body.turnstileToken, req.ip)))
        return {
          status: 403,
          body: { error: "Captcha verification failed" },
        };

      await enqueueOutboxJob(team.id, "contact_sync", {
        email: body.email,
        sourcePageId: body.sourcePageId,
        sourcePath: body.sourcePath,
      });
      return { status: 200, body: { accepted: true } };
    },
  },
  createTicket: {
    middleware: [ticketLimiter],
    handler: async ({ params, body, req }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      // Honeypot: same convention as lead capture (architecture.md
      // §13.3) — pretend success so a bot can't learn it was caught.
      // A fake ticketId/token pair is returned so the caller's shape
      // expectations are met without ever touching the database.
      if (body.website)
        return {
          status: 200,
          body: { ticketId: "tkt_dropped", token: "dropped" },
        };
      if (!(await verifyCaptcha(body.turnstileToken, req.ip)))
        return {
          status: 403,
          body: { error: "Captcha verification failed" },
        };

      const message = body.transcript
        ? `${body.transcript}\n\n---\n${body.message}`
        : body.message;
      const { ticket, token } = await createTicket({
        teamId: team.id,
        subject: body.subject,
        message,
        requesterEmail: body.email,
        requesterName: body.name,
        source: body.source,
      });

      const recipient = await getTicketNotificationRecipient(team.id, null);
      if (recipient) {
        notifyTeamOfRequesterMessage({
          teamId: team.id,
          ticketId: ticket.ticketId,
          recipientEmail: recipient,
          subject: ticket.subject,
        }).catch(() => {});
      }

      return { status: 200, body: { ticketId: ticket.ticketId, token } };
    },
  },
  getTicketThread: {
    middleware: [ticketThreadLimiter],
    handler: async ({ params, query }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const ticket = await getTicketByTicketId(team.id, params.ticketId);
      if (!ticket) return { status: 404, body: { error: "Not found" } };
      if (!(await verifyTicketAccess(ticket, query.token)))
        return {
          status: 401,
          body: { error: "Invalid or expired token" },
        };

      const [messages, byMessage] = await Promise.all([
        getTicketMessages(ticket.id),
        attachmentsByMessage(ticket.id),
      ]);
      return {
        status: 200,
        body: toPublicTicketThread(ticket, messages, byMessage),
      };
    },
  },
  replyToTicketThread: {
    middleware: [ticketThreadLimiter],
    handler: async ({ params, body, req }) => {
      const team = await findTeamByPublicId(params.teamId);
      if (!team) return { status: 404, body: { error: "Team not found" } };

      const ticket = await getTicketByTicketId(team.id, params.ticketId);
      if (!ticket) return { status: 404, body: { error: "Not found" } };
      if (!(await verifyTicketAccess(ticket, body.token)))
        return {
          status: 401,
          body: { error: "Invalid or expired token" },
        };
      if (!(await verifyCaptcha(body.turnstileToken, req.ip)))
        return {
          status: 403,
          body: { error: "Captcha verification failed" },
        };

      await addTicketMessage({
        teamId: team.id,
        ticketDbId: ticket.id,
        author: "requester",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: body.message }],
            },
          ],
        },
      });

      const recipient = await getTicketNotificationRecipient(
        team.id,
        ticket.assigneeAccountId,
      );
      if (recipient) {
        notifyTeamOfRequesterMessage({
          teamId: team.id,
          ticketId: ticket.ticketId,
          recipientEmail: recipient,
          subject: ticket.subject,
        }).catch(() => {});
      }

      const [updated, messages, byMessage] = await Promise.all([
        getTicketByTicketId(team.id, ticket.ticketId),
        getTicketMessages(ticket.id),
        attachmentsByMessage(ticket.id),
      ]);
      return {
        status: 200,
        body: toPublicTicketThread(updated ?? ticket, messages, byMessage),
      };
    },
  },
});

createExpressEndpoints(contract.public, impl, router);

/** Caddy on-demand TLS `ask` adapter. Caddy sends `GET ?domain=` and
 * issues a certificate only when this returns 200. Same host authority as
 * `GET /public/resolve-host`. */
router.get("/public/tls-ask", publicReadLimiter, async (req, res) => {
  const domain = String(req.query.domain ?? req.query.host ?? "");
  const resolved = await resolveHost(domain);
  if (!resolved) {
    res.status(404).end();
    return;
  }
  res.status(200).end();
});

export default router;
