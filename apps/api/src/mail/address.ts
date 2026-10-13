import { inboundEmailDomain, mailDomain, supportLocalPart } from "./config";

const TICKET_ID_RE = /\b(tkt_[a-z0-9]+)\b/i;
const REPLY_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function supportAddress(subdomain: string): string {
  return `${supportLocalPart()}@${subdomain}.${mailDomain()}`;
}

export function supportFromHeader(teamName: string, subdomain: string): string {
  return `${teamName} Support <${supportAddress(subdomain)}>`;
}

export function replyToAddress(token: string): string | null {
  const domain = inboundEmailDomain();
  if (!domain || !REPLY_TOKEN_RE.test(token)) return null;
  return `reply+${token}@${domain}`;
}

export function conversationMessageId(ticketId: string, subdomain: string): string {
  return `<${ticketId}@${subdomain}.${mailDomain()}>`;
}

export function outboundMessageId(
  ticketId: string,
  subdomain: string,
  unique: string,
): string {
  return `<${ticketId}.${unique}@${subdomain}.${mailDomain()}>`;
}

export function extractTicketId(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(TICKET_ID_RE);
    if (match) return match[1];
  }
  return null;
}

export function parseEmailAddress(value: string): string | null {
  const angled = value.match(/<([^>]+)>/);
  const raw = (angled?.[1] ?? value).trim().toLowerCase();
  if (!raw.includes("@")) return null;
  return raw;
}

export function parseDisplayName(value: string): string | undefined {
  const angled = value.match(/^(.*)<[^>]+>\s*$/);
  const name = angled?.[1]?.replaceAll('"', "").trim();
  return name || undefined;
}

/** `support@acme.frontlit.app` or `support+tkt_x@acme.frontlit.app`. */
export function parseSupportRecipient(address: string): {
  subdomain: string;
  ticketId: string | null;
} | null {
  const email = parseEmailAddress(address);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const host = email.slice(at + 1);
  const suffix = `.${mailDomain()}`;
  if (!host.endsWith(suffix)) return null;
  const subdomain = host.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;

  const [mailbox, plus] = local.split("+", 2);
  if (mailbox !== supportLocalPart()) return null;
  return {
    subdomain,
    ticketId: plus ? extractTicketId(plus) : null,
  };
}

/** `reply+<opaque-token>@replies.frontlit.app` — token is case-sensitive. */
export function parseReplyRecipient(address: string): string | null {
  const angled = address.match(/<([^>]+)>/);
  const raw = (angled?.[1] ?? address).trim();
  const at = raw.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = inboundEmailDomain();
  if (!domain) return null;
  const host = raw.slice(at + 1).toLowerCase();
  if (host !== domain) return null;
  const local = raw.slice(0, at);
  const prefix = local.slice(0, "reply+".length).toLowerCase();
  if (prefix !== "reply+") return null;
  const token = local.slice("reply+".length);
  return REPLY_TOKEN_RE.test(token) ? token : null;
}

export function isOurMailbox(address: string): boolean {
  return (
    parseSupportRecipient(address) !== null || parseReplyRecipient(address) !== null
  );
}
