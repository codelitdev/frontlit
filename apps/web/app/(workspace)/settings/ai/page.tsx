"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, Sparkles } from "lucide-react";
import { defaultAiModels } from "@frontlit/api-contract";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    deleteAiConfig,
    getAiConfig,
    updateAiConfig,
    type AiConfig,
    type AiModelSettings,
    type AiProvider,
    type EmbeddingProvider,
} from "@/lib/api";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { Loading } from "@/components/workspace/loading";
import { PageHeader } from "@/components/workspace/page-header";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { Button } from "@/components/ui/codelit/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/codelit/card";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/codelit/select";

const PROVIDERS: Array<{
    value: AiProvider;
    label: string;
    dashboardUrl: string;
    dashboardLabel: string;
    apiKeyLabel?: string;
}> = [
    {
        value: "openai",
        label: "OpenAI",
        dashboardUrl: "https://platform.openai.com/api-keys",
        dashboardLabel: "OpenAI dashboard",
    },
    {
        value: "anthropic",
        label: "Anthropic",
        dashboardUrl: "https://console.anthropic.com/settings/keys",
        dashboardLabel: "Anthropic Console",
    },
    {
        value: "openrouter",
        label: "OpenRouter",
        dashboardUrl: "https://openrouter.ai/keys",
        dashboardLabel: "OpenRouter dashboard",
    },
    {
        value: "azure",
        label: "Azure OpenAI",
        dashboardUrl: "https://portal.azure.com/",
        dashboardLabel: "Azure portal",
        apiKeyLabel: "Azure OpenAI API key",
    },
    {
        value: "bedrock",
        label: "Amazon Bedrock",
        dashboardUrl: "https://console.aws.amazon.com/bedrock/",
        dashboardLabel: "AWS console",
        apiKeyLabel: "Bedrock API key",
    },
    {
        value: "opencode",
        label: "OpenCode Go",
        dashboardUrl: "https://opencode.ai/auth",
        dashboardLabel: "OpenCode",
    },
];

type Form = {
    provider: AiProvider;
    apiKey: string;
    region: string;
    endpoint: string;
};
const EMPTY_FORM: Form = {
    provider: "openai",
    apiKey: "",
    region: "us-east-1",
    endpoint: "",
};

function modelFormFromConfig(config: AiConfig): AiModelSettings {
    const defaults = defaultAiModels[config.provider];
    return {
        chatbot: config.models.chatbot || defaults.chatbot,
        grammar: config.models.grammar || defaults.grammar,
        builder: config.models.builder || defaults.builder,
    };
}

type EmbeddingForm = {
    provider: EmbeddingProvider;
    apiKey: string;
    endpoint: string;
    deployment: string;
};

const EMPTY_EMBEDDING_FORM: EmbeddingForm = {
    provider: "openai",
    apiKey: "",
    endpoint: "",
    deployment: "text-embedding-3-small",
};

function embeddingFormFromConfig(config: AiConfig): EmbeddingForm {
    return {
        provider: config.embedding?.provider || "openai",
        apiKey: "",
        endpoint: config.embedding?.endpoint || "",
        deployment: config.embedding?.deployment || "text-embedding-3-small",
    };
}

function formFromConfig(config: AiConfig): Form {
    const provider = PROVIDERS.find((item) => item.value === config.provider)!;
    return {
        provider: config.provider,
        apiKey: "",
        region: config.region || "us-east-1",
        endpoint: config.endpoint || "",
    };
}

function ModelInput({
    id,
    label,
    description,
    value,
    placeholder,
    onChange,
}: {
    id: string;
    label: string;
    description: string;
    value: string;
    placeholder: string | null;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder || undefined}
                required
            />
            <p className="text-xs text-muted-foreground">{description}</p>
        </div>
    );
}

