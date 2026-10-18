import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { customDomains, teams, type CustomDomainStatus } from "../db/schema";

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
export function getCustomDomainCnameTarget(
  team?: Pick<typeof teams.$inferSelect, "customDomainCnameTarget">,
): string {
  return (
    team?.customDomainCnameTarget ||
    process.env.CUSTOM_DOMAIN_CNAME_TARGET ||
    `sites.${getPlatformSiteDomain()}`
  )
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

/** Relative owner label for the TXT ownership record. Team-specific values
 * allow provisioning integrations to use a neutral, integration-owned name. */
export function getCustomDomainTxtRecordName(
  team?: Pick<typeof teams.$inferSelect, "customDomainTxtRecordName">,
): string {
  return (
    team?.customDomainTxtRecordName ||
    process.env.CUSTOM_DOMAIN_TXT_RECORD_NAME ||
    "_frontlit-verify"
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

/** The other half of an apex/www pair: `example.com` <-> `www.example.com`.
 * Any other host (`docs.example.com`) has no pair. */
export function pairedHostname(hostname: string): string | null {
  if (isApexHostname(hostname)) return `www.${hostname}`;
  if (hostname.startsWith("www.") && isApexHostname(hostname.slice(4)))
    return hostname.slice(4);
  return null;
}

/** A pair shares one ownership TXT record, placed on the apex. */
function ownershipHostname(hostname: string): string {
  const paired = pairedHostname(hostname);
  return paired && isApexHostname(paired) ? paired : hostname;
}

type TeamRow = typeof teams.$inferSelect;
type CustomDomainRow = typeof customDomains.$inferSelect;

/** The verified primary, else the other verified host of the pair, else
 * the FrontLit subdomain. Unverified hosts are never canonical. */
function canonicalHostFor(
  team: Pick<TeamRow, "subdomain">,
  hosts: CustomDomainRow[],
): string | null {
  const verified = hosts.filter((host) => host.status === "verified");
  const custom = verified.find((host) => host.primary) ?? verified[0];
  if (custom) return custom.hostname;
  return team.subdomain ? getSubdomainHost(team.subdomain) : null;
}

function listCustomDomains(teamId: string): Promise<CustomDomainRow[]> {
  return db.query.customDomains.findMany({
    where: eq(customDomains.teamId, teamId),
    orderBy: (table, { desc, asc }) => [desc(table.primary), asc(table.hostname)],
  });
}

export type DomainSettings = {
  subdomain: { name: string; hostname: string } | null;
  customDomains: {
    hostname: string;
    primary: boolean;
    status: CustomDomainStatus;
    verifiedAt: Date | null;
    /** The routing record to create for this host. Apex hosts get one A
     * record per IP in `CUSTOM_DOMAIN_A_RECORDS` (none when unset). */
    record: { type: "A" | "CNAME"; values: string[] };
    routingSatisfied: boolean | null;
  }[];
  /** Ownership TXT record shared by every custom host. */
  verification: {
    txtName: string;
    txtValue: string;
    txtSatisfied: boolean | null;
  } | null;
  canonicalHost: string | null;
  redirectSubdomain: boolean;
  hideFromSearch: boolean;
  platformDomain: string;
};

function routingRecord(
  team: TeamRow,
  hostname: string,
): DomainSettings["customDomains"][number]["record"] {
  return isApexHostname(hostname)
    ? { type: "A", values: getCustomDomainARecords() }
    : { type: "CNAME", values: [getCustomDomainCnameTarget(team)] };
}

/** Returns the one website's domain configuration. A null subdomain means
 * the team has not deliberately made its public site live yet. */
export async function getDomainSettings(
  teamId: string,
): Promise<DomainSettings | null> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });
  if (!team) return null;
  const hosts = await listCustomDomains(teamId);

  return {
    subdomain: team.subdomain
      ? { name: team.subdomain, hostname: getSubdomainHost(team.subdomain) }
      : null,
    customDomains: hosts.map((host) => ({
      hostname: host.hostname,
      primary: host.primary,
      status: host.status,
      verifiedAt: host.verifiedAt,
      record: routingRecord(team, host.hostname),
      routingSatisfied: host.routingSatisfied,
    })),
    verification:
      hosts.length > 0 && team.customDomainVerificationToken
        ? {
            txtName: `${getCustomDomainTxtRecordName(team)}.${ownershipHostname(hosts[0]!.hostname)}`,
            txtValue: team.customDomainVerificationToken,
            txtSatisfied: team.customDomainTxtSatisfied,
          }
        : null,
    canonicalHost: canonicalHostFor(team, hosts),
    redirectSubdomain: team.redirectSubdomain,
    hideFromSearch: team.hideFromSearch,
    platformDomain: getPlatformSiteDomain(),
  };
}

