export interface LlmsTxtLink {
  title: string;
  url: string;
  /** Shown after the link as `: <description>`. */
  description?: string | null;
}

export interface LlmsTxtSection {
  title: string;
  links: LlmsTxtLink[];
}

/** `/llms.txt` (llmstxt.org): the site's title, summary, instructions for
 * agents and sections of links. Empty sections are left out. */
export function buildLlmsTxt(input: {
  title: string;
  summary?: string | null;
  instructions?: string | null;
  sections: LlmsTxtSection[];
}): string {
  const line = (link: LlmsTxtLink) =>
    `- [${link.title}](${link.url})${link.description ? `: ${link.description}` : ""}`;
  return `${[
    `# ${input.title}`,
    input.summary ? `> ${input.summary}` : "",
    input.instructions ? `## Agent instructions\n\n${input.instructions}` : "",
    ...input.sections
      .filter((section) => section.links.length)
      .map((section) => `## ${section.title}\n\n${section.links.map(line).join("\n")}`),
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
}

/** A Markdown document for agents: `# title`, then the non-empty parts. */
export function markdownDocument(
  title: string,
  ...parts: (string | null | undefined)[]
): string {
  return `${[`# ${title}`, ...parts].filter((part) => part?.trim()).join("\n\n")}\n`;
}
