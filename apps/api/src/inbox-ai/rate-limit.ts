import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { rateLimitBuckets } from "../db/schema";
import { incrementCounter } from "../services/metrics";

async function hit(
    key: string,
    windowMs: number,
    max: number,
): Promise<boolean> {
    const now = new Date();
    const existing = await db.query.rateLimitBuckets.findFirst({
        where: eq(rateLimitBuckets.key, key),
    });
    if (!existing || existing.resetAt <= now) {
        await db
            .insert(rateLimitBuckets)
            .values({
                key,
                count: 1,
                resetAt: new Date(now.getTime() + windowMs),
            })
            .onConflictDoUpdate({
                target: rateLimitBuckets.key,
                set: {
                    count: 1,
                    resetAt: new Date(now.getTime() + windowMs),
                },
            });
        return true;
    }
    if (existing.count >= max) return false;
    await db
        .update(rateLimitBuckets)
        .set({ count: sql`${rateLimitBuckets.count} + 1` })
        .where(eq(rateLimitBuckets.key, key));
    return true;
}

function clientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress || "unknown";
}

export function publicTeamIdFromPath(req: Request): string {
    const match = (req.originalUrl || req.url || "").match(
        /\/public\/([^/?#]+)/,
    );
    return match?.[1] ?? "unknown";
}

type Limit = { key: string; windowMs: number; max: number };

export function postgresPublicLimit(input: {
    route: string;
    limits: (req: Request) => Limit[];
    message?: string;
}) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            for (const limit of input.limits(req)) {
                const allowed = await hit(limit.key, limit.windowMs, limit.max);
                if (!allowed) {
                    incrementCounter("rate_limit_hits_total", {
                        route: input.route,
                    });
                    res.status(429).json({
                        error: "too_many_requests",
                        error_description:
                            input.message ??
                            "Too many requests. Please wait a moment and try again.",
                    });
                    return;
                }
            }
            next();
        } catch {
            next();
        }
    };
}

export { clientIp };
