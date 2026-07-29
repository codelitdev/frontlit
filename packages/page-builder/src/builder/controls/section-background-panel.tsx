"use client";

import React, { useMemo, useState } from "react";
import {
    Check,
    ChevronDown,
    ExternalLink,
    ImageIcon,
    Palette,
    Pin,
    Sparkles,
} from "lucide-react";
import type {
    BackgroundRepeat,
    BlendMode,
    SectionBackground,
    SectionBackgroundOverlay,
} from "../../models";
import { cn } from "../../primitives/lib/utils";
import { Switch } from "../../primitives/components/ui/switch";
import { ColorSelector } from "./color-selector";
import { PageBuilderSlider } from "./page-builder-slider";
import { PATTERN_PRESETS, type PatternPresetCategory } from "./pattern-presets";

interface SectionBackgroundPanelProps {
    value?: SectionBackground;
    onChange: (value: SectionBackground) => void;
    className?: string;
}

const BG_TYPES = [
    {
        type: "color" as const,
        label: "Color",
        description: "Solid fill",
        icon: Palette,
    },
    {
        type: "image" as const,
        label: "Image",
        description: "Photo or asset",
        icon: ImageIcon,
    },
    {
        type: "gradient" as const,
        label: "Pattern",
        description: "Texture or glow",
        icon: Sparkles,
    },
];

const BLEND_MODES: { label: string; value: BlendMode }[] = [
    { label: "Normal", value: "normal" },
    { label: "Multiply", value: "multiply" },
    { label: "Screen", value: "screen" },
    { label: "Overlay", value: "overlay" },
    { label: "Darken", value: "darken" },
    { label: "Lighten", value: "lighten" },
    { label: "Color Dodge", value: "color-dodge" },
    { label: "Color Burn", value: "color-burn" },
    { label: "Hard Light", value: "hard-light" },
    { label: "Soft Light", value: "soft-light" },
    { label: "Difference", value: "difference" },
    { label: "Exclusion", value: "exclusion" },
    { label: "Hue", value: "hue" },
    { label: "Saturation", value: "saturation" },
    { label: "Color", value: "color" },
    { label: "Luminosity", value: "luminosity" },
];

const BACKGROUND_REPEAT_OPTIONS: {
    label: string;
    value: BackgroundRepeat;
}[] = [
    { label: "No repeat", value: "no-repeat" },
    { label: "Repeat", value: "repeat" },
    { label: "Repeat X", value: "repeat-x" },
    { label: "Repeat Y", value: "repeat-y" },
    { label: "Space", value: "space" },
    { label: "Round", value: "round" },
];

const PATTERN_FILTERS: {
    id: "all" | PatternPresetCategory;
    label: string;
}[] = [
    { id: "all", label: "All" },
    { id: "tile", label: "Tiles" },
    { id: "glow", label: "Glows" },
];

const fieldLabelClass = "text-xs font-semibold tracking-tight text-foreground";
const fieldHintClass =
    "text-[11px] leading-relaxed text-muted-foreground break-words";
const controlClass =
    "box-border h-9 w-full min-w-0 max-w-full rounded-lg border border-input bg-muted/20 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20";
const textareaClass =
    "box-border min-h-[4.5rem] w-full min-w-0 max-w-full resize-y rounded-lg border border-input bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20 break-all";

function FieldLabel({
    htmlFor,
    children,
    hint,
    trailing,
}: {
    htmlFor?: string;
    children: React.ReactNode;
    hint?: string;
    trailing?: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
                <label htmlFor={htmlFor} className={fieldLabelClass}>
                    {children}
                </label>
                {hint ? <p className={fieldHintClass}>{hint}</p> : null}
            </div>
            {trailing ? (
                <div className="shrink-0 pt-0.5">{trailing}</div>
            ) : null}
        </div>
    );
}

function PanelInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={cn(controlClass, props.className)} />;
}

