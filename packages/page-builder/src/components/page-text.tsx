import React from "react";
import { TextRenderer, type TextRendererProps } from "@frontlit/text-editor/renderer";
import { pageTextProfile } from "../schema/rich-text";

/** A page block's rich text, rendered with the page text profile. */
export function PageText(props: Omit<TextRendererProps, "profile">) {
  return <TextRenderer {...props} profile={pageTextProfile} />;
}
