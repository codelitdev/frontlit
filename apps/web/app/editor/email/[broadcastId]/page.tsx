"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { defaultEmail, EmailEditor, type Email } from "@sendlit/email-blocks";
import { ApiError } from "@/lib/api-client";
import {
    type Broadcast,
    getEmailSettings,
    listBroadcasts,
    sendBroadcast,
    updateBroadcast,
    type ContactFilter,
} from "@/lib/api";
import { BroadcastAudienceFilter } from "@/components/email/broadcast-audience-filter";
import { EMPTY_CONTACT_FILTER } from "@/lib/contact-filters";
import { FullScreenLoading } from "@/components/workspace/loading";
import { Banner } from "@/components/workspace/banner";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type EditableBroadcast = {
    broadcast: Broadcast;
    body: Email;
    managedFooter?: Email["content"][number];
};

const MARKETING_VARIABLES = [
    { tag: "{{ subscriber.email }}", description: "Subscriber's email" },
    { tag: "{{ subscriber.name }}", description: "Subscriber's name" },
    { tag: "{{ subscriber.tags }}", description: "Subscriber's tags" },
];

function cloneEmail(email: Email): Email {
    return JSON.parse(JSON.stringify(email)) as Email;
}

function editorDocumentFromBody(
    body: Broadcast["body"],
): Pick<EditableBroadcast, "body" | "managedFooter"> {
    if (
        body &&
        typeof body === "object" &&
        Array.isArray((body as { content?: unknown }).content) &&
        typeof (body as { style?: unknown }).style === "object" &&
        typeof (body as { meta?: unknown }).meta === "object"
    ) {
        const email = cloneEmail(body as unknown as Email);
        const footer = email.content.at(-1);
        if (footer?.blockType === "footer") {
            return {
                body: { ...email, content: email.content.slice(0, -1) },
                managedFooter: footer,
            };
        }
        return { body: email };
    }
    return { body: cloneEmail(defaultEmail) };
}

