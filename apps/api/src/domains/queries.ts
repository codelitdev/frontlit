import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teams, type CustomDomainStatus } from "../db/schema";

/** Labels that must never be claimed as a team slug. */
export const RESERVED_SUBDOMAIN_LABELS = new Set([
    "www",
    "api",
    "app",
    "sites",
    "mail",
    "admin",
    "status",
    "static",
    "assets",
    "cdn",
    "localhost",
    "ftp",
    "smtp",
    "imap",
    "pop",
    "ns1",
    "ns2",
    "help",
    "support",
    "blog",
    "docs",
    "auth",
    "login",
    "oauth",
    "mcp",
    "media",
    "internal",
    "platform",
    "frontlit",
    "staging",
    "prod",
    "production",
    "dev",
    "test",
    "beta",
    "dashboard",
    "console",
    "webhook",
    "webhooks",
]);

/** The API is the sole authority for classifying public-site hosts. The
 * stored `teams.subdomain` never includes this suffix, so the same database
 * works in local, staging and production. */
export function getPlatformSiteDomain(): string {
    return (process.env.PLATFORM_SITE_DOMAIN || "localhost")
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");
}

/** DNS target shown while verifying a custom domain. It is deliberately
 * independent from the platform-site suffix because an edge/load-balancer
 * hostname need not be `sites.<platform-domain>`. */
export function getCustomDomainCnameTarget(): string {
    return (
        process.env.CUSTOM_DOMAIN_CNAME_TARGET ||
        `sites.${getPlatformSiteDomain()}`
    )
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");
}

/** Optional anycast A set for apex hosts. Empty means "name resolves". */
export function getCustomDomainARecords(): string[] {
    return (process.env.CUSTOM_DOMAIN_A_RECORDS || "")
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
}

/** Two labels (`example.com`) is treated as the zone apex. */
export function isApexHostname(hostname: string): boolean {
    return hostname.split(".").filter(Boolean).length === 2;
}

export function getSubdomainHost(subdomain: string): string {
    return `${subdomain}.${getPlatformSiteDomain()}`;
}

/** A browser's Host header includes a non-default port. Normalize it at the
 * API boundary so tenant resolution works identically locally and in prod. */
export function normalizeHost(value: string): string {
    const host = value.split(",")[0]?.trim().toLowerCase() || "";
    if (!host) return "";

    try {
        return new URL(`http://${host}`).hostname.replace(/\.$/, "");
    } catch {
        return host.replace(/:\d+$/, "").replace(/\.$/, "");
    }
}

function isPlatformHost(hostname: string): boolean {
    const base = getPlatformSiteDomain();
    return hostname.endsWith(`.${base}`) && hostname.length > base.length + 1;
}

function subdomainFromHost(hostname: string): string | null {
    if (!isPlatformHost(hostname)) return null;
    const base = getPlatformSiteDomain();
    const subdomain = hostname.slice(0, -(base.length + 1));
    return subdomain.includes(".") ? null : subdomain;
}

export type DomainSettings = {
    subdomain: { name: string; hostname: string } | null;
    customDomain: {
        hostname: string;
        status: CustomDomainStatus;
        verifiedAt: Date | null;
    } | null;
    canonicalHost: string | null;
    verificationRecords: {
        cnameTarget: string;
        txtName: string;
        txtValue: string;
        kind: "cname" | "alias";
        txtSatisfied: boolean | null;
        routingSatisfied: boolean | null;
    } | null;
    subdomainPublic: boolean;
    platformDomain: string;
};

/** Returns the one website's domain configuration. A null subdomain means
 * the team has not deliberately made its public site live yet. */
