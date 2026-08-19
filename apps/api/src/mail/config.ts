import { getPlatformSiteDomain } from "../domains/queries";

export type InboundMailProvider = "ses" | "mailgun" | "generic";

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function normalizeDomain(value: string | undefined): string | null {
    const domain = value?.trim().toLowerCase().replace(/\.$/, "");
    if (!domain) return null;
    const labels = domain.split(".");
    const valid =
        domain.length <= 253 &&
        labels.length >= 2 &&
        labels.every(
            (label) =>
                label.length >= 1 &&
                label.length <= 63 &&
                DOMAIN_LABEL.test(label),
        );
    return valid ? domain : null;
}

/** Visible From domain: `support@acme.<MAIL_DOMAIN>`. Defaults to the
 * public site suffix. This is display/branding, not the MX target. */
export function mailDomain(): string {
    return normalizeDomain(process.env.MAIL_DOMAIN) || getPlatformSiteDomain();
}

/** Dedicated inbound MX host (`replies.frontlit.app`). When unset, Reply-To
 * stays on the branded support@ address (local/Mailpit). */
export function inboundEmailDomain(): string | null {
    return normalizeDomain(process.env.INBOUND_EMAIL_DOMAIN);
}

export function supportLocalPart(): string {
    return (process.env.MAIL_SUPPORT_LOCAL_PART || "support").toLowerCase();
}

export function inboundMailSecret(): string | null {
    return process.env.EMAIL_INBOUND_SECRET?.trim() || null;
}

export function mailgunSigningKey(): string | null {
    return process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim() || null;
}

export function sesInboundConfig(): {
    topicArn: string;
    bucket: string;
    region: string;
    objectPrefix?: string;
} | null {
    const topicArn = process.env.EMAIL_SES_TOPIC_ARN?.trim();
    const bucket = process.env.EMAIL_SES_BUCKET?.trim();
    const region = process.env.EMAIL_SES_REGION?.trim();
    if (!topicArn || !bucket || !region) return null;
    const objectPrefix = process.env.EMAIL_SES_PREFIX?.trim().replace(
        /^\/+|\/+$/g,
        "",
    );
    return {
        topicArn,
        bucket,
        region,
        objectPrefix: objectPrefix || undefined,
    };
}
