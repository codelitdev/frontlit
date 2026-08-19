"use client";

import React, { useCallback, useState } from "react";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Columns3,
    Palette,
    SquareMousePointer,
    Type,
} from "lucide-react";
import type { Theme, ThemeStyle, Typography } from "../../models";
import { cn } from "../../primitives/lib/utils";
import { generateUniqueId } from "../../utils";
import { ColorSelector } from "../controls";
import { ThemeCard } from "./theme-card";
import { TypographySelector } from "./typography-selector";
import {
    InteractiveSelector,
    interactiveDisplayNames,
    type InteractiveType,
} from "./interactive-selector";
import { StructureSelector, structureDisplayNames } from "./structure-selector";
import { AccordionSection, PanelInput, PanelLabel } from "./ui";

type Section = {
    id: string;
    label: string;
    icon: React.ReactNode;
};

type NavigationItem = {
    id: string;
    label: string;
};

const sections: Section[] = [
    {
        id: "colors",
        label: "Colors",
        icon: <Palette className="h-4 w-4" />,
    },
    {
        id: "typography",
        label: "Typography",
        icon: <Type className="h-4 w-4" />,
    },
    {
        id: "interactives",
        label: "Interactives",
        icon: <SquareMousePointer className="h-4 w-4" />,
    },
    {
        id: "structure",
        label: "Structure",
        icon: <Columns3 className="h-4 w-4" />,
    },
];

const typographyDisplayNames: Record<string, string> = {
    header1: "Header 1",
    header2: "Header 2",
    header3: "Header 3",
    header4: "Header 4",
    preheader: "Preheader",
    subheader1: "Subheader 1",
    subheader2: "Subheader 2",
    text1: "Text 1",
    text2: "Text 2",
    caption: "Caption",
    link: "Link",
    button: "Button Text",
    input: "Input Text",
} as const;

const typographyCategories: { name: string; items: string[] }[] = [
    {
        name: "Headers",
        items: ["header1", "header2", "header3", "header4", "preheader"],
    },
    {
        name: "Subheaders",
        items: ["subheader1", "subheader2"],
    },
    {
        name: "Body Text",
        items: ["text1", "text2", "caption"],
    },
    {
        name: "Interactive Elements",
        items: ["link", "button", "input"],
    },
];

type ColorName = keyof ThemeStyle["colors"]["light"];

const colorCategories: {
    key: string;
    label: string;
    colors: { name: ColorName; displayName: string }[];
}[] = [
    {
        key: "primary",
        label: "Primary Colors",
        colors: [
            { name: "primary", displayName: "Primary" },
            { name: "primaryForeground", displayName: "Primary Foreground" },
        ],
    },
    {
        key: "secondary",
        label: "Secondary Colors",
        colors: [
            { name: "secondary", displayName: "Secondary" },
            {
                name: "secondaryForeground",
                displayName: "Secondary Foreground",
            },
        ],
    },
    {
        key: "accent",
        label: "Accent Colors",
        colors: [
            { name: "accent", displayName: "Accent" },
            { name: "accentForeground", displayName: "Accent Foreground" },
        ],
    },
    {
        key: "base",
        label: "Base Colors",
        colors: [
            { name: "background", displayName: "Background" },
            { name: "foreground", displayName: "Foreground" },
        ],
    },
    {
        key: "card",
        label: "Card Colors",
        colors: [
            { name: "card", displayName: "Card" },
            { name: "cardForeground", displayName: "Card Foreground" },
        ],
    },
    {
        key: "popover",
        label: "Popover Colors",
        colors: [
            { name: "popover", displayName: "Popover" },
            { name: "popoverForeground", displayName: "Popover Foreground" },
        ],
    },
    {
        key: "muted",
        label: "Muted Colors",
        colors: [
            { name: "muted", displayName: "Muted" },
            { name: "mutedForeground", displayName: "Muted Foreground" },
        ],
    },
    {
        key: "border",
        label: "Border & Input Colors",
        colors: [
            { name: "border", displayName: "Border" },
            { name: "input", displayName: "Input" },
            { name: "ring", displayName: "Ring" },
        ],
    },
    {
        key: "destructive",
        label: "Destructive Colors",
        colors: [{ name: "destructive", displayName: "Destructive" }],
    },
    {
        key: "shadows",
        label: "Shadow Styles",
        colors: [
            { name: "shadow2xs", displayName: "Shadow 2XS" },
            { name: "shadowXs", displayName: "Shadow XS" },
            { name: "shadowSm", displayName: "Shadow SM" },
            { name: "shadowMd", displayName: "Shadow MD" },
            { name: "shadowLg", displayName: "Shadow LG" },
            { name: "shadowXl", displayName: "Shadow XL" },
            { name: "shadow2xl", displayName: "Shadow 2XL" },
        ],
    },
];

