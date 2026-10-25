"use client";

import { useCallback, useEffect, useState } from "react";
import { Braces } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  getApiReferenceStatus,
  previewApiReference,
  updateApiReference,
  type ApiReferencePreview,
  type ApiReferenceStatus,
} from "@/lib/api";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Callout, Mono } from "@/components/content/documentation-connect-parts";
import { DiagnosticList } from "@/components/content/pages-source-section";

const shortSha = (sha: string) => sha.slice(0, 7);

/**
 * API reference from an OpenAPI spec in the connected repository
 * (docs/openapi-support.md). The spec can live anywhere in the repo; every
 * push re-imports it when it changed.
 */
export function ApiReferenceSourceSection({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState<ApiReferenceStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [specPath, setSpecPath] = useState("");
  const [mount, setMount] = useState("api-reference");
  const [preview, setPreview] = useState<ApiReferencePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getApiReferenceStatus();
      setStatus(next);
      return next;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  function startEditing() {
    setSpecPath(status?.specPath ?? "");
    setMount(status?.mount ?? "api-reference");
    setPreview(null);
    setEditing(true);
  }

  /** The import runs in the next sync; check back a few times. */
  function followSync() {
    for (const delay of [3000, 8000, 15000]) setTimeout(() => void refresh(), delay);
  }

  if (!status) return null;
  const failed = !!status.lastFailure;
  const problems = status.diagnostics;

  return (
    <div className="space-y-3 rounded-[0.625rem] border border-border px-4 py-3.5 text-sm">
      <div className="flex items-start gap-3.5">
        <Braces className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          {status.specPath ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-medium">API reference from</b>
                <Mono>{status.specPath}</Mono>
                <Badge
                  variant={failed ? "destructive" : status.live ? "success" : "neutral"}
                >
                  {failed
                    ? "Last import failed"
                    : status.live
                      ? "Live"
                      : "Waiting for sync"}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Published at <Mono>/docs/{status.mount}</Mono>, with the spec at{" "}
                <Mono>/openapi.json</Mono>. Everything in the spec is public, except
                operations marked <Mono>x-internal: true</Mono>.
              </p>
              {status.live && (
                <p className="text-muted-foreground">
                  Live: {status.live.title}
                  {status.live.version ? ` ${status.live.version}` : ""},{" "}
                  {status.live.operationCount === 1
                    ? "1 endpoint"
                    : `${status.live.operationCount} endpoints`}{" "}
                  from <Mono>{shortSha(status.live.commitSha)}</Mono>.
                </p>
              )}
              {status.lastFailure && (
                <p className="text-muted-foreground">
                  The import at <Mono>{shortSha(status.lastFailure.commitSha)}</Mono>{" "}
                  failed;
                  {status.live
                    ? " the version above stays live."
                    : " nothing is published yet."}
                </p>
              )}
            </>
          ) : (
            <>
              <b className="font-medium">No API reference</b>
              <p className="text-muted-foreground">
                Point to an OpenAPI 3.0 or 3.1 spec (JSON or YAML) in the repository.
                FrontLit publishes a page per endpoint under <Mono>/docs</Mono>, with a
                “Try it” panel, and serves the spec at <Mono>/openapi.json</Mono>.
              </p>
            </>
          )}
        </div>
        {canManage && !editing && (
          <div className="flex shrink-0 gap-2">
            {status.specPath && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setStatus(await updateApiReference({ specPath: null }));
                    toast.success("API reference unpublished");
                  })
                }
              >
                Turn off
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={startEditing}>
              {status.specPath ? "Change" : "Add spec"}
            </Button>
          </div>
        )}
      </div>
      {!editing && problems.length > 0 && <DiagnosticList items={problems} />}
      {editing && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () =>
              setPreview(await previewApiReference({ specPath, mount })),
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="api-spec-path">Spec file in the repository</Label>
              <Input
                id="api-spec-path"
                value={specPath}
                placeholder="apps/api/openapi.json"
                onChange={(e) => {
                  setSpecPath(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-mount">URL path</Label>
              <Input
                id="api-mount"
                value={mount}
                placeholder="api-reference"
                onChange={(e) => {
                  setMount(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
          </div>
          {preview && (
            <div className="space-y-2">
              {preview.title && (
                <p>
                  At <Mono>{shortSha(preview.commitSha)}</Mono>: {preview.title},{" "}
                  {preview.routes.length === 1
                    ? "1 endpoint"
                    : `${preview.routes.length} endpoints`}{" "}
                  under <Mono>/docs/{preview.mount}</Mono>.
                </p>
              )}
              {preview.routes.length > 0 && (
                <ul className="space-y-1" aria-label="Endpoint pages">
                  {preview.routes.slice(0, 8).map((route) => (
                    <li key={route.route} className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{route.method.toUpperCase()}</Badge>
                      <Mono>{route.path}</Mono>
                      <span className="text-muted-foreground">→ {route.route}</span>
                    </li>
                  ))}
                  {preview.routes.length > 8 && (
                    <li className="text-muted-foreground">
                      and {preview.routes.length - 8} more
                    </li>
                  )}
                </ul>
              )}
              {preview.diagnostics.length > 0 && (
                <DiagnosticList items={preview.diagnostics} />
              )}
              {preview.publishable && (
                <Callout tone="info" title="Everything in the spec becomes public">
                  The endpoint pages and <Mono>/openapi.json</Mono> are public, even for
                  a private repository. Mark operations to leave out with{" "}
                  <Mono>x-internal: true</Mono>.
                </Callout>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            {preview?.publishable ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setStatus(await updateApiReference({ specPath, mount }));
                    toast.success("Publishing the API reference");
                    setEditing(false);
                    followSync();
                  })
                }
              >
                Publish API reference
              </Button>
            ) : (
              <Button type="submit" disabled={busy || !specPath.trim()}>
                Preview
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
