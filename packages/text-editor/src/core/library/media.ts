import Image from "@tiptap/extension-image";
import { DIAGNOSTIC_CODES as CODES } from "../diagnostics";
import {
  isAllowedImageUrl,
  isBase64Image,
  isId,
  isVideoId,
  parseVideoUrl,
  VIDEO_PROVIDERS,
  videoPageUrl,
  type VideoProvider,
} from "../urls";
import type { AttrSpec, BlockSchema } from "../types";
import { attr } from "./attrs";

/** Media kinds a host picker is asked for. */
export type MediaKind = "image" | "video" | "audio" | "pdf" | "file";

/** Block name → the media kind its `media` attribute holds. */
export const MEDIA_KINDS: Record<string, MediaKind> = {
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  file: "file",
};

export interface ImageOptions {
  /** `https` hosts allowed in `src`; any host when absent. */
  hosts?: string[];
  /** Images may be stored inline as base64 `data:` URLs. Default: false. */
  allowBase64?: boolean;
  /** Images may reference uploaded media by ID (`<Image media="…" />`). Default: false. */
  media?: boolean;
  /** Images keep a width and height (resizable in the editor). Default: false. */
  resize?: boolean;
}

/**
 * Image. Markdown: `![alt](https://… "title")`, or `<Image media="…" alt="…" />`
 * for uploaded media when `media` is on.
 */
export function image(options: ImageOptions = {}): BlockSchema {
  const { hosts, allowBase64 = false, media = false, resize = false } = options;
  const lowerHosts = hosts?.map((host) => host.toLowerCase());
  const srcMessage = lowerHosts
    ? `Image URLs must use https and one of these hosts: ${lowerHosts.join(", ")}.`
    : "Images require a stable HTTPS URL.";
  const size: AttrSpec<number | null> = resize
    ? attr.integer("Display size in pixels.", 1, 10000, { markdown: false })
    : {
        default: null,
        validate: (v) => v === null,
        description: "Not used.",
        markdown: false,
      };
  const attrs: Record<string, AttrSpec> = {
    // First, so `<Image media="…" alt="…" />` reads naturally.
    ...(media
      ? { media: attr.media("An uploaded image (instead of src).", false) }
      : {}),
    src: {
      default: null,
      type: "https URL",
      url: "image",
      validate: (v) =>
        (media && v === null) ||
        (allowBase64 && isBase64Image(v)) ||
        isAllowedImageUrl(v, lowerHosts) ||
        srcMessage,
      description: lowerHosts
        ? `An https URL on ${lowerHosts.join(", ")}.`
        : "An https URL.",
    },
    alt: attr.optionalText("Text for screen readers."),
    title: attr.optionalText("Tooltip text."),
    width: size,
    height: size,
  };
  return {
    name: "image",
    tag: media ? "Image" : undefined,
    group: "block",
    attrs,
    extension: ({ editing }) =>
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            ...(media ? { media: { default: null } } : {}),
          };
        },
      }).configure({
        allowBase64,
        HTMLAttributes: { class: "max-w-full h-auto rounded-md" },
        resize:
          editing && resize
            ? {
                enabled: true,
                directions: ["top", "bottom", "left", "right"],
                alwaysPreserveAspectRatio: true,
              }
            : false,
      }),
    validate(node, ctx) {
      const { src = null, media: id = null } = node.attrs ?? {};
      if (media && (src === null) === (id === null))
        ctx.report(
          CODES.invalidDocument,
          "An image needs either src or media.",
          `${ctx.path}.attrs`,
        );
    },
    normalize: (node) => ({
      ...node,
      attrs: { ...node.attrs, alt: node.attrs?.alt ?? "" },
    }),
    docs: {
      summary: media
        ? "An image: an uploaded media ID, or an https URL in standard Markdown image syntax."
        : "An image in standard Markdown image syntax.",
      example: media
        ? '![Team photo](https://images.unsplash.com/photo-1 "Optional title")\n\n<Image media="med_123" alt="Diagram" />'
        : '![Team photo](https://example.com/photo.png "Optional title")',
    },
  };
}

const PROVIDER_NAMES: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
};

export interface VideoOptions {
  /** Uploaded video files by media ID. Default: true. */
  media?: boolean;
  /** Hosted players allowed through `url`. Default: YouTube and Vimeo. */
  providers?: VideoProvider[];
}

/**
 * Video: an uploaded file, or a YouTube or Vimeo URL. A URL is reduced on
 * write to provider + video ID; the renderer builds the player URL itself.
 */
