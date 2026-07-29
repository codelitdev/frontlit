"use client";

import { useEffect, useState } from "react";
import {
    getChatbotSettings,
    searchDocs,
    updateChatbotSettings,
    type ChatbotSettings,
    type ChatbotWidgetStyle,
    type ChatbotWidgetVariant,
    type DocSearchResult,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";
import { Button } from "@/components/ui/codelit/button";
import { cn } from "@/lib/utils";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";

const VARIANTS: {
    id: ChatbotWidgetVariant;
    title: string;
    description: string;
}[] = [
    {
        id: "bubble",
        title: "Bubble",
        description: "Classic floating chat button in the corner.",
    },
    {
        id: "text_input",
        title: "Text input",
        description:
            "Centered bottom composer; chat opens above when visitors type.",
    },
];

const BUBBLE_SHAPES: {
    id: ChatbotWidgetStyle["bubbleShape"];
    label: string;
}[] = [
    { id: "circle", label: "Circle" },
    { id: "rounded", label: "Rounded" },
    { id: "square", label: "Square" },
];

const BUBBLE_ICONS: { id: ChatbotWidgetStyle["bubbleIcon"]; label: string }[] =
    [
        { id: "chat", label: "Chat" },
        { id: "message", label: "Message" },
        { id: "sparkles", label: "Sparkles" },
        { id: "bot", label: "Bot" },
    ];

const BUBBLE_SIZES: { id: ChatbotWidgetStyle["bubbleSize"]; label: string }[] =
    [
        { id: "sm", label: "S" },
        { id: "md", label: "M" },
        { id: "lg", label: "L" },
    ];

const INPUT_RADII: { id: ChatbotWidgetStyle["inputRadius"]; label: string }[] =
    [
        { id: "none", label: "None" },
        { id: "sm", label: "SM" },
        { id: "md", label: "MD" },
        { id: "lg", label: "LG" },
        { id: "full", label: "Full" },
    ];

const INPUT_WIDTHS: { id: ChatbotWidgetStyle["inputWidth"]; label: string }[] =
    [
        { id: "sm", label: "Narrow" },
        { id: "md", label: "Medium" },
        { id: "lg", label: "Wide" },
    ];

function OptionGroup<T extends string>({
    label,
    value,
    options,
    onChange,
    disabled,
}: {
    label: string;
    value: T;
    options: { id: T; label: string }[];
    onChange: (next: T) => void;
    disabled?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium">{label}</Label>
            <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(option.id)}
                        className={cn(
                            "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                            value === option.id
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-background text-foreground hover:bg-muted",
                            disabled && "opacity-50",
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function LauncherPreview({ settings }: { settings: ChatbotSettings }) {
    // Preview-only fallback; the live widget uses the site theme primary when accent is empty.
    const color = settings.accentColor || "#2563eb";
    const style = settings.widgetStyle;
    const size =
        style.bubbleSize === "sm" ? 44 : style.bubbleSize === "lg" ? 64 : 56;
    const radius =
        style.bubbleShape === "circle"
            ? 9999
            : style.bubbleShape === "rounded"
              ? 16
              : 8;
    const inputRadius =
        style.inputRadius === "none"
            ? 0
            : style.inputRadius === "sm"
              ? 6
              : style.inputRadius === "md"
                ? 10
                : style.inputRadius === "lg"
                  ? 16
                  : 9999;
    const inputWidth =
        style.inputWidth === "sm" ? 180 : style.inputWidth === "lg" ? 280 : 220;

    return (
        <div className="relative h-40 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
            <div className="absolute inset-x-0 top-0 border-b border-border/60 bg-background/80 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Live preview
            </div>
            <div
                className={
                    settings.variant === "bubble"
                        ? "absolute bottom-3 right-3 flex items-end justify-end"
                        : "absolute inset-x-3 bottom-3 flex items-end justify-center"
                }
            >
                {settings.variant === "bubble" ? (
                    <div
                        className="flex items-center justify-center text-white shadow-lg"
                        style={{
                            width: size,
                            height: size,
                            borderRadius: radius,
                            backgroundColor: color,
                        }}
                        aria-hidden
                    >
                        <PreviewIcon icon={style.bubbleIcon} />
                    </div>
                ) : (
                    <div className="flex w-full flex-col items-center gap-2">
                        <div
                            className="w-full max-w-[220px] rounded-lg border border-border bg-background px-2 py-2 text-[10px] text-muted-foreground shadow-sm"
                            aria-hidden
                        >
                            <span className="block truncate rounded-md bg-muted px-2 py-1">
                                Hi! How can I help?
                            </span>
                        </div>
                        <div
                            className="flex items-center gap-2 border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-md"
                            style={{
                                width: inputWidth,
                                maxWidth: "100%",
                                borderRadius: inputRadius,
                            }}
                        >
                            <span className="truncate">
                                {style.inputPlaceholder || "Ask a question…"}
                            </span>
                            <span
                                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                                style={{ backgroundColor: color }}
                                aria-hidden
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2.25}
                                    className="h-3 w-3"
                                >
                                    <path
                                        d="M12 19V5M5 12l7-7 7 7"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PreviewIcon({
    icon,
    className = "h-5 w-5",
}: {
    icon: ChatbotWidgetStyle["bubbleIcon"] | "chat";
    className?: string;
}) {
    if (icon === "message") {
        return (
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={className}
            >
                <path
                    d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }
    if (icon === "sparkles") {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2zm6 10l.9 3.1L22 16l-3.1.9L18 20l-.9-3.1L14 16l3.1-.9L18 12zM6 14l.7 2.3L9 17l-2.3.7L6 20l-.7-2.3L3 17l2.3-.7L6 14z" />
            </svg>
        );
    }
    if (icon === "bot") {
        return (
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={className}
            >
                <rect x="5" y="8" width="14" height="11" rx="3" />
                <path
                    d="M12 5v3M9 12h.01M15 12h.01M9 16h6"
                    strokeLinecap="round"
                />
            </svg>
        );
    }
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={className}
        >
            <path
                d="M4 4h16v12H7l-3 3V4z"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function ChatbotPage() {
    useSetBreadcrumb([
        { label: "Website", href: "/website/pages" },
        { label: "Chatbot" },
    ]);
    const [settings, setSettings] = useState<ChatbotSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testMessage, setTestMessage] = useState("");
    const [testAnswer, setTestAnswer] = useState<{
        answer: string;
        sources: DocSearchResult[];
    } | null>(null);
    const [asking, setAsking] = useState(false);

    useEffect(() => {
        getChatbotSettings()
            .then(setSettings)
            .finally(() => setLoading(false));
    }, []);

    async function save(patch: Parameters<typeof updateChatbotSettings>[0]) {
        setSaving(true);
        try {
            setSettings(await updateChatbotSettings(patch));
        } finally {
            setSaving(false);
        }
    }

    async function saveStyle(partial: Partial<ChatbotWidgetStyle>) {
        if (!settings) return;
        // Optimistic local merge so the preview updates immediately.
        setSettings({
            ...settings,
            widgetStyle: { ...settings.widgetStyle, ...partial },
        });
        await save({ widgetStyle: partial });
    }

    async function handleTest(e: React.FormEvent) {
        e.preventDefault();
        if (!testMessage.trim()) return;
        setAsking(true);
        setTestAnswer(null);
        try {
            const { items } = await searchDocs(testMessage.trim());
            setTestAnswer({
                answer: items[0]?.content ?? "No matching docs found.",
                sources: items,
            });
        } finally {
            setAsking(false);
        }
    }

    if (loading || !settings) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return (
        <ScrollablePage>
            <div className="max-w-xl space-y-6">
                <PageHeader title="Chatbot" />

                <Card>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label
                                htmlFor="chatbot-enabled"
                                className="text-sm font-medium"
                            >
                                Enabled
                            </Label>
                            <Switch
                                id="chatbot-enabled"
                                checked={settings.enabled}
                                onCheckedChange={(checked) =>
                                    save({ enabled: checked })
                                }
                                disabled={saving}
                                data-testid="chatbot-enabled-toggle"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-name">Assistant name</Label>
                            <Input
                                id="chatbot-name"
                                value={settings.name}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        name: e.target.value,
                                    })
                                }
                                onBlur={(e) => save({ name: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-greeting">Greeting</Label>
                            <Input
                                id="chatbot-greeting"
                                value={settings.greeting || ""}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        greeting: e.target.value,
                                    })
                                }
                                onBlur={(e) =>
                                    save({ greeting: e.target.value })
                                }
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-accent">Accent color</Label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="chatbot-accent"
                                    type="color"
                                    value={settings.accentColor || "#2563eb"}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            accentColor: e.target.value,
                                        })
                                    }
                                    onBlur={(e) =>
                                        save({
                                            accentColor: e.target.value || null,
                                        })
                                    }
                                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-1"
                                />
                                <Input
                                    value={settings.accentColor || ""}
                                    placeholder="Site theme primary"
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            accentColor: e.target.value || null,
                                        })
                                    }
                                    onBlur={(e) =>
                                        save({
                                            accentColor:
                                                e.target.value.trim() || null,
                                        })
                                    }
                                    className="font-mono text-xs"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Leave empty to use your homepage theme primary
                                (same as page buttons).
                            </p>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label
                                htmlFor="chatbot-escalation"
                                className="text-sm font-medium"
                            >
                                Offer &ldquo;talk to a human&rdquo;
                            </Label>
                            <Switch
                                id="chatbot-escalation"
                                checked={settings.escalationEnabled}
                                onCheckedChange={(checked) =>
                                    save({ escalationEnabled: checked })
                                }
                                disabled={saving}
                                data-testid="chatbot-escalation-toggle"
                            />
                        </div>
                        <p className="-mt-2 text-xs text-muted-foreground">
                            When the bot can&apos;t answer, it offers to raise a
                            support ticket with the conversation attached.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="space-y-5">
                        <div>
                            <h2 className="text-base font-semibold">
                                Launcher
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                How the chatbot appears on your public site.
                            </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {VARIANTS.map((variant) => (
                                <button
                                    key={variant.id}
                                    type="button"
                                    disabled={saving}
                                    onClick={() => {
                                        setSettings({
                                            ...settings,
                                            variant: variant.id,
                                        });
                                        void save({ variant: variant.id });
                                    }}
                                    className={cn(
                                        "rounded-lg border p-3 text-left transition-colors",
                                        settings.variant === variant.id
                                            ? "border-foreground bg-muted/50 ring-1 ring-foreground"
                                            : "border-border hover:bg-muted/30",
                                    )}
                                    data-testid={`chatbot-variant-${variant.id}`}
                                >
                                    <p className="text-sm font-medium">
                                        {variant.title}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {variant.description}
                                    </p>
                                </button>
                            ))}
                        </div>

                        <LauncherPreview settings={settings} />

                        {settings.variant === "bubble" ? (
                            <div className="space-y-4 border-t border-border pt-4">
                                <p className="text-sm font-medium">
                                    Bubble styles
                                </p>
                                <OptionGroup
                                    label="Shape"
                                    value={settings.widgetStyle.bubbleShape}
                                    options={BUBBLE_SHAPES}
                                    onChange={(bubbleShape) =>
                                        void saveStyle({ bubbleShape })
                                    }
                                    disabled={saving}
                                />
                                <OptionGroup
                                    label="Icon"
                                    value={settings.widgetStyle.bubbleIcon}
                                    options={BUBBLE_ICONS}
                                    onChange={(bubbleIcon) =>
                                        void saveStyle({ bubbleIcon })
                                    }
                                    disabled={saving}
                                />
                                <OptionGroup
                                    label="Size"
                                    value={settings.widgetStyle.bubbleSize}
                                    options={BUBBLE_SIZES}
                                    onChange={(bubbleSize) =>
                                        void saveStyle({ bubbleSize })
                                    }
                                    disabled={saving}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4 border-t border-border pt-4">
                                <p className="text-sm font-medium">
                                    Text input styles
                                </p>
                                <OptionGroup
                                    label="Rounded corners"
                                    value={settings.widgetStyle.inputRadius}
                                    options={INPUT_RADII}
                                    onChange={(inputRadius) =>
                                        void saveStyle({ inputRadius })
                                    }
                                    disabled={saving}
                                />
                                <OptionGroup
                                    label="Width"
                                    value={settings.widgetStyle.inputWidth}
                                    options={INPUT_WIDTHS}
                                    onChange={(inputWidth) =>
                                        void saveStyle({ inputWidth })
                                    }
                                    disabled={saving}
                                />
                                <div className="space-y-1.5">
                                    <Label htmlFor="chatbot-input-placeholder">
                                        Placeholder
                                    </Label>
                                    <Input
                                        id="chatbot-input-placeholder"
                                        value={
                                            settings.widgetStyle
                                                .inputPlaceholder || ""
                                        }
                                        placeholder="Ask a question…"
                                        onChange={(e) =>
                                            setSettings({
                                                ...settings,
                                                widgetStyle: {
                                                    ...settings.widgetStyle,
                                                    inputPlaceholder:
                                                        e.target.value || null,
                                                },
                                            })
                                        }
                                        onBlur={(e) =>
                                            void saveStyle({
                                                inputPlaceholder:
                                                    e.target.value || null,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div>
                    <h2 className="mb-2 text-lg font-semibold">
                        Test grounding
                    </h2>
                    <p className="mb-3 text-xs text-muted-foreground">
                        Preview which published doc chunks would ground an
                        answer to this question.
                    </p>
                    <form onSubmit={handleTest} className="mb-4 flex gap-2">
                        <Input
                            value={testMessage}
                            onChange={(e) => setTestMessage(e.target.value)}
                            placeholder="Ask a question…"
                            className="flex-1"
                        />
                        <Button type="submit" disabled={asking}>
                            {asking ? "Asking…" : "Test"}
                        </Button>
                    </form>
                    {testAnswer && (
                        <Card>
                            <CardContent className="text-sm">
                                <p className="mb-2">{testAnswer.answer}</p>
                                {testAnswer.sources.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Sources:{" "}
                                        {testAnswer.sources
                                            .map((s) => s.title)
                                            .join(", ")}
                                    </p>
                                )}
                                {testAnswer.sources.length === 0 &&
                                    settings.escalationEnabled && (
                                        <p className="mt-2 text-xs text-warning">
                                            No grounding found — the live widget
                                            would offer &ldquo;talk to a
                                            human&rdquo; here.
                                        </p>
                                    )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </ScrollablePage>
    );
}
