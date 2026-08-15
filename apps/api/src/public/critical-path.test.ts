import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
import { getSubdomainHost } from "../domains/queries";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../tickets/notify", () => ({
    notifyTeamOfRequesterMessage: vi.fn().mockResolvedValue(undefined),
    notifyRequesterOfReply: vi.fn().mockResolvedValue(undefined),
    notifyRequesterOfTicketCreated: vi.fn().mockResolvedValue(undefined),
}));

import { db as testDb } from "../db/client";
import { outboxJobs, ticketMailOutbox } from "../db/schema";
import { updateChatbotSettings } from "../chatbot/queries";
import {
    createDocument,
    publishDocument,
    updateDocument,
} from "../documents/queries";
import { createPage, publishPage } from "../pages/queries";
import { updateTeamSettings } from "../settings/queries";
import { createTheme } from "../themes/queries";
import publicRoutes from "./routes";

const originalEnv = { ...process.env };

async function withServer(
    run: (origin: string) => Promise<void>,
): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use(publicRoutes);
    const server = app.listen(0, "127.0.0.1");
    try {
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const { port } = server.address() as AddressInfo;
        await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

describe("public critical paths", () => {
    const db = testDb as unknown as TestDb;
    let teamInternalId: string;
    let teamPublicId: string;
    let subdomainHost: string;

    beforeEach(async () => {
        process.env = { ...originalEnv };
        process.env.CAPTCHA_PROVIDER = "none";
        delete process.env.TURNSTILE_SECRET_KEY;

        const seeded = await seedTeam(db);
        teamInternalId = seeded.team.id;
        teamPublicId = seeded.team.teamId;
        subdomainHost = getSubdomainHost(seeded.team.subdomain!);
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("resolves a known host and rejects an unknown host", async () => {
        await withServer(async (origin) => {
            const ok = await fetch(
                `${origin}/public/resolve-host?host=${encodeURIComponent(subdomainHost)}`,
            );
            expect(ok.status).toBe(200);
            expect(await ok.json()).toEqual({
                teamId: teamPublicId,
                canonicalHost: subdomainHost,
            });

            const missing = await fetch(
                `${origin}/public/resolve-host?host=${encodeURIComponent("unknown.example.com")}`,
            );
            expect(missing.status).toBe(404);
        });
    });

    it("serves the single team site theme from public settings", async () => {
        const theme = await createTheme({
            teamId: teamInternalId,
            name: "Brand",
            style: { colors: { light: { primary: "#123456" } } },
        });
        await updateTeamSettings(teamInternalId, { themeId: theme.themeId });

        await withServer(async (origin) => {
            const response = await fetch(
                `${origin}/public/${teamPublicId}/settings`,
            );
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                themeId: theme.themeId,
                theme: theme.style,
            });
        });
    });

    it("serves only published pages and docs by slug", async () => {
        const draftPage = await createPage({
            teamId: teamInternalId,
            name: "Pricing",
            type: "custom",
        });
        const publishedPage = await createPage({
            teamId: teamInternalId,
            name: "About",
            type: "custom",
        });
        await publishPage(teamInternalId, publishedPage.pageId);

        const draftDoc = await createDocument("doc", {
            teamId: teamInternalId,
            title: "Draft Guide",
        });
        const publishedDoc = await createDocument("doc", {
            teamId: teamInternalId,
            title: "Live Guide",
        });
        await updateDocument("doc", teamInternalId, publishedDoc.documentId, {
            content: {
                type: "doc",
                content: [
                    {
                        type: "paragraph",
                        content: [{ type: "text", text: "Published body." }],
                    },
                ],
            },
        });
        await publishDocument("doc", teamInternalId, publishedDoc.documentId);

        await withServer(async (origin) => {
            const livePage = await fetch(
                `${origin}/public/${teamPublicId}/pages?slug=${encodeURIComponent(publishedPage.slug)}`,
            );
            expect(livePage.status).toBe(200);
            expect(await livePage.json()).toMatchObject({
                pageId: publishedPage.pageId,
                slug: publishedPage.slug,
                name: "About",
            });

            const unpublishedPage = await fetch(
                `${origin}/public/${teamPublicId}/pages?slug=${encodeURIComponent(draftPage.slug)}`,
            );
            expect(unpublishedPage.status).toBe(404);

            const liveDoc = await fetch(
                `${origin}/public/${teamPublicId}/content/documentation/${encodeURIComponent(publishedDoc.slug)}`,
            );
            expect(liveDoc.status).toBe(200);
            expect(await liveDoc.json()).toMatchObject({
                documentId: publishedDoc.documentId,
                slug: publishedDoc.slug,
                title: "Live Guide",
            });

            const unpublishedDoc = await fetch(
                `${origin}/public/${teamPublicId}/content/documentation/${encodeURIComponent(draftDoc.slug)}`,
            );
            expect(unpublishedDoc.status).toBe(404);
        });
    });

    it("blocks chat when disabled and answers when enabled", async () => {
        await withServer(async (origin) => {
            const disabled = await fetch(
                `${origin}/public/${teamPublicId}/chat`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ message: "How do I get started?" }),
                },
            );
            expect(disabled.status).toBe(403);
            expect(await disabled.json()).toMatchObject({
                error: "Chatbot is not enabled for this team",
            });
        });

        await updateChatbotSettings(teamInternalId, { enabled: true });

        await withServer(async (origin) => {
            const enabled = await fetch(
                `${origin}/public/${teamPublicId}/chat`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ message: "How do I get started?" }),
                },
            );
            expect(enabled.status).toBe(200);
            const body = (await enabled.json()) as {
                outcome: string;
                answer: string | null;
                conversationId: string;
                conversationToken: string;
                sources: unknown[];
                escalate: boolean;
            };
            expect(body.outcome).toBe("human_only");
            expect(body.answer).toBeNull();
            expect(body.escalate).toBe(false);
            expect(body.conversationId).toMatch(/^tkt_/);
            expect(body.conversationToken).toEqual(expect.any(String));
            expect(body.sources).toEqual([]);
        });
    });

    it("enqueues lead capture to the outbox and rejects captcha failures", async () => {
        await withServer(async (origin) => {
            const accepted = await fetch(
                `${origin}/public/${teamPublicId}/leads`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        email: "lead@example.com",
                        sourcePath: "/pricing",
                    }),
                },
            );
            expect(accepted.status).toBe(200);
            expect(await accepted.json()).toEqual({ accepted: true });
        });

        const jobs = await db.query.outboxJobs.findMany({
            where: eq(outboxJobs.teamId, teamInternalId),
        });
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            type: "contact_sync",
            status: "pending",
            payload: {
                email: "lead@example.com",
                sourcePath: "/pricing",
            },
        });

        process.env.CAPTCHA_PROVIDER = "turnstile";
        process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";

        await withServer(async (origin) => {
            const rejected = await fetch(
                `${origin}/public/${teamPublicId}/leads`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email: "bot@example.com" }),
                },
            );
            expect(rejected.status).toBe(403);
            expect(await rejected.json()).toMatchObject({
                error: "Captcha verification failed",
            });
        });

        const afterReject = await db.query.outboxJobs.findMany({
            where: eq(outboxJobs.teamId, teamInternalId),
        });
        expect(afterReject).toHaveLength(1);
    });

    it("creates a public ticket, serves the thread with a valid token, and rejects a bad token", async () => {
        await withServer(async (origin) => {
            const created = await fetch(
                `${origin}/public/${teamPublicId}/tickets`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        subject: "Billing question",
                        message: "I was charged twice.",
                        email: "customer@example.com",
                        name: "Casey",
                        source: "form",
                    }),
                },
            );
            expect(created.status).toBe(200);
            const { ticketId, token } = (await created.json()) as {
                ticketId: string;
                token: string;
            };
            expect(ticketId).toMatch(/^tkt_/);
            expect(token.length).toBeGreaterThan(10);
            const mail = await db.query.ticketMailOutbox.findMany({
                where: eq(ticketMailOutbox.teamId, teamInternalId),
            });
            expect(mail).toHaveLength(1);
            expect(mail[0]).toMatchObject({
                sequence: 1,
                kind: "receipt",
                status: "pending",
                payload: { token },
            });

            const thread = await fetch(
                `${origin}/public/${teamPublicId}/tickets/${ticketId}/messages?token=${encodeURIComponent(token)}`,
            );
            expect(thread.status).toBe(200);
            const body = (await thread.json()) as {
                ticketId: string;
                subject: string;
                requesterEmail: string;
                messages: unknown[];
                accessTokenHash?: string;
            };
            expect(body).toMatchObject({
                ticketId,
                subject: "Billing question",
                requesterEmail: "customer@example.com",
            });
            expect(body.messages).toHaveLength(1);
            expect(body.accessTokenHash).toBeUndefined();

            const jobs = await db.query.outboxJobs.findMany({
                where: eq(outboxJobs.teamId, teamInternalId),
            });
            expect(jobs).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: "contact_sync",
                        status: "pending",
                        payload: {
                            email: "customer@example.com",
                            name: "Casey",
                            sourcePath: "/help",
                        },
                    }),
                ]),
            );

            const badToken = await fetch(
                `${origin}/public/${teamPublicId}/tickets/${ticketId}/messages?token=not-the-token`,
            );
            expect(badToken.status).toBe(401);
        });
    });
});
