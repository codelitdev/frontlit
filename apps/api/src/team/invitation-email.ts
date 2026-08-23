import {
    invitationIdempotencyKey,
    MailDeliveryError,
    sendPlatformEmail,
} from "../email/platform-mail";

export type InvitationEmailInput = {
    to: string;
    teamName: string;
    inviterName: string | null;
    expiresAt: Date;
    acceptUrl: string;
    invitationId: string;
    tokenHash: string;
};

export class InvitationDeliveryError extends Error {
    constructor() {
        super("invitation_delivery_failed");
        this.name = "InvitationDeliveryError";
    }
}

export type InvitationMailer = (input: InvitationEmailInput) => Promise<void>;

export const sendInvitationEmail: InvitationMailer = async (input) => {
    try {
        await sendPlatformEmail(
            "invitation",
            {
                teamName: input.teamName,
                inviterName: input.inviterName ?? undefined,
                expiresAt: input.expiresAt.toUTCString(),
                acceptUrl: input.acceptUrl,
                inviteeEmail: input.to,
            },
            {
                to: input.to,
                subject: `Join ${input.teamName} on FrontLit`,
                idempotencyKey: invitationIdempotencyKey(
                    input.invitationId,
                    input.tokenHash,
                ),
            },
        );
    } catch (error) {
        if (error instanceof MailDeliveryError) {
            throw new InvitationDeliveryError();
        }
        throw error;
    }
};
