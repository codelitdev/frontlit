/** What the dialog offers besides uploading, for `description`. */
export type MediaUploaderDescriptionContext = {
  /** "image" when only images are accepted, otherwise "file". */
  kind: "image" | "file";
  /** The "Your media" tab is shown. */
  library: boolean;
  /** The Unsplash tab is shown. */
  unsplash: boolean;
};

/**
 * Every piece of text the media upload dialogs show. Pass a partial set as
 * `labels` to translate them; the rest stay English. Text with a value in it
 * is a function, so any translator can be used.
 */
export type MediaUploaderLabels = {
  /** Dialog title when only images are accepted. */
  selectImageTitle: string;
  /** Dialog title for other files. */
  selectFileTitle: string;
  /** Dialog description, unless the `description` prop is given. */
  description: (context: MediaUploaderDescriptionContext) => string;
  /** Screen-reader text of the dialog's close button. */
  close: string;
  uploadTab: string;
  libraryTab: string;
  unsplashTab: string;
  dropImage: string;
  dropFile: string;
  /** Accepted formats when only images are accepted and no list is given. */
  imageFormats: string;
  /** Accepted formats when anything is accepted. */
  anyFile: string;
  /** Size limit under the drop zone; `size` is formatted, e.g. "10.0 MB". */
  upTo: (size: string) => string;
  previewAlt: string;
  removeFile: string;
  changeFile: string;
  altTextLabel: string;
  altTextPlaceholder: string;
  titleLabel: string;
  titlePlaceholder: string;
  uploadImage: string;
  uploadFile: string;
  /** Upload button while uploading; `progress` is a whole percentage. */
  uploading: (progress: number) => string;
  searchLibrary: string;
  loadingLibrary: string;
  noMedia: string;
  /** Name shown for a library item with no file name, title or alt text. */
  untitledFile: string;
  /** Alt text of a library item picked without any. */
  mediaAlt: string;
  select: string;
  unsplashUrlLabel: string;
  unsplashAltPlaceholder: string;
  insert: string;
  searchUnsplash: string;
  searchingUnsplash: string;
  /** Alt text and credit of an Unsplash photo that has none. */
  unsplash: string;
  /** Alt text of a picked Unsplash photo that has none. */
  unsplashImageAlt: string;
  /** `fileType` may be empty; `allowedTypes` is empty when all are allowed. */
  formatNotAccepted: (fileType: string, allowedTypes: string[]) => string;
  /** `maxSize` is formatted, e.g. "10.0 MB". */
  fileTooLarge: (maxSize: string) => string;
  validationFailed: string;
  uploadFailed: string;
  loadMediaFailed: string;
  enterUnsplashUrl: string;
  invalidUnsplashUrl: string;
  enterSearchTerm: string;
  unsplashSearchFailed: string;
};

export const defaultMediaUploaderLabels: MediaUploaderLabels = {
  selectImageTitle: "Select image",
  selectFileTitle: "Select file",
  description: ({ kind, library, unsplash }) => {
    if (library && unsplash) {
      return `Upload a new ${kind}, choose one from your library, or pick from Unsplash.`;
    }
    if (library) return `Upload a new ${kind} or choose one from your library.`;
    if (unsplash) return `Upload a new ${kind} or pick from Unsplash.`;
    return `Upload a new ${kind}.`;
  },
  close: "Close",
  uploadTab: "Upload",
  libraryTab: "Your media",
  unsplashTab: "Unsplash",
  dropImage: "Drop image here or click",
  dropFile: "Drop file here or click",
  imageFormats: "JPEG, PNG, GIF, WebP",
  anyFile: "Any file",
  upTo: (size) => `up to ${size}`,
  previewAlt: "Preview",
  removeFile: "Remove file",
  changeFile: "Change file",
  altTextLabel: "Alt text",
  altTextPlaceholder: "Describe the image for accessibility",
  titleLabel: "Display title / caption",
  titlePlaceholder: "Give this file a display title",
  uploadImage: "Upload image",
  uploadFile: "Upload file",
  uploading: (progress) => `Uploading… ${progress}%`,
  searchLibrary: "Search library",
  loadingLibrary: "Loading library…",
  noMedia: "No media yet",
  untitledFile: "File",
  mediaAlt: "Media",
  select: "Select",
  unsplashUrlLabel: "Unsplash URL",
  unsplashAltPlaceholder: "Describe the image",
  insert: "Insert",
  searchUnsplash: "Search Unsplash",
  searchingUnsplash: "Searching Unsplash…",
  unsplash: "Unsplash",
  unsplashImageAlt: "Unsplash image",
  formatNotAccepted: (fileType, allowedTypes) =>
    `File format not accepted (${fileType || "unknown"}). Allowed: ${
      allowedTypes.length ? allowedTypes.join(", ") : "all formats"
    }.`,
  fileTooLarge: (maxSize) => `File is too large. Maximum allowed size is ${maxSize}.`,
  validationFailed: "Validation failed.",
  uploadFailed: "Failed to upload file.",
  loadMediaFailed: "Failed to load media.",
  enterUnsplashUrl: "Enter an Unsplash image URL",
  invalidUnsplashUrl: "Enter a valid Unsplash URL",
  enterSearchTerm: "Enter a search term",
  unsplashSearchFailed: "Failed to search Unsplash",
};

/** The defaults with `labels` laid over them. */
export function resolveMediaUploaderLabels(
  labels?: Partial<MediaUploaderLabels>,
): MediaUploaderLabels {
  if (!labels) return defaultMediaUploaderLabels;
  const resolved = { ...defaultMediaUploaderLabels };
  for (const [key, value] of Object.entries(labels)) {
    if (value !== undefined) (resolved as Record<string, unknown>)[key] = value;
  }
  return resolved;
}
