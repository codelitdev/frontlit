"use client";

import { use, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
  discardProductUpdateDraft,
  getAiConfig,
  getProductUpdate,
  publishProductUpdate,
  updateProductUpdate,
  type ProductUpdate,
} from "@/lib/api";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";
import { WritingEditorDocumentHeader } from "@/components/workspace/writing-editor-document-header";
import { WritingEditorShell } from "@/components/workspace/writing-editor-shell";
import { Badge } from "@/components/ui/codelit/badge";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Toggle } from "@/components/ui/toggle";
import { ContentIndexSettings } from "@/components/workspace/content-index-settings";
import { FeaturedImageSetting } from "@/components/workspace/featured-image-setting";

const LABEL_OPTIONS = ["added", "fixed", "improved", "removed"] as const;

export default function ProductUpdateEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const [entry, setEntry] = useState<ProductUpdate | null>(null);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [teamIndexesChangelog, setTeamIndexesChangelog] = useState(false);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseDateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettingsOpen(window.matchMedia("(min-width: 768px)").matches);
    getProductUpdate(documentId).then((loaded) => {
      setEntry(loaded);
      setTitle(loaded.draftTitle);
      setVersion(loaded.draftMeta.version ?? "");
      setReleaseDate(loaded.draftMeta.releaseDate ?? "");
    });
    getAiConfig()
      .then((config) =>
        setTeamIndexesChangelog(Boolean(config?.indexContent?.changelog)),
      )
      .catch(() => setTeamIndexesChangelog(false));
  }, [documentId]);

  useEffect(
    () => () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      if (versionDebounceRef.current) clearTimeout(versionDebounceRef.current);
      if (releaseDateDebounceRef.current) clearTimeout(releaseDateDebounceRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!teamIndexesChangelog || entry?.index?.state !== "pending") return;
    const timer = window.setInterval(() => {
      getProductUpdate(documentId)
        .then(setEntry)
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [documentId, teamIndexesChangelog, entry?.index?.state]);

  async function saveMeta(meta: Partial<ProductUpdate["draftMeta"]>) {
    setSaving(true);
    try {
      setEntry(await updateProductUpdate(documentId, { meta }));
    } finally {
      setSaving(false);
    }
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        setEntry(await updateProductUpdate(documentId, { title: value }));
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  function handleVersionChange(value: string) {
    setVersion(value);
    if (versionDebounceRef.current) clearTimeout(versionDebounceRef.current);
    versionDebounceRef.current = setTimeout(
      () => saveMeta({ version: value || undefined }),
      600,
    );
  }

  function handleReleaseDateChange(value: string) {
    setReleaseDate(value);
    if (releaseDateDebounceRef.current) clearTimeout(releaseDateDebounceRef.current);
    releaseDateDebounceRef.current = setTimeout(
      () => saveMeta({ releaseDate: value || undefined }),
      600,
    );
  }

  async function handleLabelToggle(label: string) {
    const current = entry?.draftMeta.labels ?? [];
    const labels = current.includes(label)
      ? current.filter((item) => item !== label)
      : [...current, label];
    await saveMeta({ labels });
  }

  async function handleContentChange(json: TextEditorContent) {
    setSaving(true);
    try {
      setEntry(await updateProductUpdate(documentId, { content: json }));
    } finally {
      setSaving(false);
    }
  }

  async function handleFeaturedImageChange(image: Record<string, unknown> | null) {
    setSaving(true);
    try {
      setEntry(await updateProductUpdate(documentId, { featuredImage: image }));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      setEntry(await publishProductUpdate(documentId));
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscardDraft() {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (versionDebounceRef.current) clearTimeout(versionDebounceRef.current);
    if (releaseDateDebounceRef.current) clearTimeout(releaseDateDebounceRef.current);
    setPublishing(true);
    try {
      const reverted = await discardProductUpdateDraft(documentId);
      setEntry(reverted);
      setTitle(reverted.draftTitle);
      setVersion(reverted.draftMeta.version ?? "");
      setReleaseDate(reverted.draftMeta.releaseDate ?? "");
      setResetKey((key) => key + 1);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSlugSave(slug: string) {
    const updated = await updateProductUpdate(documentId, { slug });
    setEntry(updated);
    return updated.slug;
  }

  if (!entry) return <FullScreenLoading label="Loading update…" />;

  return (
    <WritingEditorShell
      backHref="/content?type=changelog"
      backLabel="Changelog"
      contextLabel={entry.draftMeta.github ? "GitHub import" : undefined}
      title={title || "Untitled update"}
      status={entry.status}
      statusTestId="changelog-status-badge"
      index={teamIndexesChangelog ? entry.index : null}
      updatedAt={entry.updatedAt}
      saving={saving}
      publishing={publishing}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onPublish={handlePublish}
      onDiscardDraft={handleDiscardDraft}
      discardDescription="Discard all unpublished changes on this product update? This cannot be undone."
      settings={
        <div className="space-y-7">
          {entry.draftMeta.github && (
            <Badge variant="neutral">Imported from GitHub</Badge>
          )}
          <SlugEditor
            slug={entry.slug}
            prefix="/changelog/"
            onSave={handleSlugSave}
            testId="changelog-slug-input"
          />
          <FeaturedImageSetting
            image={entry.draftFeaturedImage}
            onChange={handleFeaturedImageChange}
            disabled={saving || publishing}
          />
          <div>
            <Label htmlFor="changelog-version">Version</Label>
            <Input
              id="changelog-version"
              value={version}
              onChange={(event) => handleVersionChange(event.target.value)}
              placeholder="v1.2.0"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="changelog-release-date">Release date</Label>
            <Input
              id="changelog-release-date"
              type="date"
              value={releaseDate}
              onChange={(event) => handleReleaseDateChange(event.target.value)}
              className="mt-1"
              data-testid="changelog-release-date"
            />
          </div>
          <div>
            <Label>Labels</Label>
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="changelog-labels">
              {LABEL_OPTIONS.map((label) => (
                <Toggle
                  key={label}
                  size="sm"
                  pressed={entry.draftMeta.labels.includes(label)}
                  onPressedChange={() => handleLabelToggle(label)}
                  variant="outline"
                  className="capitalize"
                >
                  {label}
                </Toggle>
              ))}
            </div>
          </div>
          {teamIndexesChangelog && (
            <ContentIndexSettings
              checked={entry.draftMeta.indexable !== false}
              disabled={saving || publishing}
              onCheckedChange={(checked) => void saveMeta({ indexable: checked })}
            />
          )}
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold">Publishing</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The release details and update content go live together when you publish
              changes.
            </p>
          </div>
        </div>
      }
    >
      <Editor
        key={resetKey}
        initialContent={entry.draftContent}
        onChange={handleContentChange}
        placeholder="What changed?"
        className="h-full min-h-0 gap-0 overflow-x-hidden overflow-y-auto border-0"
        contentClassName="max-w-[46rem]"
        editorClassName="writing-editor-content min-h-[420px]"
        beforeContent={
          <WritingEditorDocumentHeader
            title={title}
            titlePlaceholder="Product update title"
            onTitleChange={handleTitleChange}
            titleTestId="changelog-title-input"
          />
        }
      />
    </WritingEditorShell>
  );
}
