"use client";

import { useId, useState } from "react";
import { FileJson } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  disableGitPages,
  enableGitPages,
  exportGitPages,
  previewGitPages,
  type DocumentationGitSource,
  type GitPagesPreview,
} from "@/lib/api";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Callout, Mono } from "@/components/content/documentation-connect-parts";

type Binding = NonNullable<DocumentationGitSource["binding"]>;
type Diagnostic = GitPagesPreview["diagnostics"][number];

function DiagnosticList({ items }: { items: Diagnostic[] }) {
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Problems">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <Badge variant={item.severity === "warning" ? "warning" : "destructive"}>
            {item.severity === "warning" ? "Warning" : "Error"}
          </Badge>
          <span className="min-w-0">
            {item.file && (
              <Mono>
                {item.file}
                {item.fieldPath ? ` ${item.fieldPath}` : ""}
                {item.line ? `:${item.line}:${item.column ?? 1}` : ""}
              </Mono>
            )}{" "}
            {item.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pages from Git, inside the connected-repository dialog. Turning it on
 * previews the folder (routes, problems, pages that go offline) and asks
 * for confirmation; after that every push publishes the folder.
 */
export function PagesSourceSection({
  binding,
  canManage,
  onChanged,
}: {
  binding: Binding;
  canManage: boolean;
  onChanged: () => void;
}) {
  const inputId = useId();
  const [directory, setDirectory] = useState(
    binding.pagesDirectory ?? "frontlit/pages",
  );
  const [preview, setPreview] = useState<GitPagesPreview | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    try {
      await run();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (binding.pagesDirectory) {
    const problems = binding.pagesDiagnostics ?? [];
    const failed = problems.some((item) => item.severity !== "warning");
    return (
      <div className="space-y-3 rounded-[0.625rem] border border-border px-4 py-3.5 text-sm">
        <div className="flex items-start gap-3.5">
          <FileJson className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <b className="font-medium">Pages sync from</b>
              <Mono>{binding.pagesDirectory}/</Mono>
              <Badge variant={failed ? "destructive" : "success"}>
                {failed ? "Last sync failed" : "On"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Every page, the header, footer and theme come from the repository. Each
              push publishes the folder as one release.
            </p>
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await disableGitPages();
                  toast.success("Pages are back in the builder");
                  onChanged();
                })
              }
            >
              Stop syncing
            </Button>
          )}
        </div>
        {problems.length > 0 && <DiagnosticList items={problems} />}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[0.625rem] border border-border px-4 py-3.5 text-sm">
      <div className="flex items-start gap-3.5">
        <FileJson className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <b className="font-medium">Pages aren&apos;t synced</b>
          <p className="text-muted-foreground">
            Keep landing pages in this repository as JSON files (
            <Mono>pricing.json</Mono> → <Mono>/pricing</Mono>, <Mono>index.json</Mono> →
            homepage) with an optional <Mono>site.json</Mono> beside the folder for the
            header, footer and theme.
          </p>
        </div>
      </div>
      {(binding.pagesDiagnostics?.length ?? 0) > 0 && (
        <DiagnosticList items={binding.pagesDiagnostics!} />
      )}
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={inputId}>Pages folder</Label>
            <Input
              id={inputId}
              value={directory}
              onChange={(event) => {
                setDirectory(event.target.value);
                setPreview(null);
              }}
            />
          </div>
          <Button
            variant="outline"
            disabled={busy || !directory.trim()}
            onClick={() =>
              void act(async () => setPreview(await previewGitPages(directory)))
            }
          >
            Preview
          </Button>
        </div>
      )}
      {binding.pagesSetup?.status === "open" ? (
        <Callout tone="info" title="Setup pull request is open">
          <a
            href={binding.pagesSetup.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Pull request #{binding.pagesSetup.number}
          </a>{" "}
          adds your pages to <Mono>{binding.pagesSetup.directory}/</Mono>. Merging it
          turns pages sync on.
        </Callout>
      ) : (
        canManage &&
        !preview && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground">
              No pages in the repository yet? Export the current pages, header, footer
              and theme to that folder as a pull request.
            </p>
            <Button
              variant="outline"
              disabled={busy || !directory.trim()}
              onClick={() =>
                void act(async () => {
                  const pr = await exportGitPages(directory);
                  toast.success(`Opened pull request #${pr.number}`, {
                    action: {
                      label: "View",
                      onClick: () => window.open(pr.url, "_blank"),
                    },
                  });
                  onChanged();
                })
              }
            >
              Export pages
            </Button>
          </div>
        )
      )}
      {preview && (
        <div className="space-y-3">
          <p>
            At <Mono>{preview.commitSha.slice(0, 7)}</Mono>:{" "}
            {preview.pages.length === 1 ? "1 page" : `${preview.pages.length} pages`}
            {preview.hasSiteFile ? (
              <>
                {" "}
                and <Mono>{preview.siteFile}</Mono>
              </>
            ) : (
              <>
                , no <Mono>{preview.siteFile}</Mono> (the current header and footer
                stay)
              </>
            )}
            .
          </p>
          {preview.pages.length > 0 && (
            <ul className="space-y-1" aria-label="Pages in the folder">
              {preview.pages.map((page) => (
                <li key={page.path} className="flex items-center gap-2">
                  <Mono>{page.route}</Mono>
                  <span className="text-muted-foreground">
                    {page.title ?? page.path}
                  </span>
                  {!page.published && <Badge variant="neutral">Draft</Badge>}
                </li>
              ))}
            </ul>
          )}
          {preview.diagnostics.length > 0 && (
            <DiagnosticList items={preview.diagnostics} />
          )}
          {preview.removedPages.length > 0 && (
            <Callout
              tone="warning"
              title="These live pages have no file and go offline"
            >
              {preview.removedPages
                .map((page) => `${page.name} (${page.route})`)
                .join(", ")}
              . Export them to the repository first to keep them.
            </Callout>
          )}
          {preview.publishable ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await enableGitPages({ directory, commitSha: preview.commitSha });
                    toast.success("Syncing pages from the repository");
                    setPreview(null);
                    onChanged();
                  })
                }
              >
                Sync pages from Git
              </Button>
            </div>
          ) : (
            <p className="text-destructive">
              Fix the errors above, push, and preview again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
