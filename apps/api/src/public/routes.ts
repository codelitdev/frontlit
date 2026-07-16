import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { countPublishedDocuments, getPublishedDocumentBySlug, listPublishedDocuments } from "../documents/queries";
import { listDocSections, searchChunks } from "../documentation/queries";
import { getChatbotSettings } from "../chatbot/queries";
import { getChatAnswer } from "../chatbot/completion";
import { findTeamById, findTeamByPublicId } from "../team/queries";
import { omitInternal, serializeDates } from "../utils/public";
import { enqueueOutboxJob } from "../newsletter/outbox";
import { addTicketMessage, createTicket, getTicketByTicketId, getTicketMessages, getTicketNotificationRecipient, verifyTicketAccess } from "../tickets/queries";
import { notifyTeamOfRequesterMessage } from "../tickets/notify";
import { resolveHost } from "../domains/queries";
import { getTeamSettings } from "../settings/queries";
import { getPublishedPageBySlug, listPublishedPages } from "../pages/queries";
import { getThemeById } from "../themes/queries";
import { verifyCaptcha } from "../services/captcha";
import { incrementCounter } from "../services/metrics";

/** Records `rate_limit_hits_total{route=...}` (architecture.md §13.6)
 * without changing the limiter's existing response shape — express-rate-limit's
 * `handler` fully replaces the default response, so it re-sends the same
 * `message`/`statusCode` every limiter below already configures. */
function rateLimitHandler(route: string) {
    return (_req: any, res: any, _next: any, options: any) => {
        incrementCounter("rate_limit_hits_total", { route });
        res.status(options.statusCode).json(options.message);
    };
}

/** Public writes/expensive reads get a tighter limit than the cacheable
 * reads above (architecture.md §13.2) — chat spends real LLM/embedding
 * tokens per request. */
const chatLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many chat requests. Please wait a moment and try again." },
    handler: rateLimitHandler("chat"),
});

/** Lead capture is a public write from anonymous site visitors (architecture.md
 * §13.2/§13.3) — looser than chat (no LLM cost) but still capped per IP to
 * blunt scraping/spam bursts; the honeypot field below catches simple bots
 * without a CAPTCHA challenge on every legitimate signup. */
const leadLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many submissions. Please wait a moment and try again." },
    handler: rateLimitHandler("leads"),
});

/** Docs search embeds one query per call — capped separately from plain
 * reads (architecture.md §13.2). */
const docsSearchLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many search requests. Please wait a moment and try again." },
    handler: rateLimitHandler("docs_search"),
});

/** Ticket submission shares lead capture's public-write budget
 * (architecture.md §13.2's table groups them together). */
const ticketLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many submissions. Please wait a moment and try again." },
    handler: rateLimitHandler("tickets"),
});

/** Plain public reads (host resolution, settings, pages, sitemap) — generous,
 * since ISR/CDN caching absorbs most real traffic (architecture.md §13.2). */
const publicReadLimiter = rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many requests. Please wait a moment and try again." },
    handler: rateLimitHandler("public_read"),
});

/** Ticket thread reads/replies (magic token) — moderate limit, keyed by
 * IP like the other public endpoints (architecture.md §13.2). */
const ticketThreadLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many requests. Please wait a moment and try again." },
    handler: rateLimitHandler("ticket_thread"),
});

/** Unauthenticated, published-only reads for public site rendering
 * (architecture.md \u00a75.4). Resolved by the team's public id \u2014 no
 * session/API key, no `requireAuth`/`requireTeam`. Only published fields
 * are ever selected by the queries this delegates to, so there's no
 * draft-leak risk even without an explicit field-level strip. */
const router = Router();

const s = initServer();

function toPublicDocumentProjection<T extends Record<string, unknown>>(doc: T) {
    const { documentId, slug, title, content, excerpt, featuredImage, meta, publishedAt, updatedAt } = doc as any;
    return serializeDates({ documentId, slug, title, content, excerpt, featuredImage, meta, publishedAt, updatedAt });
}

/** The visitor-facing thread view (architecture.md §11.2) — never exposes
 * `accessTokenHash` or internal ids, requester identity is already known
 * to the visitor themselves. */
