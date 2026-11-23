"use client";

import React, {
  FC,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { JSONContent } from "@tiptap/core";
import { generateText } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import emptyDoc from "./empty-doc";
import { createExtensions } from "./extensions";
import Toolbar from "./toolbar";
import BubbleMenu from "./bubble-menu";
import type { ReactEditorProps } from "./types";
import { cn } from "./lib/cn";
import { useImagePicker } from "./image-picker";
import { docsBlockUi } from "./components/docs-block-views";
import { resolveProfile, type ProfileInput } from "./profiles";
import { checkUrlAttr } from "./core/url-check";
import { EditorBlocksContext } from "./ui/block-frame";
import { collectBlockUi, createEditorExtensions } from "./ui/editor-extensions";
import { getInsertItems, type InsertItem } from "./ui/insert-items";
import { TableBar } from "./ui/table-bar";
import { useMediaPicker, MEDIA_ACCEPT } from "./ui/media-picker";
import type { BlockUi, ResolveMedia } from "./ui/types";

export interface EditorProps {
  /** `"default"`, `"documentation"`, or a profile from `defineProfile`. */
  profile?: ProfileInput;
  /**
   * Blocks that may not be added now, with the reason shown to the author
   * (e.g. `{ embed: "Upgrade to add embeds" }`). Existing ones stay editable.
   */
  unavailable?: Record<string, string>;
  /** UI for host blocks in the profile (library blocks bring their own). */
  blocks?: BlockUi[];
  /** Preview URLs for media IDs already in the document. */
  resolveMedia?: ResolveMedia;
  onChange: (json: JSONContent) => void;
  onFlushChangeReady?: (flush: () => void) => void;
  /** How long to wait after the last edit before calling `onChange`. Defaults to 1000. */
  debounceMs?: number;
  showToolbar?: boolean;
  editable?: boolean;
  refresh?: number;
  url?: string;
  initialContent?: ReactEditorProps["initialContent"];
  placeholder?: string;
  /** Accessible name of the editing area. Defaults to "Rich text editor". */
  ariaLabel?: string;
  autoFocus?: boolean;
  imageSizeLimit?: number;
  onError?: (...args: any[]) => void;
  className?: string;
  editorClassName?: string;
  contentClassName?: string;
  beforeContent?: React.ReactNode;
}

interface EditorType extends FC<PropsWithChildren<EditorProps>> {
  getPlainText: (doc: JSONContent) => string;
  emptyDoc: JSONContent;
}

const Editor: EditorType = Object.assign(
  ({
    initialContent,
    onChange,
    onFlushChangeReady,
    debounceMs = 1000,
    placeholder,
    ariaLabel = "Rich text editor",
    children,
    showToolbar = true,
    editable = true,
    refresh,
    url,
    autoFocus,
    imageSizeLimit,
    onError,
    className,
    editorClassName,
    contentClassName,
    beforeContent,
    profile: profileInput = "default" as ProfileInput,
    unavailable,
    blocks,
    resolveMedia,
  }) => {
    const [isUploading, setIsUploading] = useState(false);
    // Render nothing on the server and in the first client render, so
    // hydration matches; the editor needs the DOM anyway.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pickImage = useImagePicker();
    const pickMedia = useMediaPicker();
    const profile = resolveProfile(profileInput);
    const imageSchema = profile.blockSchemas.get("image");
    const allowsBase64 =
      imageSchema?.attrs.src.validate("data:image/png;base64,AA==") === true;
    const mediaImages = Boolean(imageSchema?.attrs.media);
    // Host UIs arrive as a new array on every render; rebuild only when the set changes.
    const blockKey = (blocks ?? []).map((block) => block.schema.name).join(",");
    const blocksRef = useRef(blocks);
    blocksRef.current = blocks;
    const ui = useMemo(
      () => collectBlockUi(profile, [...docsBlockUi, ...(blocksRef.current ?? [])]),
      [profile, blockKey],
    );
    const previews = useRef(new Map<string, { url?: string; name?: string }>()).current;
    const itemsRef = useRef<InsertItem[]>([]);
    const hasInteractedRef = useRef(false);
    const lastSerializedContentRef = useRef(JSON.stringify(initialContent ?? emptyDoc));
    const refreshRef = useRef<EditorProps["refresh"]>(refresh);

    const extensions = useMemo(
      () =>
        createEditorExtensions(profile, {
          placeholder,
          ui,
          getItems: () => itemsRef.current,
        }),
      [placeholder, profile, ui],
    );

    const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingJsonRef = useRef<JSONContent | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const debounceMsRef = useRef(debounceMs);
    debounceMsRef.current = debounceMs;

    const editor = useEditor(
      {
        immediatelyRender: false,
        extensions,
        content: initialContent ?? emptyDoc,
        autofocus: autoFocus ? "end" : false,
        editable,
        editorProps: {
          attributes: {
            class: `tiptap-content ${editorClassName ?? ""}`,
            "data-placeholder": placeholder ?? "",
            role: "textbox",
            "aria-multiline": "true",
            "aria-label": ariaLabel,
            ...(editable ? {} : { "aria-readonly": "true" }),
          },
        },
        onUpdate: ({ editor: instance }) => {
          // TipTap may normalize loaded JSON during initialization
          // (notably `{ type: "doc", content: [] }` to
          // `{ type: "doc" }`). Do not turn that internal mount work
          // into a user-visible autosave.
          if (!hasInteractedRef.current) {
            return;
          }
          if (changeTimeoutRef.current) {
            clearTimeout(changeTimeoutRef.current);
          }

          pendingJsonRef.current = instance.getJSON();
          changeTimeoutRef.current = setTimeout(() => {
            changeTimeoutRef.current = null;
            const json = pendingJsonRef.current;
            pendingJsonRef.current = null;
            if (json) onChangeRef.current(json);
          }, debounceMsRef.current);
        },
        onSelectionUpdate: ({ editor: instance }) => {
          hasInteractedRef.current = true;
        },
      },
      [extensions],
    );
    useEffect(() => {
      onFlushChangeReady?.(() => {
        if (!editor || !changeTimeoutRef.current) return;
        clearTimeout(changeTimeoutRef.current);
        changeTimeoutRef.current = null;
        pendingJsonRef.current = null;
        onChangeRef.current(editor.getJSON());
      });
      return () => onFlushChangeReady?.(() => {});
    }, [editor, onFlushChangeReady]);
    useEffect(() => {
      // Deliver an edit that is still waiting on the debounce instead of
      // dropping it, e.g. when the panel hosting the editor is closed.
      return () => {
        if (changeTimeoutRef.current) {
          clearTimeout(changeTimeoutRef.current);
          changeTimeoutRef.current = null;
        }
        const json = pendingJsonRef.current;
        pendingJsonRef.current = null;
        if (json) onChangeRef.current(json);
      };
    }, []);

    useEffect(() => {
      if (!editor) {
        return;
      }

      editor.setEditable(editable);
    }, [editor, editable]);

    useEffect(() => {
      if (!editor) {
        return;
      }

      const nextContent = initialContent ?? emptyDoc;
      const nextSerialized = JSON.stringify(nextContent);
      const refreshChanged = refreshRef.current !== refresh;

      if (refreshChanged) {
        refreshRef.current = refresh;
        hasInteractedRef.current = false;
        lastSerializedContentRef.current = nextSerialized;
        editor.commands.setContent(nextContent, {
          emitUpdate: false,
        });
        return;
      }

      if (!hasInteractedRef.current) {
        if (lastSerializedContentRef.current !== nextSerialized) {
          lastSerializedContentRef.current = nextSerialized;
          editor.commands.setContent(nextContent, {
            emitUpdate: false,
          });
        }
        return;
      }

      lastSerializedContentRef.current = nextSerialized;
    }, [editor, initialContent, refresh]);

    const handleImageUpload = useCallback(
      async (file: File) => {
        if (!allowsBase64) {
          onError?.(
            "Upload a public image using the media library before inserting it.",
          );
          return;
        }
        const sizeLimit = imageSizeLimit ?? 2097152; // 2 MB
        if (file.size > sizeLimit) {
          onError?.("File is larger than the allowed size");
          return;
        }

        try {
          setIsUploading(true);
          // First-draft implementation: embed the image as a data URL so
          // the editor works without a media/upload backend.
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          editor
            ?.chain()
            .focus()
            .setImage({
              src: dataUrl,
              alt: file.name,
              title: file.name,
            })
            .run();
        } catch (error) {
          console.error("Image upload failed", error);
        } finally {
          setIsUploading(false);
        }
      },
      [editor, allowsBase64, onError, imageSizeLimit],
    );

    const handleSelectFile = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
          return;
        }

        const file = files[0];
        void handleImageUpload(file);
        event.target.value = "";
      },
      [handleImageUpload],
    );

    const insertPickedImage = useCallback(
      (image: { src: string; alt?: string }) => {
        const check = imageSchema
          ? checkUrlAttr(profile, imageSchema.attrs.src, image.src)
          : "Images are not allowed here.";
        if (check !== true) {
          onError?.(
            profile.options.name === "documentation"
              ? "Documentation images require a stable public HTTPS URL."
              : check,
          );
          return;
        }
        editor
          ?.chain()
          .focus()
          .setImage({
            src: image.src,
            alt: image.alt,
            title: image.alt,
          })
          .run();
      },
      [editor, profile, imageSchema, onError],
    );

    const openFileDialog = useCallback(() => {
      if (mediaImages && pickMedia) {
        void pickMedia({ kind: "image", accept: MEDIA_ACCEPT.image }).then((picked) => {
          if (!picked) return;
          previews.set(picked.id, { url: picked.previewUrl, name: picked.name });
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: "image",
              attrs: { media: picked.id, src: null, alt: picked.alt ?? "" },
            })
            .run();
        });
        return;
      }
      if (pickImage) {
        void pickImage().then((image) => {
          if (image) insertPickedImage(image);
        });
        return;
      }
      fileInputRef.current?.click();
    }, [editor, insertPickedImage, mediaImages, pickImage, pickMedia, previews]);

    itemsRef.current = useMemo(
      () =>
        getInsertItems(profile, {
          ui,
          unavailable,
          insertImage: () => openFileDialog(),
          // The default editor has always offered headings 1–3.
          headingLevels:
            profile.options.name === "default"
              ? profile.headingLevels.filter((level) => level <= 3)
              : undefined,
        }),
      [profile, ui, unavailable, openFileDialog],
    );
    const blocksContext = useMemo(
      () => ({ ui, pickMedia, resolveMedia, previews }),
      [ui, pickMedia, resolveMedia, previews],
    );

    if (!mounted) {
      return <></>;
    }

    return (
      <EditorBlocksContext.Provider value={blocksContext}>
        <div
          className={cn("tiptap-editor flex flex-col gap-4 border", className)}
          onPointerDownCapture={() => {
            hasInteractedRef.current = true;
          }}
          onKeyDownCapture={() => {
            hasInteractedRef.current = true;
          }}
        >
          {editable && showToolbar && (
            <div
              className="sticky top-0 bg-background"
              style={{
                zIndex: 1,
              }}
            >
              <Toolbar
                editor={editor}
                isUploadingImage={isUploading}
                profile={profile}
                items={itemsRef.current}
              />
            </div>
          )}
          <div className="flex w-full justify-center">
            <div
              className={cn(
                "relative flex w-full max-w-3xl flex-col",
                contentClassName,
              )}
            >
              {beforeContent}
              <EditorContent
                editor={editor}
                className={`${editorClassName ?? ""} ${editorClassName?.includes("min-h-") ? "" : "min-h-[200px]"}`}
              />
              {pickImage ? null : (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSelectFile}
                />
              )}
              {children}
              {editor && <BubbleMenu editor={editor} profile={profile} />}
              {editor && editable && profile.nodeNames.has("table") && (
                <TableBar
                  editor={editor}
                  headerToggle={profile.options.tables !== "simple"}
                />
              )}
            </div>
          </div>
        </div>
      </EditorBlocksContext.Provider>
    );
  },
  {
    getPlainText: (doc: JSONContent) =>
      generateText(doc || emptyDoc, createExtensions()),
    emptyDoc,
  },
) as EditorType;

export default Editor;
