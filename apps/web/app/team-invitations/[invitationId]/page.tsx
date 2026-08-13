"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    acceptTeamInvitation,
    previewTeamInvitation,
    rejectTeamInvitation,
    type InvitationPreview,
} from "@/lib/api";
import {
    clearInvitationHash,
    persistInvitationToken,
    readInvitationTokenFromHash,
    peekInvitationToken,
    clearInvitationToken,
} from "@/lib/invitation-token";
import { summarizePermissions } from "@/lib/permission-ui";
import { clientLoginPath } from "@/lib/login-url";
import { Button } from "@/components/ui/codelit/button";
import { Banner } from "@/components/workspace/banner";

export default function TeamInvitationPage() {
    const params = useParams<{ invitationId: string }>();
    const router = useRouter();
    const invitationId = params.invitationId;
    const [preview, setPreview] = useState<InvitationPreview | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!invitationId) return;
        const fromHash = readInvitationTokenFromHash(window.location.hash);
        if (fromHash) persistInvitationToken(invitationId, fromHash);
        const resolved = fromHash ?? peekInvitationToken(invitationId);
        if (fromHash) {
            window.history.replaceState(
                null,
                "",
                clearInvitationHash(window.location.href),
            );
        }
        if (!resolved) {
            setError("This invitation link is missing its secret.");
            return;
        }
        setToken(resolved);

        previewTeamInvitation({ invitationId, token: resolved })
            .then(setPreview)
            .catch((err) => {
                if (err instanceof ApiError && err.status === 401) {
                    persistInvitationToken(invitationId, resolved);
                    window.location.href = clientLoginPath(
                        `/team-invitations/${invitationId}`,
                    );
                    return;
                }
                setError(
                    err instanceof ApiError
                        ? err.message
                        : "This invitation could not be opened.",
                );
            });
    }, [invitationId]);

    async function act(kind: "accept" | "reject") {
        if (!token) return;
        setBusy(true);
        try {
            if (kind === "accept") {
                const membership = await acceptTeamInvitation({
                    invitationId,
                    token,
                });
                clearInvitationToken(invitationId);
                const form = document.createElement("form");
                form.method = "POST";
                form.action = "/api/team/switch";
                for (const [name, value] of Object.entries({
                    teamId: membership.teamId,
                    redirectTo: "/",
                })) {
                    const input = document.createElement("input");
                    input.type = "hidden";
                    input.name = name;
                    input.value = value;
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
            } else {
                await rejectTeamInvitation({ invitationId, token });
                clearInvitationToken(invitationId);
                router.replace("/teams");
            }
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Could not update the invitation",
            );
            setBusy(false);
        }
    }

    return (
        <main className="mx-auto max-w-lg space-y-4 p-8">
            <h1 className="text-2xl font-semibold">Team invitation</h1>
            {error && <Banner>{error}</Banner>}
            {preview && (
                <>
                    <p>
                        Join <strong>{preview.teamName}</strong>
                        {preview.inviterName
                            ? `, invited by ${preview.inviterName}`
                            : ""}
                        .
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Sign in as {preview.email}. Expires{" "}
                        {new Date(preview.expiresAt).toLocaleString()}.
                    </p>
                    <p className="text-sm">
                        Access: {summarizePermissions(preview.permissions)}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            disabled={busy}
                            onClick={() => void act("accept")}
                        >
                            Accept
                        </Button>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void act("reject")}
                        >
                            Reject
                        </Button>
                    </div>
                </>
            )}
        </main>
    );
}
