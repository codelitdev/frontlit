import { createContext, useContext, type ReactNode } from "react";
import type { ImageUploaderAdapters, LibraryImage } from "./types";

const ImageUploaderContext = createContext<ImageUploaderAdapters | null>(null);

export function ImageUploaderProvider<
    TMedia extends LibraryImage = LibraryImage,
>({
    children,
    ...adapters
}: ImageUploaderAdapters<TMedia> & { children: ReactNode }) {
    return (
        <ImageUploaderContext.Provider
            value={adapters as ImageUploaderAdapters}
        >
            {children}
        </ImageUploaderContext.Provider>
    );
}

export function useImageUploaderAdapters<
    TMedia extends LibraryImage = LibraryImage,
>(
    overrides: Partial<ImageUploaderAdapters<TMedia>> = {},
): ImageUploaderAdapters<TMedia> {
    const context = useContext(
        ImageUploaderContext,
    ) as ImageUploaderAdapters<TMedia> | null;
    const uploadImage = overrides.uploadImage ?? context?.uploadImage;
    if (!uploadImage) {
        throw new Error(
            "ImageUploadDialog requires uploadImage via props or ImageUploaderProvider.",
        );
    }
    return {
        uploadImage,
        listMedia: overrides.listMedia ?? context?.listMedia,
        searchUnsplash: overrides.searchUnsplash ?? context?.searchUnsplash,
        isUploading: overrides.isUploading ?? context?.isUploading,
        uploadProgress: overrides.uploadProgress ?? context?.uploadProgress,
        cancelUpload: overrides.cancelUpload ?? context?.cancelUpload,
    };
}
