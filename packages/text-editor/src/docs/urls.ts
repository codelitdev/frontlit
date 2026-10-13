/** DM-VALIDATE/DM-MEDIA: syntax safety; ownership/provider checks belong to the API. */
export function isSafeDocsUrl(value: unknown, image = false): value is string {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  // Browsers ignore control characters in protocols. Reject their encoded forms too.
  if (
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Browsers ignore controls in dangerous protocols.
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)
  )
    return false;
  if (value.startsWith("//")) return false;
  const privatePath =
    /\/(?:attachments|private|ticket-attachments|conversation-attachments)(?:\/|$)/i;
  const signedKey =
    /^(?:x-amz-.+|x-goog-.+|signature|sig|token|access_token|expires)$/i;
  if (/^(?:https?:|mailto:)/i.test(value)) {
    try {
      const url = new URL(value);
      if (image && url.protocol !== "https:") return false;
      if (url.username || url.password) return false;
      if (url.protocol === "mailto:") return !image && Boolean(url.pathname);
      // Known private attachment paths and expiring signed links are never docs assets.
      if (privatePath.test(decodeURIComponent(url.pathname))) return false;
      for (const key of url.searchParams.keys()) {
        if (signedKey.test(key)) return false;
      }
      return Boolean(url.hostname);
    } catch {
      return false;
    }
  }
  if (image) return false;
  // Relative Markdown paths, site paths, fragments, and query links are safe data.
  if (/^[^/?#]*:/.test(value) || /%(?:2f|3a)/i.test(value)) return false;
  try {
    const url = new URL(value, "https://docs.invalid/");
    return (
      !privatePath.test(decodeURIComponent(url.pathname)) &&
      ![...url.searchParams.keys()].some((key) => signedKey.test(key))
    );
  } catch {
    return false;
  }
}
