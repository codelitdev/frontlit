"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { Button } from "@/components/ui/codelit/button";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import { embedSnippet } from "@/lib/embed-snippet";

const IN_APP_SUPPORT_DOCS = "https://frontlit.app/docs/developers/in-app-support";

/**
 * Copy-ready embed code for the chatbot, filled in with the team ID and
 * this environment's widget host, so nobody has to dig them up.
 */
export function EmbedSnippetCard({
  teamId,
  origin,
  enabled,
}: {
  teamId: string;
  origin: string;
  enabled: boolean;
}) {
  const [ownButton, setOwnButton] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippet = embedSnippet(teamId, origin, ownButton);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable over insecure origins; the code stays
      // selectable below.
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Add the chat to another site</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste this on every page of your product or another website. Your FrontLit
            site already shows the chat.
            {!enabled && " Turn the chatbot on above for it to appear."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="embed-own-button" className="text-sm font-medium">
              Open from your own button
            </Label>
            <p className="text-xs text-muted-foreground">
              Hides the floating bubble. For in-app support with signed-in users.
            </p>
          </div>
          <Switch
            id="embed-own-button"
            checked={ownButton}
            onCheckedChange={setOwnButton}
          />
        </div>

        <pre
          aria-label="Embed code"
          className="whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5"
        >
          {snippet}
        </pre>

        {ownButton && (
          <p className="text-xs text-muted-foreground">
            Start a support session from your server with{" "}
            <code className="font-mono">POST /support-sessions</code> and a{" "}
            <strong>Support sessions only</strong> API key, then call{" "}
            <code className="font-mono">FrontLit.open({"{ token }"})</code> from your
            button. The chat then knows who the user is and what went wrong.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy code"}
          </Button>
          <a
            href={IN_APP_SUPPORT_DOCS}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs underline underline-offset-4"
          >
            Setup guide
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
