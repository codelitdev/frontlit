"use client";

import { useEffect, useMemo, useState } from "react";
import {
    expandPermissionPreset,
    filterDelegablePermissions,
    type PermissionPresetId,
    type TeamPermission,
} from "@frontlit/api-contract";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
    createTeamInvitation,
    leaveTeam,
    listTeamInvitations,
    listTeamMembers,
    listTeams,
    removeTeamMember,
    resendTeamInvitation,
    revokeTeamInvitation,
    transferTeamOwnership,
    updateTeamMember,
    type TeamInvitation,
    type TeamMember,
} from "@/lib/api";
import { resolveCurrentTeamId } from "@/lib/tokens";
import { summarizePermissions } from "@/lib/permission-ui";
import { PageHeader } from "@/components/workspace/page-header";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { Banner } from "@/components/workspace/banner";
import { DeleteConfirm } from "@/components/workspace/delete-confirm";
import { useSetBreadcrumb } from "@/components/workspace/breadcrumb-context";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { PermissionPicker } from "@/components/workspace/permission-picker";
import {
    isRecentAuthRequired,
    RecentAuthDialog,
} from "@/components/workspace/recent-auth-dialog";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";

export default function MembersPage() {
    useSetBreadcrumb([
        { label: "Settings", href: "/settings/esp" },
        { label: "Members" },
    ]);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [selfEmail, setSelfEmail] = useState<string | null>(null);
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
    const [self, setSelf] = useState<TeamMember | null>(null);
    const [membersCursor, setMembersCursor] = useState<string | null>(null);
    const [invitationsCursor, setInvitationsCursor] = useState<string | null>(
        null,
    );
    const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
    const [loadingMoreInvitations, setLoadingMoreInvitations] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [editMember, setEditMember] = useState<TeamMember | null>(null);
    const [recentAuthOpen, setRecentAuthOpen] = useState(false);
    const [pendingSensitive, setPendingSensitive] = useState<
        null | (() => Promise<void>)
    >(null);

    async function refresh(id: string) {
        const [membersResult, invitesResult] = await Promise.allSettled([
            listTeamMembers(id),
            listTeamInvitations(id),
        ]);
        if (membersResult.status === "fulfilled") {
            setMembers(membersResult.value.items);
            setSelf(membersResult.value.viewer);
            setMembersCursor(membersResult.value.nextCursor);
        } else {
            setMembers([]);
            throw membersResult.reason;
        }
        if (invitesResult.status === "fulfilled") {
            setInvitations(invitesResult.value.items);
            setInvitationsCursor(invitesResult.value.nextCursor);
        } else if (
            invitesResult.reason instanceof ApiError &&
            invitesResult.reason.code === "insufficient_permission"
        ) {
            setInvitations([]);
            setInvitationsCursor(null);
        } else if (invitesResult.reason instanceof Error) {
            throw invitesResult.reason;
        }
    }

    async function loadMoreMembers() {
        if (!teamId || !membersCursor) return;
        setLoadingMoreMembers(true);
        try {
            const page = await listTeamMembers(teamId, {
                cursor: membersCursor,
            });
            setMembers((current) => [...current, ...page.items]);
            setSelf(page.viewer);
            setMembersCursor(page.nextCursor);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Could not load more members",
            );
        } finally {
            setLoadingMoreMembers(false);
        }
    }

    async function loadMoreInvitations() {
        if (!teamId || !invitationsCursor) return;
        setLoadingMoreInvitations(true);
        try {
            const page = await listTeamInvitations(teamId, {
                cursor: invitationsCursor,
            });
            setInvitations((current) => [...current, ...page.items]);
            setInvitationsCursor(page.nextCursor);
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Could not load more invitations",
            );
        } finally {
            setLoadingMoreInvitations(false);
        }
    }

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const [{ items }, session] = await Promise.all([
                    listTeams(),
                    fetch("/api/auth/get-session", { cache: "no-store" }).then(
                        async (res) =>
                            res.ok
                                ? ((await res.json()) as {
                                      user?: { email?: string };
                                  })
                                : null,
                    ),
                ]);
                const current = resolveCurrentTeamId(items);
                if (!current) throw new Error("No team selected");
                setTeamId(current);
                setSelfEmail(session?.user?.email ?? null);
                await refresh(current);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof ApiError &&
                            err.code === "insufficient_permission"
                            ? "You don't have permission to view this team's members."
                            : err instanceof ApiError
                              ? err.message
                              : "Failed to load members.",
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const canInvite = Boolean(
        self?.isOwner || self?.effectivePermissions.includes("members:invite"),
    );
    const canManage = Boolean(
        self?.isOwner || self?.effectivePermissions.includes("members:manage"),
    );
    const selectable = self
        ? filterDelegablePermissions(self.effectivePermissions, self.isOwner)
        : [];

    if (loading) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return (
        <ScrollablePage>
            <div className="max-w-3xl space-y-6">
                <PageHeader
                    title="Members"
                    description="Invite people and choose what they can do in this team."
                    action={
                        <Button
                            disabled={!canInvite}
                            onClick={() => setInviteOpen(true)}
                        >
                            Invite
                        </Button>
                    }
                />
                {!canInvite && !error && (
                    <Banner variant="warning">
                        You can view this list, but you don&apos;t have
                        permission to invite or manage members.
                    </Banner>
                )}
                {error && <Banner>{error}</Banner>}

                <section className="space-y-3">
                    {members.map((member) => (
                        <div
                            key={member.memberId}
                            className="flex items-start justify-between gap-3 rounded-lg border p-4"
                        >
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-medium">
                                        {member.name || member.email}
                                    </p>
                                    {member.isOwner && (
                                        <Badge variant="neutral">Owner</Badge>
                                    )}
                                    {member.email === selfEmail && (
                                        <Badge variant="neutral">You</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {member.email}
                                </p>
                                <p className="mt-1 text-sm">
                                    {member.isOwner
                                        ? "Every team permission"
                                        : summarizePermissions(
                                              member.effectivePermissions,
                                          )}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {!member.isOwner && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={
                                            !canManage ||
                                            member.email === selfEmail
                                        }
                                        onClick={() => setEditMember(member)}
                                    >
                                        Edit
                                    </Button>
                                )}
                                {!member.isOwner &&
                                    member.email !== selfEmail && (
                                        <DeleteConfirm
                                            title="Remove member?"
                                            confirmLabel="Remove"
                                            description={`Remove ${member.email} from this team?`}
                                            disabled={!canManage}
                                            onConfirm={async () => {
                                                if (!teamId) return;
                                                try {
                                                    await removeTeamMember(
                                                        teamId,
                                                        member.memberId,
                                                    );
                                                    await refresh(teamId);
                                                } catch (err) {
                                                    toast.error(
                                                        err instanceof ApiError
                                                            ? err.message
                                                            : "Could not remove member",
                                                    );
                                                }
                                            }}
                                        />
                                    )}
                                {self?.isOwner && !member.isOwner && (
                                    <DeleteConfirm
                                        title="Transfer ownership?"
                                        confirmLabel="Transfer"
                                        description={`Make ${member.email} the owner? You will keep full non-owner access.`}
                                        onConfirm={async () => {
                                            if (!teamId) return;
                                            const run = async () => {
                                                await transferTeamOwnership(
                                                    teamId,
                                                    {
                                                        memberId:
                                                            member.memberId,
                                                    },
                                                );
                                                await refresh(teamId);
                                            };
                                            try {
                                                await run();
                                            } catch (err) {
                                                if (isRecentAuthRequired(err)) {
                                                    setPendingSensitive(
                                                        () => run,
                                                    );
                                                    setRecentAuthOpen(true);
                                                    return;
                                                }
                                                toast.error(
                                                    err instanceof ApiError
                                                        ? err.message
                                                        : "Could not transfer ownership",
                                                );
                                            }
                                        }}
                                        trigger={
                                            <Button variant="outline" size="sm">
                                                Make owner
                                            </Button>
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                    {membersCursor && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={loadingMoreMembers}
                            onClick={() => void loadMoreMembers()}
                        >
                            {loadingMoreMembers
                                ? "Loading…"
                                : "Load more members"}
                        </Button>
                    )}
                </section>

                {invitations.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-medium">
                            Pending invitations
                        </h2>
                        {invitations.map((invitation) => (
                            <div
                                key={invitation.invitationId}
                                className="flex items-center justify-between rounded-lg border p-4"
                            >
                                <div>
                                    <p className="font-medium">
                                        {invitation.email}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {summarizePermissions(
                                            invitation.effectivePermissions,
                                        )}{" "}
                                        · expires{" "}
                                        {new Date(
                                            invitation.expiresAt,
                                        ).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!canInvite}
                                        onClick={async () => {
                                            if (!teamId) return;
                                            try {
                                                await resendTeamInvitation(
                                                    teamId,
                                                    invitation.invitationId,
                                                );
                                                toast.success(
                                                    "Invitation resent",
                                                );
                                            } catch (err) {
                                                toast.error(
                                                    err instanceof ApiError
                                                        ? err.message
                                                        : "Could not resend",
                                                );
                                            }
                                        }}
                                    >
                                        Resend
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!canManage}
                                        onClick={async () => {
                                            if (!teamId) return;
                                            try {
                                                await revokeTeamInvitation(
                                                    teamId,
                                                    invitation.invitationId,
                                                );
                                                await refresh(teamId);
                                            } catch (err) {
                                                toast.error(
                                                    err instanceof ApiError
                                                        ? err.message
                                                        : "Could not revoke",
                                                );
                                            }
                                        }}
                                    >
                                        Revoke
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {invitationsCursor && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={loadingMoreInvitations}
                                onClick={() => void loadMoreInvitations()}
                            >
                                {loadingMoreInvitations
                                    ? "Loading…"
                                    : "Load more invitations"}
                            </Button>
                        )}
                    </section>
                )}

                {((self && !self.isOwner) ||
                    (error && !self && Boolean(teamId))) &&
                    teamId && (
                        <DeleteConfirm
                            title="Leave team?"
                            confirmLabel="Leave"
                            description="You will lose access to this team immediately."
                            onConfirm={async () => {
                                await leaveTeam(teamId);
                                window.location.href = "/teams";
                            }}
                            trigger={
                                <Button variant="outline">Leave team</Button>
                            }
                        />
                    )}
            </div>

            {teamId && (
                <InviteDialog
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                    teamId={teamId}
                    selectable={selectable}
                    onCreated={() => refresh(teamId)}
                />
            )}
            {teamId && editMember && (
                <EditMemberDialog
                    member={editMember}
                    teamId={teamId}
                    selectable={selectable}
                    onClose={() => setEditMember(null)}
                    onSaved={() => refresh(teamId)}
                />
            )}
            <RecentAuthDialog
                open={recentAuthOpen}
                email={selfEmail}
                onOpenChange={setRecentAuthOpen}
                onVerified={async () => {
                    const run = pendingSensitive;
                    setPendingSensitive(null);
                    if (!run) return;
                    try {
                        await run();
                    } catch (err) {
                        toast.error(
                            err instanceof ApiError
                                ? err.message
                                : "Could not finish after verification",
                        );
                    }
                }}
            />
        </ScrollablePage>
    );
}

function InviteDialog({
    open,
    onOpenChange,
    teamId,
    selectable,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    teamId: string;
    selectable: TeamPermission[];
    onCreated: () => Promise<void>;
}) {
    const [email, setEmail] = useState("");
    const [preset, setPreset] = useState<PermissionPresetId | "">("");
    const [permissions, setPermissions] = useState<TeamPermission[]>([]);

    async function submit() {
        if (!preset) {
            toast.error("Choose a preset or Custom");
            return;
        }
        try {
            await createTeamInvitation(teamId, { email, permissions });
            onOpenChange(false);
            setEmail("");
            setPreset("");
            setPermissions([]);
            await onCreated();
        } catch (err) {
            toast.error(
                err instanceof ApiError ? err.message : "Could not invite",
            );
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[min(90vh,40rem)] max-w-lg flex-col overflow-hidden p-0">
                <DialogHeader className="shrink-0 px-6 pt-6">
                    <DialogTitle>Invite a member</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
                    <div className="space-y-2">
                        <Label htmlFor="team-invitation-email">Email</Label>
                        <Input
                            id="team-invitation-email"
                            name="email"
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    </div>
                    <PermissionPicker
                        preset={preset}
                        permissions={permissions}
                        selectable={selectable}
                        onPresetChange={(next) => {
                            setPreset(next);
                            setPermissions(
                                next === "custom"
                                    ? []
                                    : expandPermissionPreset(next),
                            );
                        }}
                        onPermissionsChange={(next) => {
                            setPreset("custom");
                            setPermissions(next);
                        }}
                    />
                </div>
                <DialogFooter className="mt-0 shrink-0 border-t px-6 py-4">
                    <Button onClick={() => void submit()} disabled={!email}>
                        Send invitation
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditMemberDialog({
    member,
    teamId,
    selectable,
    onClose,
    onSaved,
}: {
    member: TeamMember;
    teamId: string;
    selectable: TeamPermission[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [permissions, setPermissions] = useState(member.permissions);
    const preset = useMemo<PermissionPresetId>(() => "custom", []);

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[min(90vh,40rem)] max-w-lg flex-col overflow-hidden p-0">
                <DialogHeader className="shrink-0 px-6 pt-6">
                    <DialogTitle>Edit {member.email}</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-6">
                    <PermissionPicker
                        preset={preset}
                        permissions={permissions}
                        selectable={selectable}
                        onPresetChange={(next) =>
                            setPermissions(
                                next === "custom"
                                    ? permissions
                                    : expandPermissionPreset(next),
                            )
                        }
                        onPermissionsChange={setPermissions}
                    />
                </div>
                <DialogFooter className="mt-0 shrink-0 border-t px-6 py-4">
                    <Button
                        onClick={async () => {
                            try {
                                await updateTeamMember(
                                    teamId,
                                    member.memberId,
                                    {
                                        permissions,
                                        version: member.version,
                                    },
                                );
                                await onSaved();
                                onClose();
                            } catch (err) {
                                toast.error(
                                    err instanceof ApiError
                                        ? err.message
                                        : "Could not update member",
                                );
                            }
                        }}
                    >
                        Save permissions
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
