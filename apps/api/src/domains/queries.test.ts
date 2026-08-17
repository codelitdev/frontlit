import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("node:dns", () => ({
    promises: {
        resolveTxt: vi.fn(),
        resolveCname: vi.fn(),
        resolve4: vi.fn(),
    },
}));

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
    setSubdomainPublic,
    setTeamSubdomain,
    verifyCustomDomain,
} from "./queries";

function uniqueName(label: string): string {
    return `${label} ${crypto.randomUUID().slice(0, 8)}`;
}

describe("team website domains", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    async function mockDns(opts: {
        txt?: string[][] | Error;
        cname?: string[] | Error;
        a?: string[] | Error;
    }) {
        if (opts.txt instanceof Error)
            vi.mocked(dns.resolveTxt).mockRejectedValue(opts.txt);
        else if (opts.txt)
            vi.mocked(dns.resolveTxt).mockResolvedValue(opts.txt);
        else
            vi.mocked(dns.resolveTxt).mockRejectedValue(new Error("ENOTFOUND"));

        if (opts.cname instanceof Error)
            vi.mocked(dns.resolveCname).mockRejectedValue(opts.cname);
        else if (opts.cname)
            vi.mocked(dns.resolveCname).mockResolvedValue(opts.cname);
        else
            vi.mocked(dns.resolveCname).mockRejectedValue(
                new Error("ENOTFOUND"),
            );

        if (opts.a instanceof Error)
            vi.mocked(dns.resolve4).mockRejectedValue(opts.a);
        else if (opts.a) vi.mocked(dns.resolve4).mockResolvedValue(opts.a);
        else vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    }

    async function attachAndPassBothChecks(
        id: string,
        hostname: string,
    ): Promise<void> {
        expect(await attachCustomDomain(id, hostname)).toEqual({ ok: true });
        const pending = await getDomainSettings(id);
        await mockDns({
            txt: [[pending!.verificationRecords!.txtValue]],
            cname: [getCustomDomainCnameTarget()],
            a: ["203.0.113.10"],
        });
        expect(await verifyCustomDomain(id)).toBe("verified");
    }

    beforeEach(async () => {
        vi.mocked(dns.resolveTxt).mockReset();
        vi.mocked(dns.resolveCname).mockReset();
        vi.mocked(dns.resolve4).mockReset();
        const seeded = await seedTeam(db, { name: uniqueName("Acme Inc") });
        teamId = seeded.team.id;
    });

    it("keeps only an environment-independent subdomain label on the team", async () => {
        const settings = await getDomainSettings(teamId);
        expect(settings?.subdomain?.name).toMatch(/^team-/);
        expect(settings?.subdomain?.hostname).toBe(
            getSubdomainHost(settings!.subdomain!.name),
        );
        expect(settings?.customDomain).toBeNull();
        expect(settings?.canonicalHost).toBe(settings?.subdomain?.hostname);
        expect(settings?.subdomainPublic).toBe(true);
        expect(settings?.platformDomain).toBe(getPlatformSiteDomain());
    });

    it("does not resolve a team before it deliberately claims a subdomain", async () => {
        const { team } = await seedTeam(db, { name: "Not Live" });
        await db
            .update(teams)
            .set({ subdomain: null })
            .where(eq(teams.id, team.id));

        expect((await getDomainSettings(team.id))?.subdomain).toBeNull();
        expect((await getDomainSettings(team.id))?.canonicalHost).toBeNull();
        expect(await resolveHost("not-live.localhost")).toBeNull();
        expect(
            await attachCustomDomain(team.id, "not-live.example.com"),
        ).toEqual({ ok: false, reason: "subdomain_required" });
    });

    it("renames a subdomain label and rejects a duplicate", async () => {
        const newSubdomain = `new-${crypto.randomUUID().slice(0, 8)}`;
        expect(await setTeamSubdomain(teamId, newSubdomain)).toEqual({
            ok: true,
        });
        expect((await getDomainSettings(teamId))?.subdomain?.hostname).toBe(
            `${newSubdomain}.${getPlatformSiteDomain()}`,
        );

        const { team: other } = await seedTeam(db, { name: "Other" });
        expect(await setTeamSubdomain(other.id, newSubdomain)).toEqual({
            ok: false,
            reason: "taken",
        });
    });

    it("attaches a pending custom domain and exposes verification records", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        expect(await attachCustomDomain(teamId, hostname)).toEqual({
            ok: true,
        });

        const settings = await getDomainSettings(teamId);
        expect(settings?.customDomain).toMatchObject({
            hostname,
            status: "pending",
            verifiedAt: null,
        });
        expect(settings?.verificationRecords).toMatchObject({
            cnameTarget: getCustomDomainCnameTarget(),
            txtName: `_frontlit-verify.${hostname}`,
            kind: "alias",
            txtSatisfied: null,
            routingSatisfied: null,
        });
        expect(settings?.subdomainPublic).toBe(true);
    });

    it("rejects a platform host, a second custom domain, and an already-claimed custom domain", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        expect(
            await attachCustomDomain(teamId, `foo.${getPlatformSiteDomain()}`),
        ).toEqual({ ok: false, reason: "reserved" });
        expect(await attachCustomDomain(teamId, "another.com")).toEqual({
            ok: false,
            reason: "already_attached",
        });

        const { team: other } = await seedTeam(db, { name: "Other" });
        expect(await attachCustomDomain(other.id, hostname)).toEqual({
            ok: false,
            reason: "taken",
        });
    });

    it("makes a verified custom domain canonical while both hosts resolve", async () => {
        const hostname = `www.${crypto.randomUUID().slice(0, 8)}.com`;
        await attachAndPassBothChecks(teamId, hostname);

        const settings = await getDomainSettings(teamId);
        expect(settings?.canonicalHost).toBe(hostname);
        expect(settings?.subdomainPublic).toBe(true);
        expect(settings?.verificationRecords).toMatchObject({
            kind: "cname",
            txtSatisfied: true,
            routingSatisfied: true,
            txtName: `_frontlit-verify.${hostname}`,
        });
        expect(settings?.verificationRecords?.txtValue).toBeTruthy();
        expect(
            await resolveHost(`${settings!.subdomain!.hostname}:3002`),
        ).toEqual({ teamId, canonicalHost: hostname });
        expect(await resolveHost(hostname)).toEqual({
            teamId,
            canonicalHost: hostname,
        });
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
        expect(normalizeHost("CoDeLiT.Localhost:3002")).toBe(
            "codelit.localhost",
        );
    });

    it("rejects hide without a verified custom domain", async () => {
        expect(await setSubdomainPublic(teamId, false)).toEqual({
            ok: false,
            reason: "custom_domain_required",
        });

        const hostname = `www.${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        expect(await setSubdomainPublic(teamId, false)).toEqual({
            ok: false,
            reason: "custom_domain_required",
        });
        expect((await getDomainSettings(teamId))?.subdomainPublic).toBe(true);
    });

    it("hides the platform subdomain without a redirect while the custom host still resolves", async () => {
        const hostname = `www.${crypto.randomUUID().slice(0, 8)}.com`;
        await attachAndPassBothChecks(teamId, hostname);
        expect(await setSubdomainPublic(teamId, false)).toEqual({ ok: true });

        const settings = await getDomainSettings(teamId);
        expect(settings?.subdomainPublic).toBe(false);
        expect(settings?.canonicalHost).toBe(hostname);
        expect(await resolveHost(settings!.subdomain!.hostname)).toBeNull();
        expect(await resolveHost(hostname)).toEqual({
            teamId,
            canonicalHost: hostname,
        });
    });

    it("re-enables the subdomain when the custom domain is removed", async () => {
        const hostname = `www.${crypto.randomUUID().slice(0, 8)}.com`;
        await attachAndPassBothChecks(teamId, hostname);
        await setSubdomainPublic(teamId, false);
        expect(await removeCustomDomain(teamId)).toBe(true);

        const settings = await getDomainSettings(teamId);
        expect(settings?.subdomainPublic).toBe(true);
        expect(settings?.customDomain).toBeNull();
        expect(settings?.verificationRecords).toBeNull();
        expect(await resolveHost(settings!.subdomain!.hostname)).toEqual({
            teamId,
            canonicalHost: settings!.subdomain!.hostname,
        });
        expect(await resolveHost(hostname)).toBeNull();
    });

    it("requires both ownership TXT and routing before a domain is verified", async () => {
        const hostname = `www.${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        const pending = await getDomainSettings(teamId);
        const token = pending!.verificationRecords!.txtValue;

        await mockDns({
            txt: [[token]],
            cname: new Error("ENOTFOUND"),
        });
        expect(await verifyCustomDomain(teamId)).toBe("failed");
        let settings = await getDomainSettings(teamId);
        expect(settings?.customDomain?.status).toBe("failed");
        expect(settings?.verificationRecords).toMatchObject({
            txtSatisfied: true,
            routingSatisfied: false,
        });
        expect(await resolveHost(hostname)).toBeNull();

        await mockDns({
            txt: [["wrong-token"]],
            cname: [getCustomDomainCnameTarget()],
        });
        expect(await verifyCustomDomain(teamId)).toBe("failed");
        settings = await getDomainSettings(teamId);
        expect(settings?.customDomain?.status).toBe("failed");
        expect(settings?.verificationRecords).toMatchObject({
            txtSatisfied: false,
            routingSatisfied: true,
        });

        await mockDns({
            txt: [[token]],
            cname: [getCustomDomainCnameTarget()],
        });
        expect(await verifyCustomDomain(teamId)).toBe("verified");
        settings = await getDomainSettings(teamId);
        expect(settings?.verificationRecords).toMatchObject({
            kind: "cname",
            txtSatisfied: true,
            routingSatisfied: true,
        });
        expect(await resolveHost(hostname)).toEqual({
            teamId,
            canonicalHost: hostname,
        });
    });

    it("accepts apex flattening when the name resolves and no A set is configured", async () => {
        const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
        await attachCustomDomain(teamId, hostname);
        const pending = await getDomainSettings(teamId);
        expect(pending?.verificationRecords?.kind).toBe("alias");
        await mockDns({
            txt: [[pending!.verificationRecords!.txtValue]],
            cname: new Error("ENOTFOUND"),
            a: ["198.51.100.20"],
        });
        expect(await verifyCustomDomain(teamId)).toBe("verified");
    });

    it("requires the configured apex A set to match when CUSTOM_DOMAIN_A_RECORDS is set", async () => {
        const previous = process.env.CUSTOM_DOMAIN_A_RECORDS;
        process.env.CUSTOM_DOMAIN_A_RECORDS = "198.51.100.10,198.51.100.11";
        try {
            const hostname = `${crypto.randomUUID().slice(0, 8)}.com`;
            await attachCustomDomain(teamId, hostname);
            const pending = await getDomainSettings(teamId);
            await mockDns({
                txt: [[pending!.verificationRecords!.txtValue]],
                cname: new Error("ENOTFOUND"),
                a: ["198.51.100.99"],
            });
            expect(await verifyCustomDomain(teamId)).toBe("failed");

            await mockDns({
                txt: [[pending!.verificationRecords!.txtValue]],
                cname: new Error("ENOTFOUND"),
                a: ["198.51.100.11", "198.51.100.10"],
            });
            expect(await verifyCustomDomain(teamId)).toBe("verified");
        } finally {
            if (previous === undefined)
                delete process.env.CUSTOM_DOMAIN_A_RECORDS;
            else process.env.CUSTOM_DOMAIN_A_RECORDS = previous;
        }
    });

    it("rejects reserved subdomain labels", async () => {
        for (const slug of ["www", "api", "app", "sites", "localhost", "cdn"]) {
            expect(await setTeamSubdomain(teamId, slug)).toEqual({
                ok: false,
                reason: "reserved",
            });
        }
        const allowed = `ok-${crypto.randomUUID().slice(0, 8)}`;
        expect(await setTeamSubdomain(teamId, allowed)).toEqual({ ok: true });
    });

    it("still allows renaming a hidden slug", async () => {
        const hostname = `www.${crypto.randomUUID().slice(0, 8)}.com`;
        await attachAndPassBothChecks(teamId, hostname);
        await setSubdomainPublic(teamId, false);
        const renamed = `renamed-${crypto.randomUUID().slice(0, 8)}`;
        expect(await setTeamSubdomain(teamId, renamed)).toEqual({ ok: true });
        const settings = await getDomainSettings(teamId);
        expect(settings?.subdomain?.name).toBe(renamed);
        expect(settings?.subdomainPublic).toBe(false);
        expect(await resolveHost(settings!.subdomain!.hostname)).toBeNull();
    });
});
