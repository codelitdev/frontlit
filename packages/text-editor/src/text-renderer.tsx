import React from "react";
import { renderToReactElement } from "@tiptap/static-renderer";
import { getSchema } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { extractTextFromNode } from "./extract-text-from-node";
import emptyDoc from "./empty-doc";
import { createExtensions } from "./extensions";
import { createId } from "./create-id";
import type { TextEditorContent } from "./text-editor-content";
import type { TextRendererTheme } from "./renderer-theme";
import { cn } from "./lib/cn";
import { RenderedCodeBlock } from "./components/rendered-code-block";
import { extractDocsHeadings } from "./docs/headings";

interface TextRendererProps {
  profile?: "default" | "documentation";
  json: TextEditorContent;
  className?: string;
  theme?: TextRendererTheme;
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
  if (!node || typeof node !== "object") {
    return node;
  }

  if (node.type === "text" && node.text === "") {
    return undefined;
  }

  if (!Array.isArray(node.content)) {
    return node;
  }

  const content = node.content
    .map(removeEmptyTextNodes)
    .filter((child: any) => child !== undefined);

  return {
    ...node,
    content,
  };
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
}: TextRendererProps) {
  const extensions = createExtensions();
  const content = removeEmptyTextNodes(
    (json as any) ?? (emptyDoc as any),
  ) as TextEditorContent;
  const docsHeadings = profile === "documentation" ? extractDocsHeadings(content) : [];
  // React can replay each mapped node (StrictMode, hydration, or a retry).
  // Bind IDs before rendering instead of consuming an iterator in a component.
  const renderContent =
    profile === "documentation" ? getSchema(extensions).nodeFromJSON(content) : content;
  const headingIds = new WeakMap<ProseMirrorNode, string>();
  if (profile === "documentation") {
    let headingIndex = 0;
    (renderContent as ProseMirrorNode).descendants((node) => {
      if (node.type.name === "heading") {
        headingIds.set(node, docsHeadings[headingIndex++].id);
      }
    });
  }

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
          // Extract text from the node structure (same as extractHeadings does)
          const textContent = extractTextFromNode(node);
          const id =
            profile === "documentation" ? headingIds.get(node) : createId(textContent);

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
              profile === "documentation" && level >= 4
                ? (theme?.typography?.header4 ?? theme?.typography?.header3)
                : theme?.typography?.header3,
            ),
          );
          const Tag = (
            profile === "documentation" ? `h${level}` : "h3"
          ) as React.ElementType;
          return (
            <Tag id={id} className={classes}>
              {children}
            </Tag>
          );
        },
        codeBlock: ({ node, children }) => (
          <RenderedCodeBlock node={node} language={node?.attrs?.language}>
            {children}
          </RenderedCodeBlock>
        ),
        codeMirror: ({ node, children }) => (
          <RenderedCodeBlock node={node}>{children}</RenderedCodeBlock>
        ),
      },
      markMapping: {
        link: ({ mark, children }) => {
          const href = mark?.attrs?.href;
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
              style={{
                textShadow: linkStyle?.textShadow || undefined,
              }}
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

export default TextRenderer;
