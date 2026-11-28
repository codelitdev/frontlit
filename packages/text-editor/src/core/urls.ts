/**
 * URL rules (design doc §10 L6). Links: `https`, `http`, `mailto` or relative.
 * Images: `https` only. `data:`, `javascript:` and every other scheme are
 * refused. Hosts add their own policy on top (`options.isAllowedUrl`).
 */
export function isSafeUrl(value: unknown, image = false): value is string {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  // Browsers ignore control characters in protocols. Reject their encoded forms too.
  if (
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Browsers ignore controls in dangerous protocols.
    /[\u0000- \u007f\\]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)
  )
    return false;
  if (value.startsWith("//")) return false;
  if (/^(?:https?:|mailto:)/i.test(value)) {
    try {
      const url = new URL(value);
      if (image && url.protocol !== "https:") return false;
      if (url.username || url.password) return false;
      if (url.protocol === "mailto:") return !image && Boolean(url.pathname);
      decodeURIComponent(url.pathname);
      return Boolean(url.hostname);
    } catch {
      return false;
    }
  }
  if (image) return false;
  // Relative paths, site paths, fragments and query links.
  if (/^[^/?#]*:/.test(value) || /%(?:2f|3a)/i.test(value)) return false;
  try {
    const url = new URL(value, "https://relative.invalid/");
    decodeURIComponent(url.pathname);
    return true;
  } catch {
    return false;
  }
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/**
 * True for absolute `http(s)` links that leave the site. Relative paths,
 * fragments, `mailto:` and links to one of `siteHosts` (host names, matched
 * ignoring `www.` and any port) stay on the site.
 */
export function isExternalUrl(
  value: string,
  siteHosts: readonly string[] = [],
): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  let host: string;
  try {
    host = bareHost(new URL(value).hostname);
  } catch {
    return true;
  }
  return !siteHosts.some((site) => bareHost(site.replace(/:\d+$/, "")) === host);
}

/**
 * `target`/`rel` for a rendered link, decided from its URL alone (stored
 * mark attributes are ignored): external links open in a new tab without
 * leaking the opener or referrer; site links get neither. No `nofollow`.
 */
export function linkAttributes(
  href: string,
  siteHosts?: readonly string[],
): { target?: "_blank"; rel?: "noopener noreferrer" } {
  return isExternalUrl(href, siteHosts)
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

/** `https` and, when `hosts` is given, one of those host names exactly. */
export function isAllowedImageUrl(value: unknown, hosts?: readonly string[]): boolean {
  if (!isSafeUrl(value, true)) return false;
  if (!hosts) return true;
  return hosts.includes(new URL(value).hostname.toLowerCase());
}

const BASE64_IMAGE =
  /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/]+=*$/;
/** A raster image embedded as base64 (the default editor stores pasted images this way). */
export function isBase64Image(value: unknown): value is string {
  return typeof value === "string" && BASE64_IMAGE.test(value);
}

/** Media IDs and block IDs (§10 L7). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const isId = (value: unknown): value is string =>
  typeof value === "string" && ID_PATTERN.test(value);

export type VideoProvider = "youtube" | "vimeo";
export const VIDEO_PROVIDERS: readonly VideoProvider[] = ["youtube", "vimeo"];
const VIDEO_ID: Record<VideoProvider, RegExp> = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  vimeo: /^[0-9]{1,12}$/,
};

export const isVideoId = (provider: unknown, id: unknown): boolean =>
  typeof provider === "string" &&
  Object.hasOwn(VIDEO_ID, provider) &&
  typeof id === "string" &&
  VIDEO_ID[provider as VideoProvider].test(id);

/**
 * Reduces a YouTube or Vimeo page URL to provider + video ID. Everything else
 * in the URL (query, timestamps, tracking) is dropped; nothing the author
 * typed reaches the page except the ID.
 */
export function parseVideoUrl(
  value: unknown,
): { provider: VideoProvider; videoId: string } | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let result: { provider: VideoProvider; videoId: string } | null = null;
  if (host === "youtu.be") result = { provider: "youtube", videoId: parts[0] ?? "" };
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch")
      result = { provider: "youtube", videoId: url.searchParams.get("v") ?? "" };
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? ""))
      result = { provider: "youtube", videoId: parts[1] ?? "" };
  } else if (host === "vimeo.com")
    result = {
      provider: "vimeo",
      videoId: parts.find((part) => /^\d+$/.test(part)) ?? "",
    };
  else if (host === "player.vimeo.com" && parts[0] === "video")
    result = { provider: "vimeo", videoId: parts[1] ?? "" };
  return result && isVideoId(result.provider, result.videoId) ? result : null;
}

/** The only player URLs the renderer ever builds: fixed hosts, the ID URL-encoded. */
export function videoEmbedUrl(provider: VideoProvider, videoId: string): string | null {
  if (!isVideoId(provider, videoId)) return null;
  const id = encodeURIComponent(videoId);
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}`;
}

/** A canonical page URL, used when a video is written back to Markdown. */
export function videoPageUrl(provider: VideoProvider, videoId: string): string {
  return provider === "youtube"
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://vimeo.com/${videoId}`;
}
