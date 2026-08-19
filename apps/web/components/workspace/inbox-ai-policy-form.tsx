"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    updateInboxAiSettings,
    type InboxAiChannel,
    type InboxAiPolicy,
    type InboxAiPolicyPatch,
} from "@/lib/api";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";

const EMPTY: InboxAiPolicy = {
    channel: "chatbot",
    autoReply: false,
    escalateOnVisitorRequest: true,
    escalateWhenUnsure: true,
    escalateTopics: [],
    escalateAfterBotTurns: null,
    createdAt: null,
    updatedAt: null,
};

export function InboxAiPolicyForm({
    channel,
    initial,
    aiConfigured,
    readOnly,
}: {
    channel: InboxAiChannel;
    initial?: InboxAiPolicy;
    aiConfigured: boolean;
    readOnly?: boolean;
}) {
    const [policy, setPolicy] = useState<InboxAiPolicy>(
        initial ?? { ...EMPTY, channel },
    );
    const [topicsText, setTopicsText] = useState(
        (initial?.escalateTopics ?? []).join(", "),
    );
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            const topics = topicsText
                .split(",")
                .map((topic) => topic.trim())
                .filter(Boolean);
            const patch: InboxAiPolicyPatch = {
                autoReply: policy.autoReply,
                escalateOnVisitorRequest: policy.escalateOnVisitorRequest,
                escalateWhenUnsure: policy.escalateWhenUnsure,
                escalateTopics: topics,
                escalateAfterBotTurns: policy.escalateAfterBotTurns,
            };
            const updated = await updateInboxAiSettings({ [channel]: patch });
            const next = updated.channels[channel];
            if (next) {
                setPolicy(next);
                setTopicsText(next.escalateTopics.join(", "));
            }
            toast.success("Inbox AI settings saved.");
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "Failed to save inbox AI settings.",
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            {!aiConfigured && (
                <p className="text-sm text-muted-foreground">
                    Configure AI in{" "}
                    <Link href="/settings/ai" className="underline">
                        Settings
                    </Link>{" "}
                    before enabling auto-reply.
                </p>
            )}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <Label htmlFor={`${channel}-auto-reply`}>
                        Use AI to auto-reply
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        Answers from published help articles on the same thread,
                        then hands off to a human when needed.
                    </p>
                </div>
                <Switch
                    id={`${channel}-auto-reply`}
                    checked={policy.autoReply}
                    disabled={readOnly || saving || !aiConfigured}
                    onCheckedChange={(checked) =>
                        setPolicy({ ...policy, autoReply: checked })
                    }
                />
            </div>
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${channel}-visitor`}>
                    Escalate when the visitor asks for a human
                </Label>
                <Switch
                    id={`${channel}-visitor`}
                    checked={policy.escalateOnVisitorRequest}
                    disabled={readOnly || saving}
                    onCheckedChange={(checked) =>
                        setPolicy({
                            ...policy,
                            escalateOnVisitorRequest: checked,
                        })
                    }
                />
            </div>
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${channel}-unsure`}>
                    When help articles miss, offer a human (wait for
                    confirmation)
                </Label>
                <Switch
                    id={`${channel}-unsure`}
                    checked={policy.escalateWhenUnsure}
                    disabled={readOnly || saving}
                    onCheckedChange={(checked) =>
                        setPolicy({ ...policy, escalateWhenUnsure: checked })
                    }
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${channel}-topics`}>
                    Topics the AI should escalate (similar meaning counts)
                </Label>
                <Input
                    id={`${channel}-topics`}
                    value={topicsText}
                    disabled={readOnly || saving}
                    placeholder="refund, cancel, legal"
                    onChange={(event) => setTopicsText(event.target.value)}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${channel}-cap`}>
                    Escalate after this many bot answers
                </Label>
                <Input
                    id={`${channel}-cap`}
                    type="number"
                    min={1}
                    max={100}
                    disabled={readOnly || saving}
                    value={policy.escalateAfterBotTurns ?? ""}
                    placeholder="No cap"
                    onChange={(event) => {
                        const raw = event.target.value;
                        setPolicy({
                            ...policy,
                            escalateAfterBotTurns: raw ? Number(raw) : null,
                        });
                    }}
                />
            </div>
            {!readOnly && (
                <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                >
                    {saving ? "Saving…" : "Save AI policy"}
                </Button>
            )}
        </div>
    );
}
