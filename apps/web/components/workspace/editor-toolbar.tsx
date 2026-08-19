"use client";

import Link from "next/link";
import {
    DocumentStatusBadge,
    type DocumentStatus,
} from "@/components/workspace/document-status-badge";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
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

export function EditorToolbar({
    backHref,
    backLabel,
    status,
    statusTestId,
    saving,
    publishing,
    publishingLabel = "Publishing…",
    leading,
    extra,
    onPublish,
    onDiscardDraft,
    discardDescription = "Discard all unpublished changes? This cannot be undone.",
}: {
    backHref: string;
    backLabel: string;
    status: DocumentStatus;
    statusTestId?: string;
    saving?: boolean;
    publishing?: boolean;
    publishingLabel?: string;
    leading?: React.ReactNode;
    extra?: React.ReactNode;
    onPublish: () => void;
    onDiscardDraft: () => void;
    discardDescription?: string;
}) {
    return (
        <div className="flex h-11 shrink-0 items-center justify-between border-b bg-background px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <Link
                    href={backHref}
                    className="shrink-0 text-xs text-muted-foreground hover:underline"
                >
                    ← {backLabel}
                </Link>
                {leading}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <DocumentStatusBadge
                    status={status}
                    data-testid={statusTestId}
                />
                {extra}
                {saving && <Badge variant="neutral">Saving…</Badge>}
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={publishing || status === "published"}
                        >
                            Discard draft
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Discard draft?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {discardDescription}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={onDiscardDraft}>
                                Discard
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <Button
                    size="sm"
                    onClick={onPublish}
                    disabled={publishing || status === "published"}
                    data-testid="publish-button"
                >
                    {publishing ? publishingLabel : "Publish"}
                </Button>
            </div>
        </div>
    );
}
