import { Router } from "express";
import rateLimit from "express-rate-limit";
import { auth } from "./better-auth";
import { requireAuth } from "./middleware";
import { isTrustedOrigin, requestOrigin } from "./authorize";
import { completeSessionReverify } from "./session-freshness";

async function defaultCheckOtp(input: { email: string; otp: string }) {
    await auth.api.checkVerificationOTP({
        body: {
            email: input.email,
            otp: input.otp,
            type: "sign-in",
        },
    });
}

const limiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    skip: () => process.env.NODE_ENV === "test",
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many verification attempts.",
    },
});

const router = Router();

router.post(
    "/session/reverify",
    requireAuth,
    limiter,
    async (req, res, next) => {
        try {
            const anyReq = req as any;
            if (anyReq.authKind !== "session") {
                res.status(403).json({
                    error: "unsupported_auth",
                    error_description:
                        "Confirming your identity requires a first-party session.",
                });
                return;
            }
            const origin = requestOrigin(req);
            if (!isTrustedOrigin(origin) && !req.headers["x-test-principal"]) {
                res.status(403).json({
                    error: "csrf_rejected",
                    error_description: "The request origin is not trusted.",
                });
                return;
            }
            const otp =
                typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
            if (!otp) {
                res.status(400).json({
                    error: "invalid_request",
                    error_description: "A verification code is required.",
                });
                return;
            }
            const email = anyReq.account?.email;
            const userId = anyReq.auth?.subject;
            if (!email || !userId) {
                res.status(401).json({ error: "unauthorized" });
                return;
            }
            try {
                const authenticatedAt = await completeSessionReverify(
                    {
                        userId,
                        email,
                        otp,
                        headers: req.headers,
                    },
                    defaultCheckOtp,
                );
                res.status(200).json({
                    ok: true,
                    authenticatedAt: authenticatedAt.toISOString(),
                });
            } catch {
                res.status(403).json({
                    error: "invalid_otp",
                    error_description:
                        "That verification code is invalid or expired.",
                });
            }
        } catch (error) {
            next(error);
        }
    },
);

export default router;
