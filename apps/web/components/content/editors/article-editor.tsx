"use client";

import { use, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
  discardArticleDraft,
  getAiConfig,
  getArticle,
  publishArticle,
  updateArticle,
  type Article,
} from "@/lib/api";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";
import { WritingEditorDocumentHeader } from "@/components/workspace/writing-editor-document-header";
import { WritingEditorShell } from "@/components/workspace/writing-editor-shell";
import {
  PUBLISH_BLOCKED_REASON,
  PublishBlockers,
} from "@/components/workspace/publish-blockers";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Textarea } from "@/components/ui/codelit/textarea";
import { parseTags } from "@/lib/writing-editor";
import { ContentIndexSettings } from "@/components/workspace/content-index-settings";
import { FeaturedImageSetting } from "@/components/workspace/featured-image-setting";
import { DraftSaveBanner } from "@/components/workspace/draft-save-banner";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";

type ArticlePatch = Parameters<typeof updateArticle>[1];

export default function ArticleEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const [post, setPost] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teamIndexesArticles, setTeamIndexesArticles] = useState(false);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postRef = useRef<Article | null>(null);

  function clearDebounces() {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
  }

  function showPost(next: Article) {
    postRef.current = next;
    setPost(next);
  }

  /** Replaces the editor's state with `loaded` and remounts the body editor. */
  function resetTo(loaded: Article) {
    clearDebounces();
    showPost(loaded);
    setTitle(loaded.draftTitle);
    setDescription(loaded.draftExcerpt ?? "");
    setTags(loaded.draftMeta.tags.join(", "));
  }

  const autosave = useDraftAutosave<Article, ArticlePatch>({
    save: (patch, expectedDraftVersion) =>
      updateArticle(documentId, patch, expectedDraftVersion),
    load: () => getArticle(documentId),
    onSaved: showPost,
    onReset: resetTo,
  });
  const { save, adopt, reset, isCurrent, resetKey, saving } = autosave;

  useEffect(() => {
    setSettingsOpen(window.matchMedia("(min-width: 768px)").matches);
    getArticle(documentId).then((loaded) => {
      adopt(loaded);
      showPost(loaded);
      setTitle(loaded.draftTitle);
      setDescription(loaded.draftExcerpt ?? "");
      setTags(loaded.draftMeta.tags.join(", "));
    });
    getAiConfig()
      .then((config) => setTeamIndexesArticles(Boolean(config?.indexContent?.articles)))
      .catch(() => setTeamIndexesArticles(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per document
  }, [documentId]);

  useEffect(() => clearDebounces, []);

  useEffect(() => {
    if (!teamIndexesArticles || post?.index?.state !== "pending") return;
    const timer = window.setInterval(() => {
      getArticle(documentId)
        .then((loaded) =>
          setPost((current) =>
            current ? { ...current, index: loaded.index } : current,
          ),
        )
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [documentId, teamIndexesArticles, post?.index?.state]);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => void save({ title: value }), 600);
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    descriptionDebounceRef.current = setTimeout(
      () => void save({ excerpt: value }),
      600,
    );
  }

  function handleTagsChange(value: string) {
    setTags(value);
    if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
    tagsDebounceRef.current = setTimeout(
      () => void save({ meta: { tags: parseTags(value) } }),
      600,
    );
  }

  async function handleIndexableChange(indexable: boolean) {
    await save({ meta: { tags: parseTags(tags), indexable } });
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
      setPost(await publishArticle(documentId));
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscardDraft() {
    setPublishing(true);
    try {
      const reverted = await discardArticleDraft(documentId);
      reset(reverted);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSlugSave(slug: string) {
    if (!(await save({ slug })))
      throw new Error("The URL could not be saved. Resolve the save error first.");
    return postRef.current?.slug ?? slug;
  }

  if (!post) {
    return <FullScreenLoading label="Loading post…" />;
  }

  return (
    <WritingEditorShell
      backHref="/content?type=articles"
      backLabel="Articles"
      contextLabel="Article"
      title={title || "Untitled article"}
      status={post.status}
      statusTestId="blog-status-badge"
      index={teamIndexesArticles ? post.index : null}
      updatedAt={post.updatedAt}
      saving={saving}
      saveError={Boolean(autosave.saveError)}
      publishing={publishing}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onPublish={handlePublish}
      publishBlockedReason={
        autosave.conflict || autosave.saveError
          ? "Save your changes before publishing."
          : post.publishable === false
            ? PUBLISH_BLOCKED_REASON
            : undefined
      }
      onDiscardDraft={handleDiscardDraft}
      discardDescription="Discard all unpublished changes on this article? This cannot be undone."
      settings={
        <div className="space-y-7">
          <SlugEditor
            slug={post.slug}
            prefix="/blog/"
            onSave={handleSlugSave}
            testId="blog-slug-input"
          />

          <FeaturedImageSetting
            image={post.draftFeaturedImage}
            onChange={handleFeaturedImageChange}
            disabled={saving || publishing}
          />

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="blog-description">Excerpt</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {description.length} characters
              </span>
            </div>
            <Textarea
              id="blog-description"
              value={description}
              onChange={(event) => handleDescriptionChange(event.target.value)}
              placeholder="A short description for blog listings."
              className="mt-1 min-h-28"
            />
          </div>

          <div>
            <Label htmlFor="blog-tags">Tags</Label>
            <Input
              id="blog-tags"
              value={tags}
              onChange={(event) => handleTagsChange(event.target.value)}
              placeholder="Product, engineering, launch"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Separate tags with commas.
            </p>
          </div>

          {teamIndexesArticles && (
            <ContentIndexSettings
              checked={post.draftMeta.indexable !== false}
              disabled={saving || publishing}
              onCheckedChange={(checked) => void handleIndexableChange(checked)}
            />
          )}

          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold">Publishing</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Your title, excerpt, tags, and article content go live together when you
              publish changes.
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
            initialContent={post.draftContent}
            onChange={(json) => {
              if (isCurrent(resetKey))
                void handleContentChange(json as TextEditorContent);
            }}
            placeholder="Start writing…"
            className="h-full min-h-0 gap-0 overflow-x-hidden overflow-y-auto border-0"
            contentClassName="max-w-[46rem]"
            editorClassName="writing-editor-content min-h-[420px]"
            beforeContent={
              <>
                <WritingEditorDocumentHeader
                  title={title}
                  titlePlaceholder="Article title"
                  description={description}
                  descriptionPlaceholder="Add a short description…"
                  onTitleChange={handleTitleChange}
                  onDescriptionChange={handleDescriptionChange}
                  titleTestId="blog-title-input"
                />
                <PublishBlockers
                  publishable={post.publishable}
                  diagnostics={post.diagnostics}
                />
              </>
            }
          />
        </div>
      </div>
    </WritingEditorShell>
  );
}
