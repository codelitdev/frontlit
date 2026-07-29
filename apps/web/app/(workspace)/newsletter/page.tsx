"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    type Broadcast,
    createBroadcast,
    getNewsletterSettings,
    listBroadcasts,
    sendBroadcast,
} from "@/lib/api";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Badge } from "@/components/ui/codelit/badge";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
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

/**
 * Newsletter workspace: a thin, team-scoped read-through/adapter over
 * SendLit (architecture.md §10.2/§10.3) — FrontLit stores no broadcast data
 * of its own. Audience/contacts management lives on the standalone Users
 * page (also a SendLit contacts read-through). Sender identity lives under
 * Settings → ESP.
 */
export default function NewsletterPage() {
    useSetBreadcrumb([{ label: "Newsletter" }]);
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
    const [loading, setLoading] = useState(true);
    const [notConnected, setNotConnected] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [newBroadcastName, setNewBroadcastName] = useState("");
    const [sendingId, setSendingId] = useState<string | null>(null);

    function handleLoadError(err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
            setNotConnected(true);
        } else {
            setLoadError(
                err instanceof ApiError
                    ? err.message
                    : "Failed to load newsletter data.",
            );
        }
    }

    useEffect(() => {
        getNewsletterSettings()
            .then((s) => {
                if (!s.connected) {
                    setNotConnected(true);
                    return;
                }
                return listBroadcasts()
                    .then(({ items }) => setBroadcasts(items))
                    .catch(handleLoadError);
            })
            .catch(handleLoadError)
            .finally(() => setLoading(false));
    }, []);

    async function handleCreateBroadcast(e: React.FormEvent) {
        e.preventDefault();
        if (!newBroadcastName.trim()) return;
        try {
            const created = await createBroadcast({
                name: newBroadcastName.trim(),
            });
            setBroadcasts((prev) => [created, ...prev]);
            setNewBroadcastName("");
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to create broadcast.",
            );
        }
    }

    async function handleSend(broadcastId: string) {
        setSendingId(broadcastId);
        try {
            await sendBroadcast(broadcastId);
            const { items } = await listBroadcasts();
            setBroadcasts(items);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Failed to send broadcast.",
            );
        } finally {
            setSendingId(null);
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
            <div className="max-w-3xl space-y-8">
                <PageHeader
                    title="Newsletter"
                    description="Leads captured through this team's pages sync automatically to SendLit contacts. All contact management, segmentation and sending happens there — this is a thin control panel over it."
                />

                {notConnected && (
                    <Banner variant="warning">
                        This team isn&rsquo;t connected to SendLit yet.
                        Configure the{" "}
                        <Link
                            href="/settings/esp"
                            className="font-medium underline"
                        >
                            ESP
                        </Link>{" "}
                        connection, or check back shortly if provisioning is
                        still running.
                    </Banner>
                )}

                {loadError && <Banner>{loadError}</Banner>}

                {!notConnected && (
                    <div>
                        <h2 className="mb-3 text-lg font-semibold">
                            Broadcasts
                        </h2>
                        <form
                            onSubmit={handleCreateBroadcast}
                            className="mb-4 flex gap-2"
                        >
                            <Input
                                value={newBroadcastName}
                                onChange={(e) =>
                                    setNewBroadcastName(e.target.value)
                                }
                                placeholder="Broadcast name"
                                className="flex-1"
                            />
                            <Button type="submit">Create draft</Button>
                        </form>
                        <div className="divide-y rounded-lg border">
                            {broadcasts.length === 0 && (
                                <p className="p-4 text-sm text-muted-foreground">
                                    No broadcasts yet.
                                </p>
                            )}
                            {broadcasts.map((b) => (
                                <div
                                    key={b.broadcastId}
                                    className="flex items-center justify-between p-3"
                                >
                                    <div>
                                        <p className="font-medium">{b.name}</p>
                                        <Badge
                                            variant="neutral"
                                            className="mt-1"
                                        >
                                            {b.status}
                                        </Badge>
                                    </div>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={
                                                    sendingId === b.broadcastId
                                                }
                                            >
                                                {sendingId === b.broadcastId
                                                    ? "Sending…"
                                                    : "Send"}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    Send this broadcast?
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will send &ldquo;
                                                    {b.name}&rdquo; to its
                                                    audience now. This cannot be
                                                    undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>
                                                    Cancel
                                                </AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() =>
                                                        handleSend(
                                                            b.broadcastId,
                                                        )
                                                    }
                                                >
                                                    Send
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </ScrollablePage>
    );
}
