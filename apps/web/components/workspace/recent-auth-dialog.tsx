"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/codelit/dialog";
import { ApiError } from "@/lib/api-client";
import { reverifySession, sendEmailOtp } from "@/lib/session-reverify";

export function RecentAuthDialog({
    open,
    email,
    onOpenChange,
    onVerified,
}: {
    open: boolean;
    email: string | null;
    onOpenChange: (open: boolean) => void;
    onVerified: () => Promise<void> | void;
}) {
    const [code, setCode] = useState("");
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [sent, setSent] = useState(false);

    async function sendCode() {
        if (!email) {
            toast.error("Sign in again to confirm your identity.");
            return;
        }
        setSending(true);
        try {
            await sendEmailOtp(email);
            setSent(true);
            toast.success("We sent a verification code to your email.");
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "Could not send a verification code",
            );
        } finally {
            setSending(false);
        }
    }

    async function verify() {
        if (!code.trim()) return;
        setVerifying(true);
        try {
            await reverifySession(code.trim());
            setCode("");
            setSent(false);
            onOpenChange(false);
            await onVerified();
        } catch (err) {
            toast.error(
                err instanceof ApiError
                    ? err.message
                    : "That code is invalid or expired",
            );
        } finally {
            setVerifying(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm it&apos;s you</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Ownership changes need a fresh email code. We&apos;ll send
                    it to {email || "your signed-in address"}.
                </p>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={sending || !email}
                        onClick={() => void sendCode()}
                    >
                        {sending
                            ? "Sending…"
                            : sent
                              ? "Resend code"
                              : "Send code"}
                    </Button>
                </div>
                <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Verification code"
                    autoComplete="one-time-code"
                />
                <Button
                    type="button"
                    disabled={!code.trim() || verifying}
                    onClick={() => void verify()}
                >
                    {verifying ? "Confirming…" : "Confirm"}
                </Button>
            </DialogContent>
        </Dialog>
    );
}

export function isRecentAuthRequired(err: unknown): boolean {
    return (
        err instanceof ApiError &&
        (err.code === "recent_authentication_required" ||
            err.message === "recent_authentication_required")
    );
}
