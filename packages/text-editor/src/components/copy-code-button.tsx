"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

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

/** The copy button of a rendered code block; the only client part of it. */
export function CopyCodeButton({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);

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
  );
}
