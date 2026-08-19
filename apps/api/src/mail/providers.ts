import type { NormalizedInboundMail } from "./normalized";
import { parseRawMime } from "./mime";

export function fromGenericJson(body: unknown): NormalizedInboundMail | null {
    if (!body || typeof body !== "object") return null;
    const value = body as Record<string, unknown>;
    const from = typeof value.from === "string" ? value.from : "";
    const text = typeof value.text === "string" ? value.text : "";
    if (!from || !text) return null;
    const to = Array.isArray(value.to)
        ? value.to.filter((item): item is string => typeof item === "string")
        : typeof value.to === "string"
          ? [value.to]
          : [];
    return {
        from,
        to,
        subject: typeof value.subject === "string" ? value.subject : "",
        text,
        messageId:
            typeof value.messageId === "string" ? value.messageId : undefined,
        inReplyTo:
            typeof value.inReplyTo === "string" ? value.inReplyTo : undefined,
        references: Array.isArray(value.references)
            ? value.references.filter(
                  (item): item is string => typeof item === "string",
              )
            : undefined,
        autoSubmitted:
            typeof value.autoSubmitted === "string"
                ? value.autoSubmitted
                : undefined,
    };
}

export function fromMailgunForm(
    body: Record<string, unknown>,
): NormalizedInboundMail | null {
    const from =
        stringField(body, "from") ||
        stringField(body, "sender") ||
        stringField(body, "From");
    const text =
        stringField(body, "body-plain") ||
        stringField(body, "stripped-text") ||
        "";
    if (!from || !text) return null;
    const recipient =
        stringField(body, "recipient") || stringField(body, "To") || "";
    return {
        from,
        to: recipient ? [recipient] : [],
        subject: stringField(body, "subject") ?? "",
        text,
        messageId:
            stringField(body, "Message-Id") || stringField(body, "message-id"),
        inReplyTo: stringField(body, "In-Reply-To"),
        references: stringField(body, "References")?.split(/\s+/),
    };
}

export function fromSesSnsMessage(
    message: unknown,
): NormalizedInboundMail | null {
    if (!message || typeof message !== "object") return null;
    const value = message as Record<string, unknown>;
    if (typeof value.content === "string" && value.content.trim()) {
        return parseRawMime(value.content);
    }
    const mail = value.mail as Record<string, unknown> | undefined;
    const headers = mail?.commonHeaders as Record<string, unknown> | undefined;
    if (!headers) return null;
    const from = firstString(headers.from);
    const text =
        typeof value.content === "string"
            ? value.content
            : firstString(headers.subject);
    if (!from) return null;
    return {
        from,
        to: Array.isArray(headers.to)
            ? headers.to.filter(
                  (item): item is string => typeof item === "string",
              )
            : [],
        subject: typeof headers.subject === "string" ? headers.subject : "",
        text: text || "",
        messageId:
            typeof headers.messageId === "string"
                ? headers.messageId
                : undefined,
    };
}

function stringField(
    body: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = body[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstString(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    return undefined;
}
