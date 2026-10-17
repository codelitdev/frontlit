/**
 * Hosts whose images the public sites may optimize. The same list feeds
 * `images.remotePatterns` in next.config.mjs (so `/_next/image` is not an
 * open proxy) and decides which `<img>` get an optimizer URL (lib/images.ts).
 *
 * Set `IMAGE_REMOTE_HOSTS` (comma-separated hostnames) to match the media
 * CDN in use. Next reads it at build time, so pass it to `next build`.
 */
const DEFAULT_HOSTS = ["cdn.medialit.cloud", "images.unsplash.com"];

export const imageRemoteHosts = (process.env.IMAGE_REMOTE_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

if (imageRemoteHosts.length === 0) imageRemoteHosts.push(...DEFAULT_HOSTS);
