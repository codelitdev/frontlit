/** `owner/repo` from `owner/repo` or a `https://github.com/owner/repo` URL. */
export function parseGithubRepo(value?: string): string | undefined {
  const match = value
    ?.trim()
    .match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  return match?.[1];
}

/** 1234 → "1.2k", like GitHub's own star count. */
export function formatStars(count: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(count)
    .toLowerCase();
}
