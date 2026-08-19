import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type ReactNode,
} from "react";
import { ImageIcon, Search, Upload } from "lucide-react";
import { formatFileSize } from "./format-file-size";
import { useImageUploaderAdapters } from "./image-uploader-provider";
import type {
    ImageUploaderAdapters,
    LibraryImage,
    SelectedImage,
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

const DEFAULT_ACCEPTED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
];
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ImageUploadDialogProps<TMedia extends LibraryImage = LibraryImage> =
    Partial<ImageUploaderAdapters<TMedia>> & {
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        onSelect: (image: SelectedImage<TMedia>) => void;
        title?: string;
        description?: string;
        children?: ReactNode;
        disabled?: boolean;
        allowUnsplash?: boolean;
        allowExistingMedia?: boolean;
        acceptedTypes?: string[];
        maxUploadBytes?: number;
    };

function defaultDescription(
    allowExistingMedia: boolean,
    allowUnsplash: boolean,
) {
    if (allowExistingMedia && allowUnsplash) {
        return "Upload a new image, choose one from the library, or pick from Unsplash.";
    }
    if (allowExistingMedia) {
        return "Upload a new image or choose one from the library.";
    }
    if (allowUnsplash) {
        return "Upload a new image or pick from Unsplash.";
    }
    return "Upload a new image.";
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function ImageUploadDialog<TMedia extends LibraryImage = LibraryImage>({
    open,
    onOpenChange,
    onSelect,
    title = "Select image",
    description,
    children,
    disabled = false,
    allowUnsplash = true,
    allowExistingMedia = true,
    acceptedTypes = DEFAULT_ACCEPTED_TYPES,
    maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
    uploadImage: uploadImageProp,
    listMedia: listMediaProp,
    searchUnsplash: searchUnsplashProp,
    isUploading: isUploadingProp,
    uploadProgress: uploadProgressProp,
    cancelUpload: cancelUploadProp,
}: ImageUploadDialogProps<TMedia>) {
    const adapters = useImageUploaderAdapters<TMedia>({
        uploadImage: uploadImageProp,
        listMedia: listMediaProp,
        searchUnsplash: searchUnsplashProp,
        isUploading: isUploadingProp,
        uploadProgress: uploadProgressProp,
        cancelUpload: cancelUploadProp,
    });
    const {
        uploadImage,
        listMedia,
        searchUnsplash,
        isUploading = false,
        uploadProgress = 0,
        cancelUpload,
    } = adapters;
    const showExistingMedia = allowExistingMedia && Boolean(listMedia);
    const showUnsplash = allowUnsplash && Boolean(searchUnsplash);
    const resolvedDescription =
        description ?? defaultDescription(showExistingMedia, showUnsplash);
    const tabCount = 1 + (showExistingMedia ? 1 : 0) + (showUnsplash ? 1 : 0);
    const [activeTab, setActiveTab] = useState("upload");
    const [file, setFile] = useState<File | null>(null);
    const [alt, setAlt] = useState("");
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
    const [unsplashConfigured, setUnsplashConfigured] = useState<
        boolean | null
    >(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const resolvedOpen = isControlled ? open : internalOpen;

    function resetFields() {
        setFile(null);
        setAlt("");
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

    function selectImage(image: SelectedImage<TMedia>) {
        onSelect(image);
        closeDialog();
    }

    function confirmSelectedMedia() {
        if (!selectedMedia) return;
        selectImage({
            src: selectedMedia.url,
            alt: selectedMedia.alt || selectedMedia.fileName || "Image",
            media: selectedMedia,
        });
    }

    function validateFile(selected: File) {
        if (
            !selected.type.startsWith("image/") ||
            !acceptedTypes.includes(selected.type)
        ) {
            setFileError("Only JPEG, PNG, GIF, and WebP images are supported.");
            setFile(null);
            return;
        }
        if (selected.size > maxUploadBytes) {
            setFileError(
                `Image is too large. Maximum size is ${formatFileSize(maxUploadBytes)}.`,
            );
            setFile(null);
            return;
        }
        setFileError("");
        setUploadError("");
        setFile(selected);
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files?.[0];
        event.target.value = "";
        if (selected) validateFile(selected);
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setIsDragging(false);
        const dropped = event.dataTransfer.files[0];
        if (dropped) validateFile(dropped);
    }

    async function handleUpload() {
        if (!file) return;
        setUploadError("");
        try {
            const media = await uploadImage(file, {
                alt: alt || file.name,
            });
            selectImage({
                src: media.url,
                alt: media.alt || file.name,
                media,
            });
        } catch (error) {
            setUploadError(errorMessage(error, "Failed to upload image."));
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
                current && items.some((item) => item.id === current.id)
                    ? current
                    : null,
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
        selectImage({
            src: trimmedUrl,
            alt: unsplashAlt.trim() || "Unsplash image",
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
        if (
            showUnsplash &&
            activeTab === "unsplash" &&
            unsplashConfigured === null
        ) {
            void loadUnsplashConfig();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, showExistingMedia, showUnsplash]);

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
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{resolvedDescription}</DialogDescription>
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    {tabCount > 1 ? (
                        <TabsList
                            className={`grid w-full ${tabCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}
                        >
                            <TabsTrigger value="upload">Upload</TabsTrigger>
                            {showExistingMedia ? (
                                <TabsTrigger value="media">
                                    Your media
                                </TabsTrigger>
                            ) : null}
                            {showUnsplash ? (
                                <TabsTrigger value="unsplash">
                                    Unsplash
                                </TabsTrigger>
                            ) : null}
                        </TabsList>
                    ) : null}
                    <TabsContent value="upload" className="space-y-4 py-4">
                        <div
                            onDragOver={(event) => {
                                event.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 ${
                                isDragging
                                    ? "border-primary bg-primary/5"
                                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                            } ${file ? "bg-primary/5" : ""} ${
                                fileError
                                    ? "border-destructive bg-destructive/5"
                                    : ""
                            }`}
                            style={{
                                pointerEvents: isUploading ? "none" : "auto",
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={acceptedTypes.join(",")}
                                className="hidden"
                                disabled={isUploading}
                                onChange={handleFileChange}
                            />
                            <Upload
                                className={`mb-2 size-6 ${
                                    fileError
                                        ? "text-destructive"
                                        : isDragging || file
                                          ? "text-primary"
                                          : "text-muted-foreground"
                                }`}
                            />
                            <p className="text-sm font-medium text-muted-foreground">
                                {file ? file.name : "Drop image here or click"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {file
                                    ? formatFileSize(file.size)
                                    : `JPEG, PNG, GIF, or WebP · up to ${formatFileSize(maxUploadBytes)}`}
                            </p>
                            {fileError ? (
                                <p className="mt-2 text-xs text-destructive">
                                    {fileError}
                                </p>
                            ) : null}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="image-alt">Alt text</Label>
                            <Input
                                id="image-alt"
                                value={alt}
                                onChange={(event) => setAlt(event.target.value)}
                                placeholder="Describe the image"
                                disabled={isUploading}
                            />
                        </div>
                        {uploadError ? (
                            <p className="text-sm text-destructive">
                                {uploadError}
                            </p>
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
                                    : "Upload image"}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                    {showExistingMedia ? (
                        <TabsContent value="media" className="space-y-4 py-4">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Search library"
                                    value={mediaQuery}
                                    onChange={(event) =>
                                        setMediaQuery(event.target.value)
                                    }
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
                                <p className="text-sm text-destructive">
                                    {mediaError}
                                </p>
                            ) : null}
                            {loadingMedia ? (
                                <p className="text-sm text-muted-foreground">
                                    Loading library…
                                </p>
                            ) : mediaItems.length ? (
                                <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto pr-1">
                                    {mediaItems.map((item) => {
                                        const isSelected =
                                            selectedMedia?.id === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                aria-pressed={isSelected}
                                                className={`overflow-hidden rounded-md border bg-background text-left hover:border-primary ${
                                                    isSelected
                                                        ? "border-primary ring-2 ring-primary/30"
                                                        : ""
                                                }`}
                                                onClick={() =>
                                                    setSelectedMedia(item)
                                                }
                                            >
                                                <div className="aspect-square bg-muted">
                                                    <img
                                                        src={
                                                            item.thumbnailUrl ||
                                                            item.url
                                                        }
                                                        alt={
                                                            item.alt ||
                                                            item.fileName ||
                                                            ""
                                                        }
                                                        className="size-full object-cover"
                                                    />
                                                </div>
                                                <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                                                    {item.alt ||
                                                        item.fileName ||
                                                        "Image"}
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
                        <TabsContent
                            value="unsplash"
                            className="space-y-4 py-4"
                        >
                            {unsplashConfigured === false ? (
                                <>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="unsplash-url">
                                            Unsplash URL
                                        </Label>
                                        <Input
                                            id="unsplash-url"
                                            placeholder="https://images.unsplash.com/..."
                                            value={unsplashUrl}
                                            onChange={(event) => {
                                                setUnsplashUrl(
                                                    event.target.value,
                                                );
                                                setUnsplashError("");
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="unsplash-alt">
                                            Alt text
                                        </Label>
                                        <Input
                                            id="unsplash-alt"
                                            placeholder="Describe the image"
                                            value={unsplashAlt}
                                            onChange={(event) =>
                                                setUnsplashAlt(
                                                    event.target.value,
                                                )
                                            }
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
                                            onChange={(event) =>
                                                setUnsplashQuery(
                                                    event.target.value,
                                                )
                                            }
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
                                            onClick={() =>
                                                void runUnsplashSearch()
                                            }
                                            disabled={loadingUnsplash}
                                        >
                                            <Search className="size-4" />
                                        </Button>
                                    </div>
                                    {loadingUnsplash ? (
                                        <p className="text-sm text-muted-foreground">
                                            Searching Unsplash…
                                        </p>
                                    ) : unsplashResults.length ? (
                                        <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto pr-1">
                                            {unsplashResults.map((photo) => (
                                                <button
                                                    key={photo.id}
                                                    type="button"
                                                    className="overflow-hidden rounded-md border bg-background text-left hover:border-primary"
                                                    onClick={() =>
                                                        selectImage({
                                                            src: photo.url,
                                                            alt:
                                                                photo.alt ||
                                                                "Unsplash image",
                                                        })
                                                    }
                                                >
                                                    <div className="aspect-square bg-muted">
                                                        <img
                                                            src={photo.thumbUrl}
                                                            alt={
                                                                photo.alt ||
                                                                "Unsplash"
                                                            }
                                                            className="size-full object-cover"
                                                        />
                                                    </div>
                                                    <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                                                        {photo.photographer ||
                                                            "Unsplash"}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </>
                            )}
                            {unsplashError ? (
                                <p className="text-sm text-destructive">
                                    {unsplashError}
                                </p>
                            ) : null}
                        </TabsContent>
                    ) : null}
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