export async function getDomainSettings(
    teamId: string,
): Promise<DomainSettings | null> {
    const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
    });
    if (!team) return null;

    const customDomain = team.customDomain
        ? {
              hostname: team.customDomain,
              status: team.customDomainStatus!,
              verifiedAt: team.customDomainVerifiedAt,
          }
        : null;
    const subdomain = team.subdomain
        ? { name: team.subdomain, hostname: getSubdomainHost(team.subdomain) }
        : null;
    const canonicalHost =
        customDomain?.status === "verified"
            ? customDomain.hostname
            : (subdomain?.hostname ?? null);

    return {
        subdomain,
        customDomain,
        canonicalHost,
        verificationRecords:
            customDomain && team.customDomainVerificationToken
                ? {
                      cnameTarget: getCustomDomainCnameTarget(),
                      txtName: `_frontlit-verify.${customDomain.hostname}`,
                      txtValue: team.customDomainVerificationToken,
                      kind: isApexHostname(customDomain.hostname)
                          ? "alias"
                          : "cname",
                      txtSatisfied: team.customDomainTxtSatisfied,
                      routingSatisfied: team.customDomainRoutingSatisfied,
                  }
                : null,
        subdomainPublic: team.subdomainPublic,
        platformDomain: getPlatformSiteDomain(),
    };
}

export type SetTeamSubdomainResult =
    { ok: true } | { ok: false; reason: "taken" | "reserved" };

export async function setTeamSubdomain(
    teamId: string,
    subdomain: string,
): Promise<SetTeamSubdomainResult> {
    if (RESERVED_SUBDOMAIN_LABELS.has(subdomain.toLowerCase()))
        return { ok: false, reason: "reserved" };

    const existing = await db.query.teams.findFirst({
        where: eq(teams.subdomain, subdomain),
    });
    if (existing && existing.id !== teamId)
        return { ok: false, reason: "taken" };

    try {
        await db
            .update(teams)
            .set({ subdomain, updatedAt: new Date() })
            .where(eq(teams.id, teamId));
        return { ok: true };
    } catch (error) {
        // The pre-check gives a fast friendly response, while the unique
        // constraint remains authoritative if two teams claim the same name
        // concurrently.
        let cause: unknown = error;
        while (cause && typeof cause === "object") {
            if ("code" in cause && cause.code === "23505")
                return { ok: false, reason: "taken" };
            cause = "cause" in cause ? cause.cause : null;
        }
        throw error;
    }
}

export type AttachCustomDomainResult =
    | { ok: true }
    | {
          ok: false;
          reason:
              "subdomain_required" | "reserved" | "already_attached" | "taken";
      };

/** One website has one optional custom domain. A verified custom domain
 * becomes canonical automatically; the FrontLit subdomain stays public
 * until the team hides it. */
export async function attachCustomDomain(
    teamId: string,
    value: string,
): Promise<AttachCustomDomainResult> {
    const hostname = normalizeHost(value);
    if (hostname === getPlatformSiteDomain() || isPlatformHost(hostname))
        return { ok: false, reason: "reserved" };

    const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
    });
    if (!team) return { ok: false, reason: "already_attached" };
    if (!team.subdomain) return { ok: false, reason: "subdomain_required" };
    if (team.customDomain) return { ok: false, reason: "already_attached" };

    const taken = await db.query.teams.findFirst({
        where: eq(teams.customDomain, hostname),
    });
    if (taken) return { ok: false, reason: "taken" };

    await db
        .update(teams)
        .set({
            customDomain: hostname,
            customDomainStatus: "pending",
            customDomainVerificationToken: randomBytes(16).toString("hex"),
            customDomainVerifiedAt: null,
            customDomainTxtSatisfied: null,
            customDomainRoutingSatisfied: null,
            subdomainPublic: true,
            updatedAt: new Date(),
        })
        .where(eq(teams.id, teamId));
    return { ok: true };
}

export async function removeCustomDomain(teamId: string): Promise<boolean> {
    const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
    });
    if (!team?.customDomain) return false;

    await db
        .update(teams)
        .set({
            customDomain: null,
            customDomainStatus: null,
            customDomainVerificationToken: null,
            customDomainVerifiedAt: null,
            customDomainTxtSatisfied: null,
            customDomainRoutingSatisfied: null,
            subdomainPublic: true,
            updatedAt: new Date(),
        })
        .where(eq(teams.id, teamId));
    return true;
}

export type SetSubdomainPublicResult =
    { ok: true } | { ok: false; reason: "custom_domain_required" };

export async function setSubdomainPublic(
    teamId: string,
    subdomainPublic: boolean,
): Promise<SetSubdomainPublicResult> {
    const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
    });
    if (!team) return { ok: false, reason: "custom_domain_required" };
    if (
        !subdomainPublic &&
        (team.customDomainStatus !== "verified" || !team.customDomain)
    ) {
        return { ok: false, reason: "custom_domain_required" };
    }

    await db
        .update(teams)
        .set({ subdomainPublic, updatedAt: new Date() })
        .where(eq(teams.id, teamId));
    return { ok: true };
}

