import React from "react";
import { extractTextFromNode } from "../extract-text-from-node";
import { CopyCodeButton } from "./copy-code-button";
import { defaultTextEditorLabels, type TextEditorLabels } from "../labels";

function textFromChildren(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromChildren).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromChildren(node.props.children);
  }
  return "";
}

export function RenderedCodeBlock({
  node,
  children,
  language,
  title,
  labels = defaultTextEditorLabels,
}: {
  node?: { textContent?: string; content?: unknown };
  children?: React.ReactNode;
  language?: string;
  title?: string | null;
  labels?: Pick<TextEditorLabels, "copy" | "copied" | "copyCode">;
}): React.JSX.Element {
  const source = extractTextFromNode(node) || textFromChildren(children);

  return (
    <div className="te-code-block">
      {title && <div className="te-code-block__title">{title}</div>}
      <pre>
        <code className={language ? `language-${language}` : undefined}>
          {children}
        </code>
      </pre>
      <CopyCodeButton
        source={source}
        copyLabel={labels.copy}
        copiedLabel={labels.copied}
        copyCodeLabel={labels.copyCode}
      />
    </div>
  );
}
