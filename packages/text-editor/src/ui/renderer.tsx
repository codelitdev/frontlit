import React from "react";
import { renderToReactElement } from "@tiptap/static-renderer";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { extractTextFromNode } from "../extract-text-from-node";
import emptyDoc from "../empty-doc";
import { createId } from "../create-id";
import type { TextEditorContent } from "../text-editor-content";
import type { TextRendererTheme } from "../renderer-theme";
import { cn } from "../lib/cn";
import { RenderedCodeBlock } from "../components/rendered-code-block";
import { extractDocsHeadings } from "../core/headings";
import { createProfileExtensions, getProfileSchema } from "../core/extensions";
import type { Profile } from "../core/types";
import { isSafeUrl } from "../core/urls";
import { mediaBlockRenderers, textBlockRenderers } from "./block-renderers";
import type { BlockRenderer, ResolveMedia } from "./types";

export interface ContentRendererProps {
  profile: Profile;
  json: TextEditorContent;
  className?: string;
  theme?: TextRendererTheme;
  /** Host components per block, e.g. `{ quiz: LearnerQuiz }`. They win over built-in ones. */
  blocks?: Record<string, BlockRenderer>;
  /** Media ID → URL, for Image, Video, Audio, PDF and File blocks. */
  resolveMedia?: ResolveMedia;
}

const typographyClasses = (typography?: {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: string;
  textDecoration?: string;
  textOverflow?: string;
}) => [
  typography?.fontFamily,
  typography?.fontSize,
  typography?.fontWeight,
  typography?.lineHeight,
  typography?.letterSpacing,
  typography?.textTransform,
  typography?.textDecoration,
  typography?.textOverflow,
];

function removeEmptyTextNodes(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (node.type === "text" && node.text === "") return undefined;
  if (!Array.isArray(node.content)) return node;
  const content = node.content
    .map(removeEmptyTextNodes)
    .filter((child: any) => child !== undefined);
  return { ...node, content };
}

const extensionCache = new WeakMap<
  Profile,
  ReturnType<typeof createProfileExtensions>
>();
const extensionsFor = (profile: Profile) => {
  let extensions = extensionCache.get(profile);
  if (!extensions) {
    extensions = createProfileExtensions(profile);
    extensionCache.set(profile, extensions);
  }
  return extensions;
};

/** Built-in renderers for library blocks the profile holds. */
export function libraryRenderers(profile: Profile, resolveMedia?: ResolveMedia) {
  const all: Record<string, unknown> = {
    ...textBlockRenderers,
    ...mediaBlockRenderers(resolveMedia),
  };
  // Images stored only by URL keep Tiptap's own markup.
  if (!profile.blockSchemas.get("image")?.attrs.media) delete all.image;
  return Object.fromEntries(
    Object.entries(all).filter(([name]) => profile.blockSchemas.has(name)),
  );
}

/**
 * Renders Tiptap JSON of a profile as static React elements (no raw
 * HTML injection; author code only ever runs in an embed's
 * sandboxed frame). A `theme` styles headings, paragraphs and links.
 */
export function ContentRenderer({
  profile,
  json,
  className,
  theme,
  blocks,
  resolveMedia,
}: ContentRendererProps) {
  const extensions = extensionsFor(profile);
  const unique = profile.options.headingAnchors !== "legacy";
  const content = removeEmptyTextNodes(
    (json as any) ?? (emptyDoc as any),
  ) as TextEditorContent;
  const headings = unique ? extractDocsHeadings(content) : [];
  // React can replay each mapped node (StrictMode, hydration, or a retry).
  // Bind IDs before rendering instead of consuming an iterator in a component.
  const renderContent = unique
    ? getProfileSchema(profile).nodeFromJSON(content)
    : content;
  const headingIds = new WeakMap<ProseMirrorNode, string>();
  if (unique) {
    let headingIndex = 0;
    (renderContent as ProseMirrorNode).descendants((node) => {
      if (node.type.name === "heading")
        headingIds.set(node, headings[headingIndex++].id);
    });
  }
  const hosted = Object.fromEntries(
    Object.entries(blocks ?? {}).map(([name, Component]) => [
      name,
      ({ node, children }: { node: ProseMirrorNode; children?: React.ReactNode }) => (
        <Component node={node} attrs={node.attrs} resolveMedia={resolveMedia}>
          {children}
        </Component>
      ),
    ]),
  );

  const rendered = renderToReactElement({
    extensions,
    content: renderContent,
    options: {
      nodeMapping: {
        paragraph: ({ children }) => {
          const classes = cn(
            "text-base",
            ...typographyClasses(theme?.typography?.text1),
          );
          return <p className={classes}>{children}</p>;
        },
        hardBreak: () => <br />,
        heading: ({ node, children }) => {
          const level = node?.attrs?.level ?? 1;
          const id = unique
            ? headingIds.get(node)
            : createId(extractTextFromNode(node));
          if (!theme) {
            const Tag = `h${level}` as React.ElementType;
            return <Tag id={id}>{children}</Tag>;
          }
          if (level === 1) {
            const classes = cn(
              "scroll-m-20 text-4xl font-bold tracking-tight",
              ...typographyClasses(theme?.typography?.header1),
            );
            return (
              <h1 id={id} className={classes}>
                {children}
              </h1>
            );
          }
          if (level === 2) {
            const classes = cn(
              "scroll-m-20 text-3xl font-bold tracking-tight",
              ...typographyClasses(theme?.typography?.header2),
            );
            return (
              <h2 id={id} className={classes}>
                {children}
              </h2>
            );
          }
          const classes = cn(
            "scroll-m-20 text-2xl font-semibold tracking-normal",
            ...typographyClasses(
              unique && level >= 4
                ? (theme?.typography?.header4 ?? theme?.typography?.header3)
                : theme?.typography?.header3,
            ),
          );
          const Tag = (unique ? `h${level}` : "h3") as React.ElementType;
          return (
            <Tag id={id} className={classes}>
              {children}
            </Tag>
          );
        },
        ...(libraryRenderers(profile, resolveMedia) as object),
        codeBlock: ({ node, children }) => (
          <RenderedCodeBlock
            node={node}
            language={node?.attrs?.language}
            title={node?.attrs?.title}
          >
            {children}
          </RenderedCodeBlock>
        ),
        codeMirror: ({ node, children }) => (
          <RenderedCodeBlock node={node}>{children}</RenderedCodeBlock>
        ),
        ...hosted,
      },
      markMapping: {
        link: ({ mark, children }) => {
          const href = mark?.attrs?.href;
          // Stored content is validated, but never render an unsafe scheme.
          if (!isSafeUrl(href)) return <>{children}</>;
          const linkStyle = theme?.interactives?.link;
          const classes = cn(
            "font-medium cursor-pointer",
            ...typographyClasses(theme?.typography?.link),
            linkStyle?.padding?.x,
            linkStyle?.padding?.y,
            linkStyle?.border?.width,
            linkStyle?.border?.radius,
            linkStyle?.border?.style,
            linkStyle?.custom,
          );
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={classes}
              style={{ textShadow: linkStyle?.textShadow || undefined }}
            >
              {children}
            </a>
          );
        },
        highlight: ({ children }) => (
          <mark className="bg-accent text-accent-foreground">{children}</mark>
        ),
      },
    },
  });

  const combinedClassName = ["tiptap-renderer", className].filter(Boolean).join(" ");
  return (
    <div className="text-editor flex flex-col gap-4">
      <div className={combinedClassName}>{rendered}</div>
    </div>
  );
}
