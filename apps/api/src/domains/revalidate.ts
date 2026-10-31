import { invalidateSiteCache, siteTags } from "../services/site-cache";
import { getDomainSettings } from "./queries";

export async function teamSiteHosts(internalTeamId: string): Promise<string[]> {
  const settings = await getDomainSettings(internalTeamId);
  const hosts: string[] = [];
  if (settings?.subdomain) hosts.push(settings.subdomain.hostname);
  for (const host of settings?.customDomains ?? []) hosts.push(host.hostname);
  for (const host of settings?.redirectDomains ?? []) hosts.push(host.hostname);
  return hosts;
}

/** A domain change can move the canonical host every page links to, so the
 * whole site and the host map are refreshed. */
export async function revalidateAfterDomainChange(
  internalTeamId: string,
  extraHosts: string[] = [],
): Promise<void> {
  const hosts = [...new Set([...extraHosts, ...(await teamSiteHosts(internalTeamId))])];
  await invalidateSiteCache(internalTeamId, (teamId) => [siteTags.team(teamId)], {
    invalidateHosts: hosts,
  });
}
