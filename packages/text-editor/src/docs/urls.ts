import { isSafeUrl } from "../core/urls";

const PRIVATE_PATH =
  /\/(?:attachments|private|ticket-attachments|conversation-attachments)(?:\/|$)/i;
const SIGNED_KEY = /^(?:x-amz-.+|x-goog-.+|signature|sig|token|access_token|expires)$/i;

/**
 * Docs policy on top of the generic URL rules: known private attachment paths
 * and expiring signed links are never docs assets.
 */
export function isPublicDocsUrl(value: string): boolean {
  if (/^mailto:/i.test(value)) return true;
  try {
    const url = new URL(value, "https://docs.invalid/");
    return (
      !PRIVATE_PATH.test(decodeURIComponent(url.pathname)) &&
      ![...url.searchParams.keys()].some((key) => SIGNED_KEY.test(key))
    );
  } catch {
    return false;
  }
}

/** DM-VALIDATE/DM-MEDIA: syntax safety; ownership/provider checks belong to the API. */
export function isSafeDocsUrl(value: unknown, image = false): value is string {
  return isSafeUrl(value, image) && isPublicDocsUrl(value);
}