export default function AiSettingsPage() {
    useSetBreadcrumb([{ label: "Settings" }, { label: "AI" }]);
    const [config, setConfig] = useState<AiConfig | null>(null);
    const [form, setForm] = useState<Form>(EMPTY_FORM);
    const [modelForm, setModelForm] = useState<AiModelSettings>(
        defaultAiModels.openai,
    );
    const [embeddingForm, setEmbeddingForm] =
        useState<EmbeddingForm>(EMPTY_EMBEDDING_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const selectedProvider = useMemo(
        () => PROVIDERS.find((provider) => provider.value === form.provider)!,
        [form.provider],
    );
    const usesProviderEmbeddings =
        form.provider === "openai" || form.provider === "azure";

    useEffect(() => {
        getAiConfig()
            .then((result) => {
                setConfig(result);
                if (result) {
                    setForm(formFromConfig(result));
                    setModelForm(modelFormFromConfig(result));
                    setEmbeddingForm(embeddingFormFromConfig(result));
                }
            })
            .catch((error) =>
                setLoadError(
                    error instanceof ApiError
                        ? error.message
                        : "Failed to load AI settings.",
                ),
            )
            .finally(() => setLoading(false));
    }, []);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (
            !form.apiKey.trim() &&
            !(config?.provider === form.provider && config.hasApiKey)
        ) {
            toast.error("Enter an API key to configure this provider.");
            return;
        }
        if (form.provider === "azure" && !form.endpoint.trim()) {
            toast.error("Enter your Azure OpenAI resource endpoint.");
            return;
        }
        if (
            !usesProviderEmbeddings &&
            config?.embedding &&
            config.embedding.provider !== embeddingForm.provider &&
            !embeddingForm.apiKey.trim()
        ) {
            toast.error("Enter an API key for the embedding provider.");
            return;
        }
        setSaving(true);
        try {
            const updated = await updateAiConfig({
                provider: form.provider,
                models: {
                    chatbot: modelForm.chatbot?.trim() || null,
                    grammar: modelForm.grammar?.trim() || null,
                    builder: modelForm.builder?.trim() || null,
                },
                region:
                    form.provider === "bedrock"
                        ? form.region.trim()
                        : undefined,
                endpoint:
                    form.provider === "azure"
                        ? form.endpoint.trim()
                        : undefined,
                apiKey: form.apiKey.trim() || undefined,
                embedding:
                    !usesProviderEmbeddings &&
                    (config?.embedding || embeddingForm.apiKey.trim())
                        ? {
                              provider: embeddingForm.provider,
                              apiKey: embeddingForm.apiKey.trim() || undefined,
                              endpoint:
                                  embeddingForm.provider === "azure"
                                      ? embeddingForm.endpoint.trim()
                                      : undefined,
                              deployment:
                                  embeddingForm.provider === "azure"
                                      ? embeddingForm.deployment.trim()
                                      : undefined,
                          }
                        : undefined,
            });
            setConfig(updated);
            setForm(formFromConfig(updated));
            setModelForm(modelFormFromConfig(updated));
            setEmbeddingForm(embeddingFormFromConfig(updated));
            toast.success("AI provider settings saved.");
        } catch (error) {
            toast.error(
                error instanceof ApiError ? error.message : "Failed to Save.",
            );
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        try {
            await deleteAiConfig();
            setConfig(null);
            setForm(EMPTY_FORM);
            setModelForm(defaultAiModels.openai);
            setEmbeddingForm(EMPTY_EMBEDDING_FORM);
            toast.success("AI provider configuration removed.");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to remove AI settings.",
            );
        }
    }

    if (loading) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return (
        <ScrollablePage>
            <div className="max-w-2xl space-y-6">
                <PageHeader
                    title="AI"
                    description="Configure your team’s AI credentials, models, and embedding provider."
                />

                {loadError && <Banner>{loadError}</Banner>}
                {!config && !loadError && (
                    <Banner variant="warning">
                        No AI provider is configured. AI features use the local
                        fallback until this team&rsquo;s settings are saved.
                    </Banner>
                )}

                <form onSubmit={save} className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Sparkles className="size-4" /> AI provider
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="provider">Provider</Label>
                                <Select
                                    value={form.provider}
                                    onValueChange={(provider) => {
                                        const next = PROVIDERS.find(
                                            (item) => item.value === provider,
                                        )!;
                                        setForm((current) => ({
                                            ...current,
                                            provider: provider as AiProvider,
                                        }));
                                        setModelForm(
                                            defaultAiModels[next.value],
                                        );
                                    }}
                                >
                                    <SelectTrigger
                                        id="provider"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROVIDERS.map((provider) => (
                                            <SelectItem
                                                key={provider.value}
                                                value={provider.value}
                                            >
                                                {provider.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {form.provider === "bedrock" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="region">AWS region</Label>
                                    <Input
                                        id="region"
                                        value={form.region}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                region: event.target.value,
                                            }))
                                        }
                                        placeholder="us-east-1"
                                        required
                                    />
                                </div>
                            )}

                            {form.provider === "azure" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="azureEndpoint">
                                        Azure OpenAI endpoint
                                    </Label>
                                    <Input
                                        id="azureEndpoint"
                                        type="url"
                                        value={form.endpoint}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                endpoint: event.target.value,
                                            }))
                                        }
                                        placeholder="https://your-resource.openai.azure.com/openai"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Use your Azure resource endpoint. The
                                        model IDs below are Azure deployment
                                        names.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="apiKey">
                                            {selectedProvider.apiKeyLabel ||
                                                `${selectedProvider.label} API key`}
                                        </Label>
                                        <Input
                                            id="apiKey"
                                            type="password"
                                            value={form.apiKey}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    apiKey: event.target.value,
                                                }))
                                            }
                                            placeholder={
                                                config?.provider ===
                                                    form.provider &&
                                                config.hasApiKey
                                                    ? "Saved — leave blank to retain"
                                                    : "Paste your API key"
                                            }
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        type="button"
                                        asChild
                                    >
                                        <a
                                            href={selectedProvider.dashboardUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Get API key{" "}
                                            <ExternalLink className="size-3.5" />
                                        </a>
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Create a key in the{" "}
                                    {selectedProvider.dashboardLabel}. It is
                                    encrypted before it is stored and is never
                                    shown again.
                                </p>
                                {usesProviderEmbeddings && (
                                    <p className="text-xs text-muted-foreground">
                                        Help-content embeddings automatically
                                        use this provider with{" "}
                                        <code>text-embedding-3-small</code>.
                                    </p>
                                )}
                                <Button type="submit" disabled={saving}>
                                    {saving
                                        ? "Saving…"
                                        : config
                                          ? "Save"
                                          : "Configure AI"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Sparkles className="size-4" /> Models
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Choose a model for each job. You can use a fast,
                                lower-cost model for short tasks and a more
                                capable one for generation.
                            </p>
                            <ModelInput
                                id="chatbotModel"
                                label="Support chatbot"
                                description="Answers help-center questions. A fast model is usually best."
                                value={modelForm.chatbot || ""}
                                placeholder={
                                    defaultAiModels[form.provider].chatbot
                                }
                                onChange={(value) =>
                                    setModelForm((current) => ({
                                        ...current,
                                        chatbot: value,
                                    }))
                                }
                            />
                            <ModelInput
                                id="grammarModel"
                                label="Grammar correction"
                                description="Short proofreading and rewrite requests."
                                value={modelForm.grammar || ""}
                                placeholder={
                                    defaultAiModels[form.provider].grammar
                                }
                                onChange={(value) =>
                                    setModelForm((current) => ({
                                        ...current,
                                        grammar: value,
                                    }))
                                }
                            />
                            <ModelInput
                                id="builderModel"
                                label="Page and email builder"
                                description="Longer content and layout generation. A more capable model is recommended."
                                value={modelForm.builder || ""}
                                placeholder={
                                    defaultAiModels[form.provider].builder
                                }
                                onChange={(value) =>
                                    setModelForm((current) => ({
                                        ...current,
                                        builder: value,
                                    }))
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                Enter any model available to{" "}
                                {selectedProvider.label}.
                            </p>
                            <Button type="submit" disabled={saving}>
                                {saving ? "Saving…" : "Save"}
                            </Button>
                        </CardContent>
                    </Card>

                    {!usesProviderEmbeddings && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <KeyRound className="size-4" /> Embeddings
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Used to index and search your help content
                                    with
                                    <code>text-embedding-3-small</code>.
                                </p>
                                <div className="space-y-1.5">
                                    <Label htmlFor="embeddingProvider">
                                        Provider
                                    </Label>
                                    <Select
                                        value={embeddingForm.provider}
                                        onValueChange={(provider) =>
                                            setEmbeddingForm((current) => ({
                                                ...current,
                                                provider:
                                                    provider as EmbeddingProvider,
                                            }))
                                        }
                                    >
                                        <SelectTrigger
                                            id="embeddingProvider"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="openai">
                                                OpenAI
                                            </SelectItem>
                                            <SelectItem value="azure">
                                                Azure OpenAI
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {embeddingForm.provider === "azure" && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="embeddingEndpoint">
                                                Azure OpenAI endpoint
                                            </Label>
                                            <Input
                                                id="embeddingEndpoint"
                                                type="url"
                                                value={embeddingForm.endpoint}
                                                onChange={(event) =>
                                                    setEmbeddingForm(
                                                        (current) => ({
                                                            ...current,
                                                            endpoint:
                                                                event.target
                                                                    .value,
                                                        }),
                                                    )
                                                }
                                                placeholder="https://your-resource.openai.azure.com/openai"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="embeddingDeployment">
                                                Deployment name
                                            </Label>
                                            <Input
                                                id="embeddingDeployment"
                                                value={embeddingForm.deployment}
                                                onChange={(event) =>
                                                    setEmbeddingForm(
                                                        (current) => ({
                                                            ...current,
                                                            deployment:
                                                                event.target
                                                                    .value,
                                                        }),
                                                    )
                                                }
                                                placeholder="text-embedding-3-small"
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="space-y-1.5">
                                    <Label htmlFor="embeddingApiKey">
                                        {embeddingForm.provider === "azure"
                                            ? "Azure OpenAI API key"
                                            : "OpenAI API key"}
                                    </Label>
                                    <Input
                                        id="embeddingApiKey"
                                        type="password"
                                        value={embeddingForm.apiKey}
                                        onChange={(event) =>
                                            setEmbeddingForm((current) => ({
                                                ...current,
                                                apiKey: event.target.value,
                                            }))
                                        }
                                        placeholder={
                                            config?.embedding?.provider ===
                                                embeddingForm.provider &&
                                            config.embedding.hasApiKey
                                                ? "Saved — leave blank to retain"
                                                : "Paste your API key"
                                        }
                                        autoComplete="new-password"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        The key is encrypted before storage and
                                        is never shown again.
                                    </p>
                                </div>
                                <Button type="submit" disabled={saving}>
                                    {saving ? "Saving…" : "Save"}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        {config && (
                            <DeleteConfirm
                                title="Remove AI provider configuration?"
                                description="This team’s AI features will return to the local fallback until another provider is configured."
                                onConfirm={remove}
                                trigger={
                                    <Button type="button" variant="outline">
                                        Remove
                                    </Button>
                                }
                            />
                        )}
                    </div>
                </form>
            </div>
        </ScrollablePage>
    );
}
