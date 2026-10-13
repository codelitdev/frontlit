"use client";

import React, { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { extractTextFromNode } from "../extract-text-from-node";

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

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
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
  const [copied, setCopied] = useState(false);

  const source = extractTextFromNode(node) || textFromChildren(children);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (!source) return;
    try {
      await writeClipboard(source);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="te-code-block">
      <pre>
        <code className={language ? `language-${language}` : undefined}>
          {children}
        </code>
      </pre>
      <button
        type="button"
        className="te-code-copy"
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy"}
        onClick={() => {
          void handleCopy();
        }}
      >
        {copied ? (
          <Check className="te-code-copy__icon" aria-hidden />
        ) : (
          <Copy className="te-code-copy__icon" aria-hidden />
        )}
      </button>
    </div>
  );
}
