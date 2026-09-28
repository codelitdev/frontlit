import type { NormalizedInboundMail } from "./normalized";

function unfoldHeaders(raw: string): string {
  return raw.replaceAll(/\r\n[ \t]+/g, " ").replaceAll(/\n[ \t]+/g, " ");
}

function headerValue(headers: string, name: string): string | undefined {
  const match = unfoldHeaders(headers).match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function decodeBody(body: string, transferEncoding: string | undefined): string {
  const encoding = transferEncoding?.toLowerCase() ?? "7bit";
  if (encoding === "base64") {
    return Buffer.from(body.replaceAll(/\s/g, ""), "base64").toString("utf8");
  }
  if (encoding === "quoted-printable") {
    return body
      .replaceAll(/=\r?\n/g, "")
      .replaceAll(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
  }
  return body;
}

function extractPlainText(raw: string): string {
  const split = raw.split(/\r?\n\r?\n/);
  const headers = split[0] ?? "";
  const body = split.slice(1).join("\n\n");
  const contentType = headerValue(headers, "Content-Type") ?? "text/plain";
  const transfer = headerValue(headers, "Content-Transfer-Encoding");
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(new RegExp(`--${escapeRegExp(boundary)}`));
    for (const part of parts) {
      if (!/Content-Type:\s*text\/plain/i.test(part)) continue;
      const inner = part.replace(/^\r?\n/, "");
      const innerSplit = inner.split(/\r?\n\r?\n/);
      return decodeBody(
        innerSplit.slice(1).join("\n\n"),
        headerValue(innerSplit[0] ?? "", "Content-Transfer-Encoding"),
      );
    }
  }
  if (/text\/html/i.test(contentType) && !/text\/plain/i.test(contentType)) {
    return decodeBody(body, transfer)
      .replaceAll(/<br\s*\/?>/gi, "\n")
      .replaceAll(/<[^>]+>/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim();
  }
  return decodeBody(body, transfer);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitAddresses(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseRawMime(raw: string): NormalizedInboundMail {
  const splitAt = raw.search(/\r?\n\r?\n/);
  const headers = splitAt === -1 ? raw : raw.slice(0, splitAt);
  return {
    from: headerValue(headers, "From") ?? "",
    to: splitAddresses(
      headerValue(headers, "To") ?? headerValue(headers, "Delivered-To"),
    ),
    subject: headerValue(headers, "Subject") ?? "",
    text: extractPlainText(raw),
    messageId: headerValue(headers, "Message-ID") ?? headerValue(headers, "Message-Id"),
    inReplyTo: headerValue(headers, "In-Reply-To"),
    references: headerValue(headers, "References")?.split(/\s+/).filter(Boolean),
    autoSubmitted: headerValue(headers, "Auto-Submitted"),
  };
}
