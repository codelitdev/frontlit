import React from "react";
import { TextRenderer, type TextRendererProps } from "@frontlit/text-editor/renderer";
import { pageTextProfile, toPageText } from "../schema/rich-text";

/** A page block's rich text, rendered with the page text profile. Content
 * saved before the profile is cut down to it rather than failing to render. */
export function PageText({ json, ...props }: Omit<TextRendererProps, "profile">) {
  return <TextRenderer {...props} json={toPageText(json)} profile={pageTextProfile} />;
}
