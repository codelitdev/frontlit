import { getDomainSettings, getPlatformSiteDomain } from "../domains/queries";

export function sitesOrigin(canonicalHost: string | null): string {
  if (!canonicalHost) return process.env.SITES_BASE_URL ?? "http://localhost:3002";
  const local =
    getPlatformSiteDomain() === "localhost" ||
    canonicalHost === "localhost" ||
    canonicalHost.endsWith(".localhost");
  return `${local ? "http" : "https"}://${canonicalHost}${local ? ":3002" : ""}`;
}
export async function siteOriginForTeam(teamId: string): Promise<string> {
  const settings = await getDomainSettings(teamId);
  return sitesOrigin(settings?.canonicalHost ?? null);
}