function PanelTextarea(
    props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
    return (
        <textarea
            {...props}
            className={cn(textareaClass, props.className)}
            spellCheck={false}
        />
    );
}

function PanelSelect<T extends string>({
    id,
    title,
    hint,
    value,
    onChange,
    options,
}: {
    id?: string;
    title: string;
    hint?: string;
    value: T;
    onChange: (value: T) => void;
    options: { label: string; value: T }[];
}) {
    return (
        <div className="space-y-2">
            <FieldLabel htmlFor={id} hint={hint}>
                {title}
            </FieldLabel>
            <select
                id={id}
                className={cn(
                    controlClass,
                    "cursor-pointer appearance-none pr-8",
                )}
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function SectionCard({
    title,
    description,
    children,
    className,
}: {
    title?: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "min-w-0 max-w-full overflow-hidden rounded-xl border border-border/70 bg-card/40 p-3 shadow-sm",
                className,
            )}
        >
            {(title || description) && (
                <div className="mb-3 space-y-0.5">
                    {title ? (
                        <p className="text-xs font-semibold text-foreground">
                            {title}
                        </p>
                    ) : null}
                    {description ? (
                        <p className={fieldHintClass}>{description}</p>
                    ) : null}
                </div>
            )}
            {children}
        </div>
    );
}

