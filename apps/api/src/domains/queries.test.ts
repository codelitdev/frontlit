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
  addRedirectDomain,
  attachCustomDomain,
  getCustomDomainCnameTarget,
  getPlatformSiteDomain,
  getDomainSettings,
  getSubdomainHost,
  normalizeHost,
  pairedHostname,
  removeCustomDomain,
  removeRedirectDomain,
  resolveHost,
  setHideFromSearch,
  setPrimaryCustomDomain,
  setRedirectSubdomain,
  setTeamSubdomain,
  updateRedirectDomain,
  verifyCustomDomain,
  verifyRedirectDomain,
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
    else if (opts.txt) vi.mocked(dns.resolveTxt).mockResolvedValue(opts.txt);
    else vi.mocked(dns.resolveTxt).mockRejectedValue(new Error("ENOTFOUND"));

    if (opts.cname instanceof Error)
      vi.mocked(dns.resolveCname).mockRejectedValue(opts.cname);
    else if (opts.cname) vi.mocked(dns.resolveCname).mockResolvedValue(opts.cname);
    else vi.mocked(dns.resolveCname).mockRejectedValue(new Error("ENOTFOUND"));

    if (opts.a instanceof Error) vi.mocked(dns.resolve4).mockRejectedValue(opts.a);
    else if (opts.a) vi.mocked(dns.resolve4).mockResolvedValue(opts.a);
    else vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
  }

  async function txtValue(id: string): Promise<string> {
    return (await getDomainSettings(id))!.verification!.txtValue;
  }

  async function hostStatus(id: string, hostname: string) {
    return (await getDomainSettings(id))!.customDomains.find(
      (host) => host.hostname === hostname,
    )?.status;
  }

  /** Attaches and passes every DNS check (TXT, apex A and www CNAME). */
  async function attachAndPassAllChecks(id: string, hostname: string): Promise<void> {
    expect(await attachCustomDomain(id, hostname)).toEqual({ ok: true });
    await mockDns({
      txt: [[await txtValue(id)]],
      cname: [getCustomDomainCnameTarget()],
      a: ["203.0.113.10"],
    });
    expect(await verifyCustomDomain(id)).toBe(true);
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
    expect(settings?.customDomains).toEqual([]);
    expect(settings?.canonicalHost).toBe(settings?.subdomain?.hostname);
    expect(settings?.redirectSubdomain).toBe(true);
    expect(settings?.platformDomain).toBe(getPlatformSiteDomain());
  });

  it("does not resolve a team before it deliberately claims a subdomain", async () => {
    const { team } = await seedTeam(db, { name: "Not Live" });
    await db.update(teams).set({ subdomain: null }).where(eq(teams.id, team.id));

    expect((await getDomainSettings(team.id))?.subdomain).toBeNull();
    expect((await getDomainSettings(team.id))?.canonicalHost).toBeNull();
    expect(await resolveHost("not-live.localhost")).toBeNull();
    expect(await attachCustomDomain(team.id, "not-live.example.com")).toEqual({
      ok: false,
      reason: "subdomain_required",
    });
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

  it("pairs an apex and www host", () => {
    expect(pairedHostname("example.com")).toBe("www.example.com");
    expect(pairedHostname("www.example.com")).toBe("example.com");
    expect(pairedHostname("docs.example.com")).toBeNull();
  });

  it("attaches both halves of an apex/www pair with one shared TXT on the apex", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    expect(await attachCustomDomain(teamId, `www.${apex}`)).toEqual({ ok: true });

    const settings = await getDomainSettings(teamId);
    expect(settings?.customDomains).toEqual([
      {
        hostname: `www.${apex}`,
        primary: true,
        status: "pending",
        verifiedAt: null,
        record: { type: "CNAME", values: [getCustomDomainCnameTarget()] },
        routingSatisfied: null,
      },
      {
        hostname: apex,
        primary: false,
        status: "pending",
        verifiedAt: null,
        record: { type: "A", values: [] },
        routingSatisfied: null,
      },
    ]);
    expect(settings?.verification).toMatchObject({
      txtName: `_frontlit-verify.${apex}`,
      txtSatisfied: null,
    });
    // Still the subdomain until something verifies.
    expect(settings?.canonicalHost).toBe(settings?.subdomain?.hostname);
  });

  it("asks for the configured A set on the apex", async () => {
    const previous = process.env.CUSTOM_DOMAIN_A_RECORDS;
    process.env.CUSTOM_DOMAIN_A_RECORDS = "198.51.100.10,198.51.100.11";
    try {
      const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
      await attachCustomDomain(teamId, apex);
      const [primary] = (await getDomainSettings(teamId))!.customDomains;
      expect(primary).toMatchObject({
        hostname: apex,
        primary: true,
        record: { type: "A", values: ["198.51.100.10", "198.51.100.11"] },
      });
    } finally {
      if (previous === undefined) delete process.env.CUSTOM_DOMAIN_A_RECORDS;
      else process.env.CUSTOM_DOMAIN_A_RECORDS = previous;
    }
  });

  it("attaches a non-www subdomain host alone", async () => {
    const hostname = `docs.${crypto.randomUUID().slice(0, 8)}.com`;
    await attachCustomDomain(teamId, hostname);
    const settings = await getDomainSettings(teamId);
    expect(settings?.customDomains.map((host) => host.hostname)).toEqual([hostname]);
    expect(settings?.verification?.txtName).toBe(`_frontlit-verify.${hostname}`);
  });

  it("uses the team's provisioned DNS target and TXT label for instructions and checks", async () => {
    const hostname = `docs.${crypto.randomUUID().slice(0, 8)}.com`;
    await db
      .update(teams)
      .set({
        customDomainCnameTarget: "domains.courselit.example",
        customDomainTxtRecordName: "_courselit-verification",
      })
      .where(eq(teams.id, teamId));

    expect(await attachCustomDomain(teamId, hostname)).toEqual({ ok: true });
    const pending = await getDomainSettings(teamId);
    expect(pending?.customDomains[0]?.record.values).toEqual([
      "domains.courselit.example",
    ]);
    expect(pending?.verification?.txtName).toBe(`_courselit-verification.${hostname}`);

    await mockDns({
      txt: [[pending!.verification!.txtValue]],
      cname: ["domains.courselit.example"],
    });
    await verifyCustomDomain(teamId);
    expect(await hostStatus(teamId, hostname)).toBe("verified");
    expect(dns.resolveTxt).toHaveBeenCalledWith(`_courselit-verification.${hostname}`);
    expect(dns.resolveCname).toHaveBeenCalledWith(hostname);
  });

  it("rejects a platform host, a second custom domain, and a claimed host or its pair", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachCustomDomain(teamId, apex);
    expect(await attachCustomDomain(teamId, `foo.${getPlatformSiteDomain()}`)).toEqual({
      ok: false,
      reason: "reserved",
    });
    expect(await attachCustomDomain(teamId, "another.com")).toEqual({
      ok: false,
      reason: "already_attached",
    });

    const { team: other } = await seedTeam(db, { name: "Other" });
    for (const hostname of [apex, `www.${apex}`]) {
      expect(await attachCustomDomain(other.id, hostname)).toEqual({
        ok: false,
        reason: "taken",
      });
    }
  });

  it("makes the verified primary canonical and redirects every other host to it", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachAndPassAllChecks(teamId, apex);

    const settings = await getDomainSettings(teamId);
    expect(settings?.canonicalHost).toBe(apex);
    expect(settings?.verification?.txtSatisfied).toBe(true);
    expect(settings?.customDomains.every((host) => host.status === "verified")).toBe(
      true,
    );
    expect(await resolveHost(apex)).toEqual({
      teamId,
      canonicalHost: apex,
      redirect: false,
      hideFromSearch: false,
    });
    expect(await resolveHost(`WWW.${apex}`)).toEqual({
      teamId,
      canonicalHost: apex,
      redirect: true,
      hideFromSearch: false,
    });
    expect(await resolveHost(`${settings!.subdomain!.hostname}:3002`)).toEqual({
      teamId,
      canonicalHost: apex,
      redirect: true,
      hideFromSearch: false,
    });
  });

  it("starts hidden from search and opens on the first verified custom domain", async () => {
    const subdomainHost = (await getDomainSettings(teamId))!.subdomain!.hostname;
    expect((await getDomainSettings(teamId))?.hideFromSearch).toBe(true);
    expect(await resolveHost(subdomainHost)).toMatchObject({ hideFromSearch: true });

    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachAndPassAllChecks(teamId, apex);
    expect((await getDomainSettings(teamId))?.hideFromSearch).toBe(false);
    expect(await resolveHost(apex)).toMatchObject({ hideFromSearch: false });

    // Re-checking an already live domain leaves a deliberate choice alone.
    await setHideFromSearch(teamId, true);
    expect(await verifyCustomDomain(teamId)).toBe(true);
    expect((await getDomainSettings(teamId))?.hideFromSearch).toBe(true);

    await setHideFromSearch(teamId, false);
    expect((await getDomainSettings(teamId))?.hideFromSearch).toBe(false);
  });

  it("switches the primary host", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachAndPassAllChecks(teamId, apex);
    expect(await setPrimaryCustomDomain(teamId, `www.${apex}`)).toBe(true);

    const settings = await getDomainSettings(teamId);
    expect(settings?.canonicalHost).toBe(`www.${apex}`);
    expect(settings?.customDomains.filter((host) => host.primary)).toHaveLength(1);
    expect(await resolveHost(apex)).toMatchObject({
      canonicalHost: `www.${apex}`,
      redirect: true,
    });
    expect(await setPrimaryCustomDomain(teamId, "unrelated.com")).toBe(false);
  });

  it("keeps the subdomain serving when the team turns its redirect off", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachAndPassAllChecks(teamId, apex);
    await setRedirectSubdomain(teamId, false);

    const settings = await getDomainSettings(teamId);
    expect(settings?.redirectSubdomain).toBe(false);
    expect(await resolveHost(settings!.subdomain!.hostname)).toEqual({
      teamId,
      canonicalHost: apex,
      redirect: false,
      hideFromSearch: false,
    });
    // The other half of the pair still redirects.
    expect(await resolveHost(`www.${apex}`)).toMatchObject({ redirect: true });
  });

  it("verifies each host of a pair independently and serves the verified one meanwhile", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    // The team typed www (primary) but only configured the apex A record.
    await attachCustomDomain(teamId, `www.${apex}`);
    await mockDns({
      txt: [[await txtValue(teamId)]],
      cname: new Error("ENOTFOUND"),
      a: ["203.0.113.10"],
    });
    await verifyCustomDomain(teamId);

    const settings = await getDomainSettings(teamId);
    expect(await hostStatus(teamId, apex)).toBe("verified");
    expect(await hostStatus(teamId, `www.${apex}`)).toBe("failed");
    // An unverified primary is never canonical.
    expect(settings?.canonicalHost).toBe(apex);
    expect(await resolveHost(apex)).toMatchObject({ redirect: false });
    // The pending half resolves (the shared TXT proves the zone) and redirects.
    expect(await resolveHost(`www.${apex}`)).toMatchObject({
      canonicalHost: apex,
      redirect: true,
    });

    await mockDns({
      txt: [[await txtValue(teamId)]],
      cname: [getCustomDomainCnameTarget()],
      a: ["203.0.113.10"],
    });
    await verifyCustomDomain(teamId);
    expect((await getDomainSettings(teamId))?.canonicalHost).toBe(`www.${apex}`);
    expect(await resolveHost(apex)).toMatchObject({ redirect: true });
  });

  it("does not resolve an unverified custom domain and clears all custom-domain state on removal", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachCustomDomain(teamId, apex);
    expect(await resolveHost(apex)).toBeNull();
    expect(await resolveHost(`www.${apex}`)).toBeNull();
    const subdomainHost = (await getDomainSettings(teamId))!.subdomain!.hostname;
    expect(await resolveHost(subdomainHost)).toMatchObject({ redirect: false });

    expect(await removeCustomDomain(teamId)).toBe(true);
    const settings = await getDomainSettings(teamId);
    expect(settings?.customDomains).toEqual([]);
    expect(settings?.verification).toBeNull();
    expect(settings?.canonicalHost).toBe(settings?.subdomain?.hostname);
    expect(await removeCustomDomain(teamId)).toBe(false);
  });

  it("stops redirecting the subdomain once the custom domain is removed", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachAndPassAllChecks(teamId, apex);
    expect(await removeCustomDomain(teamId)).toBe(true);

    const settings = await getDomainSettings(teamId);
    expect(await resolveHost(settings!.subdomain!.hostname)).toEqual({
      teamId,
      canonicalHost: settings!.subdomain!.hostname,
      redirect: false,
      hideFromSearch: false,
    });
    expect(await resolveHost(apex)).toBeNull();
  });

  it("normalizes ports and casing in host headers", () => {
    expect(normalizeHost("CoDeLiT.Localhost:3002")).toBe("codelit.localhost");
  });

  it("requires both ownership TXT and routing before a host is verified", async () => {
    const hostname = `docs.${crypto.randomUUID().slice(0, 8)}.com`;
    await attachCustomDomain(teamId, hostname);
    const token = await txtValue(teamId);

    await mockDns({ txt: [[token]], cname: new Error("ENOTFOUND") });
    await verifyCustomDomain(teamId);
    let settings = await getDomainSettings(teamId);
    expect(settings?.customDomains[0]).toMatchObject({
      status: "failed",
      routingSatisfied: false,
    });
    expect(settings?.verification?.txtSatisfied).toBe(true);
    expect(await resolveHost(hostname)).toBeNull();

    await mockDns({ txt: [["wrong-token"]], cname: [getCustomDomainCnameTarget()] });
    await verifyCustomDomain(teamId);
    settings = await getDomainSettings(teamId);
    expect(settings?.customDomains[0]).toMatchObject({
      status: "failed",
      routingSatisfied: true,
    });
    expect(settings?.verification?.txtSatisfied).toBe(false);

    await mockDns({ txt: [[token]], cname: [getCustomDomainCnameTarget()] });
    await verifyCustomDomain(teamId);
    expect(await hostStatus(teamId, hostname)).toBe("verified");
    expect(await resolveHost(hostname)).toEqual({
      teamId,
      canonicalHost: hostname,
      redirect: false,
      hideFromSearch: false,
    });
  });

  it("accepts apex flattening when the name resolves and no A set is configured", async () => {
    const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
    await attachCustomDomain(teamId, apex);
    await mockDns({
      txt: [[await txtValue(teamId)]],
      cname: new Error("ENOTFOUND"),
      a: ["198.51.100.20"],
    });
    await verifyCustomDomain(teamId);
    expect(await hostStatus(teamId, apex)).toBe("verified");
  });

  it("requires the configured apex A set to match when CUSTOM_DOMAIN_A_RECORDS is set", async () => {
    const previous = process.env.CUSTOM_DOMAIN_A_RECORDS;
    process.env.CUSTOM_DOMAIN_A_RECORDS = "198.51.100.10,198.51.100.11";
    try {
      const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
      await attachCustomDomain(teamId, apex);
      const token = await txtValue(teamId);
      await mockDns({
        txt: [[token]],
        cname: new Error("ENOTFOUND"),
        a: ["198.51.100.99"],
      });
      await verifyCustomDomain(teamId);
      expect(await hostStatus(teamId, apex)).toBe("failed");

      await mockDns({
        txt: [[token]],
        cname: new Error("ENOTFOUND"),
        a: ["198.51.100.11", "198.51.100.10"],
      });
      await verifyCustomDomain(teamId);
      expect(await hostStatus(teamId, apex)).toBe("verified");
    } finally {
      if (previous === undefined) delete process.env.CUSTOM_DOMAIN_A_RECORDS;
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

  it("lets the platform team claim reserved subdomains and the platform apex", async () => {
    const previousDomain = process.env.PLATFORM_SITE_DOMAIN;
    const previousTeam = process.env.PLATFORM_TEAM_ID;
    process.env.PLATFORM_SITE_DOMAIN = "frontlit.test";
    try {
      expect(await attachCustomDomain(teamId, "frontlit.test")).toEqual({
        ok: false,
        reason: "reserved",
      });
      expect(await setTeamSubdomain(teamId, "frontlit")).toEqual({
        ok: false,
        reason: "reserved",
      });

      process.env.PLATFORM_TEAM_ID = teamId;
      expect(await setTeamSubdomain(teamId, "frontlit")).toEqual({ ok: true });
      expect(await attachCustomDomain(teamId, "docs.frontlit.test")).toEqual({
        ok: false,
        reason: "reserved",
      });
      await attachAndPassAllChecks(teamId, "frontlit.test");
      expect(await resolveHost("frontlit.test")).toMatchObject({
        teamId,
        canonicalHost: "frontlit.test",
        redirect: false,
      });
      expect(await resolveHost("www.frontlit.test")).toMatchObject({
        teamId,
        redirect: true,
      });
      expect(await resolveHost("frontlit.frontlit.test")).toMatchObject({
        teamId,
        redirect: true,
      });
    } finally {
      if (previousDomain === undefined) delete process.env.PLATFORM_SITE_DOMAIN;
      else process.env.PLATFORM_SITE_DOMAIN = previousDomain;
      if (previousTeam === undefined) delete process.env.PLATFORM_TEAM_ID;
      else process.env.PLATFORM_TEAM_ID = previousTeam;
    }
  });

  describe("redirect domains", () => {
    const redirectHost = () => `docs.${crypto.randomUUID().slice(0, 8)}.com`;
    const redirectSettings = async (id: string, hostname: string) =>
      (await getDomainSettings(id))!.redirectDomains.find(
        (host) => host.hostname === hostname,
      )!;

    it("only redirects once its own TXT and routing records pass", async () => {
      const hostname = redirectHost();
      expect(await addRedirectDomain(teamId, hostname.toUpperCase(), "/docs")).toEqual({
        ok: true,
      });
      const added = await redirectSettings(teamId, hostname);
      expect(added).toMatchObject({
        pathPrefix: "/docs",
        rules: [],
        status: "pending",
        record: { type: "CNAME", values: [getCustomDomainCnameTarget()] },
        verification: { txtName: `_frontlit-verify.${hostname}`, txtSatisfied: null },
      });
      expect(await resolveHost(hostname)).toBeNull();

      await mockDns({ txt: [[added.verification.txtValue]] });
      expect(await verifyRedirectDomain(teamId, hostname)).toBe(true);
      expect(await redirectSettings(teamId, hostname)).toMatchObject({
        status: "failed",
        verification: { txtSatisfied: true },
        routingSatisfied: false,
      });
      expect(await resolveHost(hostname)).toBeNull();

      await mockDns({
        txt: [[added.verification.txtValue]],
        cname: [getCustomDomainCnameTarget()],
      });
      expect(await verifyRedirectDomain(teamId, hostname)).toBe(true);
      expect((await redirectSettings(teamId, hostname)).status).toBe("verified");
      const subdomainHost = (await getDomainSettings(teamId))!.subdomain!.hostname;
      expect(await resolveHost(`${hostname}:443`)).toEqual({
        teamId,
        canonicalHost: subdomainHost,
        redirect: true,
        hideFromSearch: true,
        redirectTo: { pathPrefix: "/docs", rules: [] },
      });
    });

    it("targets the verified custom domain and carries rule changes", async () => {
      const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
      await attachAndPassAllChecks(teamId, apex);
      const hostname = redirectHost();
      await addRedirectDomain(teamId, hostname, "");
      const { verification } = await redirectSettings(teamId, hostname);
      await mockDns({
        txt: [[verification.txtValue]],
        cname: [getCustomDomainCnameTarget()],
      });
      await verifyRedirectDomain(teamId, hostname);

      const rules = [{ from: "/api/uploadMedia", to: "/docs/api/upload-media" }];
      expect(
        await updateRedirectDomain(teamId, hostname, { pathPrefix: "/docs", rules }),
      ).toBe(true);
      expect(await resolveHost(hostname)).toEqual({
        teamId,
        canonicalHost: apex,
        redirect: true,
        hideFromSearch: false,
        redirectTo: { pathPrefix: "/docs", rules },
      });

      expect(await removeRedirectDomain(teamId, hostname)).toBe(true);
      expect(await resolveHost(hostname)).toBeNull();
      expect(await removeRedirectDomain(teamId, hostname)).toBe(false);
    });

    it("keeps custom and redirect hosts apart and scoped to their team", async () => {
      const apex = `${crypto.randomUUID().slice(0, 8)}.com`;
      await attachCustomDomain(teamId, apex);
      expect(await addRedirectDomain(teamId, `www.${apex}`, "")).toEqual({
        ok: false,
        reason: "taken",
      });
      expect(
        await addRedirectDomain(teamId, `docs.${getPlatformSiteDomain()}`, ""),
      ).toEqual({ ok: false, reason: "reserved" });

      const hostname = redirectHost();
      await addRedirectDomain(teamId, hostname, "");
      const { team: other } = await seedTeam(db, { name: uniqueName("Other") });
      expect(await addRedirectDomain(other.id, hostname, "")).toEqual({
        ok: false,
        reason: "taken",
      });
      expect(await attachCustomDomain(other.id, hostname)).toEqual({
        ok: false,
        reason: "taken",
      });
      // Another team can't change, verify or remove it.
      expect(await updateRedirectDomain(other.id, hostname, { pathPrefix: "/x" })).toBe(
        false,
      );
      expect(await verifyRedirectDomain(other.id, hostname)).toBe(false);
      expect(await removeRedirectDomain(other.id, hostname)).toBe(false);
      expect((await redirectSettings(teamId, hostname)).pathPrefix).toBe("");
    });
  });
});
