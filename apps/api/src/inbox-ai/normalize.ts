import { VISITOR_HANDOFF_PHRASES } from "./config";

/** Unicode NFKC, lowercase, trim, collapse internal whitespace. */
export function normalizeInboxText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Token-boundary phrase match against already-normalized haystack/needle. */
export function matchesNormalizedPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  const pattern = escapeRegExp(phrase).replace(/ /g, "\\s+");
  return new RegExp(`(?:^|\\s)${pattern}(?:$|\\s)`).test(haystack);
}

const GREETING_ONLY = new Set([
  "hi",
  "hello",
  "hey",
  "hi there",
  "hey there",
  "good morning",
  "good afternoon",
  "good evening",
  "howdy",
  "yo",
  "thanks",
  "thank you",
  "ok",
  "okay",
]);

/** True for a short greeting / ack with no support question. Empty
 * retrieval must not treat these as "unsure" — the model can greet. */
export function isGreetingOnly(value: string): boolean {
  const normalized = normalizeInboxText(value).replace(/[!?.,]+$/g, "");
  if (!normalized || normalized.length > 40) return false;
  return GREETING_ONLY.has(normalized);
}

const HUMAN_CONFIRM_PHRASES = [
  "yes",
  "yeah",
  "yep",
  "yup",
  "please",
  "ok",
  "okay",
  "sure",
  "do it",
  "yes please",
  "please do",
  "connect",
  "connect me",
  "please connect",
  "transfer",
  "transfer me",
  "teammate",
] as const;

export function botOfferedHuman(text: string): boolean {
  return /teammate|talk to (a )?(human|person|agent)|speak to (a )?(human|person|agent)|connect(ed)?( you)?|hand(ing)? (this|you)|escalate/i.test(
    text,
  );
}

export function visitorConfirmedHuman(
  visitorText: string,
  thread: Array<{ author: string; content: unknown }>,
  extractText: (content: unknown) => string,
): boolean {
  if (findMatchingPhrase(visitorText, VISITOR_HANDOFF_PHRASES)) return true;
  if (!findMatchingPhrase(visitorText, HUMAN_CONFIRM_PHRASES)) return false;
  return thread.some(
    (message) =>
      message.author === "bot" && botOfferedHuman(extractText(message.content)),
  );
}

export function findMatchingPhrase(
  haystackRaw: string,
  phrases: readonly string[],
): string | null {
  const haystack = normalizeInboxText(haystackRaw);
  for (const phrase of phrases) {
    const normalized = normalizeInboxText(phrase);
    if (normalized && matchesNormalizedPhrase(haystack, normalized)) {
      return normalized;
    }
  }
  return null;
}
