import { createContext, useContext, type ReactNode } from "react";
import type { LibraryMedia, MediaUploaderAdapters } from "./types";

const MediaUploaderContext = createContext<MediaUploaderAdapters | null>(null);

export function MediaUploaderProvider<TMedia extends LibraryMedia = LibraryMedia>({
  children,
  ...adapters
}: MediaUploaderAdapters<TMedia> & { children: ReactNode }) {
  return (
    <MediaUploaderContext.Provider value={adapters as MediaUploaderAdapters}>
      {children}
    </MediaUploaderContext.Provider>
  );
}

/** Backward-compatible alias for MediaUploaderProvider. */
export const ImageUploaderProvider = MediaUploaderProvider;

export function useMediaUploaderAdapters<TMedia extends LibraryMedia = LibraryMedia>(
  overrides: Partial<MediaUploaderAdapters<TMedia>> = {},
): Required<Pick<MediaUploaderAdapters<TMedia>, "uploadMedia">> &
  Omit<MediaUploaderAdapters<TMedia>, "uploadMedia"> {
  const context = useContext(
    MediaUploaderContext,
  ) as MediaUploaderAdapters<TMedia> | null;

  const uploadMedia = overrides.uploadMedia ?? context?.uploadMedia;

  const fallbackUploadMedia = async () => {
    throw new Error(
      "MediaUploadDialog requires uploadMedia via props or MediaUploaderProvider.",
    );
  };

  const resolvedUploadMedia = uploadMedia ?? fallbackUploadMedia;

  return {
    uploadNotice: overrides.uploadNotice ?? context?.uploadNotice,
    uploadMedia: resolvedUploadMedia,
    listMedia: overrides.listMedia ?? context?.listMedia,
    searchUnsplash: overrides.searchUnsplash ?? context?.searchUnsplash,
    isUploading: overrides.isUploading ?? context?.isUploading,
    uploadProgress: overrides.uploadProgress ?? context?.uploadProgress,
    cancelUpload: overrides.cancelUpload ?? context?.cancelUpload,
  };
}

/** Backward-compatible alias for useMediaUploaderAdapters. */
export const useImageUploaderAdapters = useMediaUploaderAdapters;
