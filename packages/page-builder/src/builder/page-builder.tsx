"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import type { PageData, PageSeo, Theme, WidgetInstance } from "../models";
import { PageRenderer } from "../renderer";
import { getAddableBlocks, getWidget } from "../registry";
import {
    createDefaultLayout,
    createWidgetInstance,
    ensureRequiredSharedWidgets,
    getDefaultTheme,
} from "../starter";
import { debounce, resolveColorMode, type ColorMode } from "../utils";
import { themes } from "../primitives";
import { cn } from "../primitives/lib/utils";
import type { PageBuilderLinkComponent } from "../components/nav-link";
import { BuilderTopBar, type PreviewDevice } from "./top-bar";
import { PreviewFrame } from "./preview-frame";
import { BlockPicker } from "./block-picker";
import { SettingsPanel } from "./settings-panel";
import { BlockSettings } from "./block-settings";
import { ThemeEditor } from "./theme-editor";
import { SeoEditor } from "./seo-editor";

export interface PageBuilderState {
    layout: WidgetInstance[];
    theme: Theme;
    seo: PageSeo;
    /** The user's own themes, created/edited from the theme panel. */
    customThemes: Theme[];
}

export interface PageBuilderProps {
    initialLayout?: WidgetInstance[];
    initialTheme?: Theme;
    initialSeo?: PageSeo;
    /**
     * Themes offered in the theme panel, categorized like CourseLit's
     * backend sends them: read-only `system` themes and the user's own
     * `custom` themes. Defaults to the built-in presets and no custom
     * themes. Editing a system theme copies it into the custom collection,
     * which flows back to the host via `onChange`.
     */
    themes?: { system?: Theme[]; custom?: Theme[] };
    pageData?: PageData;
    onChange?: (state: PageBuilderState) => void;
    /** Whether the editor may alter team-wide theme data. */
    allowThemeEditing?: boolean;
    /**
     * Optional host link (e.g. Next.js `Link`) forwarded to the live
     * preview's `PageRenderer`. Omit it to render native `<a>` tags.
     */
    linkComponent?: PageBuilderLinkComponent;
    className?: string;
}

/**
 * What the right-hand settings panel is currently showing. Structured as a
 * union so richer modes (e.g. a full theme editor, SEO, fonts) can slot in
 * later without changing the shell.
 */
type PanelState =
    | { mode: "block"; widgetId: string }
    | { mode: "theme" }
    | { mode: "seo" }
    | null;

/**
 * A self-contained, client-side WYSIWYG page builder: pick a theme, add/
 * remove/reorder blocks, and edit each block's settings from the side
 * panel. Holds all state in memory (via `onChange`, the host app decides
 * whether/how to persist it) — there is no backend dependency.
 */
