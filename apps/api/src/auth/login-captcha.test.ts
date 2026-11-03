import { describe, expect, it, vi } from "vitest";
import { makeTestDb } from "../test/db";
import { listenApp } from "../test/auth-app";

const siteKey = vi.hoisted(() => {
  // Cloudflare's always-passes testing keys. Read when better-auth.ts loads.
  process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  return process.env.TURNSTILE_SITE_KEY;
});

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import {
  TURNSTILE_TESTING_SECRET,
  loginCaptchaConfig,
  toHostedLoginCaptcha,
} from "./login-captcha";

describe("loginCaptchaConfig", () => {
  it("is on only when both keys are set, trimmed", () => {
    expect(loginCaptchaConfig({})).toBeUndefined();
    expect(loginCaptchaConfig({ TURNSTILE_SITE_KEY: "site" })).toBeUndefined();
    // A secret alone is valid: it still enables CAPTCHA on public writes.
    expect(loginCaptchaConfig({ TURNSTILE_SECRET_KEY: "secret" })).toBeUndefined();
    expect(
      loginCaptchaConfig({
        TURNSTILE_SITE_KEY: " site ",
        TURNSTILE_SECRET_KEY: "secret",
      }),
    ).toEqual({ siteKey: "site", secretKey: "secret" });
  });

  it("only hands the site key to the login page", () => {
    expect(toHostedLoginCaptcha(undefined)).toBeUndefined();
    expect(toHostedLoginCaptcha({ siteKey: "site", secretKey: "secret" })).toEqual({
      provider: "cloudflare-turnstile",
      siteKey: "site",
    });
  });

  it("recognises Cloudflare's testing secrets", () => {
    for (const secret of [
      "1x0000000000000000000000000000000AA",
      "2x0000000000000000000000000000000AA",
      "3x0000000000000000000000000000000AA",
    ]) {
      expect(TURNSTILE_TESTING_SECRET.test(secret)).toBe(true);
    }
    expect(TURNSTILE_TESTING_SECRET.test("0x4AAAAAAAreal")).toBe(false);
  });
});

describe("login with Turnstile configured", () => {
  it("renders the widget on the hosted login page", async () => {
    const listening = await listenApp();
    try {
      const response = await fetch(`${listening.origin}/login`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(`data-sitekey="${siteKey}"`);
      expect(html).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    } finally {
      await listening.close();
    }
  });

  it("refuses to email a sign-in code without a Turnstile token", async () => {
    const listening = await listenApp();
    try {
      const response = await fetch(
        `${listening.origin}/api/auth/email-otp/send-verification-otp`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body: JSON.stringify({ email: "someone@example.com", type: "sign-in" }),
        },
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "MISSING_RESPONSE",
      });
    } finally {
      await listening.close();
    }
  });
});
