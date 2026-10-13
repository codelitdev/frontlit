export type LibraryMedia = {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  alt?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  title?: string | null;
};

/** Backward-compatible alias for LibraryMedia. */
export type LibraryImage = LibraryMedia;

export type SelectedMedia<TMedia extends LibraryMedia = LibraryMedia> = {
  src: string;
  alt?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  media?: TMedia;
};

/** Backward-compatible alias for SelectedMedia. */
export type SelectedImage<TMedia extends LibraryImage = LibraryImage> =
  SelectedMedia<TMedia>;

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

export type MediaUploadMeta = {
  alt?: string;
  fileName?: string;
  title?: string;
  mimeType?: string;
};

export type UploadMediaFn<TMedia extends LibraryMedia = LibraryMedia> = (
  file: File,
  meta: MediaUploadMeta,
) => Promise<TMedia>;

export type ListMediaFn<TMedia extends LibraryMedia = LibraryMedia> = (
  query: string,
) => Promise<TMedia[]>;

export type SearchUnsplashFn = (query?: string) => Promise<UnsplashSearchResult>;

export type MediaUploaderAdapters<TMedia extends LibraryMedia = LibraryMedia> = {
  uploadNotice?: string;
  uploadMedia?: UploadMediaFn<TMedia>;
  listMedia?: ListMediaFn<TMedia>;
  searchUnsplash?: SearchUnsplashFn;
  isUploading?: boolean;
  uploadProgress?: number;
  cancelUpload?: () => void;
};

/** Backward-compatible alias for MediaUploaderAdapters. */
export type ImageUploaderAdapters<TMedia extends LibraryImage = LibraryImage> =
  MediaUploaderAdapters<TMedia>;