const paletteColorOrder: ColorName[] = [
    "primary",
    "accent",
    "secondary",
    "border",
];

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Picks a name for a copy of `baseName`: "X - Copy", then "X - Copy 2",
 * "X - Copy 3", … — mirroring CourseLit's server-side copy naming.
 */
function copyName(baseName: string, taken: string[]): string {
    const base = `${baseName} - Copy`;
    if (!taken.includes(base)) return base;
    let counter = 2;
    while (taken.includes(`${base} ${counter}`)) counter++;
    return `${base} ${counter}`;
}

export interface ThemeEditorProps {
    /** Theme currently painted on the canvas (applied, or a local preview). */
    theme: Theme;
    /** Id of the theme actually applied to the site. */
    appliedThemeId: string;
    /** Built-in themes; read-only, editing one creates a custom copy. */
    systemThemes: Theme[];
    /** The user's own themes; edited in place. */
    customThemes: Theme[];
    colorMode: "light" | "dark";
    onColorModeChange: (mode: "light" | "dark") => void;
    /** Paint a theme on the canvas without applying it. */
    onPreview: (theme: Theme) => void;
    /** Apply a theme to the page. */
    onApply: (theme: Theme) => void;
    /** Persist a change to the custom themes collection. */
    onCustomThemesChange: (themes: Theme[]) => void;
}

/**
 * Visual theme editor ported from CourseLit's page-editor theme editor.
 * Themes are listed in two groups — system and custom. Clicking a card
 * previews it on the canvas without applying it. Each card also offers
 * "use" (check) and "edit" (pencil). Editing a system theme first copies
 * it into the custom collection ("X - Copy"), so system themes stay
 * pristine; custom themes are edited in place. The host app persists both
 * the applied theme and the custom collection via the builder's `onChange`.
 */
