import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { accounts, teamMembers, teams } from "../db/schema";
import { GRANTABLE_NON_OWNER_PERMISSIONS } from "@frontlit/api-contract";
import { computeEffectivePermissions } from "@frontlit/api-contract";
import { reportOwnershipInvariants } from "./membership";

const db = testDb as unknown as TestDb;

describe("membership migration and ownership invariants", () => {
    beforeEach(async () => {
        await truncateAll(db);
    });

    it("keeps owner implicit-all and backfills non-owners without API-key grants", async () => {
        const { account, team } = await seedTeam(db);
        const [member] = await db
            .insert(accounts)
            .values({ email: "legacy@example.com" })
            .returning();
        await db.insert(teamMembers).values({
            teamId: team.id,
            accountId: member.id,
            role: "member",
            permissions: [...GRANTABLE_NON_OWNER_PERMISSIONS],
        });

        const ownerRow = await db.query.teamMembers.findFirst({
            where: eq(teamMembers.accountId, account.id),
        });
        expect(ownerRow?.permissions ?? []).toEqual([]);
        expect(
            computeEffectivePermissions(ownerRow?.permissions ?? [], {
                isOwner: true,
            }),
        ).toEqual([...GRANTABLE_NON_OWNER_PERMISSIONS]);

        const memberRow = await db.query.teamMembers.findFirst({
            where: eq(teamMembers.accountId, member.id),
        });
        expect(memberRow?.permissions).toEqual([
            ...GRANTABLE_NON_OWNER_PERMISSIONS,
        ]);
        expect(memberRow?.permissions).not.toContain("api_keys:write");
    });

    it("reports missing or extra owner relationships without repairing them", async () => {
        const { account, team } = await seedTeam(db);
        await db.delete(teamMembers);
        const [stranger] = await db
            .insert(accounts)
            .values({ email: "stranger@example.com" })
            .returning();
        await db.insert(teamMembers).values({
            teamId: team.id,
            accountId: stranger.id,
            role: "owner",
            permissions: [],
        });
        const report = await reportOwnershipInvariants();
        expect(report.missingOwnerMemberships).toBeGreaterThan(0);
        expect(report.unexpectedOwnerRoleRows).toBeGreaterThan(0);
        const stillOwner = await db.query.teams.findFirst({
            where: eq(teams.ownerAccountId, account.id),
        });
        expect(stillOwner?.ownerAccountId).toBe(account.id);
    });
});
