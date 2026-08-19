export type NormalizedInboundMail = {
    from: string;
    to: string[];
    subject: string;
    text: string;
    messageId?: string;
    inReplyTo?: string;
    references?: string[];
    autoSubmitted?: string;
};

export function isAutomatedMail(mail: NormalizedInboundMail): boolean {
    const flag = mail.autoSubmitted?.trim().toLowerCase();
    if (flag && flag !== "no") return true;
    return false;
}