export function PageBuilder({
    initialLayout,
    initialTheme,
    initialSeo,
    themes: providedThemes,
    pageData,
    onChange,
    allowThemeEditing = true,
    linkComponent,
    className,
}: PageBuilderProps) {
    const [layout, setLayout] = useState<WidgetInstance[]>(() =>
        initialLayout
            ? ensureRequiredSharedWidgets(initialLayout)
            : createDefaultLayout(),
    );
    const [theme, setTheme] = useState<Theme>(
        () => initialTheme ?? getDefaultTheme(),
    );
    const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
    const paintedTheme = previewTheme ?? theme;
    const [seo, setSeo] = useState<PageSeo>(
        () => initialSeo ?? { robotsAllowed: true },
    );
    const systemThemes = providedThemes?.system ?? themes;
    const [customThemes, setCustomThemes] = useState<Theme[]>(
        () => providedThemes?.custom ?? [],
    );
    const [mode, setMode] = useState<ColorMode>("system");
    const [systemPrefersDark, setSystemPrefersDark] = useState(false);
    const [device, setDevice] = useState<PreviewDevice>("desktop");
    const [panel, setPanel] = useState<PanelState>(null);
    const [insertAfter, setInsertAfter] = useState<string | "end" | null>(null);
    const [movedWidgetId, setMovedWidgetId] = useState<string | null>(null);
    const movedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (movedTimeoutRef.current) clearTimeout(movedTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const apply = () => setSystemPrefersDark(media.matches);
        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, []);

    const resolvedMode = resolveColorMode(mode, systemPrefersDark);

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const emitChange = useMemo(
        () =>
            debounce(
                (state: PageBuilderState) => onChangeRef.current?.(state),
                500,
            ),
        [],
    );

    useEffect(() => {
        emitChange({ layout, theme, seo, customThemes });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout, theme, seo, customThemes]);

    const addableBlocks = useMemo(() => getAddableBlocks(), []);

    function updateWidgetSettings(
        widgetId: string,
        settings: Record<string, unknown>,
    ) {
        setLayout((prev) =>
            prev.map((widget) =>
                widget.widgetId === widgetId ? { ...widget, settings } : widget,
            ),
        );
    }

    function moveWidget(widgetId: string, direction: -1 | 1) {
        const index = layout.findIndex((w) => w.widgetId === widgetId);
        if (
            index === -1 ||
            ["header", "footer"].includes(layout[index].name) ||
            !layout[index].moveable
        ) {
            return;
        }
        const targetIndex = index + direction;
        if (
            targetIndex < 0 ||
            targetIndex >= layout.length ||
            ["header", "footer"].includes(layout[targetIndex].name)
        ) {
            return;
        }
        setLayout((prev) => {
            const next = prev.slice();
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
        if (movedTimeoutRef.current) clearTimeout(movedTimeoutRef.current);
        setMovedWidgetId(widgetId);
        movedTimeoutRef.current = setTimeout(
            () => setMovedWidgetId(null),
            1500,
        );
    }

    function deleteWidget(widgetId: string) {
        setLayout((prev) => {
            const widget = prev.find((item) => item.widgetId === widgetId);
            if (
                !widget ||
                !widget.deletable ||
                ["header", "footer"].includes(widget.name)
            ) {
                return prev;
            }
            return prev.filter((item) => item.widgetId !== widgetId);
        });
        setPanel((current) =>
            current?.mode === "block" && current.widgetId === widgetId
                ? null
                : current,
        );
    }

    function addWidget(name: string) {
        const instance = createWidgetInstance(name);
        setLayout((prev) => {
            if (insertAfter === "end" || insertAfter === null) {
                const footerIndex = prev.findIndex((w) => w.name === "footer");
                if (footerIndex === -1) return [...prev, instance];
                return [
                    ...prev.slice(0, footerIndex),
                    instance,
                    ...prev.slice(footerIndex),
                ];
            }
            const afterIndex = prev.findIndex(
                (w) => w.widgetId === insertAfter,
            );
            if (afterIndex === -1) return [...prev, instance];
            return [
                ...prev.slice(0, afterIndex + 1),
                instance,
                ...prev.slice(afterIndex + 1),
            ];
        });
        setInsertAfter(null);
        // Newly added blocks should immediately reveal their settings. This is
        // especially important for intentionally empty blocks such as Embed:
        // without a configured URL or snippet they have no public rendering.
        setPanel({ mode: "block", widgetId: instance.widgetId });
    }

    const selectedWidgetId = panel?.mode === "block" ? panel.widgetId : null;
    const selectedInstance = layout.find(
        (w) => w.widgetId === selectedWidgetId,
    );
    const selectedDefinition = selectedInstance
        ? getWidget(selectedInstance.name)
        : undefined;

    const showBlockPanel = Boolean(
        panel?.mode === "block" &&
        selectedInstance &&
        selectedDefinition?.editor,
    );
    const showThemePanel = allowThemeEditing && panel?.mode === "theme";
    const showSeoPanel = panel?.mode === "seo";
    const panelOpen = showBlockPanel || showThemePanel || showSeoPanel;

    function closePanel() {
        setPreviewTheme(null);
        setPanel(null);
    }

    return (
        <div
            className={cn(
                // Same token scope as PageRenderer. Builder chrome (top bar,
                // add-block overlay, device-frame pattern) lives outside the
                // canvas but still uses bg-background / --muted-foreground.
                "pb-theme flex h-full w-full flex-col overflow-hidden bg-background text-foreground",
                resolvedMode === "dark" && "dark",
                className,
            )}
        >
            <BuilderTopBar
                resolvedMode={resolvedMode}
                onModeChange={setMode}
                device={device}
                onDeviceChange={setDevice}
                onOpenTheme={() => setPanel({ mode: "theme" })}
                onOpenSeo={() => setPanel({ mode: "seo" })}
                onAddBlock={() => setInsertAfter("end")}
                allowThemeEditing={allowThemeEditing}
            />
            <div className="flex min-h-0 w-full min-w-0 flex-1 gap-4 overflow-hidden bg-muted/10 p-4">
                <div
                    className={cn(
                        "flex min-h-0 min-w-0 justify-center overflow-hidden rounded-xl border bg-background/98 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80",
                        panelOpen ? "flex-1" : "w-full",
                    )}
                    style={{
                        backgroundImage:
                            "radial-gradient(color-mix(in srgb, var(--muted-foreground) 25%, transparent) 1px, transparent 1px)",
                        backgroundSize: "14px 14px",
                    }}
                >
                    <PreviewFrame
                        className={cn(
                            "h-full w-full max-w-full transition-[max-width] duration-300",
                            device === "mobile" && "max-w-[390px] border-x",
                            device === "tablet" && "max-w-[768px] border-x",
                        )}
                    >
                        <PageRenderer
                            layout={layout}
                            theme={paintedTheme}
                            pageData={pageData}
                            nextTheme={resolvedMode}
                            themeMode={mode}
                            onThemeModeChange={setMode}
                            editing
                            selectedWidgetId={selectedWidgetId ?? undefined}
                            highlightedWidgetId={movedWidgetId ?? undefined}
                            onSelectWidget={(id) =>
                                setPanel({ mode: "block", widgetId: id })
                            }
                            onMoveWidgetUp={(id) => moveWidget(id, -1)}
                            onMoveWidgetDown={(id) => moveWidget(id, 1)}
                            onDeleteWidget={deleteWidget}
                            onAddWidgetBelow={(id) => setInsertAfter(id)}
                            linkComponent={linkComponent}
                        />
                    </PreviewFrame>
                </div>
                {showBlockPanel &&
                    selectedInstance &&
                    selectedDefinition?.editor && (
                        <SettingsPanel
                            title={selectedDefinition.metadata.displayName}
                            eyebrow="Block settings"
                            description={
                                selectedDefinition.metadata.description
                            }
                            icon={LayoutTemplate}
                            onClose={closePanel}
                        >
                            <BlockSettings
                                key={selectedInstance.widgetId}
                                instance={selectedInstance}
                                definition={selectedDefinition}
                                theme={theme}
                                onChange={(settings) =>
                                    updateWidgetSettings(
                                        selectedInstance.widgetId,
                                        settings,
                                    )
                                }
                            />
                        </SettingsPanel>
                    )}
                {showThemePanel && (
                    <SettingsPanel title="Theme" onClose={closePanel}>
                        <ThemeEditor
                            theme={paintedTheme}
                            appliedThemeId={theme.id}
                            systemThemes={systemThemes}
                            customThemes={customThemes}
                            colorMode={resolvedMode}
                            onColorModeChange={setMode}
                            onPreview={setPreviewTheme}
                            onApply={(next) => {
                                setPreviewTheme(null);
                                setTheme(next);
                            }}
                            onCustomThemesChange={setCustomThemes}
                        />
                    </SettingsPanel>
                )}
                {showSeoPanel && (
                    <SettingsPanel title="SEO" onClose={closePanel}>
                        <SeoEditor seo={seo} onChange={setSeo} />
                    </SettingsPanel>
                )}
            </div>
            {insertAfter !== null && (
                <BlockPicker
                    blocks={addableBlocks}
                    onPick={addWidget}
                    onClose={() => setInsertAfter(null)}
                />
            )}
        </div>
    );
}
