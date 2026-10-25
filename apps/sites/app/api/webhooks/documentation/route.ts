import { revalidateTag } from "next/cache";
import { z } from "zod";
import { verifyWebhookSignature } from "@/lib/webhook-signing";
import { checkReceipt, recordReceipt } from "@/lib/webhook-receipts";
const eventSchema = z
  .object({
    eventId: z.string().regex(/^evt_[a-z0-9]+$/),
    type: z.enum(["activation", "policy", "purge", "api_reference"]),
    teamId: z.string().regex(/^team_[a-z0-9]+$/),
    publicationId: z
      .string()
      .regex(/^pub_[a-z0-9]+$/)
      .nullable(),
    policyEpoch: z.number().int().nonnegative(),
  })
  .strict();
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
  const receipt = checkReceipt(parsed.data.eventId, raw);
  if (receipt === "conflict") return new Response("Conflicting event", { status: 409 });
  if (receipt === "new") {
    // Every event (activation, policy change, purge) changes what the docs
    // and the sitemap show, and nothing else.
    revalidateTag(`docs:${parsed.data.teamId}`, { expire: 0 });
    revalidateTag(`sitemap:${parsed.data.teamId}`, { expire: 0 });
    recordReceipt(parsed.data.eventId, raw);
  }
  return Response.json({ acknowledged: parsed.data.eventId });
}