export function ThemeEditor({
    theme,
    appliedThemeId,
    systemThemes,
    customThemes,
    colorMode,
    onColorModeChange,
    onPreview,
    onApply,
    onCustomThemesChange,
}: ThemeEditorProps) {
    const [navigationStack, setNavigationStack] = useState<NavigationItem[]>(
        [],
    );
    const [collapsedCategories, setCollapsedCategories] = useState<
        Record<string, boolean>
    >(() => {
        const initial: Record<string, boolean> = {};
        typographyCategories.forEach((category) => {
            initial[category.name] = true;
        });
        return initial;
    });

    const navigateTo = useCallback((item: NavigationItem) => {
        setNavigationStack((prev) => [...prev, item]);
    }, []);

    const navigateBack = useCallback(() => {
        setNavigationStack((prev) => prev.slice(0, -1));
    }, []);

    const toggleCategory = useCallback((categoryName: string) => {
        setCollapsedCategories((prev) => ({
            ...prev,
            [categoryName]: !prev[categoryName],
        }));
    }, []);

    /**
     * Applies an edited style to the theme being edited (always a custom
     * theme — `startEditing` guarantees it) and persists it in the custom
     * themes collection.
     */
    const applyStyle = useCallback(
        (style: ThemeStyle) => {
            const updated = { ...theme, theme: style };
            onApply(updated);
            onCustomThemesChange(
                customThemes.map((t) => (t.id === updated.id ? updated : t)),
            );
        },
        [theme, customThemes, onApply, onCustomThemesChange],
    );

    /**
     * Opens a theme for editing. System themes are copied into the custom
     * collection first ("X - Copy"), so the original stays pristine; the
     * copy (or the custom theme itself) becomes the applied theme.
     */
    const startEditing = useCallback(
        (themeItem: Theme, isSystem: boolean) => {
            let target = themeItem;
            if (isSystem) {
                const takenNames = [...systemThemes, ...customThemes].map(
                    (t) => t.name,
                );
                target = {
                    id: generateUniqueId(),
                    name: copyName(themeItem.name, takenNames),
                    theme: JSON.parse(JSON.stringify(themeItem.theme)),
                };
                onCustomThemesChange([...customThemes, target]);
            }
            onApply(target);
            setNavigationStack([{ id: "categories", label: target.name }]);
        },
        [systemThemes, customThemes, onApply, onCustomThemesChange],
    );

    const renderDrillButton = (label: string, onClick: () => void) => (
        <button
            key={label}
            onClick={onClick}
            className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-xs transition-colors hover:bg-muted"
        >
            <span className="transition-colors group-hover:text-foreground">
                {label}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
    );

    const renderThemeCard = (themeItem: Theme, isSystem: boolean) => (
        <ThemeCard
            key={themeItem.id}
            name={themeItem.name}
            palette={paletteColorOrder
                .map((key) => themeItem.theme.colors.light[key])
                .filter(Boolean)}
            selected={themeItem.id === theme.id}
            active={themeItem.id === appliedThemeId}
            onPreview={() => onPreview(themeItem)}
            onUse={() => onApply(themeItem)}
            onEdit={() => startEditing(themeItem, isSystem)}
        />
    );

    const renderRootView = () => (
        <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">
                System Themes
            </div>
            <div className="space-y-2">
                {systemThemes.map((themeItem) =>
                    renderThemeCard(themeItem, true),
                )}
            </div>
            <hr className="my-4 border-muted" />
            <div className="text-sm font-medium text-muted-foreground">
                Custom Themes
            </div>
            <div className="space-y-2">
                {customThemes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                        No custom themes yet
                    </div>
                ) : (
                    customThemes.map((themeItem) =>
                        renderThemeCard(themeItem, false),
                    )
                )}
            </div>
        </div>
    );

    const renderCategoriesView = () => (
        <div className="space-y-1">
            {sections.map((section) => (
                <button
                    key={section.id}
                    onClick={() =>
                        navigateTo({
                            id: section.id,
                            label: section.label,
                        })
                    }
                    className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                    <div className="flex items-center gap-3">
                        <div className="text-muted-foreground transition-colors group-hover:text-foreground">
                            {section.icon}
                        </div>
                        <span className="transition-colors group-hover:text-foreground">
                            {section.label}
                        </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </button>
            ))}
        </div>
    );

    const renderColorsView = () => {
        const colors = theme.theme.colors[colorMode];

        const updateColor = (name: ColorName, value: string) => {
            applyStyle({
                ...theme.theme,
                colors: {
                    ...theme.theme.colors,
                    [colorMode]: {
                        ...theme.theme.colors[colorMode],
                        [name]: value,
                    },
                },
            });
        };

        return (
            <div className="space-y-4">
                <div
                    role="tablist"
                    className="grid w-full grid-cols-2 rounded-md border border-input bg-muted p-0.5"
                >
                    {(["light", "dark"] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={colorMode === mode}
                            className={cn(
                                "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                                colorMode === mode
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => onColorModeChange(mode)}
                        >
                            {capitalize(mode)}
                        </button>
                    ))}
                </div>
                <div className="space-y-4">
                    {colorCategories.map((category) => (
                        <AccordionSection
                            key={category.key}
                            title={category.label}
                        >
                            <div className="flex flex-col gap-3">
                                {category.colors.map((color) =>
                                    category.key === "shadows" ? (
                                        <div
                                            key={color.name}
                                            className="space-y-1.5"
                                        >
                                            <PanelLabel>
                                                {color.displayName}
                                            </PanelLabel>
                                            <PanelInput
                                                value={colors[color.name]}
                                                onChange={(e) =>
                                                    updateColor(
                                                        color.name,
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                    ) : (
                                        <ColorSelector
                                            key={color.name}
                                            title={color.displayName}
                                            value={colors[color.name]}
                                            onChange={(value) =>
                                                updateColor(
                                                    color.name,
                                                    value ?? "",
                                                )
                                            }
                                            allowReset={false}
                                        />
                                    ),
                                )}
                            </div>
                        </AccordionSection>
                    ))}
                </div>
            </div>
        );
    };

    const renderTypographyList = () => (
        <div className="space-y-1">
            {typographyCategories.map((category) => (
                <div key={category.name} className="mb-2">
                    <button
                        type="button"
                        className="flex w-full items-center rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                        onClick={() => toggleCategory(category.name)}
                    >
                        <ChevronDown
                            className={cn(
                                "mr-2 h-4 w-4 transition-transform",
                                collapsedCategories[category.name]
                                    ? "rotate-[-90deg]"
                                    : "rotate-0",
                            )}
                        />
                        <span className="text-sm font-medium text-muted-foreground">
                            {category.name}
                        </span>
                    </button>
                    {!collapsedCategories[category.name] && (
                        <div>
                            {category.items.map((typography) =>
                                renderDrillButton(
                                    typographyDisplayNames[typography] ||
                                        capitalize(typography),
                                    () =>
                                        navigateTo({
                                            id: typography,
                                            label:
                                                typographyDisplayNames[
                                                    typography
                                                ] || capitalize(typography),
                                        }),
                                ),
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderInteractivesList = () => (
        <div className="space-y-1">
            {Object.keys(interactiveDisplayNames).map((interactive) =>
                renderDrillButton(
                    interactiveDisplayNames[interactive] ||
                        capitalize(interactive),
                    () =>
                        navigateTo({
                            id: interactive,
                            label:
                                interactiveDisplayNames[interactive] ||
                                capitalize(interactive),
                        }),
                ),
            )}
        </div>
    );

    const renderStructureList = () => (
        <div className="space-y-1">
            {Object.keys(structureDisplayNames).map((structure) =>
                renderDrillButton(
                    structureDisplayNames[structure] || capitalize(structure),
                    () =>
                        navigateTo({
                            id: structure,
                            label:
                                structureDisplayNames[structure] ||
                                capitalize(structure),
                        }),
                ),
            )}
        </div>
    );

    const getCurrentView = () => {
        const currentItem = navigationStack[navigationStack.length - 1];
        const parentItem = navigationStack[navigationStack.length - 2];

        if (!currentItem) {
            return renderRootView();
        }

        if (
            parentItem?.id === "typography" &&
            currentItem.id in theme.theme.typography
        ) {
            const key = currentItem.id as keyof ThemeStyle["typography"];
            return (
                <TypographySelector
                    value={theme.theme.typography[key]}
                    onChange={(value: Typography) =>
                        applyStyle({
                            ...theme.theme,
                            typography: {
                                ...theme.theme.typography,
                                [key]: value,
                            },
                        })
                    }
                />
            );
        }

        if (
            parentItem?.id === "interactives" &&
            currentItem.id in theme.theme.interactives
        ) {
            return (
                <InteractiveSelector
                    type={currentItem.id as InteractiveType}
                    theme={theme.theme}
                    onChange={applyStyle}
                />
            );
        }

        if (
            parentItem?.id === "structure" &&
            currentItem.id in theme.theme.structure
        ) {
            return (
                <StructureSelector
                    type={currentItem.id as "page" | "section"}
                    theme={theme.theme}
                    onChange={applyStyle}
                />
            );
        }

        switch (currentItem.id) {
            case "categories":
                return renderCategoriesView();
            case "colors":
                return renderColorsView();
            case "typography":
                return renderTypographyList();
            case "interactives":
                return renderInteractivesList();
            case "structure":
                return renderStructureList();
            default:
                return (
                    <p className="text-xs text-muted-foreground">Coming soon</p>
                );
        }
    };

    return (
        <div>
            {navigationStack.length === 0 && (
                <div className="space-y-4">{getCurrentView()}</div>
            )}
            {navigationStack.length > 0 && (
                <>
                    <div className="flex items-center gap-2 pb-2">
                        <button
                            onClick={navigateBack}
                            className="flex items-center rounded-md p-1 transition-colors hover:bg-muted focus:outline-none"
                            aria-label="Back"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium text-muted-foreground">
                            {navigationStack[navigationStack.length - 1].label}
                        </span>
                    </div>
                    <div className="py-2">{getCurrentView()}</div>
                </>
            )}
        </div>
    );
}
