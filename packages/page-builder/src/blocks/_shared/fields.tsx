"use client";

import React, { useId } from "react";
import { ImageIcon, Plus } from "lucide-react";
import { ImageUploadDialog } from "@frontlit/media-uploader";
import { Editor, emptyDoc } from "@frontlit/text-editor";
import { getMediaUrl, type Media } from "../../models/media";
import type { HeadingLevel, ResponsiveTextSize, TitleSettings } from "../../models";
import { cn } from "../../primitives/lib/utils";

/**
 * Lightweight, dependency-free form field primitives shared by every block's
 * settings editor. These intentionally stay simple (no media library, no
 * rich color pickers) so the page-builder package works without a backend.
 */

export function FieldGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 max-w-full flex-col gap-4 border-b border-border/80 pb-6 last:mb-0 last:border-0 last:pb-0">
      {title && (
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  hint,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** Short help text shown under the field. */
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = `field-${generatedId.replace(/:/g, "")}`;

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {multiline ? (
        <textarea
          id={inputId}
          className="min-h-24 resize-y rounded-lg border border-input bg-muted/20 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={inputId}
          className="h-9 rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

// Full class names so Tailwind can see them.
const RICH_TEXT_MIN_HEIGHT = {
  80: "min-h-[80px]",
  100: "min-h-[100px]",
  160: "min-h-[160px]",
};

/**
 * Rich-text field backed by the TipTap editor. Edits reach the draft (and
 * the canvas) almost immediately, and one still pending when the panel
 * closes is flushed rather than dropped.
 */
export function RichTextField({
  label,
  value,
  onChange,
  showToolbar = true,
  minHeight = 80,
}: {
  label: string;
  value?: any;
  onChange: (value: any) => void;
  showToolbar?: boolean;
  minHeight?: 80 | 100 | 160;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <Editor
        profile="documentation"
        initialContent={value ?? emptyDoc}
        onChange={onChange}
        debounceMs={150}
        showToolbar={showToolbar}
        editorClassName={RICH_TEXT_MIN_HEIGHT[minHeight]}
      />
    </div>
  );
}

const TITLE_SIZE_FIELDS: { key: keyof ResponsiveTextSize; label: string }[] = [
  { key: "mobile", label: "Phone" },
  { key: "tablet", label: "Tablet" },
  { key: "desktop", label: "Desktop" },
];

/** Heading element a block title renders as. */
export function TitleLevelField({
  settings,
  defaultLevel = "h2",
  onChange,
}: {
  settings: TitleSettings;
  defaultLevel?: HeadingLevel;
  onChange: (partial: TitleSettings) => void;
}) {
  return (
    <SelectField<HeadingLevel>
      label="Title heading level"
      value={settings.titleLevel ?? defaultLevel}
      onChange={(titleLevel) => onChange({ titleLevel })}
      options={[
        { label: "H1 — the page's main heading", value: "h1" },
        { label: "H2 — section heading", value: "h2" },
        { label: "H3 — sub-section heading", value: "h3" },
      ]}
    />
  );
}

/** Optional per-device title size; empty fields keep the theme's size. */
export function TitleSizeField({
  settings,
  onChange,
}: {
  settings: TitleSettings;
  onChange: (partial: TitleSettings) => void;
}) {
  const size = settings.titleSize ?? {};
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">Title size (px)</span>
      <div className="grid grid-cols-3 gap-2">
        {TITLE_SIZE_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <input
              type="number"
              min={8}
              max={200}
              placeholder="Theme"
              className="h-9 min-w-0 rounded-lg border border-input bg-muted/20 px-2 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
              value={size[key] ?? ""}
              onChange={(e) =>
                onChange({
                  titleSize: {
                    ...size,
                    [key]: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const generatedId = useId();
  const inputId = `field-${generatedId.replace(/:/g, "")}`;

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <input
        id={inputId}
        type="number"
        className="h-9 rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SliderField({
  label,
  value = 0,
  onChange,
  min = 0,
  max = 8,
  step = 1,
  unit = "",
  displayValue,
  minLabel,
  maxLabel,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  displayValue?: string;
  minLabel?: string;
  maxLabel?: string;
}) {
  const generatedId = useId();
  const inputId = `field-${generatedId.replace(/:/g, "")}`;
  const numValue = Number.isFinite(value) ? (value as number) : min;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-xs font-semibold text-foreground">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {displayValue && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {displayValue}
            </span>
          )}
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={numValue}
            onChange={(e) => {
              const parsed = Number(e.currentTarget.value);
              if (Number.isNaN(parsed)) return;
              onChange(Math.min(Math.max(parsed, min), max));
            }}
            className="h-7 w-12 rounded-md border border-input bg-muted/20 px-1.5 py-1 text-center text-xs font-semibold text-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
          />
          {unit && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer accent-primary"
      />
      {(minLabel || maxLabel) && (
        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: T;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
}) {
  const generatedId = useId();
  const inputId = `field-${generatedId.replace(/:/g, "")}`;

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <select
        id={inputId}
        className="h-9 w-full rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    // `relative` anchors the sr-only checkbox here. Without it the checkbox
    // is positioned against an ancestor outside the settings panel, and
    // focusing it scrolls the whole builder out of place.
    <label className="relative flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full bg-muted-foreground/25 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:shadow-sm after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
          value && "bg-primary after:translate-x-4",
        )}
      />
    </label>
  );
}

export function ListField<T>({
  label,
  items,
  onChange,
  renderItem,
  createItem,
  addLabel = "Add item",
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (
    item: T,
    update: (next: Partial<T>) => void,
    remove: () => void,
    index: number,
  ) => React.ReactNode;
  createItem: () => T;
  addLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/15 p-3.5 [&>button]:self-end [&>button]:rounded-md [&>button]:px-2 [&>button]:py-1 [&>button]:text-[11px] [&>button]:font-semibold [&>button]:transition-colors [&>button]:hover:bg-destructive/10"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Item {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            {renderItem(
              item,
              (next) => {
                const copy = items.slice();
                copy[index] = { ...item, ...next };
                onChange(copy);
              },
              () => {
                onChange(items.filter((_, i) => i !== index));
              },
              index,
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
        onClick={() => onChange([...items, createItem()])}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}

export function ImageField({
  label,
  value,
  onChange,
  placeholder = "https://...",
}: {
  label: string;
  value?: string | Media;
  onChange: (value: Media | undefined) => void;
  placeholder?: string;
}) {
  const imageUrl = getMediaUrl(value);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {imageUrl ? (
        <div className="space-y-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted/40">
            <img src={imageUrl} alt="Preview" className="h-full w-full object-cover" />
          </div>
          <div className="flex items-center gap-2">
            <ImageUploadDialog
              title={`Choose ${label.toLowerCase()}`}
              description="Upload an image or select one from your library."
              onSelect={(selected) => {
                const selMedia = selected.media as Record<string, unknown> | undefined;
                const mediaLitId =
                  (selMedia?.mediaLitId as string) ??
                  (selMedia?.mediaId as string) ??
                  undefined;
                onChange({
                  ...(mediaLitId ? { mediaId: mediaLitId, mediaLitId } : {}),
                  url: selected.src,
                  file: selected.src,
                  thumbnailUrl: (selMedia?.thumbnailUrl as string) ?? selected.src,
                  thumbnail: (selMedia?.thumbnailUrl as string) ?? selected.src,
                  alt: selected.alt,
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
              onClick={() => onChange(undefined)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <ImageUploadDialog
          title={`Choose ${label.toLowerCase()}`}
          description="Upload an image or select one from your library."
          onSelect={(selected) => {
            const selMedia = selected.media as Record<string, unknown> | undefined;
            const mediaLitId =
              (selMedia?.mediaLitId as string) ??
              (selMedia?.mediaId as string) ??
              undefined;
            onChange({
              ...(mediaLitId ? { mediaId: mediaLitId, mediaLitId } : {}),
              url: selected.src,
              file: selected.src,
              thumbnailUrl: (selMedia?.thumbnailUrl as string) ?? selected.src,
              thumbnail: (selMedia?.thumbnailUrl as string) ?? selected.src,
              alt: selected.alt,
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
      <input
        type="text"
        className="h-9 rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
        value={imageUrl ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value ? { url: e.target.value, file: e.target.value } : undefined,
          )
        }
      />
    </div>
  );
}
