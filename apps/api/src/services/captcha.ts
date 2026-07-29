import { logger } from "./log";
import { incrementCounter } from "./metrics";

export type CaptchaProvider = "turnstile" | "none";

/** Defaults to `none` (honeypot-only) unless a secret is actually
 * configured — self-hosters get graceful degradation instead of every
 * public write failing closed (architecture.md §13.3). */
export function captchaProvider(): CaptchaProvider {
    const configured = process.env.CAPTCHA_PROVIDER;
    if (configured === "turnstile" || configured === "none") return configured;
    return process.env.TURNSTILE_SECRET_KEY ? "turnstile" : "none";
}

/**
 * Verifies a Cloudflare Turnstile token server-side before accepting a
 * public write (`/leads`, `/tickets`, ticket-thread replies — architecture.md
 * §13.3). One of three stacked defenses alongside the honeypot field and
 * rate limiting; a missing/invalid token fails closed once Turnstile is
 * actually configured.
 */
export async function verifyCaptcha(
    token: string | undefined,
    remoteIp?: string,
): Promise<boolean> {
    if (captchaProvider() === "none") return true;
    if (!token) {
        incrementCounter("captcha_failures_total", { reason: "missing_token" });
        return false;
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        incrementCounter("captcha_failures_total", {
            reason: "not_configured",
        });
        return false;
    }

    try {
        const res = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    secret,
                    response: token,
                    remoteip: remoteIp,
                }),
            },
        );
        const body = (await res.json()) as { success?: boolean };
        if (body.success !== true)
            incrementCounter("captcha_failures_total", { reason: "rejected" });
        return body.success === true;
    } catch (err) {
        logger.warn(
            { error: err instanceof Error ? err.message : String(err) },
            "Turnstile verification request failed",
        );
        incrementCounter("captcha_failures_total", { reason: "request_error" });
        return false;
    }
}
