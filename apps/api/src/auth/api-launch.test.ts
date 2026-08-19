import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
import { authHeaders, listenApp, principalFromHeader } from "../test/auth-app";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./resolve-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./resolve-auth")>();
    return {
        ...actual,
        resolveAuth: async (input: { headers?: Record<string, unknown> }) => {
            const header = input.headers?.["x-test-principal"];
            const value = Array.isArray(header) ? header[0] : header;
            return principalFromHeader(
                typeof value === "string" ? value : undefined,
            );
        },
    };
});

import { db as testDb } from "../db/client";
import { accounts, teamMembers } from "../db/schema";

const db = testDb as unknown as TestDb;

describe("API launch", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("serves health and denies a restricted member on a protected path", async () => {
        const { team } = await seedTeam(db);
        const [member] = await db
            .insert(accounts)
            .values({ email: "restricted@example.com" })
            .returning();
        await db.insert(teamMembers).values({
            teamId: team.id,
            accountId: member.id,
            role: "member",
            permissions: ["pages:read"],
        });
        const listening = await listenApp();
        try {
            const health = await fetch(`${listening.origin}/health`);
            expect(health.status).toBe(200);
            const body = (await health.json()) as {
                status: string;
                uptime: number;
            };
            expect(body.status).toBe("ok");
            expect(typeof body.uptime).toBe("number");

            const denied = await fetch(`${listening.origin}/pages`, {
                method: "POST",
                headers: authHeaders(
                    {
                        kind: "session",
                        accountId: member.id,
                        email: member.email,
                    },
                    team.teamId,
                ),
                body: JSON.stringify({ name: "Nope", type: "custom" }),
            });
            expect(denied.status).toBe(403);
            await expect(denied.json()).resolves.toMatchObject({
                error: "insufficient_permission",
                permission: "pages:write",
            });
        } finally {
            await listening.close();
        }
    });
});
