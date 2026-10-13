import { Router } from "express";
import rateLimit from "express-rate-limit";
import express from "express";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";
import { processInboundMail } from "./inbound";
import { fromGenericJson, fromMailgunForm } from "./providers";
import {
  assertTrustedSubscribeUrl,
  mailFromSesNotification,
  parseSnsMessage,
  SesInboundError,
  verifySnsMessage,
} from "./ses";
import { verifyGenericSignature, verifyMailgunSignature } from "./verify";

const router = Router();

const inboundLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use("/webhooks/inbound-email", inboundLimiter);
router.use(
  "/webhooks/inbound-email",
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }),
);
router.use(
  "/webhooks/inbound-email",
  express.urlencoded({ extended: true, limit: "2mb" }),
);

router.post("/webhooks/inbound-email", async (req, res) => {
  const rawBody = (req as { rawBody?: string }).rawBody ?? "";
  if (
    !verifyGenericSignature(
      rawBody,
      header(req, "x-frontlit-timestamp"),
      header(req, "x-frontlit-signature"),
    )
  ) {
    incrementCounter("webhook_signature_failures_total");
    return res.status(401).json({ error: "invalid_signature" });
  }

  const mail = fromGenericJson(req.body);
  if (!mail) return res.status(400).json({ error: "invalid_payload" });
  const result = await processInboundMail(mail);
  return res.status(202).json(result);
});

router.post("/webhooks/inbound-email/mailgun", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (
    !verifyMailgunSignature({
      timestamp: stringField(body, "timestamp"),
      token: stringField(body, "token"),
      signature: stringField(body, "signature"),
    })
  ) {
    incrementCounter("webhook_signature_failures_total");
    return res.status(401).json({ error: "invalid_signature" });
  }
  const mail = fromMailgunForm(body);
  if (!mail) return res.status(400).json({ error: "invalid_payload" });
  const result = await processInboundMail(mail);
  return res.status(202).json(result);
});

router.post("/webhooks/inbound-email/ses", async (req, res) => {
  try {
    const rawBody = (req as { rawBody?: string }).rawBody ?? "";
    const envelope = parseSnsMessage(rawBody);
    await verifySnsMessage(envelope);

    if (envelope.Type === "SubscriptionConfirmation") {
      const url = assertTrustedSubscribeUrl(envelope.SubscribeURL ?? "");
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return res.status(400).json({ error: "invalid_subscribe" });
      }
      return res.status(200).json({ status: "subscribed" });
    }

    if (envelope.Type !== "Notification") {
      return res.status(200).json({ status: "ignored" });
    }

    const mail = await mailFromSesNotification(envelope.Message);
    const result = await processInboundMail(mail);
    return res.status(202).json(result);
  } catch (error) {
    if (error instanceof SesInboundError) {
      if (error.kind === "authentication") {
        incrementCounter("webhook_signature_failures_total");
        return res.status(401).json({ error: error.message });
      }
      if (error.kind === "transient") {
        return res.status(503).json({ error: error.message });
      }
      if (error.kind === "configuration") {
        return res.status(503).json({ error: error.message });
      }
      return res.status(400).json({ error: error.message });
    }
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "SES inbound webhook failed",
    );
    return res.status(500).json({ error: "server_error" });
  }
});

function header(req: { headers: Record<string, unknown> }, name: string) {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function stringField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

export default router;
