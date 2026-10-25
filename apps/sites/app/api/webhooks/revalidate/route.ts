import { revalidateTag } from "next/cache";
import { z } from "zod";
import { verifyWebhookSignature } from "@/lib/webhook-signing";
import { invalidateCachedHosts } from "@/lib/host";
import { checkReceipt, recordReceipt } from "@/lib/webhook-receipts";
import { isTeamTag } from "@/lib/site-tags";

const eventSchema = z
  .object({
    eventId: z.string().regex(/^evt_[a-z0-9]+$/),
    teamId: z.string().regex(/^team_[a-z0-9]+$/),
    tags: z.array(z.string().max(256)).min(1).max(200),
    invalidateHosts: z.array(z.string().max(253)).max(50).optional(),
  })
  .strict();

/**
 * Cache invalidation webhook (docs/site-delivery.md §4.5). apps/api's
 * outbox calls it when published content changes; each listed tag expires
 * immediately here, and through the shared cache handler on every other
 * replica. A server-to-server route authenticated by HMAC, not a tenant
 * host.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 404 });

  const signature = request.headers.get("x-frontlit-signature");
  const timestamp = Number(request.headers.get("x-frontlit-timestamp"));
  const raw = await request.text();
  if (raw.length > 32_768) return new Response("Payload too large", { status: 413 });
  if (!signature || !verifyWebhookSignature(secret, raw, timestamp, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let parsed;
  try {
    parsed = eventSchema.safeParse(JSON.parse(raw));
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  if (!parsed.success) return new Response("Invalid event", { status: 400 });
  const { eventId, teamId, tags, invalidateHosts } = parsed.data;
  if (!tags.every((tag) => isTeamTag(tag, teamId))) {
    return new Response("Unknown tag", { status: 400 });
  }

  const receipt = checkReceipt(eventId, raw);
  if (receipt === "conflict") return new Response("Conflicting event", { status: 409 });
  if (receipt === "new") {
    // `expire: 0`: gone now, not served stale while it re-renders.
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
    await invalidateCachedHosts(invalidateHosts);
    recordReceipt(eventId, raw);
  }
  return Response.json({ acknowledged: eventId });
}