/** Chrome-free, full-viewport editor for one SendLit-backed broadcast. */
export default function EmailBroadcastEditorPage({
    params,
}: {
    params: Promise<{ broadcastId: string }>;
}) {
    const { broadcastId } = use(params);
    const [editable, setEditable] = useState<EditableBroadcast | null>(null);
    const [subject, setSubject] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);
    const [saved, setSaved] = useState(false);
    const [audience, setAudience] = useState(EMPTY_CONTACT_FILTER);
    const bodyRef = useRef<Email | null>(null);

    useEffect(() => {
        getEmailSettings()
            .then((settings) => {
                if (!settings.connected) {
                    setError(
                        "Configure the email delivery connection in Settings first.",
                    );
                    return null;
                }
                return listBroadcasts();
            })
            .then((result) => {
                if (!result) return;
                const broadcast = result.items.find(
                    (item) => item.broadcastId === broadcastId,
                );
                if (!broadcast) {
                    setError("Broadcast not found.");
                    return;
                }
                const document = editorDocumentFromBody(broadcast.body);
                bodyRef.current = document.body;
                setSubject(broadcast.subject || broadcast.name);
                setAudience(broadcast.filter ?? EMPTY_CONTACT_FILTER);
                setEditable({ broadcast, ...document });
            })
            .catch((err) =>
                setError(
                    err instanceof ApiError
                        ? err.message
                        : "Failed to load broadcast.",
                ),
            );
    }, [broadcastId]);

    const handleBodyChange = useCallback((body: Email) => {
        bodyRef.current = body;
    }, []);

    async function save(): Promise<Broadcast | null> {
        if (!editable || !bodyRef.current) return null;

        setSaving(true);
        setError(null);
        try {
            const nextSubject = subject.trim() || editable.broadcast.name;
            const updated = await updateBroadcast(
                editable.broadcast.broadcastId,
                {
                    // SendLit broadcasts mirror sequence title onto the email
                    // subject; a subject-only PATCH is ignored.
                    name: nextSubject,
                    subject: nextSubject,
                    body: {
                        ...bodyRef.current,
                        content: editable.managedFooter
                            ? [
                                  ...bodyRef.current.content,
                                  editable.managedFooter,
                              ]
                            : bodyRef.current.content,
                    } as unknown as Record<string, unknown>,
                    filter: audience as ContactFilter,
                },
            );
            setEditable((current) =>
                current ? { ...current, broadcast: updated } : current,
            );
            setSubject(updated.subject || updated.name);
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
            return updated;
        } catch (err) {
            setError(
                err instanceof ApiError ? err.message : "Failed to save draft.",
            );
            return null;
        } finally {
            setSaving(false);
        }
    }

    async function saveAndSend() {
        const updated = await save();
        if (!updated) return;

        setSending(true);
        try {
            await sendBroadcast(updated.broadcastId);
            toast.success("Broadcast sent.");
            window.location.assign("/email?tab=broadcasts");
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Failed to send broadcast.",
            );
            setSending(false);
        }
    }

    if (error && !editable) {
        return (
            <div className="flex h-dvh items-center justify-center p-6">
                <div className="w-full max-w-md space-y-4">
                    <Banner>{error}</Banner>
                    <Button asChild variant="outline">
                        <Link href="/email?tab=broadcasts">
                            <ArrowLeft />
                            Back to email
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    if (!editable) return <FullScreenLoading label="Loading broadcast…" />;

    return (
        <div className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
            <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 sm:flex-nowrap sm:py-0">
                <div className="flex min-w-0 shrink-0 items-center gap-3">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/email?tab=broadcasts">
                            <ArrowLeft />
                            Email
                        </Link>
                    </Button>
                </div>
                <div className="order-last min-w-0 w-full flex-1 basis-full sm:order-none sm:w-auto sm:basis-0">
                    <Label htmlFor="broadcast-subject" className="sr-only">
                        Subject
                    </Label>
                    <Input
                        id="broadcast-subject"
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        placeholder="Subject"
                        disabled={saving || sending}
                    />
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                    <Button onClick={save} disabled={saving || sending}>
                        {saved ? <Check /> : null}
                        {saving ? "Saving…" : saved ? "Saved" : "Save draft"}
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button disabled={saving || sending}>
                                {sending ? "Sending…" : "Save & send"}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Send this broadcast?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Your latest subject and email body will be
                                    saved, then sent to this broadcast&rsquo;s
                                    audience. This cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={saveAndSend}>
                                    Save & send
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </header>

            {error && <Banner className="mx-4 mt-4 shrink-0">{error}</Banner>}

            <div className="shrink-0 border-b px-6 py-3">
                <Label>Audience</Label>
                <p className="mt-1 mb-2 text-sm text-muted-foreground">
                    Choose who receives this broadcast. Leave it on Everyone to
                    send to the whole list.
                </p>
                <BroadcastAudienceFilter
                    value={audience}
                    onChange={setAudience}
                    disabled={saving || sending}
                />
            </div>

            <div className="flex min-h-0 flex-1">
                <aside className="hidden w-60 shrink-0 space-y-4 overflow-y-auto border-r p-4 lg:block">
                    <h2 className="font-semibold">Personalization</h2>
                    <p className="text-sm text-muted-foreground">
                        These values are replaced when SendLit delivers the
                        email.
                    </p>
                    <dl className="space-y-3">
                        {MARKETING_VARIABLES.map((variable) => (
                            <div key={variable.tag} className="space-y-1">
                                <dt>
                                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                        {variable.tag}
                                    </code>
                                </dt>
                                <dd className="text-xs text-muted-foreground">
                                    {variable.description}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-xs text-muted-foreground">
                        SendLit&rsquo;s managed unsubscribe footer is kept
                        intact.
                    </p>
                </aside>

                <main className="min-h-0 min-w-0 flex-1">
                    <EmailEditor
                        email={editable.body}
                        onChange={handleBodyChange}
                    />
                </main>
            </div>
        </div>
    );
}