export function video({
  media = true,
  providers = [...VIDEO_PROVIDERS],
}: VideoOptions = {}): BlockSchema {
  const fromUrl = (url: unknown) => {
    const parsed = parseVideoUrl(url);
    return parsed && providers.includes(parsed.provider) ? parsed : null;
  };
  const urlMessage = `Video URLs must be ${providers.map((p) => (p === "youtube" ? "YouTube" : "Vimeo")).join(" or ")} links.`;
  return {
    name: "video",
    tag: "Video",
    group: "block",
    attrs: {
      media: media
        ? attr.media("An uploaded video file (instead of url).", false)
        : {
            default: null,
            validate: (v) => v === null,
            description: "Not used.",
            markdown: false,
          },
      provider: {
        ...attr.oneOf(providers, "Video host, set from url.", urlMessage),
        markdown: false,
      },
      videoId: {
        default: null,
        type: "string",
        validate: (v) => v === null || typeof v === "string",
        description: "Video ID on the host, set from url.",
        markdown: false,
      },
      caption: attr.optionalText("Text shown under the video."),
    },
    fromMarkdown(element, ctx) {
      const props = ctx.props(element, [...(media ? ["media"] : []), "url", "caption"]);
      if (element.children.length)
        ctx.fail(element, "<Video> cannot have children.", CODES.unsupportedSyntax);
      if (props.media !== undefined && props.url !== undefined)
        ctx.fail(
          element,
          "<Video> takes media or url, not both.",
          CODES.invalidDocument,
        );
      if (props.caption !== undefined && typeof props.caption !== "string")
        ctx.fail(element, "<Video> caption must be text.", CODES.unsupportedAttribute);
      let source: Record<string, unknown>;
      if (props.url !== undefined) {
        const parsed = fromUrl(props.url);
        if (!parsed) ctx.fail(element, urlMessage, CODES.unsafeUrl);
        source = { media: null, ...parsed };
      } else if (props.media === undefined) {
        // An empty placeholder, as the editor inserts it before a source is chosen.
        source = { media: null, provider: null, videoId: null };
      } else {
        if (!isId(props.media))
          ctx.fail(
            element,
            "Media IDs are 1–64 letters, digits, _ or -.",
            CODES.unsupportedAttribute,
          );
        source = { media: props.media, provider: null, videoId: null };
      }
      return { type: "video", attrs: { ...source, caption: props.caption ?? null } };
    },
    toMarkdown(node, ctx) {
      const a = node.attrs ?? {};
      return ctx.element("Video", [
        a.media
          ? ctx.prop("media", a.media)
          : a.provider
            ? ctx.prop("url", videoPageUrl(a.provider, a.videoId))
            : undefined,
        ctx.prop("caption", a.caption),
      ]);
    },
    validate(node, ctx) {
      const { media: id = null, provider = null, videoId = null } = node.attrs ?? {};
      const hosted = provider !== null || videoId !== null;
      // Neither is an empty placeholder (renders nothing); both is ambiguous.
      if (id !== null && hosted)
        ctx.report(
          CODES.invalidDocument,
          "A video takes media or a hosted video, not both.",
          `${ctx.path}.attrs`,
        );
      else if (hosted && !isVideoId(provider, videoId))
        ctx.report(
          CODES.unsafeUrl,
          "Invalid hosted video ID.",
          `${ctx.path}.attrs.videoId`,
        );
    },
    docs: {
      summary: media
        ? "A video: an uploaded file by media ID, or a YouTube or Vimeo URL (stored as the video ID)."
        : "A YouTube or Vimeo video (stored as the video ID).",
      example: media
        ? '<Video media="med_123" caption="Walkthrough" />\n\n<Video url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />'
        : '<Video url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />',
      props: [
        {
          name: "url",
          type: "URL",
          description: `A ${providers.map((p) => PROVIDER_NAMES[p]).join(" or ")} link${media ? "; use url or media, not both" : ""}.`,
        },
      ],
    },
  };
}

function mediaBlock(
  name: string,
  tag: string,
  noun: string,
  extra: Record<string, AttrSpec>,
  example: string,
): BlockSchema {
  return {
    name,
    tag,
    group: "block",
    // Null while the author hasn't picked a file yet; renders nothing.
    attrs: { media: attr.media(`The uploaded ${noun}.`, false), ...extra },
    docs: { summary: `An uploaded ${noun}, by media ID.`, example },
  };
}

/** An uploaded audio file with a player. */
export function audio(): BlockSchema {
  return mediaBlock(
    "audio",
    "Audio",
    "audio file",
    { caption: attr.optionalText("Text shown under the player.") },
    '<Audio media="med_123" caption="Episode 1" />',
  );
}

/** An uploaded PDF shown inline. */
export function pdf(): BlockSchema {
  return mediaBlock(
    "pdf",
    "PDF",
    "PDF",
    { title: attr.optionalText("Accessible title of the document.") },
    '<PDF media="med_123" title="Workbook" />',
  );
}

/** An uploaded file offered as a download. */
export function file(): BlockSchema {
  return mediaBlock(
    "file",
    "File",
    "file",
    { label: attr.optionalText("Link text; the file name when absent.") },
    '<File media="med_123" label="Worksheet (PDF)" />',
  );
}