function toPublicTicketThread(ticket: Record<string, unknown>, messages: Record<string, unknown>[]) {
    return {
        ...serializeDates(omitInternal(ticket, "teamId", "accessTokenHash")),
        messages: messages.map((m) => serializeDates(omitInternal(m, "teamId", "ticketId"))),
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
            return { status: 200, body: { teamId: team.teamId, isPrimary: resolved.isPrimary, primaryHost: resolved.primaryHost } };
        },
    },
    getSettings: {
        middleware: [publicReadLimiter],
        handler: async ({ params }) => {
            const team = await findTeamByPublicId(params.teamId);
            if (!team) return { status: 404, body: { error: "Team not found" } };

            const settings = await getTeamSettings(team.id);
            const { title, subtitle, logo, codeInjectionHead, codeInjectionBody } = settings;
            return { status: 200, body: { title, subtitle, logo: logo as Record<string, unknown> | null, codeInjectionHead, codeInjectionBody } };
        },
    },
    getPageBySlug: {
        middleware: [publicReadLimiter],
        handler: async ({ params, query }) => {
            const team = await findTeamByPublicId(params.teamId);
            if (!team) return { status: 404, body: { error: "Team not found" } };

            const page = await getPublishedPageBySlug(team.id, query.slug ?? "");
            if (!page) return { status: 404, body: { error: "Not found" } };
            const { pageId, name, type, slug, layout, themeId, title, description, socialImage, robotsAllowed, publishedAt, updatedAt } = page;
            const theme = themeId ? ((await getThemeById(themeId))?.style ?? null) : null;
            return {
                status: 200,
                body: serializeDates({ pageId, name, type, slug, layout, theme, title, description, socialImage, robotsAllowed, publishedAt, updatedAt }),
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
                listPublishedDocuments("blog", { teamId: team.id, itemsPerPage: 10_000 }),
                listPublishedDocuments("doc", { teamId: team.id, itemsPerPage: 10_000 }),
                listPublishedDocuments("changelog", { teamId: team.id, itemsPerPage: 10_000 }),
            ]);

            const items: { kind: "page" | "blog" | "doc" | "changelog"; path: string; lastmod: string | null }[] = [
                ...pagesList
                    .filter((p) => p.robotsAllowed !== false)
                    .map((p) => ({ kind: "page" as const, path: `/${p.slug}`, lastmod: (p.updatedAt ?? p.publishedAt)?.toISOString() ?? null })),
                ...blogs.map((d) => ({ kind: "blog" as const, path: `/blog/${d.slug}`, lastmod: (d.updatedAt ?? d.publishedAt)?.toISOString() ?? null })),
                ...docs.map((d) => ({ kind: "doc" as const, path: `/docs/${d.slug}`, lastmod: (d.updatedAt ?? d.publishedAt)?.toISOString() ?? null })),
            ];
            if (changelogs.length > 0) {
                const lastmod = changelogs.reduce<Date | null>(
                    (latest, d) => (d.publishedAt && (!latest || d.publishedAt > latest) ? d.publishedAt : latest),
                    null,
                );
                items.push({ kind: "changelog" as const, path: "/changelog", lastmod: lastmod?.toISOString() ?? null });
            }

            return { status: 200, body: { items } };
        },
    },
    getChatbotSettings: {
        middleware: [publicReadLimiter],
        handler: async ({ params }) => {
            const team = await findTeamByPublicId(params.teamId);
            if (!team) return { status: 404, body: { error: "Team not found" } };

            const { enabled, name, greeting, accentColor } = await getChatbotSettings(team.id);
            return { status: 200, body: { enabled, name, greeting, accentColor } };
        },
    },
    listBlogs: async ({ params, query }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const [items, total] = await Promise.all([
            listPublishedDocuments("blog", { teamId: team.id, offset: query.offset, itemsPerPage: query.itemsPerPage }),
            countPublishedDocuments("blog", { teamId: team.id }),
        ]);
        return { status: 200, body: { items: items.map(toPublicDocumentProjection), total } };
    },
    getBlogBySlug: async ({ params }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const doc = await getPublishedDocumentBySlug("blog", team.id, params.slug);
        if (!doc) return { status: 404, body: { error: "Not found" } };
        return { status: 200, body: toPublicDocumentProjection(doc) };
    },
    listDocSections: async ({ params }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const sections = await listDocSections(team.id);
        return { status: 200, body: { items: sections.map((s) => serializeDates(omitInternal(s, "teamId"))) } };
    },
    searchDocs: {
        middleware: [docsSearchLimiter as any],
        handler: async ({ params, query }) => {
            const team = await findTeamByPublicId(params.teamId);
            if (!team) return { status: 404, body: { error: "Team not found" } };

            const chunks = await searchChunks(team.id, query.q, query.k);
            return { status: 200, body: { items: chunks } };
        },
    },
    listDocs: async ({ params, query }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const [items, total] = await Promise.all([
            listPublishedDocuments("doc", { teamId: team.id, offset: query.offset, itemsPerPage: query.itemsPerPage }),
            countPublishedDocuments("doc", { teamId: team.id }),
        ]);
        return { status: 200, body: { items: items.map(toPublicDocumentProjection), total } };
    },
    getDocBySlug: async ({ params }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const doc = await getPublishedDocumentBySlug("doc", team.id, params.slug);
        if (!doc) return { status: 404, body: { error: "Not found" } };
        return { status: 200, body: toPublicDocumentProjection(doc) };
    },
    listChangelogs: async ({ params, query }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const [items, total] = await Promise.all([
            listPublishedDocuments("changelog", { teamId: team.id, offset: query.offset, itemsPerPage: query.itemsPerPage }),
            countPublishedDocuments("changelog", { teamId: team.id }),
        ]);
        return { status: 200, body: { items: items.map(toPublicDocumentProjection), total } };
    },
    getChangelogBySlug: async ({ params }) => {
        const team = await findTeamByPublicId(params.teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };

        const doc = await getPublishedDocumentBySlug("changelog", team.id, params.slug);
        if (!doc) return { status: 404, body: { error: "Not found" } };
        return { status: 200, body: toPublicDocumentProjection(doc) };
    },
    chat: {
        middleware: [chatLimiter],
        handler: async ({ params, body }) => {
            const team = await findTeamByPublicId(params.teamId);
            if (!team) return { status: 404, body: { error: "Team not found" } };

            const settings = await getChatbotSettings(team.id);
            if (!settings.enabled) return { status: 403, body: { error: "Chatbot is not enabled for this team" } };

            const chunks = await searchChunks(team.id, body.message);
            const { answer, sources, escalate } = await getChatAnswer(body.message, chunks, body.history);
            return { status: 200, body: { answer, sources, escalate: escalate && settings.escalationEnabled } };
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
            if (!(await verifyCaptcha(body.turnstileToken, req.ip))) return { status: 403, body: { error: "Captcha verification failed" } };

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
            if (body.website) return { status: 200, body: { ticketId: "tkt_dropped", token: "dropped" } };
            if (!(await verifyCaptcha(body.turnstileToken, req.ip))) return { status: 403, body: { error: "Captcha verification failed" } };

            const message = body.transcript ? `${body.transcript}\n\n---\n${body.message}` : body.message;
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
                notifyTeamOfRequesterMessage({ teamId: team.id, ticketId: ticket.ticketId, recipientEmail: recipient, subject: ticket.subject }).catch(() => {});
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
            if (!verifyTicketAccess(ticket, query.token)) return { status: 401, body: { error: "Invalid or expired token" } };

            const messages = await getTicketMessages(ticket.id);
            return { status: 200, body: toPublicTicketThread(ticket, messages) };
        },
    },
    replyToTicketThread: {
        middleware: [ticketThreadLimiter],
        handler: async ({ params, body, req }) => {
            const team = await findTeamByPublicId(params.teamId);
            if (!team) return { status: 404, body: { error: "Team not found" } };

            const ticket = await getTicketByTicketId(team.id, params.ticketId);
            if (!ticket) return { status: 404, body: { error: "Not found" } };
            if (!verifyTicketAccess(ticket, body.token)) return { status: 401, body: { error: "Invalid or expired token" } };
            if (!(await verifyCaptcha(body.turnstileToken, req.ip))) return { status: 403, body: { error: "Captcha verification failed" } };

            await addTicketMessage({
                teamId: team.id,
                ticketDbId: ticket.id,
                author: "requester",
                content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: body.message }] }] },
            });

            const recipient = await getTicketNotificationRecipient(team.id, ticket.assigneeAccountId);
            if (recipient) {
                notifyTeamOfRequesterMessage({ teamId: team.id, ticketId: ticket.ticketId, recipientEmail: recipient, subject: ticket.subject }).catch(() => {});
            }

            const messages = await getTicketMessages(ticket.id);
            return { status: 200, body: toPublicTicketThread(ticket, messages) };
        },
    },
});

createExpressEndpoints(contract.public, impl, router);

export default router;
