/** The tag families apps/api may expire for a team (docs/site-delivery.md
 * §4.3). Anything else is refused: this is not a general purge endpoint. */
export function isTeamTag(tag: string, teamId: string): boolean {
  const [family, owner, ...rest] = tag.split(":");
  if (owner !== teamId) return false;
  if (family === "page") return rest.length === 1 && !/\s/.test(rest[0]!);
  return (
    rest.length === 0 &&
    ["team", "shell", "docs", "blog", "changelog", "sitemap"].includes(family!)
  );
}
