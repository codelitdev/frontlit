import { MediaUploadDialog, type MediaUploadDialogProps } from "./media-upload-dialog";
import { resolveMediaUploaderLabels } from "./labels";
import type { LibraryImage, SelectedImage } from "./types";

const DEFAULT_IMAGE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const DEFAULT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export type ImageUploadDialogProps<TMedia extends LibraryImage = LibraryImage> =
  MediaUploadDialogProps<TMedia>;

/**
 * Specialized image uploader dialog.
 * Pre-configured with image-only MIME filters, image alt-text metadata mode, and image descriptions.
 * Drop-in backward-compatible component.
 */
export function ImageUploadDialog<TMedia extends LibraryImage = LibraryImage>({
  acceptedTypes = DEFAULT_IMAGE_ACCEPTED_TYPES,
  maxUploadBytes = DEFAULT_IMAGE_MAX_BYTES,
  title,
  metadataMode = "alt",
  onSelect,
  labels,
  ...props
}: ImageUploadDialogProps<TMedia>) {
  return (
    <MediaUploadDialog<TMedia>
      acceptedTypes={acceptedTypes}
      maxUploadBytes={maxUploadBytes}
      title={title ?? resolveMediaUploaderLabels(labels).selectImageTitle}
      metadataMode={metadataMode}
      onSelect={(selected: SelectedImage<TMedia>) => onSelect(selected)}
      labels={labels}
      {...props}
    />
  );
}

export { MediaUploadDialog };
export type { MediaUploadDialogProps };
