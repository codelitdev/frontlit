import { findTeamById } from "../team/queries";
import { revalidateTeam } from "../services/revalidate";
import { getDomainSettings } from "./queries";

export async function teamSiteHosts(internalTeamId: string): Promise<string[]> {
  const settings = await getDomainSettings(internalTeamId);
  const hosts: string[] = [];
  if (settings?.subdomain) hosts.push(settings.subdomain.hostname);
  if (settings?.customDomain) hosts.push(settings.customDomain.hostname);
  return hosts;
}

/** Best-effort ISR + host-map invalidation after a domain mutation. */
export async function revalidateAfterDomainChange(
  internalTeamId: string,
  extraHosts: string[] = [],
): Promise<void> {
  const team = await findTeamById(internalTeamId);
  if (!team) return;
  const hosts = [...new Set([...extraHosts, ...(await teamSiteHosts(internalTeamId))])];
  revalidateTeam(team.teamId, { invalidateHosts: hosts }).catch(() => {});
}
