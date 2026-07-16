import { logger } from "../services/log";
import { getSendlitApiKey } from "../integrations/queries";
import { sendEmail } from "../newsletter/sendlit-client";

function threadUrl(teamPublicId: string, ticketId: string, token: string): string {
    const base = process.env.SITES_BASE_URL ?? "http://localhost:3002";
    return `${base}/help/tickets/${ticketId}?token=${encodeURIComponent(token)}`;
}

/** Best-effort transactional email via SendLit (architecture.md §11.2). A
 * team with no SendLit integration connected yet just doesn't get email
 * notifications — the thread page itself is still fully usable, so this
 * never blocks the underlying ticket action. */
async function notify(teamId: string, to: string, subject: string, html: string): Promise<void> {
    const apiKey = await getSendlitApiKey(teamId);
    if (!apiKey) return;

    try {
        await sendEmail(apiKey, { to, subject, html });
    } catch (err) {
        logger.warn({ teamId, error: err instanceof Error ? err.message : String(err) }, "Ticket notification email failed");
    }
}

export async function notifyRequesterOfReply(input: { teamId: string; teamPublicId: string; ticketId: string; token: string; requesterEmail: string; subject: string }) {
    const url = threadUrl(input.teamPublicId, input.ticketId, input.token);
    await notify(
        input.teamId,
        input.requesterEmail,
        `Re: ${input.subject}`,
        `<p>You have a new reply on your support ticket.</p><p><a href="${url}">View the conversation</a></p>`,
    );
}

export async function notifyTeamOfRequesterMessage(input: { teamId: string; ticketId: string; recipientEmail: string; subject: string }) {
    const base = process.env.WEB_BASE_URL ?? "http://localhost:3001";
    const url = `${base}/dashboard/support/${input.ticketId}`;
    await notify(
        input.teamId,
        input.recipientEmail,
        `New message on ticket: ${input.subject}`,
        `<p>A new message was received on a support ticket.</p><p><a href="${url}">View in the dashboard</a></p>`,
    );
}