export type SetTeamSubdomainResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "reserved" };

export async function setTeamSubdomain(
  teamId: string,
  subdomain: string,
): Promise<SetTeamSubdomainResult> {
  if (RESERVED_SUBDOMAIN_LABELS.has(subdomain.toLowerCase()))
    return { ok: false, reason: "reserved" };

  const existing = await db.query.teams.findFirst({
    where: eq(teams.subdomain, subdomain),
  });
  if (existing && existing.id !== teamId) return { ok: false, reason: "taken" };

  try {
    await db
      .update(teams)
      .set({ subdomain, updatedAt: new Date() })
      .where(eq(teams.id, teamId));
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "taken" };
    throw error;
  }
}

/** The pre-checks give a fast friendly response, while unique constraints
 * remain authoritative if two teams claim the same name concurrently. */
function isUniqueViolation(error: unknown): boolean {
  let cause: unknown = error;
  while (cause && typeof cause === "object") {
    if ("code" in cause && cause.code === "23505") return true;
    cause = "cause" in cause ? cause.cause : null;
  }
  return false;
}

export type AttachCustomDomainResult =
  | { ok: true }
  | {
      ok: false;
      reason: "subdomain_required" | "reserved" | "already_attached" | "taken";
    };

/** One website has one optional custom domain. Attaching an apex or `www.`
 * host also attaches its pair; the typed host starts as primary. */
export async function attachCustomDomain(
  teamId: string,
  value: string,
): Promise<AttachCustomDomainResult> {
  const hostname = normalizeHost(value);
  const paired = pairedHostname(hostname);
  const hostnames = paired ? [hostname, paired] : [hostname];
  const platform = getPlatformSiteDomain();
  if (hostnames.some((host) => host === platform || isPlatformHost(host)))
    return { ok: false, reason: "reserved" };

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });
  if (!team) return { ok: false, reason: "already_attached" };
  if (!team.subdomain) return { ok: false, reason: "subdomain_required" };
  if ((await listCustomDomains(teamId)).length > 0)
    return { ok: false, reason: "already_attached" };

  const taken = await db.query.customDomains.findFirst({
    where: inArray(customDomains.hostname, hostnames),
  });
  if (taken) return { ok: false, reason: "taken" };

  try {
    await db.insert(customDomains).values(
      hostnames.map((host) => ({
        teamId,
        hostname: host,
        primary: host === hostname,
      })),
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "taken" };
    throw error;
  }
  await db
    .update(teams)
    .set({
      customDomainVerificationToken: randomBytes(16).toString("hex"),
      customDomainTxtSatisfied: null,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));
  return { ok: true };
}

export async function removeCustomDomain(teamId: string): Promise<boolean> {
  const removed = await db
    .delete(customDomains)
    .where(eq(customDomains.teamId, teamId))
    .returning({ id: customDomains.id });
  if (removed.length === 0) return false;

  await db
    .update(teams)
    .set({
      customDomainVerificationToken: null,
      customDomainTxtSatisfied: null,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));
  return true;
}

/** Picks which host of the pair is canonical once verified. */
export async function setPrimaryCustomDomain(
  teamId: string,
  value: string,
): Promise<boolean> {
  const hostname = normalizeHost(value);
  const hosts = await listCustomDomains(teamId);
  if (!hosts.some((host) => host.hostname === hostname)) return false;

  await db
    .update(customDomains)
    .set({
      primary: sql`${customDomains.hostname} = ${hostname}`,
      updatedAt: new Date(),
    })
    .where(eq(customDomains.teamId, teamId));
  return true;
}

/** Off keeps the FrontLit subdomain serving the site (with canonical tags
 * pointing at the custom host) instead of 301-redirecting to it. */
export async function setRedirectSubdomain(
  teamId: string,
  redirectSubdomain: boolean,
): Promise<void> {
  await db
    .update(teams)
    .set({ redirectSubdomain, updatedAt: new Date() })
    .where(eq(teams.id, teamId));
}

