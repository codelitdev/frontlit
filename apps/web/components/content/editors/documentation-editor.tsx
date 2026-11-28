"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
  discardDocumentationPageDraft,
  getDocumentationPage,
  listDocumentationSections,
  updateDocumentationPage,
  type DocsRevision,
  type DocumentationSection,
  type DocumentationPage,
} from "@/lib/api";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";
import { WritingEditorDocumentHeader } from "@/components/workspace/writing-editor-document-header";
import { WritingEditorShell } from "@/components/workspace/writing-editor-shell";
import { FeaturedImageSetting } from "@/components/workspace/featured-image-setting";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/codelit/select";
import { Textarea } from "@/components/ui/codelit/textarea";
import { useEditorAccess } from "@/components/workspace/editor-access-gate";
import { validateDocsContent } from "@frontlit/text-editor/docs";
import { Banner } from "@/components/workspace/banner";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { toast } from "sonner";
import { DraftSaveBanner } from "@/components/workspace/draft-save-banner";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";

import { DocumentationTools } from "@/components/content/documentation-tools";
import { DocumentationProposals } from "@/components/content/documentation-proposals";

const NO_SECTION = "none";

export default function DocumentationEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const { currentTeam } = useEditorAccess();
  const canPublish = Boolean(
    currentTeam?.isOwner ||
      currentTeam?.effectivePermissions.includes("documentation:publish"),
  );
  const [doc, setDoc] = useState<DocumentationPage | null>(null);
  const [sections, setSections] = useState<DocumentationSection[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gitSourcePath, setGitSourcePath] = useState("");
  const docRef = useRef<DocumentationPage | null>(null);
  const [comparison, setComparison] = useState<DocumentationPage | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const canManage = Boolean(
    currentTeam?.isOwner ||
      currentTeam?.effectivePermissions.includes("documentation:manage"),
  );
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushContentRef = useRef<() => void>(() => {});
  const registerContentFlush = useCallback((flush: () => void) => {
    flushContentRef.current = flush;
  }, []);

  function showDoc(next: DocumentationPage) {
    docRef.current = next;
    setDoc(next);
  }

  /** Replaces the editor's state with `loaded` and remounts the body editor. */
  function resetTo(loaded: DocumentationPage) {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    showDoc(loaded);
    setTitle(loaded.draftTitle);
    setDescription(loaded.draftExcerpt ?? "");
    setGitSourcePath(loaded.draftGitSource?.sourcePath ?? "");
    setComparison(null);
  }

  const autosave = useDraftAutosave<
    DocumentationPage,
    Parameters<typeof updateDocumentationPage>[1]
  >({
    save: (patch, expectedDraftVersion) =>
      updateDocumentationPage(documentId, patch, expectedDraftVersion),
    load: () => getDocumentationPage(documentId),
    onSaved: showDoc,
    onReset: resetTo,
  });
  const {
    save: saveDraft,
    adopt,
    reset,
    isCurrent,
    resetKey,
    saving,
    saveError,
    conflict,
  } = autosave;

  useEffect(() => {
    setSettingsOpen(window.matchMedia("(min-width: 768px)").matches);
    getDocumentationPage(documentId).then((loaded) => {
      adopt(loaded);
      showDoc(loaded);
      setTitle(loaded.draftTitle);
      setDescription(loaded.draftExcerpt ?? "");
      setGitSourcePath(loaded.draftGitSource?.sourcePath ?? "");
    });
    listDocumentationSections().then(({ items }) => setSections(items));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per document
  }, [documentId]);

  useEffect(() => {
    if (doc?.index?.state !== "pending") return;
    const timer = window.setInterval(() => {
      getDocumentationPage(documentId)
        .then((loaded) =>
          setDoc((current) =>
            current ? { ...current, index: loaded.index } : current,
          ),
        )
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [documentId, doc?.index?.state]);

  useEffect(
    () => () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    },
    [],
  );

  async function handleSectionChange(sectionId: string) {
    await saveDraft({
      meta: {
        sectionId: sectionId === NO_SECTION ? null : sectionId,
      },
    });
  }

  async function saveTitle(value: string) {
    await saveDraft({ title: value });
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => saveTitle(value), 600);
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    descriptionDebounceRef.current = setTimeout(() => {
      void saveDraft({ excerpt: value });
    }, 600);
  }

  async function handleContentChange(json: TextEditorContent) {
    await saveDraft({ content: json });
  }

  async function handleFeaturedImageChange(image: Record<string, unknown> | null) {
    await saveDraft({ featuredImage: image });
  }

  async function flushEditor() {
    flushContentRef.current();
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    const patch: Parameters<typeof updateDocumentationPage>[1] = {};
    if (title !== docRef.current?.draftTitle) patch.title = title;
    if (description !== (docRef.current?.draftExcerpt ?? ""))
      patch.excerpt = description;
    if (
      docRef.current?.draftGitSource &&
      gitSourcePath !== docRef.current.draftGitSource.sourcePath
    )
      patch.gitSourcePath = gitSourcePath;
    return Boolean(await saveDraft(patch));
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      if (!(await flushEditor())) return;
      setReviewOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publication failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscardDraft() {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    setPublishing(true);
    try {
      const reverted = await discardDocumentationPageDraft(
        documentId,
        docRef.current!.draftVersion,
      );
      reset(reverted);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Discard failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleRestoreVersion(revision: DocsRevision) {
    if (!(await flushEditor()))
      throw new Error("Save the current draft before restoring a version.");
    await updateDocumentationPage(
      documentId,
      {
        title: revision.title,
        slug: revision.slug,
        content: revision.content,
        excerpt: revision.excerpt,
        featuredImage: revision.featuredImage,
        meta: revision.meta,
      },
      docRef.current!.draftVersion,
    );
    await autosave.reload();
  }

  async function handleIndexableChange(indexable: boolean) {
    await saveDraft({
      meta: {
        indexable,
      },
    });
  }

  async function handleSlugSave(slug: string) {
    if (!(await saveDraft({ slug })))
      throw new Error("The route could not be saved. Resolve the save error first.");
    return docRef.current?.draftSlug ?? docRef.current?.slug ?? slug;
  }

  if (!doc) {
    return <FullScreenLoading label="Loading doc…" />;
  }

  const activeSection = sections.find(
    (section) => section.sectionId === doc.draftMeta.sectionId,
  );
  const contentDiagnostics = validateDocsContent(doc.draftContent).diagnostics;

  return (
    <WritingEditorShell
      backHref="/content?type=documentation"
      backLabel="Documentation"
      contextLabel={activeSection?.name}
      title={title || "Untitled doc"}
      status={doc.status}
      statusTestId="doc-status-badge"
      index={doc.index}
      updatedAt={doc.updatedAt}
      saving={saving}
      saveError={Boolean(saveError)}
      publishing={publishing}
      publishingLabel="Publishing…"
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onPublish={handlePublish}
      canPublish={canPublish}
      publishAction={
        doc.source === "git" ? (
          <DocumentationProposals
            canPublish={canPublish}
            triggerLabel="Create pull request"
            initialDocumentId={documentId}
            beforeOpen={flushEditor}
            disabled={!canPublish || Boolean(saveError) || conflict}
          />
        ) : undefined
      }
      publishBlockedReason={
        doc.source === "git"
          ? "This documentation area is owned by Git. Submit changes through Git."
          : saveError
            ? "Save your changes before publishing."
            : doc.publishable === false
              ? "Resolve publication blockers before publishing."
              : contentDiagnostics.length > 0
                ? "Resolve unsupported content before publishing."
                : undefined
      }
      onDiscardDraft={handleDiscardDraft}
      discardDescription="Discard all unpublished changes on this doc? This cannot be undone."
      headerActions={
        <DocumentationTools
          compact
          historyScope="document"
          actions={["live", "history"]}
          docs={[doc]}
          canPublish={canPublish}
          reviewOpen={reviewOpen}
          onReviewOpenChange={setReviewOpen}
          onRestoreVersion={handleRestoreVersion}
          onChanged={async () => {
            const fresh = await getDocumentationPage(documentId);
            if (autosave.adoptIfIdle(fresh)) showDoc(fresh);
          }}
        />
      }
      settings={
        <div className="space-y-7">
          <SlugEditor
            slug={doc.draftSlug ?? doc.slug}
            prefix="/docs/"
            helpText="This route is saved in the draft and becomes public when you publish."
            onSave={handleSlugSave}
            testId="doc-slug-input"
          />
          {doc.draftGitSource && (
            <div>
              <Label htmlFor="doc-git-source-path">Git Markdown path</Label>
              <Input
                id="doc-git-source-path"
                value={gitSourcePath}
                onChange={(event) => setGitSourcePath(event.target.value)}
                onBlur={() => {
                  if (gitSourcePath !== docRef.current?.draftGitSource?.sourcePath)
                    void saveDraft({ gitSourcePath });
                }}
                disabled={saving || publishing || conflict}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Changing this path saves a local move. Submit a proposal to move the
                file in Git.
              </p>
            </div>
          )}

          <FeaturedImageSetting
            image={doc.draftFeaturedImage}
            onChange={handleFeaturedImageChange}
            disabled={saving || publishing}
          />

          <div>
            <Label htmlFor="doc-section">Section</Label>
            <Select
              value={doc.draftMeta.sectionId ?? NO_SECTION}
              onValueChange={handleSectionChange}
            >
              <SelectTrigger
                id="doc-section"
                className="mt-1"
                data-testid="doc-section-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SECTION}>No section</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.sectionId} value={section.sectionId}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="doc-description">Search description</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {description.length} characters
              </span>
            </div>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(event) => handleDescriptionChange(event.target.value)}
              placeholder="A short description for search results and doc listings."
              className="mt-1 min-h-28"
            />
          </div>

          <div className="border-t pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="doc-indexable">Include in search and chatbot</Label>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  When on, the published page is chunked for site search and AI answers.
                  Turn off to keep the page live but out of retrieval.
                </p>
              </div>
              <Switch
                id="doc-indexable"
                checked={doc.draftMeta.indexable !== false}
                disabled={saving || publishing}
                onCheckedChange={(checked) => void handleIndexableChange(checked)}
              />
            </div>
          </div>
        </div>
      }
    >
      <DraftSaveBanner autosave={autosave} className="m-6">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void getDocumentationPage(documentId).then(setComparison)}
        >
          Compare with saved draft
        </Button>
      </DraftSaveBanner>
      {conflict && comparison && (
        <pre className="m-6 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(
            {
              title: comparison.draftTitle,
              description: comparison.draftExcerpt,
              slug: comparison.draftSlug,
              content: comparison.draftContent,
            },
            null,
            2,
          )}
        </pre>
      )}
      {doc.source === "git" && (
        <Banner className="m-6">
          Edits save as drafts. Create a pull request to review them in GitHub; valid
          merged changes update your documentation site.
        </Banner>
      )}
      {doc.diagnostics && doc.diagnostics.length > 0 && (
        <Banner className="m-6">
          <p>
            {doc.publishable
              ? "Saved with warnings."
              : "Draft saved. Resolve these issues before publishing."}
          </p>
          <ul>
            {doc.diagnostics.map((item, i) => (
              <li key={i}>{item.message}</li>
            ))}
          </ul>
        </Banner>
      )}
      {contentDiagnostics.length > 0 ? (
        <Banner className="m-6">
          This document contains unsupported content. Correct it through the API before
          editing so no content is lost.
          <ul className="mt-2 list-disc pl-5">
            {contentDiagnostics.map((item, index) => (
              <li key={index}>
                {item.fieldPath}: {item.message}
              </li>
            ))}
          </ul>
        </Banner>
      ) : (
        <Editor
          profile="documentation"
          key={resetKey}
          initialContent={doc.draftContent}
          onChange={(json) => {
            if (isCurrent(resetKey))
              void handleContentChange(json as TextEditorContent);
          }}
          onFlushChangeReady={registerContentFlush}
          placeholder="Write the doc… use headings to organize it."
          className="h-full min-h-0 gap-0 overflow-x-hidden overflow-y-auto border-0"
          contentClassName="max-w-[46rem]"
          editorClassName="writing-editor-content min-h-[420px]"
          beforeContent={
            <WritingEditorDocumentHeader
              title={title}
              titlePlaceholder="Doc title"
              description={description}
              descriptionPlaceholder="Add a short description…"
              onTitleChange={handleTitleChange}
              onDescriptionChange={handleDescriptionChange}
              titleTestId="doc-title-input"
            />
          }
        />
      )}
    </WritingEditorShell>
  );
}
