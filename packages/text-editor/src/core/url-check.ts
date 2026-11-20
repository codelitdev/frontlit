import type { AttrSpec, Profile } from "./types";
import { isBase64Image } from "./urls";

/** Runs a URL attribute's check, then the profile's own URL policy. */
export function checkUrlAttr(
  profile: Profile,
  spec: AttrSpec,
  value: unknown,
): true | string {
  const check = spec.validate(value);
  if (check !== true) return typeof check === "string" ? check : "URL is unsafe.";
  if (
    typeof value === "string" &&
    !isBase64Image(value) &&
    profile.options.isAllowedUrl &&
    !profile.options.isAllowedUrl(value, spec.url === "image" ? "image" : "link")
  )
    return "URL is unsafe or expiring.";
  return true;
}
