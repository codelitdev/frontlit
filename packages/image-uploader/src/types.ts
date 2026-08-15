export type LibraryImage = {
    id: string;
    url: string;
    thumbnailUrl?: string | null;
    alt?: string | null;
    fileName?: string | null;
};

export type SelectedImage<TMedia extends LibraryImage = LibraryImage> = {
    src: string;
    alt?: string;
    media?: TMedia;
};

export type UnsplashPhoto = {
    id: string;
    url: string;
    thumbUrl: string;
    alt?: string;
    photographer?: string;
};

export type UnsplashSearchResult = {
    configured: boolean;
    items: UnsplashPhoto[];
};

export type UploadImageFn<TMedia extends LibraryImage = LibraryImage> = (
    file: File,
    meta: { alt?: string },
) => Promise<TMedia>;

export type ListMediaFn<TMedia extends LibraryImage = LibraryImage> = (
    query: string,
) => Promise<TMedia[]>;

export type SearchUnsplashFn = (
    query?: string,
) => Promise<UnsplashSearchResult>;

export type ImageUploaderAdapters<TMedia extends LibraryImage = LibraryImage> =
    {
        uploadImage: UploadImageFn<TMedia>;
        listMedia?: ListMediaFn<TMedia>;
        searchUnsplash?: SearchUnsplashFn;
        isUploading?: boolean;
        uploadProgress?: number;
        cancelUpload?: () => void;
    };
