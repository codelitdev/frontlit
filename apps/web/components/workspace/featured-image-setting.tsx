"use client";

import { ImageIcon, Trash2 } from "lucide-react";
import { ImageUploadDialog } from "@frontlit/media-uploader";
import type { FrontLitImage } from "@/lib/frontlit-image-uploader";
import {
  getFeaturedImageAlt,
  getFeaturedImageUrl,
  toFeaturedImageRef,
} from "@/lib/featured-image";
import { Button } from "@/components/ui/codelit/button";
import { Label } from "@/components/ui/codelit/label";

interface FeaturedImageSettingProps {
  image?: Record<string, unknown> | null;
  onChange: (image: Record<string, unknown> | null) => void;
  disabled?: boolean;
}

export function FeaturedImageSetting({
  image,
  onChange,
  disabled = false,
}: FeaturedImageSettingProps) {
  const imageUrl = getFeaturedImageUrl(image);
  const imageAlt = getFeaturedImageAlt(image);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>Featured image</Label>
        {imageUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Remove
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown on doc cards, social share previews, and article headers.
      </p>
      {imageUrl ? (
        <div className="mt-3 space-y-2">
          <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted/40">
            <img src={imageUrl} alt={imageAlt} className="h-full w-full object-cover" />
          </div>
          <ImageUploadDialog<FrontLitImage>
            onSelect={(selected) => onChange(toFeaturedImageRef(selected))}
            title="Change featured image"
            description="Upload a new image or pick one from your media library."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={disabled}
            >
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              Change featured image
            </Button>
          </ImageUploadDialog>
        </div>
      ) : (
        <div className="mt-3">
          <ImageUploadDialog<FrontLitImage>
            onSelect={(selected) => onChange(toFeaturedImageRef(selected))}
            title="Add featured image"
            description="Upload an image or pick one from your media library."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={disabled}
            >
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              Add featured image
            </Button>
          </ImageUploadDialog>
        </div>
      )}
    </div>
  );
}
