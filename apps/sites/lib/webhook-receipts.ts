/**
 * Replay protection for the signed webhooks. A redelivered event (same ID,
 * same body) is acknowledged without repeating side effects; the same ID
 * with a different body is refused. Kept for the signature's five-minute
 * window, which is all a replay can use.
 */
const receipts = new Map<string, { body: string; expires: number }>();

export function checkReceipt(
  eventId: string,
  body: string,
): "new" | "replay" | "conflict" {
  const now = Date.now();
  for (const [key, value] of receipts) if (value.expires <= now) receipts.delete(key);
  const existing = receipts.get(eventId);
  if (!existing) return "new";
  return existing.body === body ? "replay" : "conflict";
}

export function recordReceipt(eventId: string, body: string): void {
  receipts.set(eventId, { body, expires: Date.now() + 300_000 });
}
