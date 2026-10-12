import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  ImageIcon,
  Search,
  Upload,
  X,
} from "lucide-react";
import { formatFileSize } from "./format-file-size";
import { useMediaUploaderAdapters } from "./media-uploader-provider";
import { allowsImages, getMimeCategory, matchesMime, type MimeCategory } from "./mime";
import type {
  LibraryMedia,
  MediaUploadMeta,
  MediaUploaderAdapters,
  SelectedMedia,
  UnsplashPhoto,
} from "./types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export type MediaUploadDialogProps<TMedia extends LibraryMedia = LibraryMedia> =
  Partial<MediaUploaderAdapters<TMedia>> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSelect: (media: SelectedMedia<TMedia>) => void;
    title?: string;
    description?: string;
    children?: ReactNode;
    disabled?: boolean;
    allowUnsplash?: boolean;
    allowExistingMedia?: boolean;
    acceptedTypes?: string[];
    maxUploadBytes?: number;
    validateFile?: (file: File) => string | null | Promise<string | null>;
    defaultTab?: "upload" | "media" | "unsplash";
    metadataMode?: "auto" | "alt" | "title" | "none";
  };

function defaultDescription(
  allowExistingMedia: boolean,
  showUnsplash: boolean,
  acceptsOnlyImages: boolean,
) {
  const noun = acceptsOnlyImages ? "image" : "file";
  if (allowExistingMedia && showUnsplash) {
    return `Upload a new ${noun}, choose one from your library, or pick from Unsplash.`;
  }
  if (allowExistingMedia) {
    return `Upload a new ${noun} or choose one from your library.`;
  }
  if (showUnsplash) {
    return `Upload a new ${noun} or pick from Unsplash.`;
  }
  return `Upload a new ${noun}.`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function CategoryIcon({
  category,
  className,
}: {
  category: MimeCategory;
  className?: string;
}) {
  switch (category) {
    case "image":
      return <ImageIcon className={className} />;
    case "video":
      return <FileVideo className={className} />;
    case "audio":
      return <FileAudio className={className} />;
    case "pdf":
    case "document":
      return <FileText className={className} />;
    case "archive":
      return <FileArchive className={className} />;
    default:
      return <File className={className} />;
  }
}

export function MediaUploadDialog<TMedia extends LibraryMedia = LibraryMedia>({
  open,
  onOpenChange,
  onSelect,
  title,
  description,
  children,
  disabled = false,
  allowUnsplash = true,
  allowExistingMedia = true,
  acceptedTypes,
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
  validateFile: customValidateFile,
  defaultTab = "upload",
  metadataMode = "auto",
  uploadMedia: uploadMediaProp,
  listMedia: listMediaProp,
  searchUnsplash: searchUnsplashProp,
  isUploading: isUploadingProp,
  uploadProgress: uploadProgressProp,
  cancelUpload: cancelUploadProp,
}: MediaUploadDialogProps<TMedia>) {
  const adapters = useMediaUploaderAdapters<TMedia>({
    uploadMedia: uploadMediaProp,
    listMedia: listMediaProp,
    searchUnsplash: searchUnsplashProp,
    isUploading: isUploadingProp,
    uploadProgress: uploadProgressProp,
    cancelUpload: cancelUploadProp,
  });

  const {
    uploadNotice,
    uploadMedia,
    listMedia,
    searchUnsplash,
    isUploading = false,
    uploadProgress = 0,
    cancelUpload,
  } = adapters;

  const acceptsImages = allowsImages(acceptedTypes);
  const acceptsOnlyImages = Boolean(
    acceptedTypes &&
      acceptedTypes.length > 0 &&
      acceptedTypes.every(
        (t) =>
          t.startsWith("image/") ||
          t === "image/*" ||
          [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"].includes(
            t.toLowerCase(),
          ),
      ),
  );

  const showExistingMedia = allowExistingMedia && Boolean(listMedia);
  const showUnsplash = allowUnsplash && acceptsImages && Boolean(searchUnsplash);

  const resolvedTitle = title ?? (acceptsOnlyImages ? "Select image" : "Select file");
  const resolvedDescription =
    description ??
    defaultDescription(showExistingMedia, showUnsplash, acceptsOnlyImages);

  const tabCount = 1 + (showExistingMedia ? 1 : 0) + (showUnsplash ? 1 : 0);

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metaValue, setMetaValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [mediaItems, setMediaItems] = useState<TMedia[]>([]);
  const [mediaQuery, setMediaQuery] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<TMedia | null>(null);
  const [unsplashUrl, setUnsplashUrl] = useState("");
  const [unsplashAlt, setUnsplashAlt] = useState("");
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [unsplashResults, setUnsplashResults] = useState<UnsplashPhoto[]>([]);
  const [loadingUnsplash, setLoadingUnsplash] = useState(false);
  const [unsplashError, setUnsplashError] = useState("");
  const [unsplashConfigured, setUnsplashConfigured] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = isControlled ? open : internalOpen;

  const currentCategory: MimeCategory = file
    ? getMimeCategory(file.type, file.name)
    : acceptsOnlyImages
      ? "image"
      : "other";

  useEffect(() => {
    if (!file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetFields() {
    setFile(null);
    setMetaValue("");
    setFileError("");
    setUploadError("");
    setIsDragging(false);
    setMediaError("");
    setSelectedMedia(null);
    setUnsplashError("");
    setUnsplashUrl("");
    setUnsplashAlt("");
    setUnsplashQuery("");
    setUnsplashResults([]);
  }

  function closeDialog() {
    cancelUpload?.();
    resetFields();
    if (!isControlled) setInternalOpen(false);
    onOpenChange?.(false);
  }

  function selectMedia(media: SelectedMedia<TMedia>) {
    onSelect(media);
    closeDialog();
  }

  function confirmSelectedMedia() {
    if (!selectedMedia) return;
    selectMedia({
      src: selectedMedia.url,
      alt: selectedMedia.alt || selectedMedia.fileName || "Media",
      fileName: selectedMedia.fileName || selectedMedia.title || undefined,
      mimeType: selectedMedia.mimeType || undefined,
      byteSize: selectedMedia.byteSize || undefined,
      media: selectedMedia,
    });
  }

  async function validateSelectedFile(selected: File): Promise<boolean> {
    if (!matchesMime(selected.type, selected.name, acceptedTypes)) {
      const allowedText = acceptedTypes?.length
        ? acceptedTypes.join(", ")
        : "all formats";
      setFileError(
        `File format not accepted (${selected.type || "unknown"}). Allowed: ${allowedText}.`,
      );
      setFile(null);
      return false;
    }

    if (selected.size > maxUploadBytes) {
      setFileError(
        `File is too large. Maximum allowed size is ${formatFileSize(maxUploadBytes)}.`,
      );
      setFile(null);
      return false;
    }

    if (customValidateFile) {
      try {
        const error = await customValidateFile(selected);
        if (error) {
          setFileError(error);
          setFile(null);
          return false;
        }
      } catch (err) {
        setFileError(errorMessage(err, "Validation failed."));
        setFile(null);
        return false;
      }
    }

    setFileError("");
    setUploadError("");
    setFile(selected);
    return true;
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (selected) {
      await validateSelectedFile(selected);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      await validateSelectedFile(dropped);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploadError("");

    const isImage = currentCategory === "image";
    const meta: MediaUploadMeta = {
      fileName: file.name,
      mimeType: file.type,
      alt:
        metadataMode === "alt" || (metadataMode === "auto" && isImage)
          ? metaValue.trim() || undefined
          : undefined,
      title:
        metadataMode === "title" || (metadataMode === "auto" && !isImage)
          ? metaValue.trim() || undefined
          : undefined,
    };

    try {
      const media = await uploadMedia(file, meta);
      selectMedia({
        src: media.url,
        alt: media.alt || meta.alt || file.name,
        fileName: media.fileName || file.name,
        mimeType: media.mimeType || file.type,
        byteSize: media.byteSize || file.size,
        media,
      });
    } catch (error) {
      setUploadError(errorMessage(error, "Failed to upload file."));
    }
  }

  async function loadMedia() {
    if (!listMedia) return;
    setLoadingMedia(true);
    setMediaError("");
    try {
      const items = await listMedia(mediaQuery);
      setMediaItems(items);
      setSelectedMedia((current) =>
        current && items.some((item) => item.id === current.id) ? current : null,
      );
    } catch (error) {
      setMediaError(errorMessage(error, "Failed to load media."));
    } finally {
      setLoadingMedia(false);
    }
  }

  function selectUnsplashUrl() {
    const trimmedUrl = unsplashUrl.trim();
    if (!trimmedUrl) {
      setUnsplashError("Enter an Unsplash image URL");
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (!parsed.hostname.includes("unsplash.com")) {
        setUnsplashError("Enter a valid Unsplash URL");
        return;
      }
    } catch {
      setUnsplashError("Enter a valid Unsplash URL");
      return;
    }
    selectMedia({
      src: trimmedUrl,
      alt: unsplashAlt.trim() || "Unsplash image",
      fileName: "unsplash-image.jpg",
      mimeType: "image/jpeg",
    });
  }

  async function loadUnsplashConfig() {
    if (!searchUnsplash) return;
    try {
      const result = await searchUnsplash();
      setUnsplashConfigured(result.configured);
    } catch {
      setUnsplashConfigured(false);
    }
  }

  async function runUnsplashSearch() {
    if (!searchUnsplash) return;
    const query = unsplashQuery.trim();
    if (!query) {
      setUnsplashError("Enter a search term");
      return;
    }
    setLoadingUnsplash(true);
    setUnsplashError("");
    try {
      const result = await searchUnsplash(query);
      setUnsplashConfigured(result.configured);
      if (!result.configured) return;
      setUnsplashResults(result.items);
    } catch (error) {
      setUnsplashError(errorMessage(error, "Failed to search Unsplash"));
    } finally {
      setLoadingUnsplash(false);
    }
  }

  useEffect(() => {
    if (
      (!showUnsplash && activeTab === "unsplash") ||
      (!showExistingMedia && activeTab === "media")
    ) {
      setActiveTab("upload");
      return;
    }
    if (showExistingMedia && activeTab === "media") void loadMedia();
    if (showUnsplash && activeTab === "unsplash" && unsplashConfigured === null) {
      void loadUnsplashConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, showExistingMedia, showUnsplash]);

  const showMetadataInput =
    metadataMode !== "none" &&
    (metadataMode === "alt" ||
      metadataMode === "title" ||
      (metadataMode === "auto" && Boolean(file)));

  const metadataLabel =
    metadataMode === "alt" || (metadataMode === "auto" && currentCategory === "image")
      ? "Alt text"
      : "Display title / caption";

  const metadataPlaceholder =
    metadataMode === "alt" || (metadataMode === "auto" && currentCategory === "image")
      ? "Describe the image for accessibility"
      : "Give this file a display title";

  return (
    <Dialog
      open={resolvedOpen}
      onOpenChange={(value) => {
        if (isUploading && !value) return;
        if (value) {
          if (!isControlled) setInternalOpen(true);
          onOpenChange?.(true);
          return;
        }
        closeDialog();
      }}
    >
      {children ? (
        <DialogTrigger asChild disabled={disabled}>
          {children}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-2xl" showCloseButton={!isUploading}>
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {tabCount > 1 ? (
            <TabsList
              className={`grid w-full ${tabCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}
            >
              <TabsTrigger value="upload">Upload</TabsTrigger>
              {showExistingMedia ? (
                <TabsTrigger value="media">Your media</TabsTrigger>
              ) : null}
              {showUnsplash ? (
                <TabsTrigger value="unsplash">Unsplash</TabsTrigger>
              ) : null}
            </TabsList>
          ) : null}
          <TabsContent value="upload" className="space-y-4 py-4">
            {uploadNotice && (
              <p className="text-sm text-muted-foreground">{uploadNotice}</p>
            )}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => void handleDrop(e)}
              onClick={() => {
                if (!file) fileInputRef.current?.click();
              }}
              className={`relative flex min-h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center ${
                file ? "cursor-default" : "cursor-pointer"
              } ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              } ${file ? "bg-muted/10 border-solid" : ""} ${
                fileError ? "border-destructive bg-destructive/5" : ""
              }`}
              style={{
                pointerEvents: isUploading ? "none" : "auto",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedTypes?.join(",")}
                className="hidden"
                disabled={isUploading}
                onChange={(e) => void handleFileChange(e)}
              />

              {file && previewUrl ? (
                <div className="relative flex flex-col items-center gap-3 w-full max-w-sm">
                  {currentCategory === "image" ? (
                    <div className="relative group">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-48 w-auto max-w-full rounded-md object-contain border bg-muted/20"
                      />
                    </div>
                  ) : currentCategory === "video" ? (
                    <video
                      src={previewUrl}
                      controls
                      className="max-h-48 w-full rounded-md bg-black object-contain"
                    />
                  ) : currentCategory === "audio" ? (
                    <div className="flex w-full flex-col items-center gap-2 rounded-lg border bg-background p-3">
                      <FileAudio className="size-8 text-primary" />
                      <span className="max-w-full truncate text-xs font-medium">
                        {file.name}
                      </span>
                      <audio src={previewUrl} controls className="h-8 w-full" />
                    </div>
                  ) : (
                    <div className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left">
                      <CategoryIcon
                        category={currentCategory}
                        className="size-8 shrink-0 text-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setFileError("");
                        setUploadError("");
                      }}
                      disabled={isUploading}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="mr-1 size-3.5" /> Remove file
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploading}
                      className="text-xs"
                    >
                      Change file
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Upload
                    className={`mb-2 size-6 ${
                      fileError
                        ? "text-destructive"
                        : isDragging
                          ? "text-primary"
                          : "text-muted-foreground"
                    }`}
                  />
                  <p className="text-sm font-medium text-muted-foreground">
                    {acceptsOnlyImages
                      ? "Drop image here or click"
                      : "Drop file here or click"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {acceptedTypes?.length
                      ? acceptedTypes.join(", ")
                      : acceptsOnlyImages
                        ? "JPEG, PNG, GIF, WebP"
                        : "Any file"}
                    {" · "}up to {formatFileSize(maxUploadBytes)}
                  </p>
                </>
              )}

              {fileError ? (
                <p className="mt-2 text-xs text-destructive">{fileError}</p>
              ) : null}
            </div>

            {showMetadataInput ? (
              <div className="space-y-1.5">
                <Label htmlFor="media-meta">{metadataLabel}</Label>
                <Input
                  id="media-meta"
                  value={metaValue}
                  onChange={(event) => setMetaValue(event.target.value)}
                  placeholder={metadataPlaceholder}
                  disabled={isUploading}
                />
              </div>
            ) : null}

            {uploadError ? (
              <p className="text-sm text-destructive">{uploadError}</p>
            ) : null}

            {isUploading ? (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                onClick={() => void handleUpload()}
                disabled={!file || isUploading}
              >
                {isUploading
                  ? `Uploading… ${Math.round(uploadProgress)}%`
                  : acceptsOnlyImages
                    ? "Upload image"
                    : "Upload file"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {showExistingMedia ? (
            <TabsContent value="media" className="space-y-4 py-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search library"
                  value={mediaQuery}
                  onChange={(event) => setMediaQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void loadMedia();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadMedia()}
                  disabled={loadingMedia}
                >
                  <Search className="size-4" />
                </Button>
              </div>

              {mediaError ? (
                <p className="text-sm text-destructive">{mediaError}</p>
              ) : null}

              {loadingMedia ? (
                <p className="text-sm text-muted-foreground">Loading library…</p>
              ) : mediaItems.length ? (
                <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto pr-1">
                  {mediaItems.map((item) => {
                    const isSelected = selectedMedia?.id === item.id;
                    const itemCat = getMimeCategory(item.mimeType, item.fileName);
                    const isImg = Boolean(item.thumbnailUrl) || itemCat === "image";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isSelected}
                        className={`group relative overflow-hidden rounded-md border bg-background text-left transition hover:border-primary ${
                          isSelected ? "border-primary ring-2 ring-primary/30" : ""
                        }`}
                        onClick={() => setSelectedMedia(item)}
                      >
                        <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                          {isImg ? (
                            <img
                              src={item.thumbnailUrl || item.url}
                              alt={item.alt || item.fileName || ""}
                              className="size-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-2 text-muted-foreground">
                              <CategoryIcon
                                category={itemCat}
                                className="size-10 text-muted-foreground/70"
                              />
                              {item.mimeType ? (
                                <span className="mt-1 rounded bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {item.fileName?.split(".").pop() || itemCat}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                          {item.fileName || item.title || item.alt || "File"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground">
                  <ImageIcon className="mb-2 size-6" />
                  <p className="text-sm">No media yet</p>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  onClick={confirmSelectedMedia}
                  disabled={!selectedMedia}
                >
                  Select
                </Button>
              </DialogFooter>
            </TabsContent>
          ) : null}

          {showUnsplash ? (
            <TabsContent value="unsplash" className="space-y-4 py-4">
              {unsplashConfigured === false ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="unsplash-url">Unsplash URL</Label>
                    <Input
                      id="unsplash-url"
                      placeholder="https://images.unsplash.com/..."
                      value={unsplashUrl}
                      onChange={(event) => {
                        setUnsplashUrl(event.target.value);
                        setUnsplashError("");
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="unsplash-alt">Alt text</Label>
                    <Input
                      id="unsplash-alt"
                      placeholder="Describe the image"
                      value={unsplashAlt}
                      onChange={(event) => setUnsplashAlt(event.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      disabled={!unsplashUrl.trim()}
                      onClick={selectUnsplashUrl}
                    >
                      Insert
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search Unsplash"
                      value={unsplashQuery}
                      onChange={(event) => setUnsplashQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void runUnsplashSearch();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void runUnsplashSearch()}
                      disabled={loadingUnsplash}
                    >
                      <Search className="size-4" />
                    </Button>
                  </div>
                  {loadingUnsplash ? (
                    <p className="text-sm text-muted-foreground">Searching Unsplash…</p>
                  ) : unsplashResults.length ? (
                    <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto pr-1">
                      {unsplashResults.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          className="overflow-hidden rounded-md border bg-background text-left hover:border-primary"
                          onClick={() =>
                            selectMedia({
                              src: photo.url,
                              alt: photo.alt || "Unsplash image",
                              fileName: `unsplash-${photo.id}.jpg`,
                              mimeType: "image/jpeg",
                            })
                          }
                        >
                          <div className="aspect-square bg-muted">
                            <img
                              src={photo.thumbUrl}
                              alt={photo.alt || "Unsplash"}
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                            {photo.photographer || "Unsplash"}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              {unsplashError ? (
                <p className="text-sm text-destructive">{unsplashError}</p>
              ) : null}
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
