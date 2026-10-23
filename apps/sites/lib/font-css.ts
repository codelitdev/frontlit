import type { ThemeStyle } from "@frontlit/page-builder/models";
import { DEFAULT_FONT_ID, fontFamilies, type FontFamily } from "./fonts";

const familyName = (id: string) => `fl-${id}`;
const fallbackName = (id: string) => `fl-${id}-fallback`;

function faces(family: FontFamily): string {
  const web = family.files
    .map(
      (file) =>
        `@font-face{font-family:"${familyName(family.id)}";src:url(${file.url}) format("woff2");font-weight:${file.weight};font-style:normal;font-display:swap}`,
    )
    .join("");
  const fallback = family.fallback
    ? `@font-face{font-family:"${fallbackName(family.id)}";src:local("${family.fallback.local}");ascent-override:${family.fallback.ascent}%;descent-override:${family.fallback.descent}%;line-gap-override:${family.fallback.lineGap}%;size-adjust:${family.fallback.sizeAdjust}%}`
    : "";
  return web + fallback;
}

function stack(family: FontFamily): string {
  return family.fallback
    ? `"${familyName(family.id)}","${fallbackName(family.id)}"`
    : `"${familyName(family.id)}"`;
}

const defaultFamily = fontFamilies.find((family) => family.id === DEFAULT_FONT_ID);

/**
 * `@font-face` rules for every theme font plus the `--font-<id>` variables the
 * page-builder theme classes read. Browsers download a face only when text
 * uses it, so declaring all of them is free. The `html.fl-fonts` selector
 * outranks the theme's own `:root` rules regardless of stylesheet order.
 */
export const fontCss =
  fontFamilies.map(faces).join("") +
  `html.fl-fonts{${fontFamilies
    .map((family) => `--font-${family.id}:${stack(family)}`)
    .join(";")}${defaultFamily ? `;font-family:${stack(defaultFamily)}` : ""}}`;

/**
 * Font files worth preloading for a theme: the body face, then the heading
 * face. Preloading is limited to these because each preload competes with the
 * page's own resources. Families with several static weights preload the 400
 * file only.
 */
export function themeFontPreloads(theme: ThemeStyle): string[] {
  const ids: string[] = [];
  for (const key of ["text1", "header1"] as const) {
    const match = /(?:^|\s)font-([a-z0-9-]+)/.exec(
      theme.typography?.[key]?.fontFamily ?? "",
    );
    if (match && !ids.includes(match[1])) ids.push(match[1]);
  }

  const urls: string[] = [];
  for (const id of ids) {
    const files = fontFamilies.find((family) => family.id === id)?.files;
    const file = files?.find((candidate) => candidate.weight === "400") ?? files?.[0];
    if (file) urls.push(file.url);
  }
  return urls;
}
