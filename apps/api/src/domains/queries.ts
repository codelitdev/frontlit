import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { domains, teams, type DomainVerificationStatus } from "../db/schema";
import { slugify, uniqueSlug } from "../utils/slug";

export type DomainKind = "subdomain" | "custom";

/** The deployment's base host — every team's default host is
 * `<slug>.<DOMAIN>` (architecture.md §12.1). Defaults to `localhost` for
 * local dev, where subdomain routing isn't exercised. */
export function getBaseDomain(): string {
    return process.env.DOMAIN || "localhost";
}

function isSubdomainHostname(hostname: string): boolean {
    const base = getBaseDomain();
    return hostname === base || hostname.endsWith(`.${base}`);
}

/** Not a stored column — derived from whether the hostname falls under the
 * deployment's `DOMAIN` (architecture.md §12.1's `domainKindSchema`). */
export function domainKind(hostname: string): DomainKind {
    return isSubdomainHostname(hostname) ? "subdomain" : "custom";
}

async function isHostnameTaken(hostname: string): Promise<boolean> {
    return Boolean(await db.query.domains.findFirst({ where: eq(domains.hostname, hostname) }));
}

async function getDomainsForTeam(teamId: string) {
    return db.query.domains.findMany({ where: eq(domains.teamId, teamId) });
}

async function getSubdomainForTeam(teamId: string) {
    const rows = await getDomainsForTeam(teamId);
    return rows.find((r) => domainKind(r.hostname) === "subdomain") ?? null;
}

async function getCustomDomainForTeam(teamId: string) {
    const rows = await getDomainsForTeam(teamId);
    return rows.find((r) => domainKind(r.hostname) === "custom") ?? null;
}

/** Provisions a team's default `<slug>.<DOMAIN>` host at team creation
 * (architecture.md §12.1) — always available, verified immediately (no DNS
 * involved), and primary until a verified custom domain is switched to. */
export async function provisionSubdomain(teamId: string, teamName: string) {
    const base = slugify(teamName) || "team";
    const slug = await uniqueSlug(base, (candidate) => isHostnameTaken(`${candidate}.${getBaseDomain()}`));
    const [row] = await db
        .insert(domains)
        .values({
            teamId,
            hostname: `${slug}.${getBaseDomain()}`,
            verificationToken: randomBytes(16).toString("hex"),
            status: "verified",
            isPrimary: true,
            verifiedAt: new Date(),
        })
        .returning();
    return row;
}

/** Full domain settings for the dashboard (architecture.md §12.1). Backfills
 * the subdomain for any team created before auto-provisioning shipped, so
 * this never 404s. */
export async function getDomainSettings(teamId: string) {
    let subdomain = await getSubdomainForTeam(teamId);
    if (!subdomain) {
        const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
        subdomain = await provisionSubdomain(teamId, team?.name ?? "team");
    }
    const customDomain = await getCustomDomainForTeam(teamId);
    return {
        subdomain,
        customDomain,
        verificationRecords:
            customDomain && customDomain.status !== "verified"
                ? {
                      cnameTarget: `sites.${getBaseDomain()}`,
                      txtName: `_frontlit-verify.${customDomain.hostname}`,
                      txtValue: customDomain.verificationToken,
                  }
                : null,
    };
}

export type SetTeamSubdomainResult = { ok: true; domain: typeof domains.$inferSelect } | { ok: false; reason: "taken" };

export async function setTeamSubdomain(teamId: string, slug: string): Promise<SetTeamSubdomainResult> {
    const { subdomain } = await getDomainSettings(teamId);
    const hostname = `${slug}.${getBaseDomain()}`;
    if (hostname !== subdomain!.hostname && (await isHostnameTaken(hostname))) {
        return { ok: false, reason: "taken" };
    }
    const [updated] = await db.update(domains).set({ hostname }).where(eq(domains.id, subdomain!.id)).returning();
    return { ok: true, domain: updated };
}

export type AttachCustomDomainResult =
    | { ok: true; domain: typeof domains.$inferSelect }
    | { ok: false; reason: "reserved" | "already_attached" | "taken" };

/** One custom domain per team in v1 (architecture.md §12.1) — attaching a
 * second requires removing the first. */
