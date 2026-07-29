import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { accounts, authSession, authUser, pages } from "../db/schema";
import {
    ensureFrontLitAccountForUser,
    findAccountByEmail,
} from "../account/queries";
import {
    createTeam,
    getOAuthTeamSelection,
    listTeamsForAccount,
    setOAuthTeamSelection,
} from "./queries";

describe("createTeam", () => {
    const db = testDb as unknown as TestDb;

    beforeEach(async () => {
        delete process.env.SENDLIT_API_URL;
    });

    async function makeOwner() {
        const [account] = await db
            .insert(accounts)
            .values({ email: `owner-${crypto.randomUUID()}@example.com` })
            .returning();
        return account;
    }

    it("leaves the team's public website inactive until it claims a subdomain", async () => {
        const owner = await makeOwner();
        const team = await createTeam({
            ownerAccountId: owner.id,
            name: `Acme ${crypto.randomUUID().slice(0, 8)}`,
        });

        expect(team.subdomain).toBeNull();
        expect(team.customDomain).toBeNull();
    });

    it("seeds the standard, non-deleteable pages", async () => {
        const owner = await makeOwner();
        const team = await createTeam({
            ownerAccountId: owner.id,
            name: `Acme ${crypto.randomUUID().slice(0, 8)}`,
        });

        const teamPages = await db.query.pages.findMany({
            where: eq(pages.teamId, team.id),
        });
        const slugs = teamPages.map((p) => p.slug).sort();
        expect(slugs).toEqual(
            [
                "",
                "blog",
                "changelog",
                "docs",
                "help",
                "privacy",
                "terms",
            ].sort(),
        );
        expect(teamPages.every((p) => !p.deleteable)).toBe(true);
        expect(teamPages.every((p) => p.publishedAt !== null)).toBe(true);
        expect(
            teamPages.every(
                (p) =>
                    p.layout[0]?.name === "header" &&
                    p.layout.at(-1)?.name === "footer",
            ),
        ).toBe(true);
        expect(
            teamPages.every(
                (p) =>
                    p.layout[0]?.shared &&
                    !p.layout[0]?.deleteable &&
                    p.layout.at(-1)?.shared &&
                    !p.layout.at(-1)?.deleteable,
            ),
        ).toBe(true);

        const helpPage = teamPages.find((p) => p.slug === "help");
        expect(helpPage?.layout.map((widget) => widget.name)).toEqual([
            "header",
            "support-form",
            "footer",
        ]);
    });

    it("skips SendLit provisioning silently when SENDLIT_API_URL isn't configured", async () => {
        const owner = await makeOwner();
        await expect(
            createTeam({
                ownerAccountId: owner.id,
                name: "No SendLit",
                ownerEmail: owner.email,
            }),
        ).resolves.toBeTruthy();
    });
});

describe("findAccountByEmail", () => {
    const db = testDb as unknown as TestDb;

    it("finds an account by email", async () => {
        const email = `find-${crypto.randomUUID()}@example.com`;
        await db.insert(accounts).values({ email });
        expect((await findAccountByEmail(email))?.email).toBe(email);
    });
});

describe("account team lifecycle", () => {
    const db = testDb as unknown as TestDb;

    it("gives a first-time signed-in account one default team", async () => {
        const authUserId = `auth-${crypto.randomUUID()}`;
        const email = `signup-${crypto.randomUUID()}@example.com`;
        await db.insert(authUser).values({
            id: authUserId,
            email,
            name: "New User",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const account = await ensureFrontLitAccountForUser({
            id: authUserId,
            email,
            name: "New User",
        });

        const teams = await listTeamsForAccount(account.id);
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe("New User's Team");
        expect(teams[0].subdomain).toBeNull();
        expect(
            await db.query.pages.findMany({
                where: eq(pages.teamId, teams[0].id),
            }),
        ).toHaveLength(7);
    });

    it("backfills the default team for accounts created by the old auth flow", async () => {
        const email = `legacy-${crypto.randomUUID()}@example.com`;
        await db.insert(accounts).values({ email });

        const account = await ensureFrontLitAccountForUser({
            email,
            name: "Legacy User",
        });
        const teams = await listTeamsForAccount(account.id);
        expect(teams).toHaveLength(1);
        expect(teams[0].name).toBe("Legacy User's Team");
    });
});

describe("OAuth team selection", () => {
    const db = testDb as unknown as TestDb;

    it("persists one live team choice per Better Auth session", async () => {
        const userId = `auth-${crypto.randomUUID()}`;
        const email = `oauth-${crypto.randomUUID()}@example.com`;
        await db.insert(authUser).values({
            id: userId,
            email,
            name: "OAuth User",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const account = await ensureFrontLitAccountForUser({
            id: userId,
            email,
            name: "OAuth User",
        });
        const [firstTeam] = await listTeamsForAccount(account.id);
        const secondTeam = await createTeam({
            ownerAccountId: account.id,
            ownerEmail: account.email,
            name: "Second Team",
        });
        const sessionId = `session-${crypto.randomUUID()}`;
        await db.insert(authSession).values({
            id: sessionId,
            token: `token-${crypto.randomUUID()}`,
            userId,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await setOAuthTeamSelection(sessionId, firstTeam.id);
        expect(await getOAuthTeamSelection(sessionId)).toBe(firstTeam.id);

        await setOAuthTeamSelection(sessionId, secondTeam.id);
        expect(await getOAuthTeamSelection(sessionId)).toBe(secondTeam.id);
    });
});
