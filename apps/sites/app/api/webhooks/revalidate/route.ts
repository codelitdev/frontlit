import { revalidateTag } from "next/cache";
import { verifyWebhookSignature } from "@/lib/webhook-signing";

/**
 * ISR revalidation webhook (architecture.md §12.2) — apps/api pings this
 * whenever a team's published content changes, so cached pages refresh
 * immediately instead of waiting out the 60s time-bound fallback
 * (`lib/api.ts`'s `teamCache`). One of the sole exceptions to "every route
 * lives under `/sites/[teamId]`": this is a server-to-server callback
 * authenticated by an HMAC signature, not a tenant host.
 */
export async function POST(request: Request) {
    const secret = process.env.REVALIDATE_WEBHOOK_SECRET;
    if (!secret) return new Response("Not configured", { status: 404 });

    const signature = request.headers.get("x-frontlit-signature");
    const timestamp = Number(request.headers.get("x-frontlit-timestamp"));
    const rawBody = await request.text();

    if (
        !signature ||
        !verifyWebhookSignature(secret, rawBody, timestamp, signature)
    ) {
        return new Response("Invalid signature", { status: 401 });
    }

    const { teamId } = JSON.parse(rawBody) as { teamId?: string };
    if (!teamId) return new Response("Missing teamId", { status: 400 });

    // A webhook needs the tag to expire immediately, not just go stale
    // (Next.js's `profile="max"` stale-while-revalidate default) — this is
    // exactly the case the docs call out `{ expire: 0 }` for.
    revalidateTag(`team:${teamId}`, { expire: 0 });
    return Response.json({ revalidated: true });
}