export async function attachCustomDomain(teamId: string, hostname: string): Promise<AttachCustomDomainResult> {
    if (isSubdomainHostname(hostname)) return { ok: false, reason: "reserved" };
    if (await getCustomDomainForTeam(teamId)) return { ok: false, reason: "already_attached" };
    if (await isHostnameTaken(hostname)) return { ok: false, reason: "taken" };

    const [row] = await db
        .insert(domains)
        .values({
            teamId,
            hostname,
            verificationToken: randomBytes(16).toString("hex"),
            status: "pending",
            isPrimary: false,
        })
        .returning();
    return { ok: true, domain: row };
}

/** Removing the custom domain resets `primaryDomain` to the subdomain first
 * (architecture.md §12.1) so a team is never left without a resolvable
 * primary host. */
export async function removeCustomDomain(teamId: string) {
    const existing = await getCustomDomainForTeam(teamId);
    if (!existing) return null;

    await db.delete(domains).where(eq(domains.id, existing.id));
    if (existing.isPrimary) {
        const subdomain = await getSubdomainForTeam(teamId);
        if (subdomain) await db.update(domains).set({ isPrimary: true }).where(eq(domains.id, subdomain.id));
    }
    return existing;
}

/** Looks up the TXT record a team was asked to create
 * (`_frontlit-verify.<domain>`) and checks it matches the issued token.
 * Exported standalone so tests can `vi.mock("node:dns")` without touching
 * the rest of the module. */
export async function verifyDnsTxtRecord(hostname: string, token: string): Promise<boolean> {
    try {
        const records = await dns.resolveTxt(`_frontlit-verify.${hostname}`);
        return records.some((chunks) => chunks.join("").trim() === token);
    } catch {
        return false;
    }
}

export async function verifyCustomDomain(teamId: string) {
    const existing = await getCustomDomainForTeam(teamId);
    if (!existing) return null;

    const verified = await verifyDnsTxtRecord(existing.hostname, existing.verificationToken);
    const status: DomainVerificationStatus = verified ? "verified" : "failed";
    const [updated] = await db
        .update(domains)
        .set({ status, verifiedAt: verified ? new Date() : existing.verifiedAt })
        .where(eq(domains.id, existing.id))
        .returning();
    return updated;
}

export type SetPrimaryDomainResult = { ok: true } | { ok: false; reason: "no_subdomain" | "custom_not_verified" };

export async function setPrimaryDomain(teamId: string, primary: DomainKind): Promise<SetPrimaryDomainResult> {
    const subdomain = await getSubdomainForTeam(teamId);
    if (!subdomain) return { ok: false, reason: "no_subdomain" };
    const customDomain = await getCustomDomainForTeam(teamId);

    if (primary === "custom") {
        if (!customDomain || customDomain.status !== "verified") return { ok: false, reason: "custom_not_verified" };
        await db.update(domains).set({ isPrimary: true }).where(eq(domains.id, customDomain.id));
        await db.update(domains).set({ isPrimary: false }).where(eq(domains.id, subdomain.id));
    } else {
        await db.update(domains).set({ isPrimary: true }).where(eq(domains.id, subdomain.id));
        if (customDomain) await db.update(domains).set({ isPrimary: false }).where(eq(domains.id, customDomain.id));
    }
    return { ok: true };
}

export type ResolvedHost = { teamId: string; isPrimary: boolean; primaryHost: string };

/** Answers `apps/sites`' tenant-resolution middleware and doubles as the
 * on-demand TLS "ask" (architecture.md §12.1/§12.2) — only ever resolves a
 * host it actually knows, and never an unverified custom domain. */
export async function resolveHost(hostname: string): Promise<ResolvedHost | null> {
    const row = await db.query.domains.findFirst({ where: eq(domains.hostname, hostname) });
    if (!row) return null;
    if (domainKind(hostname) === "custom" && row.status !== "verified") return null;

    const primary = await db.query.domains.findFirst({
        where: and(eq(domains.teamId, row.teamId), eq(domains.isPrimary, true)),
    });
    return { teamId: row.teamId, isPrimary: row.isPrimary, primaryHost: primary?.hostname ?? row.hostname };
}
