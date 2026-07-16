import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("node:dns", () => ({ promises: { resolveTxt: vi.fn() } }));

import { promises as dns } from "node:dns";
import { db as testDb } from "../db/client";
import {
    attachCustomDomain,
    domainKind,
    getBaseDomain,
    getDomainSettings,
    provisionSubdomain,
    removeCustomDomain,
    resolveHost,
    setPrimaryDomain,
    setTeamSubdomain,
    verifyCustomDomain,
} from "./queries";

// `domains.hostname` is unique across the whole table (not team-scoped), and
// these tests share one PGlite instance per file with no truncation between
// tests (matching this repo's other queries.test.ts files) — so every team
// name is randomized to avoid cross-test slug collisions instead of
// asserting against a hardcoded hostname.
function uniqueName(label: string): string {
    return `${label} ${crypto.randomUUID().slice(0, 8)}`;
}

describe("domains", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;
    let teamName: string;

    beforeEach(async () => {
        vi.mocked(dns.resolveTxt).mockReset();
        teamName = uniqueName("Acme Inc");
        const seeded = await seedTeam(db, { name: teamName });
        teamId = seeded.team.id;
    });

    it("provisions a verified, primary subdomain from the team name", async () => {
        const subdomain = await provisionSubdomain(teamId, teamName);

        expect(subdomain.hostname).toMatch(new RegExp(`^acme-inc-\\w+\\.${getBaseDomain()}$`));
        expect(subdomain.status).toBe("verified");
        expect(subdomain.isPrimary).toBe(true);
        expect(domainKind(subdomain.hostname)).toBe("subdomain");
    });

    it("uniquifies the subdomain slug across teams sharing the same name", async () => {
        const first = await provisionSubdomain(teamId, "Shared Name");
        const { team: other } = await seedTeam(db, { name: "Shared Name" });
        const second = await provisionSubdomain(other.id, "Shared Name");

        expect(first.hostname).not.toBe(second.hostname);
        expect(second.hostname.startsWith("shared-name")).toBe(true);
    });

    it("getDomainSettings backfills a subdomain for a team that has none yet", async () => {
        const settings = await getDomainSettings(teamId);

        expect(settings.subdomain?.hostname.startsWith("acme-inc")).toBe(true);
        expect(settings.customDomain).toBeNull();
        expect(settings.verificationRecords).toBeNull();
    });

    it("renames the subdomain slug, rejecting an already-taken hostname", async () => {
        await provisionSubdomain(teamId, teamName);
        const { team: other } = await seedTeam(db, { name: "Other" });
        const otherSubdomain = await provisionSubdomain(other.id, uniqueName("Other"));

        const newSlug = uniqueName("new-slug").toLowerCase().replace(/\s+/g, "-");
        const renamed = await setTeamSubdomain(teamId, newSlug);
        expect(renamed.ok).toBe(true);
        expect(renamed.ok && renamed.domain.hostname).toBe(`${newSlug}.${getBaseDomain()}`);

        const takenSlug = otherSubdomain.hostname.slice(0, otherSubdomain.hostname.indexOf(`.${getBaseDomain()}`));
        const clash = await setTeamSubdomain(teamId, takenSlug);
        expect(clash).toEqual({ ok: false, reason: "taken" });
    });

    it("attaches a custom domain as pending with verification records", async () => {
        await provisionSubdomain(teamId, teamName);
        const customHostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        const result = await attachCustomDomain(teamId, customHostname);

        expect(result.ok).toBe(true);
        expect(result.ok && result.domain.status).toBe("pending");
        expect(result.ok && result.domain.isPrimary).toBe(false);

        const settings = await getDomainSettings(teamId);
        expect(settings.verificationRecords).toEqual({
            cnameTarget: `sites.${getBaseDomain()}`,
            txtName: `_frontlit-verify.${customHostname}`,
            txtValue: settings.customDomain!.verificationToken,
        });
    });

    it("refuses to attach a hostname under DOMAIN, a second custom domain, or one already claimed", async () => {
        await provisionSubdomain(teamId, teamName);
        const customHostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, customHostname);

        expect(await attachCustomDomain(teamId, `foo.${getBaseDomain()}`)).toEqual({ ok: false, reason: "reserved" });
        expect(await attachCustomDomain(teamId, "another.com")).toEqual({ ok: false, reason: "already_attached" });

        const { team: other } = await seedTeam(db, { name: "Other" });
        await provisionSubdomain(other.id, uniqueName("Other"));
        expect(await attachCustomDomain(other.id, customHostname)).toEqual({ ok: false, reason: "taken" });
    });

    it("verifies via DNS TXT lookup and flips status on match", async () => {
        await provisionSubdomain(teamId, teamName);
        const result = (await attachCustomDomain(teamId, `${crypto.randomUUID().slice(0, 8)}.com`)) as {
            ok: true;
            domain: { verificationToken: string };
        };

        vi.mocked(dns.resolveTxt).mockResolvedValueOnce([[result.domain.verificationToken]]);
        const verified = await verifyCustomDomain(teamId);
        expect(verified?.status).toBe("verified");
        expect(verified?.verifiedAt).not.toBeNull();
    });

    it("marks failed when the TXT record doesn't match", async () => {
        await provisionSubdomain(teamId, teamName);
        await attachCustomDomain(teamId, `${crypto.randomUUID().slice(0, 8)}.com`);

        vi.mocked(dns.resolveTxt).mockResolvedValueOnce([["wrong-token"]]);
        const result = await verifyCustomDomain(teamId);
        expect(result?.status).toBe("failed");
    });

    it("marks failed when the DNS lookup throws (no record yet)", async () => {
        await provisionSubdomain(teamId, teamName);
        await attachCustomDomain(teamId, `${crypto.randomUUID().slice(0, 8)}.com`);

        vi.mocked(dns.resolveTxt).mockRejectedValueOnce(new Error("ENOTFOUND"));
        const result = await verifyCustomDomain(teamId);
        expect(result?.status).toBe("failed");
    });

    it("refuses to switch primary to an unverified custom domain", async () => {
        await provisionSubdomain(teamId, teamName);
        await attachCustomDomain(teamId, `${crypto.randomUUID().slice(0, 8)}.com`);

        const result = await setPrimaryDomain(teamId, "custom");
        expect(result).toEqual({ ok: false, reason: "custom_not_verified" });
    });

    it("switches primary to a verified custom domain and back", async () => {
        const subdomain = await provisionSubdomain(teamId, teamName);
        await attachCustomDomain(teamId, `${crypto.randomUUID().slice(0, 8)}.com`);
        vi.mocked(dns.resolveTxt).mockResolvedValue([[(await getDomainSettings(teamId)).customDomain!.verificationToken]]);
        await verifyCustomDomain(teamId);

        const switched = await setPrimaryDomain(teamId, "custom");
        expect(switched.ok).toBe(true);

        let settings = await getDomainSettings(teamId);
        expect(settings.subdomain?.isPrimary).toBe(false);
        expect(settings.customDomain?.isPrimary).toBe(true);

        await setPrimaryDomain(teamId, "subdomain");
        settings = await getDomainSettings(teamId);
        expect(settings.subdomain?.isPrimary).toBe(true);
        expect(settings.customDomain?.isPrimary).toBe(false);
        expect(subdomain.hostname).toBe(settings.subdomain?.hostname);
    });

    it("removing the primary custom domain resets primary to the subdomain", async () => {
        await provisionSubdomain(teamId, teamName);
        const customHostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, customHostname);
        vi.mocked(dns.resolveTxt).mockResolvedValue([[(await getDomainSettings(teamId)).customDomain!.verificationToken]]);
        await verifyCustomDomain(teamId);
        await setPrimaryDomain(teamId, "custom");

        const removed = await removeCustomDomain(teamId);
        expect(removed?.hostname).toBe(customHostname);

        const settings = await getDomainSettings(teamId);
        expect(settings.customDomain).toBeNull();
        expect(settings.subdomain?.isPrimary).toBe(true);
    });

    it("resolveHost never resolves an unverified custom domain, and answers with the team's current primary", async () => {
        await provisionSubdomain(teamId, teamName);
        const customHostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, customHostname);

        expect(await resolveHost(customHostname)).toBeNull();

        const settings = await getDomainSettings(teamId);
        const subdomainResolved = await resolveHost(settings.subdomain!.hostname);
        expect(subdomainResolved).toEqual({ teamId, isPrimary: true, primaryHost: settings.subdomain!.hostname });

        vi.mocked(dns.resolveTxt).mockResolvedValue([[settings.customDomain!.verificationToken]]);
        await verifyCustomDomain(teamId);
        await setPrimaryDomain(teamId, "custom");

        const customResolved = await resolveHost(customHostname);
        expect(customResolved).toEqual({ teamId, isPrimary: true, primaryHost: customHostname });

        const nonPrimarySubdomainResolved = await resolveHost(settings.subdomain!.hostname);
        expect(nonPrimarySubdomainResolved).toEqual({ teamId, isPrimary: false, primaryHost: customHostname });
    });

    it("resolveHost returns null for an unknown host", async () => {
        expect(await resolveHost(`${crypto.randomUUID()}.example`)).toBeNull();
    });
});
