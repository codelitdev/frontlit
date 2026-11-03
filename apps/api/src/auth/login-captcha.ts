import type { HostedLoginCaptcha } from "@codelitdev/oauth-server-kit/express";

/** The hosted login page sends the email-OTP request here. The code itself is
 * only checked after the person proves they got the email, so this is the
 * request bots abuse to send mail. */
export const CAPTCHA_PROTECTED_ENDPOINTS = ["/email-otp/send-verification-otp"];

// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export const TURNSTILE_TESTING_SECRET = /^[123]x0{31}AA$/;

export type LoginCaptchaConfig = {
  siteKey: string;
  secretKey: string;
};

/** Cloudflare Turnstile on the hosted sign-in form. On only when both keys
 * are set: the page sends the widget's token and Better Auth's `captcha`
 * plugin verifies it, so one without the other would refuse every email
 * sign-in. `TURNSTILE_SECRET_KEY` alone is valid — it still turns on CAPTCHA
 * for public writes (`services/captcha.ts`). */
export function loginCaptchaConfig(
  env: Record<string, string | undefined> = process.env,
): LoginCaptchaConfig | undefined {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim();
  return siteKey && secretKey ? { siteKey, secretKey } : undefined;
}

export function toHostedLoginCaptcha(
  config: LoginCaptchaConfig | undefined,
): HostedLoginCaptcha | undefined {
  return config
    ? { provider: "cloudflare-turnstile", siteKey: config.siteKey }
    : undefined;
}
