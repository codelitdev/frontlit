import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("node:dns", () => ({ promises: { resolveTxt: vi.fn() } }));

import { promises as dns } from "node:dns";
import { db as testDb } from "../db/client";
import { teams } from "../db/schema";
import {
    attachCustomDomain,
    getCustomDomainCnameTarget,
    getPlatformSiteDomain,
    getDomainSettings,
    getSubdomainHost,
    normalizeHost,
    removeCustomDomain,
    resolveHost,
    setTeamSubdomain,
    verifyCustomDomain,
} from "./queries";

function uniqueName(label: string): string {
    return `${label} ${crypto.randomUUID().slice(0, 8)}`;
}

describe("team website domains", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        vi.mocked(dns.resolveTxt).mockReset();
        const seeded = await seedTeam(db, { name: uniqueName("Acme Inc") });
        teamId = seeded.team.id;
    });

    it("keeps only an environment-independent subdomain label on the team", async () => {
        const settings = await getDomainSettings(teamId);
        expect(settings?.subdomain?.name).toMatch(/^team-/);
        expect(settings?.subdomain?.hostname).toBe(getSubdomainHost(settings!.subdomain!.name));
        expect(settings?.customDomain).toBeNull();
        expect(settings?.canonicalHost).toBe(settings?.subdomain?.hostname);
    });

    it("does not resolve a team before it deliberately claims a subdomain", async () => {
        const { team } = await seedTeam(db, { name: "Not Live" });
        await db.update(teams).set({ subdomain: null }).where(eq(teams.id, team.id));

        expect((await getDomainSettings(team.id))?.subdomain).toBeNull();
        expect((await getDomainSettings(team.id))?.canonicalHost).toBeNull();
        expect(await resolveHost("not-live.localhost")).toBeNull();
        expect(await attachCustomDomain(team.id, "not-live.example.com")).toEqual({ ok: false, reason: "subdomain_required" });
    });

    it("renames a subdomain label and rejects a duplicate", async () => {
        const newSubdomain = `new-${crypto.randomUUID().slice(0, 8)}`;
        expect(await setTeamSubdomain(teamId, newSubdomain)).toEqual({ ok: true });
        expect((await getDomainSettings(teamId))?.subdomain?.hostname).toBe(`${newSubdomain}.${getPlatformSiteDomain()}`);

        const { team: other } = await seedTeam(db, { name: "Other" });
        expect(await setTeamSubdomain(other.id, newSubdomain)).toEqual({ ok: false, reason: "taken" });
    });

    it("attaches a pending custom domain and exposes verification records", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        expect(await attachCustomDomain(teamId, hostname)).toEqual({ ok: true });

        const settings = await getDomainSettings(teamId);
        expect(settings?.customDomain).toMatchObject({ hostname, status: "pending", verifiedAt: null });
        expect(settings?.verificationRecords).toMatchObject({
            cnameTarget: getCustomDomainCnameTarget(),
            txtName: `_frontlit-verify.${hostname}`,
        });
    });

    it("rejects a platform host, a second custom domain, and an already-claimed custom domain", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        expect(await attachCustomDomain(teamId, `foo.${getPlatformSiteDomain()}`)).toEqual({ ok: false, reason: "reserved" });
        expect(await attachCustomDomain(teamId, "another.com")).toEqual({ ok: false, reason: "already_attached" });

        const { team: other } = await seedTeam(db, { name: "Other" });
        expect(await attachCustomDomain(other.id, hostname)).toEqual({ ok: false, reason: "taken" });
    });

    it("makes a verified custom domain canonical while both hosts resolve", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        const pending = await getDomainSettings(teamId);
        vi.mocked(dns.resolveTxt).mockResolvedValue([[pending!.verificationRecords!.txtValue]]);
        expect(await verifyCustomDomain(teamId)).toBe("verified");

        const settings = await getDomainSettings(teamId);
        expect(settings?.canonicalHost).toBe(hostname);
        expect(await resolveHost(`${settings!.subdomain!.hostname}:3002`)).toEqual({ teamId, canonicalHost: hostname });
        expect(await resolveHost(hostname)).toEqual({ teamId, canonicalHost: hostname });
    });

    it("does not resolve an unverified custom domain and clears all custom-domain state on removal", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        expect(await resolveHost(hostname)).toBeNull();
        expect(await removeCustomDomain(teamId)).toBe(true);
        const settings = await getDomainSettings(teamId);
        expect(settings?.customDomain).toBeNull();
        expect(settings?.verificationRecords).toBeNull();
        expect(settings?.canonicalHost).toBe(settings?.subdomain?.hostname);
    });

    it("normalizes ports and casing in host headers", () => {
        expect(normalizeHost("CoDeLiT.Localhost:3002")).toBe("codelit.localhost");
    });
});
