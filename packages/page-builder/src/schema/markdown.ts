import { type BlockName, DATA_SLOT_BLOCK } from "./blocks";
import { fileBlockDefaults, type StoredBlock, toFileSettings } from "./files";

/** Blocks with nothing to read: chrome repeats on every page, and the rest
 * are decorative or interactive only. */
const SKIPPED = new Set(["header", "footer", "media", "marquee", "embed"]);

type Settings = Record<string, any>;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function link(caption: unknown, href: unknown): string {
  const label = text(caption);
  if (!label) return "";
  const target = text(href);
  return target ? `[${label}](${target})` : label;
}

function heading(level: number, value: unknown): string {
  const title = text(value);
  return title ? `${"#".repeat(level)} ${title}` : "";
}

function links(...pairs: [unknown, unknown][]): string {
  return pairs
    .map(([caption, href]) => link(caption, href))
    .filter(Boolean)
    .join(" · ");
}

function blockMarkdown(name: string, s: Settings): string[] {
  switch (name) {
    case "hero":
      return [
        text(s.preTitle),
        heading(2, s.title),
        text(s.description),
        text(s.command) ? `\`\`\`sh\n${text(s.command)}\n\`\`\`` : "",
        links(
          [s.buttonCaption, s.buttonAction],
          [s.secondaryButtonCaption, s.secondaryButtonAction],
        ),
        text(s.smallPrint),
      ];
    case "content":
      return [heading(2, s.title), text(s.body)];
    case "rich-text":
      return [text(s.text)];
    case "featured":
      return [
        heading(2, s.title),
        text(s.description),
        (s.items ?? [])
          .map((item: Settings) =>
            [`- **${text(item.title)}**`, text(item.description)]
              .filter(Boolean)
              .join(": "),
          )
          .join("\n"),
      ];
    case "grid":
      return [
        heading(2, s.title),
        text(s.description),
        (s.items ?? [])
          .map((item: Settings) =>
            [
              `- **${text(item.title)}**`,
              [text(item.description), link(item.buttonCaption, item.buttonAction)]
                .filter(Boolean)
                .join(" "),
            ]
              .filter(Boolean)
              .join(": "),
          )
          .join("\n"),
        link(s.buttonCaption, s.buttonAction),
      ];
    case "pricing":
      return [
        heading(2, s.title),
        text(s.description),
        ...(s.tiers ?? []).map((tier: Settings) =>
          [
            heading(3, tier.name),
            [text(tier.price), text(tier.priceYearly)].filter(Boolean).join(" or "),
            text(tier.description),
            (tier.features ?? []).map((f: string) => `- ${text(f)}`).join("\n"),
            link(tier.buttonCaption, tier.buttonAction),
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      ];
    case "faq":
      return [
        heading(2, s.title),
        ...(s.items ?? []).map((item: Settings) =>
          [heading(3, item.question), text(item.answer)].filter(Boolean).join("\n\n"),
        ),
      ];
    case "banner":
      return [
        heading(2, s.title),
        text(s.description),
        links(
          [s.buttonCaption, s.buttonAction],
          [s.secondaryButtonCaption, s.secondaryButtonAction],
        ),
      ];
    case "email-form":
    case "support-form":
      return [heading(2, s.title), text(s.description)];
    case "code-snippet":
      return [text(s.code) ? `\`\`\`\n${text(s.code)}\n\`\`\`` : "", text(s.caption)];
    default:
      return [];
  }
}

/**
 * A published page layout as Markdown, for agents (`Accept: text/markdown`
 * and `<path>.md`): headings, text, buttons as links and cards as lists.
 * `slot` renders FrontLit's content feed (the blog, docs or changelog list)
 * where the page places it. Blocks that fail to read are skipped.
 */
export function layoutToMarkdown(
  layout: StoredBlock[],
  slot: () => string = () => "",
): string {
  const parts: string[] = [];
  for (const block of layout) {
    if (block.name === DATA_SLOT_BLOCK) {
      parts.push(slot());
      continue;
    }
    if (SKIPPED.has(block.name)) continue;
    let settings: Settings;
    try {
      settings = {
        ...fileBlockDefaults[block.name as BlockName],
        ...toFileSettings(block.name, block.settings),
      };
    } catch {
      continue;
    }
    parts.push(...blockMarkdown(block.name, settings));
  }
  return parts.filter((part) => part.trim()).join("\n\n");
}
