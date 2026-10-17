import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { listPages } from "../pages/queries";
import { accounts, authSession, authUser, pages } from "../db/schema";
import {
  createAccountWithDefaultTeam,
  ensureFrontLitAccountForUser,
  findAccountByEmail,
} from "../account/queries";
import {
  createTeam,
  findOrCreateTeamByExternalId,
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

  it("persists provisioned DNS settings and only fills missing values on retries", async () => {
    const owner = await makeOwner();
    const externalId = `courselit:${crypto.randomUUID()}`;
    const initial = await findOrCreateTeamByExternalId({
      externalId,
      ownerAccountId: owner.id,
      ownerEmail: owner.email,
      name: "CourseLit school",
      customDomainCnameTarget: "domains.courselit.example",
      customDomainTxtRecordName: "_courselit-verification",
    });
    expect(initial).toMatchObject({
      customDomainCnameTarget: "domains.courselit.example",
      customDomainTxtRecordName: "_courselit-verification",
    });

    const retried = await findOrCreateTeamByExternalId({
      externalId,
      ownerAccountId: owner.id,
      name: "CourseLit school",
      customDomainCnameTarget: "changed.example",
      customDomainTxtRecordName: "_changed-verification",
    });
    expect(retried.customDomainCnameTarget).toBe("domains.courselit.example");
    expect(retried.customDomainTxtRecordName).toBe("_courselit-verification");
  });

  it("seeds the standard, non-deletable pages", async () => {
    const owner = await makeOwner();
    const team = await createTeam({
      ownerAccountId: owner.id,
      name: `Acme ${crypto.randomUUID().slice(0, 8)}`,
    });

    const teamPages = await listPages({ teamId: team.id, itemsPerPage: 100 });
    const slugs = teamPages.map((p) => p.slug).sort();
    expect(slugs).toEqual(
      ["", "blog", "changelog", "docs", "help", "privacy", "terms"].sort(),
    );
    expect(teamPages.every((p) => !p.deletable)).toBe(true);
    expect(teamPages.every((p) => p.publishedAt !== null)).toBe(true);
    expect(teamPages.every((p) => p.status === "published")).toBe(true);
    expect(
      teamPages.every(
        (p) => p.layout[0]?.name === "header" && p.layout.at(-1)?.name === "footer",
      ),
    ).toBe(true);
    expect(
      teamPages.every(
        (p) =>
          p.layout[0]?.shared &&
          !p.layout[0]?.deletable &&
          p.layout.at(-1)?.shared &&
          !p.layout.at(-1)?.deletable,
      ),
    ).toBe(true);

    const helpPage = teamPages.find((p) => p.slug === "help");
    expect(helpPage?.layout.map((widget) => widget.name)).toEqual([
      "header",
      "support-form",
      "footer",
    ]);

    const sources = {
      blog: "articles",
      changelog: "product-updates",
      docs: "documentation",
    } as const;
    for (const [slug, source] of Object.entries(sources)) {
      const standardPage = teamPages.find((p) => p.slug === slug);
      expect(
        standardPage?.layout.filter((widget) => widget.name === "data-slot"),
      ).toEqual([
        expect.objectContaining({
          deletable: false,
          moveable: true,
          shared: false,
          settings: {
            slot: "content-feed",
            source,
          },
        }),
      ]);
    }
  });

  it("seeds only specified pages with deletable flags when passed to createTeam", async () => {
    const owner = await makeOwner();
    const team = await createTeam({
      ownerAccountId: owner.id,
      name: `Acme ${crypto.randomUUID().slice(0, 8)}`,
      pages: [
        { slug: "blog", deletable: true },
        { slug: "help", deletable: false },
        { slug: "custom", name: "Custom", deletable: false },
      ],
    });

    const teamPages = await listPages({ teamId: team.id, itemsPerPage: 100 });
    const bySlug = new Map(teamPages.map((p) => [p.slug, p]));
    expect(bySlug.get("blog")?.deletable).toBe(true);
    expect(bySlug.get("help")?.deletable).toBe(false);
    expect(bySlug.get("custom")?.deletable).toBe(false);
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

  it("allows a first-time signed-in account to remain teamless", async () => {
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
    expect(teams).toHaveLength(0);
  });

  it("does not create a team when linking an existing bare account", async () => {
    const email = `legacy-${crypto.randomUUID()}@example.com`;
    await db.insert(accounts).values({ email });

    const account = await ensureFrontLitAccountForUser({
      email,
      name: "Legacy User",
    });
    const teams = await listTeamsForAccount(account.id);
    expect(teams).toHaveLength(0);
  });

  it("creates a default team only through the explicit bootstrap helper", async () => {
    const email = `bootstrap-${crypto.randomUUID()}@example.com`;
    const account = await createAccountWithDefaultTeam(email, "Bootstrap User");
    const teams = await listTeamsForAccount(account.id);

    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe("Bootstrap User's Team");
    expect(teams[0].subdomain).toBeNull();
    expect(
      await db.query.pages.findMany({
        where: eq(pages.teamId, teams[0].id),
      }),
    ).toHaveLength(7);
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
    const firstTeam = await createTeam({
      ownerAccountId: account.id,
      ownerEmail: account.email,
      name: "First Team",
    });
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
