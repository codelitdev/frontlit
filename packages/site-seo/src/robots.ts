/** Crawlers that fetch pages to answer a user's question or to build an AI
 * search index. Allowed, so the site shows up (and is cited) in AI answers. */
export const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "DuckAssistBot",
  "MistralAI-User",
] as const;

/** Crawlers (and robots.txt tokens) that collect content to train AI
 * models. `Google-Extended` and `Applebot-Extended` are tokens only:
 * blocking them leaves Google and Apple search untouched. */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "Bytespider",
  "cohere-training-data-crawler",
] as const;

export interface RobotsTxtOptions {
  /** Host the sitemap URL points at. */
  canonicalHost: string;
  /** Pre-launch: keep every crawler out. */
  hidden?: boolean;
  /** Disallow the AI training crawlers; search crawlers stay allowed. */
  blockAiTraining?: boolean;
  /** Paths no crawler should fetch, e.g. `/embed/`. */
  disallow?: string[];
  /** Defaults to `/sitemap.xml`. */
  sitemapPath?: string;
}

function group(agents: readonly string[], rules: string[]): string {
  return [...agents.map((agent) => `User-agent: ${agent}`), ...rules].join("\n");
}

/** A site's `robots.txt`: everyone may crawl (minus `disallow`), AI search
 * crawlers are allowed by name, and AI training crawlers are blocked when
 * `blockAiTraining` is set. A hidden site blocks every crawler. */
export function buildRobotsTxt({
  canonicalHost,
  hidden = false,
  blockAiTraining = false,
  disallow = [],
  sitemapPath = "/sitemap.xml",
}: RobotsTxtOptions): string {
  if (hidden) return `${group(["*"], ["Disallow: /"])}\n`;
  const allow = ["Allow: /", ...disallow.map((path) => `Disallow: ${path}`)];
  return `${[
    group(["*"], allow),
    `# AI search crawlers\n${group(AI_SEARCH_CRAWLERS, allow)}`,
    blockAiTraining
      ? `# AI training crawlers\n${group(AI_TRAINING_CRAWLERS, ["Disallow: /"])}`
      : "",
    `Sitemap: https://${canonicalHost}${sitemapPath}`,
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
}
