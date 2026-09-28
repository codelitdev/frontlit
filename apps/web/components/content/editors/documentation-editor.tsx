"use client";

import { use, useEffect, useRef, useState } from "react";
import { Editor } from "@frontlit/text-editor";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
  discardDocumentationPageDraft,
  getDocumentationPage,
  listDocumentationSections,
  publishDocumentationPage,
  updateDocumentationPage,
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

const NO_SECTION = "none";

export default function DocumentationEditor({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  const [doc, setDoc] = useState<DocumentationPage | null>(null);
  const [sections, setSections] = useState<DocumentationSection[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettingsOpen(window.matchMedia("(min-width: 768px)").matches);
    getDocumentationPage(documentId).then((loaded) => {
      setDoc(loaded);
      setTitle(loaded.draftTitle);
      setDescription(loaded.draftExcerpt ?? "");
    });
    listDocumentationSections().then(({ items }) => setSections(items));
  }, [documentId]);

  useEffect(() => {
    if (doc?.index?.state !== "pending") return;
    const timer = window.setInterval(() => {
      getDocumentationPage(documentId)
        .then((loaded) => setDoc(loaded))
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
    setSaving(true);
    try {
      setDoc(
        await updateDocumentationPage(documentId, {
          meta: {
            sectionId: sectionId === NO_SECTION ? undefined : sectionId,
            order: doc?.draftMeta.order ?? 0,
          },
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle(value: string) {
    setSaving(true);
    try {
      setDoc(await updateDocumentationPage(documentId, { title: value }));
    } finally {
      setSaving(false);
    }
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => saveTitle(value), 600);
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    descriptionDebounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        setDoc(
          await updateDocumentationPage(documentId, {
            excerpt: value,
          }),
        );
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  async function handleContentChange(json: TextEditorContent) {
    setSaving(true);
    try {
      setDoc(await updateDocumentationPage(documentId, { content: json }));
    } finally {
      setSaving(false);
    }
  }

  async function handleFeaturedImageChange(image: Record<string, unknown> | null) {
    setSaving(true);
    try {
      setDoc(await updateDocumentationPage(documentId, { featuredImage: image }));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      setDoc(await publishDocumentationPage(documentId));
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscardDraft() {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    setPublishing(true);
    try {
      const reverted = await discardDocumentationPageDraft(documentId);
      setDoc(reverted);
      setTitle(reverted.draftTitle);
      setDescription(reverted.draftExcerpt ?? "");
      setResetKey((key) => key + 1);
    } finally {
      setPublishing(false);
    }
  }

  async function handleIndexableChange(indexable: boolean) {
    setSaving(true);
    try {
      setDoc(
        await updateDocumentationPage(documentId, {
          meta: {
            sectionId: doc?.draftMeta.sectionId,
            order: doc?.draftMeta.order ?? 0,
            indexable,
          },
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSlugSave(slug: string) {
    const updated = await updateDocumentationPage(documentId, { slug });
    setDoc(updated);
    return updated.slug;
  }

  if (!doc) {
    return <FullScreenLoading label="Loading doc…" />;
  }

  const activeSection = sections.find(
    (section) => section.sectionId === doc.draftMeta.sectionId,
  );

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
      publishing={publishing}
      publishingLabel="Publishing…"
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onPublish={handlePublish}
      onDiscardDraft={handleDiscardDraft}
      discardDescription="Discard all unpublished changes on this doc? This cannot be undone."
      settings={
        <div className="space-y-7">
          <SlugEditor
            slug={doc.slug}
            prefix="/docs/"
            onSave={handleSlugSave}
            testId="doc-slug-input"
          />

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
      <Editor
        key={resetKey}
        initialContent={doc.draftContent}
        onChange={handleContentChange}
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
    </WritingEditorShell>
  );
}
