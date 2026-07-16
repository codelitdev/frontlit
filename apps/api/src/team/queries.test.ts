import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { accounts, domains, pages } from "../db/schema";
import { createTeam, findAccountByEmail } from "./queries";
import { getBaseDomain } from "../domains/queries";

describe("createTeam", () => {
    const db = testDb as unknown as TestDb;

    beforeEach(async () => {
        delete process.env.SENDLIT_API_URL;
    });

    async function makeOwner() {
        const [account] = await db.insert(accounts).values({ email: `owner-${crypto.randomUUID()}@example.com` }).returning();
        return account;
    }

    it("provisions a verified, primary subdomain immediately", async () => {
        const owner = await makeOwner();
        const team = await createTeam({ ownerAccountId: owner.id, name: `Acme ${crypto.randomUUID().slice(0, 8)}` });

        const teamDomains = await db.query.domains.findMany({ where: eq(domains.teamId, team.id) });
        expect(teamDomains).toHaveLength(1);
        expect(teamDomains[0].isPrimary).toBe(true);
        expect(teamDomains[0].status).toBe("verified");
        expect(teamDomains[0].hostname.endsWith(`.${getBaseDomain()}`)).toBe(true);
    });

    it("seeds the standard, non-deleteable pages", async () => {
        const owner = await makeOwner();
        const team = await createTeam({ ownerAccountId: owner.id, name: `Acme ${crypto.randomUUID().slice(0, 8)}` });

        const teamPages = await db.query.pages.findMany({ where: eq(pages.teamId, team.id) });
        const slugs = teamPages.map((p) => p.slug).sort();
        expect(slugs).toEqual(["", "blog", "changelog", "docs", "help", "privacy", "terms"].sort());
        expect(teamPages.every((p) => !p.deleteable)).toBe(true);
        expect(teamPages.every((p) => p.publishedAt !== null)).toBe(true);

        const helpPage = teamPages.find((p) => p.slug === "help");
        expect(helpPage?.layout).toEqual([expect.objectContaining({ name: "support-form" })]);
    });

    it("skips SendLit provisioning silently when SENDLIT_API_URL isn't configured", async () => {
        const owner = await makeOwner();
        await expect(
            createTeam({ ownerAccountId: owner.id, name: "No SendLit", ownerEmail: owner.email }),
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
