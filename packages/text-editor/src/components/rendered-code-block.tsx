import React from "react";
import { extractTextFromNode } from "../extract-text-from-node";
import { CopyCodeButton } from "./copy-code-button";

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
}: {
  node?: { textContent?: string; content?: unknown };
  children?: React.ReactNode;
  language?: string;
}): React.JSX.Element {
  const source = extractTextFromNode(node) || textFromChildren(children);

  return (
    <div className="te-code-block">
      <pre>
        <code className={language ? `language-${language}` : undefined}>
          {children}
        </code>
      </pre>
      <CopyCodeButton source={source} />
    </div>
  );
}
