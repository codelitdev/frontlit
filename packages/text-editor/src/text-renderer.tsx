import React from "react";
import type { TextEditorContent } from "./text-editor-content";
import type { TextRendererTheme } from "./renderer-theme";
import { docsBlockMapping } from "./components/docs-blocks";
import { resolveProfile, type ProfileInput } from "./profiles";
import { ContentRenderer } from "./ui/renderer";
import type { BlockRenderer, ResolveMedia } from "./ui/types";

export interface TextRendererProps {
  /** `"default"`, `"documentation"`, or a profile from `defineProfile`. */
  profile?: ProfileInput;
  json: TextEditorContent;
  className?: string;
  theme?: TextRendererTheme;
  /** Host components per block, e.g. `{ quiz: LearnerQuiz }`. */
  blocks?: Record<string, BlockRenderer>;
  /** Media ID → URL for media blocks. The package never fetches media. */
  resolveMedia?: ResolveMedia;
}

/**
 * Renders TipTap `TextEditorContent` JSON as static React elements — used to
 * display rich text saved by the `Editor` (e.g. inside a block's body). When
 * a `theme` is provided, headings/paragraphs/links pick up its typography;
 * otherwise plain semantic HTML tags are used.
 */
export function TextRenderer({
  json,
  className,
  theme,
  profile = "default",
  blocks,
  resolveMedia,
}: TextRendererProps) {
  const resolved = resolveProfile(profile);
  const docsBlocks = Object.fromEntries(
    Object.entries(docsBlockMapping).filter(([name]) =>
      resolved.blockSchemas.has(name),
    ),
  );
  return (
    <ContentRenderer
      profile={resolved}
      json={json}
      className={className}
      theme={theme}
      blocks={{ ...(docsBlocks as Record<string, never>), ...blocks }}
      resolveMedia={resolveMedia}
    />
  );
}

export default TextRenderer;
