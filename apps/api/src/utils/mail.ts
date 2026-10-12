import { createTransport } from "nodemailer";
import { logger } from "../services/log";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
};

export class MailDeliveryError extends Error {
  constructor(message = "mail_delivery_failed") {
    super(message);
    this.name = "MailDeliveryError";
  }
}

export class MailNotConfiguredError extends MailDeliveryError {
  constructor() {
    super("mail_not_configured");
    this.name = "MailNotConfiguredError";
  }
}

function smtpConfig() {
  const host = process.env.EMAIL_HOST;
  // Host is required; user/pass are optional so auth-less sinks
  // (Mailpit, smtp4dev) work without dummy credentials.
  if (!host) return null;
  const user = process.env.EMAIL_USER;
  return {
    host,
    port: Number(process.env.EMAIL_PORT) || 587,
    auth: user ? { user, pass: process.env.EMAIL_PASS } : undefined,
    from: process.env.EMAIL_FROM,
  };
}

/** Sends a transactional email over SMTP when configured. If SMTP env is
 * missing, dumps the message to the console outside production and throws
 * `MailNotConfiguredError` in production. Transport failures become
 * `MailDeliveryError`. */
export async function sendMail(message: MailMessage): Promise<void> {
  const config = smtpConfig();
  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[Dev] Email", message); // eslint-disable-line no-console
      return;
    }
    logger.error({ to: message.to }, "Cannot send email: SMTP is not configured");
    throw new MailNotConfiguredError();
  }

  try {
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      ...(config.auth ? { auth: config.auth } : {}),
    });
    await transporter.sendMail({
      from: message.from ?? config.from,
      replyTo: message.replyTo,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    logger.error(
      {
        to: message.to,
        errorType: error instanceof Error ? error.name : typeof error,
      },
      "Email delivery failed",
    );
    throw new MailDeliveryError();
  }
}
