import type { AttrSpec, BlockSchema } from "../types";
import { isSafeUrl } from "../urls";
import { attr } from "./attrs";

/**
 * Link-shaped blocks: a call-to-action button, a link preview card and an
 * H5P activity. All atoms with literal props, so Markdown stays one line:
 * `<Button href="/start" label="Start" />`.
 *
 * Their URL is `requiredToPublish`: the editor may save it empty while the
 * author fills the block in (autosave validates every keystroke, and the
 * renderer then draws nothing), but `incompleteBlocks` keeps such a block from
 * being published, and the API refuses it in Markdown written by agents.
 */

const urlAttr = (
  description: string,
  check: (value: string) => boolean,
  message: string,
  kind: "link" | "image" = "link",
  requiredToPublish = false,
): AttrSpec<string | null> => ({
  default: null,
  type: "URL",
  url: kind,
  requiredToPublish,
  validate: (v) => v === null || (typeof v === "string" && check(v)) || message,
  description,
});

const isWebUrl = (value: string) => isSafeUrl(value) && /^https?:\/\//i.test(value);

export const BUTTON_VARIANTS = ["primary", "secondary"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/** A link styled as a button (a call to action). */
export function button(): BlockSchema {
  return {
    name: "button",
    tag: "Button",
    group: "block",
    attrs: {
      label: attr.text("Button text.", { required: true }),
      href: urlAttr(
        "Where the button goes: https, http, mailto or a site path.",
        (v) => isSafeUrl(v),
        "Button link URL is unsafe.",
        "link",
        true,
      ),
      variant: attr.oneOf(
        BUTTON_VARIANTS,
        "Visual weight. Absent means primary.",
        `Button variant must be one of: ${BUTTON_VARIANTS.join(", ")}.`,
      ),
    },
    docs: {
      summary: "A link styled as a button, for a call to action.",
      example: '<Button label="Start the course" href="/courses/intro" />',
    },
  };
}

/** A card previewing a web page: title, description and image are written by the author. */
export function webPreview(): BlockSchema {
  return {
    name: "webPreview",
    tag: "WebPreview",
    group: "block",
    attrs: {
      url: urlAttr(
        "The page to link to (http or https).",
        isWebUrl,
        "Web preview URL must be an http or https link.",
        "link",
        true,
      ),
      title: attr.optionalText("Card title. Absent shows the link's host name."),
      description: attr.optionalText("One or two sentences about the page."),
      image: urlAttr(
        "Optional thumbnail (https).",
        (v) => isSafeUrl(v, true),
        "Web preview image must be an https URL.",
        "image",
      ),
    },
    docs: {
      summary: "A link card previewing a web page, with an optional image.",
      example:
        '<WebPreview url="https://example.com/guide" title="The guide" description="Everything in one place." />',
    },
  };
}

export const H5P_DEFAULT_HOSTS = ["h5p.org", "*.h5p.com"] as const;
export const H5P_MIN_HEIGHT = 100;
export const H5P_MAX_HEIGHT = 4000;
export const H5P_DEFAULT_HEIGHT = 480;

/** True for an https URL on one of `hosts` (`*.example.com` matches subdomains). */
export function isAllowedHostUrl(value: unknown, hosts: readonly string[]): boolean {
  if (!isSafeUrl(value, true)) return false;
  const host = new URL(value).hostname.toLowerCase();
  return hosts.some((allowed) => {
    const rule = allowed.toLowerCase();
    return rule.startsWith("*.") ? host.endsWith(rule.slice(1)) : host === rule;
  });
}

export interface H5POptions {
  /** Hosts allowed to serve H5P content. Defaults to h5p.org and *.h5p.com. */
  hosts?: readonly string[];
}

/** An interactive H5P activity, shown in a frame from an allowed host. */
export function h5p({ hosts = H5P_DEFAULT_HOSTS }: H5POptions = {}): BlockSchema {
  return {
    name: "h5p",
    tag: "H5P",
    group: "block",
    attrs: {
      src: urlAttr(
        `The activity's embed URL (https, on ${hosts.join(" or ")}).`,
        (v) => isAllowedHostUrl(v, hosts),
        `H5P URLs must use https and one of these hosts: ${hosts.join(", ")}.`,
        "link",
        true,
      ),
      title: attr.optionalText("Accessible title of the activity frame."),
      height: attr.integer(
        `Frame height in pixels (default ${H5P_DEFAULT_HEIGHT}).`,
        H5P_MIN_HEIGHT,
        H5P_MAX_HEIGHT,
      ),
    },
    docs: {
      summary:
        "An interactive H5P activity (quiz, flashcards, timeline…) by its embed URL.",
      example: '<H5P src="https://h5p.org/h5p/embed/712" title="Drag the words" />',
    },
  };
}
