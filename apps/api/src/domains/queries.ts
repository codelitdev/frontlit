import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teams, type CustomDomainStatus } from "../db/schema";

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
    } | null;
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
            customDomain && customDomain.status !== "verified"
                ? {
                      cnameTarget: getCustomDomainCnameTarget(),
                      txtName: `_frontlit-verify.${customDomain.hostname}`,
                      txtValue: team.customDomainVerificationToken!,
                  }
                : null,
    };
}

export type SetTeamSubdomainResult =
    { ok: true } | { ok: false; reason: "taken" };

export async function setTeamSubdomain(
    teamId: string,
    subdomain: string,
): Promise<SetTeamSubdomainResult> {
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

/** One website has one optional custom domain. The FrontLit subdomain stays
 * reachable forever; a verified custom domain becomes canonical automatically. */
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
            updatedAt: new Date(),
        })
        .where(eq(teams.id, teamId));
    return true;
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

export async function verifyCustomDomain(
    teamId: string,
): Promise<CustomDomainStatus | null> {
    const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
    });
    if (!team?.customDomain || !team.customDomainVerificationToken) return null;

    const verified = await verifyDnsTxtRecord(
        team.customDomain,
        team.customDomainVerificationToken,
    );
    const status: CustomDomainStatus = verified ? "verified" : "failed";
    await db
        .update(teams)
        .set({
            customDomainStatus: status,
            customDomainVerifiedAt: verified
                ? new Date()
                : team.customDomainVerifiedAt,
            updatedAt: new Date(),
        })
        .where(eq(teams.id, teamId));
    return status;
}

export type ResolvedHost = { teamId: string; canonicalHost: string };

/** Resolves an incoming host to exactly one team website. Both the permanent
 * subdomain and a verified custom domain serve the site; only the latter
 * changes the canonical host. */
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

    return {
        teamId: team.id,
        canonicalHost:
            team.customDomainStatus === "verified" && team.customDomain
                ? team.customDomain
                : getSubdomainHost(team.subdomain!),
    };
}
