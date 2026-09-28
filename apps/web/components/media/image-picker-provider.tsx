"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ImagePickerContextProvider } from "@frontlit/text-editor";
import { ImageUploadDialog, ImageUploaderProvider } from "@frontlit/media-uploader";
import {
  loadLibrary,
  searchUnsplashAdapter,
  toLibraryImage,
} from "@/lib/frontlit-image-uploader";
import { useLibraryUpload } from "@/lib/use-library-upload";

export function ImagePickerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pending = useRef<
    ((value: { src: string; alt?: string } | null) => void) | null
  >(null);
  const { uploadToLibrary, isUploading, uploadProgress, cancelUpload } =
    useLibraryUpload();

  const pickImage = useCallback(() => {
    return new Promise<{ src: string; alt?: string } | null>((resolve) => {
      pending.current = resolve;
      setOpen(true);
    });
  }, []);

  function finish(value: { src: string; alt?: string } | null) {
    pending.current?.(value);
    pending.current = null;
    setOpen(false);
  }

  return (
    <ImageUploaderProvider
      uploadMedia={async (file, meta) =>
        toLibraryImage(await uploadToLibrary(file, meta))
      }
      listMedia={loadLibrary}
      searchUnsplash={searchUnsplashAdapter}
      isUploading={isUploading}
      uploadProgress={uploadProgress}
      cancelUpload={cancelUpload}
    >
      <ImagePickerContextProvider pickImage={pickImage}>
        {children}
        <ImageUploadDialog
          open={open}
          onOpenChange={(next) => {
            if (next) setOpen(true);
            else finish(null);
          }}
          onSelect={(image) => finish({ src: image.src, alt: image.alt })}
        />
      </ImagePickerContextProvider>
    </ImageUploaderProvider>
  );
}
