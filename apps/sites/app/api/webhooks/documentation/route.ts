import { revalidateTag } from "next/cache";
import { z } from "zod";
import { verifyWebhookSignature } from "@/lib/webhook-signing";
const eventSchema = z
  .object({
    eventId: z.string().regex(/^evt_[a-z0-9]+$/),
    type: z.enum(["activation", "policy", "purge"]),
    teamId: z.string().regex(/^team_[a-z0-9]+$/),
    publicationId: z
      .string()
      .regex(/^pub_[a-z0-9]+$/)
      .nullable(),
    policyEpoch: z.number().int().nonnegative(),
  })
  .strict();
// Side effects are idempotent even after restart. This receipt cache also
// rejects conflicting replay inside the signature's five-minute window.
const receipts = new Map<string, { body: string; expires: number }>();
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 404 });
  const timestamp = Number(request.headers.get("x-frontlit-timestamp"));
  const signature = request.headers.get("x-frontlit-signature");
  const raw = await request.text();
  if (raw.length > 4096) return new Response("Payload too large", { status: 413 });
  if (
    !Number.isFinite(timestamp) ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature) ||
    !verifyWebhookSignature(secret, raw, timestamp, signature)
  )
    return new Response("Invalid signature", { status: 401 });
  let parsed;
  try {
    parsed = eventSchema.safeParse(JSON.parse(raw));
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  if (!parsed.success) return new Response("Invalid event", { status: 400 });
  const now = Date.now();
  for (const [key, value] of receipts) if (value.expires <= now) receipts.delete(key);
  const existing = receipts.get(parsed.data.eventId);
  if (existing && existing.body !== raw)
    return new Response("Conflicting event", { status: 409 });
  if (!existing) {
    revalidateTag(`team:${parsed.data.teamId}`, { expire: 0 });
    receipts.set(parsed.data.eventId, { body: raw, expires: now + 300000 });
  }
  return Response.json({ acknowledged: parsed.data.eventId });
}