/** Looks up the TXT record a team was asked to create
 * (`_frontlit-verify.<domain>`) and checks it matches the issued token. */
export async function verifyDnsTxtRecord(
    hostname: string,
    token: string,
): Promise<boolean> {
    try {
        const records = await dns.resolveTxt(`_frontlit-verify.${hostname}`);
        return records.some((chunks) => chunks.join("").trim() === token);
    } catch {
        return false;
    }
}

async function cnameChainIncludes(
    hostname: string,
    target: string,
): Promise<boolean> {
    const seen = new Set<string>();
    let current = hostname;
    while (!seen.has(current)) {
        seen.add(current);
        let records: string[];
        try {
            records = await dns.resolveCname(current);
        } catch {
            return false;
        }
        const nexts = records.map((record) =>
            record.replace(/\.$/, "").toLowerCase(),
        );
        if (nexts.includes(target)) return true;
        if (nexts.length === 0) return false;
        current = nexts[0]!;
    }
    return false;
}

async function resolveIpv4(hostname: string): Promise<string[]> {
    try {
        return (await dns.resolve4(hostname)).slice().sort();
    } catch {
        return [];
    }
}

/** Routing check: non-apex CNAME chain must include the CNAME target.
 * Apex: the name must resolve; if `CUSTOM_DOMAIN_A_RECORDS` is set the A
 * set must match, otherwise CNAME flattening (CNAME or A) is enough. */
export async function verifyDnsRouting(hostname: string): Promise<boolean> {
    const target = getCustomDomainCnameTarget();
    if (!isApexHostname(hostname)) {
        return cnameChainIncludes(hostname, target);
    }

    if (await cnameChainIncludes(hostname, target)) return true;

    const addresses = await resolveIpv4(hostname);
    if (addresses.length === 0) return false;

    const required = getCustomDomainARecords().slice().sort();
    if (required.length === 0) return true;
    return (
        required.length === addresses.length &&
        required.every((ip, index) => ip === addresses[index])
    );
}

export async function verifyCustomDomain(
    teamId: string,
): Promise<CustomDomainStatus | null> {
    const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
    });
    if (!team?.customDomain || !team.customDomainVerificationToken) return null;

    const txtSatisfied = await verifyDnsTxtRecord(
        team.customDomain,
        team.customDomainVerificationToken,
    );
    const routingSatisfied = await verifyDnsRouting(team.customDomain);
    const verified = txtSatisfied && routingSatisfied;
    const status: CustomDomainStatus = verified ? "verified" : "failed";
    await db
        .update(teams)
        .set({
            customDomainStatus: status,
            customDomainVerifiedAt: verified
                ? new Date()
                : team.customDomainVerifiedAt,
            customDomainTxtSatisfied: txtSatisfied,
            customDomainRoutingSatisfied: routingSatisfied,
            // A failed re-check cannot leave the only working host hidden.
            subdomainPublic: verified ? team.subdomainPublic : true,
            updatedAt: new Date(),
        })
        .where(eq(teams.id, teamId));
    return status;
}

export type ResolvedHost = { teamId: string; canonicalHost: string };

/** Resolves an incoming host to exactly one team website. A public
 * subdomain and a verified custom domain serve the site; only the latter
 * changes the canonical host. A hidden platform subdomain is unknown. */
export async function resolveHost(
    requestHost: string,
): Promise<ResolvedHost | null> {
    const hostname = normalizeHost(requestHost);
    if (!hostname) return null;

    const subdomain = subdomainFromHost(hostname);
    const team = subdomain
        ? await db.query.teams.findFirst({
              where: eq(teams.subdomain, subdomain),
          })
        : await db.query.teams.findFirst({
              where: and(
                  eq(teams.customDomain, hostname),
                  eq(teams.customDomainStatus, "verified"),
              ),
          });
    if (!team) return null;
    if (subdomain && !team.subdomainPublic) return null;

    return {
        teamId: team.id,
        canonicalHost:
            team.customDomainStatus === "verified" && team.customDomain
                ? team.customDomain
                : getSubdomainHost(team.subdomain!),
    };
}