/** Hides the whole site from search engines (pre-launch) or exposes it. */
export async function setHideFromSearch(
  teamId: string,
  hideFromSearch: boolean,
): Promise<void> {
  await db
    .update(teams)
    .set({ hideFromSearch, updatedAt: new Date() })
    .where(eq(teams.id, teamId));
}

/** Looks up the TXT record a team was asked to create
 * (`_frontlit-verify.<domain>`) and checks it matches the issued token. */
export async function verifyDnsTxtRecord(
  hostname: string,
  token: string,
  recordName = getCustomDomainTxtRecordName(),
): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`${recordName}.${hostname}`);
    return records.some((chunks) => chunks.join("").trim() === token);
  } catch {
    return false;
  }
}

async function cnameChainIncludes(hostname: string, target: string): Promise<boolean> {
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
    const nexts = records.map((record) => record.replace(/\.$/, "").toLowerCase());
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
export async function verifyDnsRouting(
  hostname: string,
  target = getCustomDomainCnameTarget(),
): Promise<boolean> {
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

/** Checks the shared ownership TXT once and each host's routing record
 * independently. A host is verified when both pass, so one half of a pair
 * can be live while the other is still pending. Returns false when no
 * custom domain is attached. */
export async function verifyCustomDomain(teamId: string): Promise<boolean> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });
  const hosts = await listCustomDomains(teamId);
  if (!team?.customDomainVerificationToken || hosts.length === 0) return false;

  const txtSatisfied = await verifyDnsTxtRecord(
    ownershipHostname(hosts[0]!.hostname),
    team.customDomainVerificationToken,
    getCustomDomainTxtRecordName(team),
  );
  const target = getCustomDomainCnameTarget(team);
  const now = new Date();
  const wasLive = hosts.some((host) => host.status === "verified");
  let isLive = false;
  for (const host of hosts) {
    const routingSatisfied = await verifyDnsRouting(host.hostname, target);
    const verified = txtSatisfied && routingSatisfied;
    isLive ||= verified;
    await db
      .update(customDomains)
      .set({
        status: verified ? "verified" : "failed",
        verifiedAt: verified ? now : host.verifiedAt,
        routingSatisfied,
        updatedAt: now,
      })
      .where(eq(customDomains.id, host.id));
  }
  await db
    .update(teams)
    .set({
      customDomainTxtSatisfied: txtSatisfied,
      // The first verified custom domain is the launch: open the site to search.
      ...(isLive && !wasLive ? { hideFromSearch: false } : {}),
      updatedAt: now,
    })
    .where(eq(teams.id, teamId));
  return true;
}

export type ResolvedHost = {
  teamId: string;
  canonicalHost: string;
  /** True when this host should 301 to `canonicalHost`. */
  redirect: boolean;
  /** Team-wide pre-launch switch: noindex everywhere, robots disallow all. */
  hideFromSearch: boolean;
};

/** Resolves an incoming host to exactly one team website.
 *
 * - The FrontLit subdomain always resolves. Once a custom host is
 *   verified it redirects there, unless the team turned `redirectSubdomain`
 *   off.
 * - A custom host resolves once any host of its pair is verified (the
 *   shared TXT proves the zone is the team's). A pending half of a pair
 *   that already receives traffic just redirects to the canonical host.
 * - Every non-canonical custom host redirects. */
export async function resolveHost(requestHost: string): Promise<ResolvedHost | null> {
  const hostname = normalizeHost(requestHost);
  if (!hostname) return null;

  const subdomain = subdomainFromHost(hostname);
  let team: TeamRow | undefined;
  if (subdomain) {
    team = await db.query.teams.findFirst({
      where: eq(teams.subdomain, subdomain),
    });
  } else {
    const host = await db.query.customDomains.findFirst({
      where: eq(customDomains.hostname, hostname),
    });
    team = host
      ? await db.query.teams.findFirst({ where: eq(teams.id, host.teamId) })
      : undefined;
  }
  if (!team?.subdomain) return null;

  const hosts = await listCustomDomains(team.id);
  if (!subdomain && !hosts.some((host) => host.status === "verified")) return null;

  const canonicalHost = canonicalHostFor(team, hosts)!;
  return {
    teamId: team.id,
    canonicalHost,
    redirect: hostname !== canonicalHost && !(subdomain && !team.redirectSubdomain),
    hideFromSearch: team.hideFromSearch,
  };
}
