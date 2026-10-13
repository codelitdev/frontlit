"use client";

import React from "react";
import { ImageIcon } from "lucide-react";
import { ImageUploadDialog } from "@frontlit/media-uploader";
import type { PageSeo } from "../models";
import { getMediaUrl } from "../models/media";
import { FieldGroup, TextField, ToggleField } from "../blocks/_shared/fields";

/**
 * Page-level SEO settings panel. Like the block and theme editors, changes
 * apply live — the host app persists them via the builder's `onChange`.
 */
export function SeoEditor({
  seo,
  onChange,
}: {
  seo: PageSeo;
  onChange: (seo: PageSeo) => void;
}) {
  const update = (next: Partial<PageSeo>) => onChange({ ...seo, ...next });
  const imageUrl = getMediaUrl(seo.socialImage);

  return (
    <div className="flex flex-col">
      <FieldGroup title="Search results">
        <TextField
          label="Title"
          value={seo.title}
          placeholder="Page title"
          onChange={(title) => update({ title })}
        />
        <TextField
          label="Description"
          multiline
          value={seo.description}
          placeholder="A short summary of this page"
          onChange={(description) => update({ description })}
        />
        <ToggleField
          label="Search engine visibility"
          value={seo.robotsAllowed ?? true}
          onChange={(robotsAllowed) => update({ robotsAllowed })}
        />
      </FieldGroup>
      <FieldGroup title="Social card image">
        {imageUrl ? (
          <div className="space-y-2">
            <img
              src={imageUrl}
              alt="Social card preview"
              className="aspect-[1200/630] w-full rounded-md border border-border object-cover"
            />
            <div className="flex items-center gap-2">
              <ImageUploadDialog
                title="Change social card image"
                description="Upload an image or pick one from your library."
                onSelect={(selected) => {
                  const selMedia = selected.media as
                    | Record<string, unknown>
                    | undefined;
                  const mediaLitId =
                    (selMedia?.mediaLitId as string) ??
                    (selMedia?.mediaId as string) ??
                    undefined;
                  update({
                    socialImage: {
                      ...(mediaLitId ? { mediaId: mediaLitId, mediaLitId } : {}),
                      url: selected.src,
                      file: selected.src,
                      thumbnailUrl: (selMedia?.thumbnailUrl as string) ?? selected.src,
                      thumbnail: (selMedia?.thumbnailUrl as string) ?? selected.src,
                      alt: selected.alt,
                    },
                  });
                }}
              >
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                  Change image
                </button>
              </ImageUploadDialog>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-lg border border-destructive/30 bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
                onClick={() => update({ socialImage: undefined })}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <ImageUploadDialog
            title="Choose social card image"
            description="Upload an image or pick one from your library."
            onSelect={(selected) => {
              const selMedia = selected.media as Record<string, unknown> | undefined;
              const mediaLitId =
                (selMedia?.mediaLitId as string) ??
                (selMedia?.mediaId as string) ??
                undefined;
              update({
                socialImage: {
                  ...(mediaLitId ? { mediaId: mediaLitId, mediaLitId } : {}),
                  url: selected.src,
                  file: selected.src,
                  thumbnailUrl: (selMedia?.thumbnailUrl as string) ?? selected.src,
                  thumbnail: (selMedia?.thumbnailUrl as string) ?? selected.src,
                  alt: selected.alt,
                },
              });
            }}
          >
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
            >
              <ImageIcon className="h-4 w-4" />
              Upload or choose image
            </button>
          </ImageUploadDialog>
        )}
        <TextField
          label="Or paste image URL"
          value={imageUrl ?? ""}
          placeholder="https://..."
          onChange={(url) =>
            update({
              socialImage: url ? { url, file: url } : undefined,
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          Shown when the page is shared on social networks. Recommended size 1200×630.
        </p>
      </FieldGroup>
    </div>
  );
}
