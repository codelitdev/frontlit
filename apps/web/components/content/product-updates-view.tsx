"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  createProductUpdate,
  deleteProductUpdate,
  listProductUpdates,
  type ProductUpdate,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { DocumentStatusBadge } from "@/components/workspace/document-status-badge";
import { DocumentIndexBadge } from "@/components/workspace/document-index-badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

export default function ChangelogPage() {
  useSetBreadcrumb([{ label: "Content", href: "/content" }, { label: "Changelog" }]);
  const router = useRouter();
  const [entries, setEntries] = useState<ProductUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    return listProductUpdates().then(({ items }) => setEntries(items));
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setCreateError("Enter a changelog title.");
      return;
    }

    setCreateError(null);
    setCreating(true);
    try {
      const created = await createProductUpdate({ title });
      setNewTitle("");
      router.push(`/editor/content/changelog/${created.documentId}`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to create changelog entry.";
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(documentId: string) {
    try {
      await deleteProductUpdate(documentId);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete entry.");
    }
  }

  if (loading) {
    return (
      <ScrollablePage>
        <Loading />
      </ScrollablePage>
    );
  }

  return (
    <ScrollablePage>
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-2xl space-y-8">
          <div>
            <PageHeader title="Changelog" />

            <form onSubmit={handleCreate} className="mb-6 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="Entry title"
                  className="flex-1"
                  aria-invalid={Boolean(createError)}
                  aria-describedby={createError ? "changelog-create-error" : undefined}
                  disabled={creating}
                />
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </Button>
              </div>
              {createError ? (
                <p id="changelog-create-error" className="text-sm text-destructive">
                  {createError}
                </p>
              ) : null}
            </form>

            <div className="divide-y rounded-lg border">
              {entries.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  No changelog entries yet.
                </p>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.documentId}
                  className="flex items-center justify-between p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/editor/content/changelog/${entry.documentId}`}
                        className="font-medium hover:underline"
                      >
                        {entry.draftTitle}
                      </Link>
                      <DocumentStatusBadge status={entry.status} />
                      <DocumentIndexBadge index={entry.index} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      /changelog#{entry.slug} · updated{" "}
                      {entry.updatedAt
                        ? new Date(entry.updatedAt).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <DeleteConfirm
                    description={`Delete "${entry.draftTitle}"? This cannot be undone.`}
                    onConfirm={() => handleDelete(entry.documentId)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ScrollablePage>
  );
}
