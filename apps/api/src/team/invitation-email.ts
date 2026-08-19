import { MailDeliveryError, sendMail } from "../utils/mail";

export type InvitationEmailInput = {
    to: string;
    teamName: string;
    inviterName: string | null;
    expiresAt: Date;
    acceptUrl: string;
};

export class InvitationDeliveryError extends Error {
    constructor() {
        super("invitation_delivery_failed");
        this.name = "InvitationDeliveryError";
    }
}

export type InvitationMailer = (input: InvitationEmailInput) => Promise<void>;

function describeAccess(): string {
    return "You've been invited to collaborate on this team.";
}

export const sendInvitationEmail: InvitationMailer = async (input) => {
    const inviter = input.inviterName
        ? `${input.inviterName} invited you`
        : "You've been invited";
    const expiry = input.expiresAt.toUTCString();
    const text = [
        `${inviter} to join ${input.teamName} on FrontLit.`,
        describeAccess(),
        `This invitation expires on ${expiry}.`,
        `Sign in with ${input.to} and open: ${input.acceptUrl}`,
    ].join("\n\n");

    try {
        await sendMail({
            to: input.to,
            subject: `Join ${input.teamName} on FrontLit`,
            text,
            html: `<p>${inviter} to join <strong>${input.teamName}</strong> on FrontLit.</p>
<p>${describeAccess()}</p>
<p>This invitation expires on ${expiry}.</p>
<p>Sign in with ${input.to}, then <a href="${input.acceptUrl}">accept the invitation</a>.</p>`,
        });
    } catch (error) {
        if (error instanceof MailDeliveryError) {
            throw new InvitationDeliveryError();
        }
        throw error;
    }
};
