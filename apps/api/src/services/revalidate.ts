import { logger } from "./log";
import { signWebhookPayload } from "./webhook-signing";

/**
 * Best-effort ping to apps/sites' ISR revalidation webhook whenever a
 * team's published content or domain changes (architecture.md §12.2). Never
 * blocks or fails the caller — apps/sites' 60s time-bound cache (§13.5)
 * covers the gap if the webhook itself is unreachable.
 */
export async function revalidateTeam(teamPublicId: string): Promise<void> {
    const secret = process.env.REVALIDATE_WEBHOOK_SECRET;
    const base = process.env.SITES_BASE_URL || "http://localhost:3002";
    if (!secret) return;

    const body = JSON.stringify({ teamId: teamPublicId });
    const timestamp = Date.now();
    const signature = signWebhookPayload(secret, body, timestamp);

    try {
        await fetch(`${base}/api/webhooks/revalidate`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-frontlit-timestamp": String(timestamp),
                "x-frontlit-signature": signature,
            },
            body,
        });
    } catch (err) {
        logger.warn(
            {
                teamId: teamPublicId,
                error: err instanceof Error ? err.message : String(err),
            },
            "ISR revalidation webhook failed",
        );
    }
}
