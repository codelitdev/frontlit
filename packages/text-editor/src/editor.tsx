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
import { createDocsExtensions } from "./docs/extensions";
import Placeholder from "@tiptap/extension-placeholder";
import { isSafeDocsUrl } from "./docs/urls";

export interface EditorProps {
  profile?: "default" | "documentation";
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
    profile = "default" as EditorProps["profile"],
  }) => {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pickImage = useImagePicker();
    const hasInteractedRef = useRef(false);
    const lastSerializedContentRef = useRef(JSON.stringify(initialContent ?? emptyDoc));
    const refreshRef = useRef<EditorProps["refresh"]>(refresh);

    const extensions = useMemo(
      () =>
        profile === "documentation"
          ? [
              ...createDocsExtensions(),
              Placeholder.configure({ placeholder: placeholder || "Write something…" }),
            ]
          : createExtensions({ placeholder }),
      [placeholder, profile],
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
        if (profile === "documentation") {
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
      [editor, profile, onError, imageSizeLimit],
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
        if (profile === "documentation" && !isSafeDocsUrl(image.src, true)) {
          onError?.("Documentation images require a stable public HTTPS URL.");
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
      [editor, profile, onError],
    );

    const openFileDialog = useCallback(() => {
      if (pickImage) {
        void pickImage().then((image) => {
          if (image) insertPickedImage(image);
        });
        return;
      }
      fileInputRef.current?.click();
    }, [insertPickedImage, pickImage]);

    if (typeof window === "undefined") {
      return <></>;
    }

    return (
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
              onRequestImageUpload={openFileDialog}
              isUploadingImage={isUploading}
              profile={profile}
            />
          </div>
        )}
        <div className="flex w-full justify-center">
          <div className={cn("flex w-full max-w-3xl flex-col", contentClassName)}>
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
          </div>
        </div>
      </div>
    );
  },
  {
    getPlainText: (doc: JSONContent) =>
      generateText(doc || emptyDoc, createExtensions()),
    emptyDoc,
  },
) as EditorType;

export default Editor;
