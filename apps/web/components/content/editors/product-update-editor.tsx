"use client";

import { use, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import { ExternalLink } from "lucide-react";
import { publicContentPath } from "@frontlit/api-contract";
import {
  discardProductUpdateDraft,
  getAiConfig,
  getDomainSettings,
  getProductUpdate,
  publishProductUpdate,
  updateProductUpdate,
  type ProductUpdate,
} from "@/lib/api";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";
import { WritingEditorDocumentHeader } from "@/components/workspace/writing-editor-document-header";
import { WritingEditorShell } from "@/components/workspace/writing-editor-shell";
import {
  PUBLISH_BLOCKED_REASON,
  PublishBlockers,
} from "@/components/workspace/publish-blockers";
import { IconButton } from "@/components/ui/codelit/icon-button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { ContentIndexSettings } from "@/components/workspace/content-index-settings";
import { FeaturedImageSetting } from "@/components/workspace/featured-image-setting";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/codelit/tooltip";
import { siteUrl } from "@/lib/site-url";
import { DraftSaveBanner } from "@/components/workspace/draft-save-banner";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";

type ProductUpdatePatch = Parameters<typeof updateProductUpdate>[1];

export default function ProductUpdateEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const [entry, setEntry] = useState<ProductUpdate | null>(null);
  const [title, setTitle] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teamIndexesChangelog, setTeamIndexesChangelog] = useState(false);
  const [liveHost, setLiveHost] = useState<string | null>(null);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseDateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryRef = useRef<ProductUpdate | null>(null);

  function clearDebounces() {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (releaseDateDebounceRef.current) clearTimeout(releaseDateDebounceRef.current);
  }

  function showEntry(next: ProductUpdate) {
    entryRef.current = next;
    setEntry(next);
  }

  /** Replaces the editor's state with `loaded` and remounts the body editor. */
  function resetTo(loaded: ProductUpdate) {
    clearDebounces();
    showEntry(loaded);
    setTitle(loaded.draftTitle);
    setReleaseDate(loaded.draftMeta.releaseDate ?? "");
  }

  const autosave = useDraftAutosave<ProductUpdate, ProductUpdatePatch>({
    save: (patch, expectedDraftVersion) =>
      updateProductUpdate(documentId, patch, expectedDraftVersion),
    load: () => getProductUpdate(documentId),
    onSaved: showEntry,
    onReset: resetTo,
  });
  const { save, adopt, reset, isCurrent, resetKey, saving } = autosave;

  useEffect(() => {
    setSettingsOpen(window.matchMedia("(min-width: 768px)").matches);
    getProductUpdate(documentId).then((loaded) => {
      adopt(loaded);
      showEntry(loaded);
      setTitle(loaded.draftTitle);
      setReleaseDate(loaded.draftMeta.releaseDate ?? "");
    });
    getAiConfig()
      .then((config) =>
        setTeamIndexesChangelog(Boolean(config?.indexContent?.changelog)),
      )
      .catch(() => setTeamIndexesChangelog(false));
    getDomainSettings()
      .then((settings) => setLiveHost(settings.canonicalHost))
      .catch(() => setLiveHost(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per document
  }, [documentId]);

  useEffect(() => clearDebounces, []);

  useEffect(() => {
    if (!teamIndexesChangelog || entry?.index?.state !== "pending") return;
    const timer = window.setInterval(() => {
      getProductUpdate(documentId)
        .then((loaded) =>
          setEntry((current) =>
            current ? { ...current, index: loaded.index } : current,
          ),
        )
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [documentId, teamIndexesChangelog, entry?.index?.state]);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => void save({ title: value }), 600);
  }

  function handleReleaseDateChange(value: string) {
    setReleaseDate(value);
    if (releaseDateDebounceRef.current) clearTimeout(releaseDateDebounceRef.current);
    releaseDateDebounceRef.current = setTimeout(
      () => void save({ meta: { releaseDate: value || undefined } }),
      600,
    );
  }

  async function handleContentChange(json: TextEditorContent) {
    await save({ content: json });
  }

  async function handleFeaturedImageChange(image: Record<string, unknown> | null) {
    await save({ featuredImage: image });
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
    setPublishing(true);
    try {
      const reverted = await discardProductUpdateDraft(documentId);
      reset(reverted);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSlugSave(slug: string) {
    if (!(await save({ slug })))
      throw new Error("The URL could not be saved. Resolve the save error first.");
    return entryRef.current?.slug ?? slug;
  }

  if (!entry) return <FullScreenLoading label="Loading update…" />;

  const liveUrl =
    entry.status !== "draft" && liveHost
      ? `${siteUrl(liveHost)}${publicContentPath("changelog", entry.slug)}`
      : null;

  return (
    <WritingEditorShell
      backHref="/content?type=changelog"
      backLabel="Changelog"
      title={title || "Untitled update"}
      status={entry.status}
      statusTestId="changelog-status-badge"
      index={teamIndexesChangelog ? entry.index : null}
      updatedAt={entry.updatedAt}
      saving={saving}
      saveError={Boolean(autosave.saveError)}
      publishing={publishing}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onPublish={handlePublish}
      publishBlockedReason={
        autosave.conflict || autosave.saveError
          ? "Save your changes before publishing."
          : entry.publishable === false
            ? PUBLISH_BLOCKED_REASON
            : undefined
      }
      onDiscardDraft={handleDiscardDraft}
      discardDescription="Discard all unpublished changes on this product update? This cannot be undone."
      headerActions={
        liveUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton asChild size="sm" aria-label="View live entry">
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="changelog-live-link"
                >
                  <ExternalLink />
                </a>
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>View live entry</TooltipContent>
          </Tooltip>
        ) : undefined
      }
      settings={
        <div className="space-y-7">
          <SlugEditor
            slug={entry.slug}
            prefix="/changelog#"
            onSave={handleSlugSave}
            testId="changelog-slug-input"
          />
          <FeaturedImageSetting
            image={entry.draftFeaturedImage}
            onChange={handleFeaturedImageChange}
            disabled={saving || publishing}
          />
          <div>
            <Label htmlFor="changelog-release-date">Release date</Label>
            <Input
              id="changelog-release-date"
              type="date"
              value={releaseDate}
              onChange={(event) => handleReleaseDateChange(event.target.value)}
              className="mt-1"
              aria-describedby="changelog-release-date-hint"
              data-testid="changelog-release-date"
            />
            <p
              id="changelog-release-date-hint"
              className="mt-1 text-xs text-muted-foreground"
            >
              Shown on the changelog and used to order entries. If empty, the publish
              date is used.
            </p>
          </div>
          {teamIndexesChangelog && (
            <ContentIndexSettings
              checked={entry.draftMeta.indexable !== false}
              disabled={saving || publishing}
              onCheckedChange={(checked) => void save({ meta: { indexable: checked } })}
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
      <div className="flex h-full min-h-0 flex-col">
        <DraftSaveBanner autosave={autosave} className="mx-6 mt-4 shrink-0" />
        <div className="min-h-0 flex-1">
          <Editor
            key={resetKey}
            initialContent={entry.draftContent}
            onChange={(json) => {
              if (isCurrent(resetKey))
                void handleContentChange(json as TextEditorContent);
            }}
            placeholder="What changed?"
            className="h-full min-h-0 gap-0 overflow-x-hidden overflow-y-auto border-0"
            contentClassName="max-w-[46rem]"
            editorClassName="writing-editor-content min-h-[420px]"
            beforeContent={
              <>
                <WritingEditorDocumentHeader
                  title={title}
                  titlePlaceholder="Product update title"
                  onTitleChange={handleTitleChange}
                  titleTestId="changelog-title-input"
                />
                <PublishBlockers
                  publishable={entry.publishable}
                  diagnostics={entry.diagnostics}
                />
              </>
            }
          />
        </div>
      </div>
    </WritingEditorShell>
  );
}
