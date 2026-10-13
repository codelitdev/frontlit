import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captchaProvider, verifyCaptcha } from "./captcha";

describe("captcha", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("defaults to 'none' (honeypot-only) when no secret is configured", () => {
    delete process.env.CAPTCHA_PROVIDER;
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(captchaProvider()).toBe("none");
  });

  it("defaults to 'turnstile' once a secret is configured", () => {
    delete process.env.CAPTCHA_PROVIDER;
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(captchaProvider()).toBe("turnstile");
  });

  it("respects an explicit CAPTCHA_PROVIDER override", () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.CAPTCHA_PROVIDER = "none";
    expect(captchaProvider()).toBe("none");
  });

  it("always passes when the provider is 'none', even with no token", async () => {
    process.env.CAPTCHA_PROVIDER = "none";
    expect(await verifyCaptcha(undefined)).toBe(true);
  });

  it("fails closed when turnstile is configured but no token is supplied", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.CAPTCHA_PROVIDER = "turnstile";
    expect(await verifyCaptcha(undefined)).toBe(false);
  });

  it("calls Cloudflare's siteverify endpoint and trusts its verdict", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.CAPTCHA_PROVIDER = "turnstile";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await verifyCaptcha("a-real-token", "1.2.3.4")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      secret: "secret",
      response: "a-real-token",
      remoteip: "1.2.3.4",
    });
  });

  it("fails closed when Cloudflare rejects the token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }),
    );
    expect(await verifyCaptcha("bad-token")).toBe(false);
  });

  it("fails closed when the verification request throws", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await verifyCaptcha("a-token")).toBe(false);
  });
});
