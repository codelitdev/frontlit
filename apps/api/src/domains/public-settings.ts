import type { getDomainSettings } from "./queries";

/** Domain settings as the REST API and MCP tools return them (ISO dates). */
export function toPublicSettings(
  settings: NonNullable<Awaited<ReturnType<typeof getDomainSettings>>>,
) {
  return {
    ...settings,
    customDomains: settings.customDomains.map((host) => ({
      ...host,
      verifiedAt: host.verifiedAt?.toISOString() ?? null,
    })),
    redirectDomains: settings.redirectDomains.map((host) => ({
      ...host,
      verifiedAt: host.verifiedAt?.toISOString() ?? null,
    })),
  };
}
