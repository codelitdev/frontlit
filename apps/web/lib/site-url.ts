/** Public URL of a team's site host. Local `*.localhost` hosts are served by
 * `apps/sites` on its dev port over plain HTTP. */
export function siteUrl(hostname: string): string {
  const local = hostname === "localhost" || hostname.endsWith(".localhost");
  return `${local ? "http" : "https"}://${hostname}${local ? ":3002" : ""}`;
}