function CollapsibleCard({
    title,
    description,
    defaultOpen = false,
    children,
}: {
    title: string;
    description?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/70 bg-card/40 shadow-sm">
            <button
                type="button"
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">
                        {title}
                    </p>
                    {description ? (
                        <p className={fieldHintClass}>{description}</p>
                    ) : null}
                </div>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180",
                    )}
                    aria-hidden
                />
            </button>
            {open ? (
                <div className="min-w-0 space-y-4 border-t border-border/60 px-3 py-3">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

function FixedBackgroundToggle({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: (fixed: boolean) => void;
}) {
    return (
        <SectionCard>
            <div className="flex min-w-0 items-start gap-3">
                <span
                    className={cn(
                        "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        checked
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border/70 bg-muted/30 text-muted-foreground",
                    )}
                >
                    <Pin className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                        <label
                            htmlFor="bg-fixed-toggle"
                            className="text-xs font-semibold text-foreground"
                        >
                            Fixed background
                        </label>
                        <Switch
                            id="bg-fixed-toggle"
                            checked={checked}
                            onCheckedChange={onChange}
                            aria-describedby="bg-fixed-hint"
                        />
                    </div>
                    <p id="bg-fixed-hint" className={fieldHintClass}>
                        Keep the background still while the page scrolls —
                        content moves over a static surface.
                    </p>
                </div>
            </div>
        </SectionCard>
    );
}

function BackgroundPreview({ value }: { value: SectionBackground }) {
    const imageUrl =
        value.type === "image" && typeof value.media?.file === "string"
            ? value.media.file
            : undefined;

    const previewStyle: React.CSSProperties = (() => {
        if (value.type === "color") {
            return {
                backgroundColor: value.backgroundColor || "hsl(var(--muted))",
            };
        }
        if (value.type === "image") {
            return {
                backgroundColor: "hsl(var(--muted))",
                backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                backgroundSize: value.backgroundSize || "cover",
                backgroundPosition: value.backgroundPosition || "center",
                backgroundRepeat: value.backgroundRepeat || "no-repeat",
            };
        }
        return {
            backgroundColor: "hsl(var(--background))",
            backgroundImage: value.backgroundImage,
            backgroundSize: value.gradientBackgroundSize || "cover",
            backgroundPosition: value.gradientBackgroundPosition || "center",
            backgroundRepeat: value.gradientBackgroundRepeat || "no-repeat",
            WebkitMaskImage: value.gradientMaskImage,
            maskImage: value.gradientMaskImage,
        };
    })();

    const typeLabel =
        BG_TYPES.find((t) => t.type === value.type)?.label ?? "Background";

    return (
        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/70 shadow-sm">
            <div
                className="relative h-14 w-full max-w-full"
                style={previewStyle}
            >
                {value.type === "image" && imageUrl && (value.blur || 0) > 0 ? (
                    <div
                        className="absolute inset-0"
                        style={{
                            backdropFilter: `blur(${value.blur}px)`,
                        }}
                    />
                ) : null}
                {value.type === "image" && value.overlay?.color ? (
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundColor: value.overlay.color,
                            opacity: (value.overlay.opacity || 0) / 10,
                            mixBlendMode: value.overlay.blendMode || "normal",
                        }}
                    />
                ) : null}
                {value.type === "image" && !imageUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                        No image yet
                    </div>
                ) : null}
                {value.type === "gradient" && !value.backgroundImage ? (
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        Choose a pattern
                    </div>
                ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Preview
                </span>
                <span className="text-[11px] font-medium text-foreground">
                    {typeLabel}
                </span>
            </div>
        </div>
    );
}

/**
 * Section background editor for the Design tab. Segmented type switcher,
 * live preview, and card-grouped controls that write into the same
 * `SectionBackground` model as before.
 */
export function SectionBackgroundPanel({
    value = { type: "color" },
    onChange,
    className,
}: SectionBackgroundPanelProps) {
    const [patternFilter, setPatternFilter] = useState<
        "all" | PatternPresetCategory
    >("all");

    const handleTypeChange = (type: SectionBackground["type"]) => {
        onChange({ ...value, type });
    };

    const handleBackgroundChange = (updates: Partial<SectionBackground>) => {
        onChange({ ...value, ...updates });
    };

    const handleOverlayChange = (
        overlayUpdates: Partial<SectionBackgroundOverlay>,
    ) => {
        onChange({
            ...value,
            overlay: {
                color: "",
                blendMode: "normal",
                opacity: 0,
                ...value.overlay,
                ...overlayUpdates,
            },
        });
    };

    const filteredPresets = useMemo(
        () =>
            patternFilter === "all"
                ? PATTERN_PRESETS
                : PATTERN_PRESETS.filter((p) => p.category === patternFilter),
        [patternFilter],
    );

    return (
        <div className={cn("min-w-0 max-w-full space-y-3", className)}>
            {/* Type switcher */}
            <div
                role="tablist"
                aria-label="Background type"
                className="grid min-w-0 grid-cols-3 gap-1.5"
            >
                {BG_TYPES.map((tab) => {
                    const Icon = tab.icon;
                    const active = value.type === tab.type;
                    return (
                        <button
                            key={tab.type}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={cn(
                                "group flex min-w-0 flex-col items-start gap-1 rounded-xl border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                active
                                    ? "border-primary/50 bg-primary/8 shadow-sm"
                                    : "border-border/80 bg-muted/15 text-muted-foreground hover:border-primary/30 hover:bg-muted/40 hover:text-foreground",
                            )}
                            onClick={() => handleTypeChange(tab.type)}
                        >
                            <span
                                className={cn(
                                    "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                                    active
                                        ? "border-primary/30 bg-primary/15 text-primary"
                                        : "border-border/70 bg-background text-muted-foreground group-hover:text-foreground",
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <span className="min-w-0 space-y-0.5">
                                <span
                                    className={cn(
                                        "block truncate text-xs font-semibold leading-none",
                                        active
                                            ? "text-foreground"
                                            : "text-inherit",
                                    )}
                                >
                                    {tab.label}
                                </span>
                                <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                                    {tab.description}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <BackgroundPreview value={value} />

            {value.type === "color" && (
                <SectionCard
                    title="Fill colors"
                    description="Solid section background for light and dark appearance."
                >
                    <div className="space-y-4">
                        <ColorSelector
                            title="Light mode"
                            value={value.backgroundColor || ""}
                            onChange={(color) =>
                                handleBackgroundChange({
                                    backgroundColor: color,
                                })
                            }
                            allowReset={true}
                        />
                        <div className="border-t border-border/50 pt-4">
                            <ColorSelector
                                title="Dark mode"
                                value={value.backgroundColorDark || ""}
                                onChange={(color) =>
                                    handleBackgroundChange({
                                        backgroundColorDark: color,
                                    })
                                }
                                allowReset={true}
                                description="Optional override when the page is in dark mode"
                            />
                        </div>
                    </div>
                </SectionCard>
            )}

            {value.type === "image" && (
                <div className="space-y-3">
                    <FixedBackgroundToggle
                        checked={value.backgroundAttachment === "fixed"}
                        onChange={(fixed) =>
                            handleBackgroundChange({
                                backgroundAttachment: fixed
                                    ? "fixed"
                                    : "scroll",
                            })
                        }
                    />

                    <SectionCard
                        title="Source"
                        description="Paste a public image URL to use as the section backdrop."
                    >
                        <div className="space-y-2">
                            <FieldLabel htmlFor="background-image-url">
                                Image URL
                            </FieldLabel>
                            <div className="relative">
                                <ImageIcon
                                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden
                                />
                                <PanelInput
                                    id="background-image-url"
                                    value={(value.media?.file as string) || ""}
                                    onChange={(e) =>
                                        handleBackgroundChange({
                                            media: e.target.value
                                                ? { file: e.target.value }
                                                : {},
                                        })
                                    }
                                    placeholder="https://example.com/background.jpg"
                                    className="pl-9"
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Effects">
                        <PageBuilderSlider
                            title="Blur"
                            min={0}
                            max={20}
                            value={value.blur || 0}
                            onChange={(blur) =>
                                handleBackgroundChange({ blur: blur || 0 })
                            }
                            unit="px"
                            tooltip="Softens the image behind the content"
                        />
                    </SectionCard>

                    <CollapsibleCard
                        title="Overlay"
                        description="Tint the image for contrast with text"
                    >
                        <ColorSelector
                            title="Overlay color"
                            value={value.overlay?.color || ""}
                            onChange={(color) =>
                                handleOverlayChange({ color: color || "" })
                            }
                        />
                        <ColorSelector
                            title="Dark mode overlay"
                            value={value.overlay?.colorDark || ""}
                            onChange={(color) =>
                                handleOverlayChange({ colorDark: color })
                            }
                            allowReset={true}
                            description="Optional overlay when dark mode is active"
                        />
                        <PageBuilderSlider
                            title="Opacity"
                            min={0}
                            max={10}
                            value={value.overlay?.opacity || 0}
                            onChange={(opacity) =>
                                handleOverlayChange({
                                    opacity: opacity || 0,
                                })
                            }
                            unit=""
                            tooltip="0 is invisible, 10 is fully solid"
                        />
                        <PanelSelect
                            id="overlay-blend-mode"
                            title="Blend mode"
                            value={value.overlay?.blendMode || "normal"}
                            onChange={(mode) =>
                                handleOverlayChange({ blendMode: mode })
                            }
                            options={BLEND_MODES}
                        />
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Advanced"
                        description="Size, position, repeat, and CSS mask"
                    >
                        <div className="space-y-2">
                            <FieldLabel
                                htmlFor="image-background-size"
                                hint="e.g. cover, contain, 100%"
                            >
                                Background size
                            </FieldLabel>
                            <PanelInput
                                id="image-background-size"
                                value={value.backgroundSize || ""}
                                onChange={(e) =>
                                    handleBackgroundChange({
                                        backgroundSize: e.target.value,
                                    })
                                }
                                placeholder="cover"
                            />
                        </div>

                        <div className="space-y-2">
                            <FieldLabel
                                htmlFor="image-background-position"
                                hint="e.g. center, top left, 50% 50%"
                            >
                                Background position
                            </FieldLabel>
                            <PanelInput
                                id="image-background-position"
                                value={value.backgroundPosition || ""}
                                onChange={(e) =>
                                    handleBackgroundChange({
                                        backgroundPosition: e.target.value,
                                    })
                                }
                                placeholder="center"
                            />
                        </div>

                        <PanelSelect
                            id="image-background-repeat"
                            title="Background repeat"
                            value={value.backgroundRepeat || "no-repeat"}
                            onChange={(repeat) =>
                                handleBackgroundChange({
                                    backgroundRepeat: repeat,
                                })
                            }
                            options={BACKGROUND_REPEAT_OPTIONS}
                        />

                        <div className="space-y-2">
                            <FieldLabel
                                htmlFor="mask-image"
                                hint="CSS mask to fade or crop the image"
                                trailing={
                                    <a
                                        href="https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                    >
                                        Docs
                                        <ExternalLink
                                            className="h-3 w-3"
                                            aria-hidden
                                        />
                                    </a>
                                }
                            >
                                Mask image
                            </FieldLabel>
                            <PanelTextarea
                                id="mask-image"
                                value={value.maskImage || ""}
                                onChange={(e) =>
                                    handleBackgroundChange({
                                        maskImage: e.target.value || undefined,
                                    })
                                }
                                placeholder="linear-gradient(black, transparent)"
                                rows={2}
                            />
                        </div>
                    </CollapsibleCard>
                </div>
            )}

            {value.type === "gradient" && (
                <div className="space-y-3">
                    <FixedBackgroundToggle
                        checked={value.backgroundAttachment === "fixed"}
                        onChange={(fixed) =>
                            handleBackgroundChange({
                                backgroundAttachment: fixed
                                    ? "fixed"
                                    : "scroll",
                            })
                        }
                    />

                    <SectionCard
                        title="Presets"
                        description="One click fills the CSS fields below — edit anytime."
                    >
                        <div className="mb-3 flex flex-wrap gap-1.5">
                            {PATTERN_FILTERS.map((filter) => {
                                const active = patternFilter === filter.id;
                                return (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        className={cn(
                                            "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                            active
                                                ? "bg-primary text-primary-foreground shadow-sm"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                        onClick={() =>
                                            setPatternFilter(filter.id)
                                        }
                                    >
                                        {filter.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid max-h-52 min-w-0 grid-cols-3 gap-1.5 overflow-x-hidden overflow-y-auto">
                            {filteredPresets.map((preset) => {
                                const isSelected =
                                    value.backgroundImage ===
                                    preset.apply.backgroundImage;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        title={
                                            preset.description ?? preset.label
                                        }
                                        aria-pressed={isSelected}
                                        className={cn(
                                            "group relative flex min-w-0 flex-col overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            isSelected
                                                ? "border-primary/55 bg-primary/5 shadow-sm"
                                                : "border-border/80 bg-muted/10 hover:border-primary/35 hover:bg-muted/30",
                                        )}
                                        onClick={() =>
                                            handleBackgroundChange(preset.apply)
                                        }
                                    >
                                        <span
                                            className="relative h-12 w-full max-w-full bg-background"
                                            style={{
                                                backgroundImage:
                                                    preset.apply
                                                        .backgroundImage,
                                                backgroundSize:
                                                    preset.apply
                                                        .gradientBackgroundSize,
                                                backgroundRepeat:
                                                    preset.apply
                                                        .gradientBackgroundRepeat,
                                                backgroundPosition:
                                                    preset.apply
                                                        .gradientBackgroundPosition,
                                                WebkitMaskImage:
                                                    preset.apply
                                                        .gradientMaskImage,
                                                maskImage:
                                                    preset.apply
                                                        .gradientMaskImage,
                                            }}
                                            aria-hidden
                                        >
                                            {isSelected ? (
                                                <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                                    <Check
                                                        className="h-2.5 w-2.5"
                                                        aria-hidden
                                                    />
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="truncate border-t border-border/60 px-1 py-1 text-[10px] font-semibold leading-tight text-foreground">
                                            {preset.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Custom CSS"
                        description="Override or hand-author background-image values."
                    >
                        <div className="min-w-0 space-y-3.5">
                            <div className="min-w-0 space-y-2">
                                <FieldLabel
                                    htmlFor="gradient-css"
                                    hint="CSS background-image — gradients, SVG data URIs, etc."
                                >
                                    Light mode
                                </FieldLabel>
                                <PanelTextarea
                                    id="gradient-css"
                                    value={value.backgroundImage || ""}
                                    onChange={(e) =>
                                        handleBackgroundChange({
                                            backgroundImage: e.target.value,
                                        })
                                    }
                                    placeholder="linear-gradient(45deg, #ff0000, #0000ff)"
                                    rows={3}
                                />
                            </div>

                            <div className="min-w-0 space-y-2">
                                <FieldLabel
                                    htmlFor="gradient-css-dark"
                                    hint="Optional dark appearance override"
                                >
                                    Dark mode
                                </FieldLabel>
                                <PanelTextarea
                                    id="gradient-css-dark"
                                    value={value.backgroundImageDark || ""}
                                    onChange={(e) =>
                                        handleBackgroundChange({
                                            backgroundImageDark:
                                                e.target.value || undefined,
                                        })
                                    }
                                    placeholder="linear-gradient(45deg, #333333, #666666)"
                                    rows={3}
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <CollapsibleCard
                        title="Advanced"
                        description="Tile size, position, repeat, and mask"
                    >
                        <div className="space-y-2">
                            <FieldLabel
                                htmlFor="gradient-background-size"
                                hint="e.g. 24px 24px, cover, 100% 100%"
                            >
                                Background size
                            </FieldLabel>
                            <PanelInput
                                id="gradient-background-size"
                                value={value.gradientBackgroundSize || ""}
                                onChange={(e) =>
                                    handleBackgroundChange({
                                        gradientBackgroundSize: e.target.value,
                                    })
                                }
                                placeholder="cover"
                            />
                        </div>

                        <div className="space-y-2">
                            <FieldLabel
                                htmlFor="gradient-background-position"
                                hint="e.g. center, 0 0, top left"
                            >
                                Background position
                            </FieldLabel>
                            <PanelInput
                                id="gradient-background-position"
                                value={value.gradientBackgroundPosition || ""}
                                onChange={(e) =>
                                    handleBackgroundChange({
                                        gradientBackgroundPosition:
                                            e.target.value,
                                    })
                                }
                                placeholder="center"
                            />
                        </div>

                        <PanelSelect
                            id="gradient-background-repeat"
                            title="Background repeat"
                            value={
                                value.gradientBackgroundRepeat || "no-repeat"
                            }
                            onChange={(repeat) =>
                                handleBackgroundChange({
                                    gradientBackgroundRepeat: repeat,
                                })
                            }
                            options={BACKGROUND_REPEAT_OPTIONS}
                        />

                        <div className="space-y-2">
                            <FieldLabel
                                htmlFor="gradient-mask-image"
                                hint="CSS mask to fade edges or vignette"
                                trailing={
                                    <a
                                        href="https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                    >
                                        Docs
                                        <ExternalLink
                                            className="h-3 w-3"
                                            aria-hidden
                                        />
                                    </a>
                                }
                            >
                                Mask image
                            </FieldLabel>
                            <PanelTextarea
                                id="gradient-mask-image"
                                value={value.gradientMaskImage || ""}
                                onChange={(e) =>
                                    handleBackgroundChange({
                                        gradientMaskImage:
                                            e.target.value || undefined,
                                    })
                                }
                                placeholder="linear-gradient(black, transparent)"
                                rows={2}
                            />
                        </div>
                    </CollapsibleCard>

                    <div className="flex gap-2.5 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                            Need more inspiration? Browse{" "}
                            <a
                                href="https://patterncraft.fun"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                            >
                                PatternCraft
                            </a>{" "}
                            or{" "}
                            <a
                                href="https://magicpattern.design/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                            >
                                MagicPattern
                            </a>{" "}
                            and paste the CSS into Custom CSS.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
