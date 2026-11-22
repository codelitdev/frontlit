import { describe, expect, it } from "vitest";
import { sessionCookieName } from "@codelitdev/oauth-server-kit/better-auth";
import { authCookieOptions } from "./cookie-options";

describe("authCookieOptions", () => {
  it("names the session cookie for each deployment shape", () => {
    expect(
      sessionCookieName(
        authCookieOptions({
          baseURL: "https://api.frontlit.example",
          cookieDomain: "frontlit.example",
        }),
      ),
    ).toBe("__Secure-frontlit.session_token");
    expect(
      sessionCookieName(authCookieOptions({ baseURL: "https://api.frontlit.example" })),
    ).toBe("__Host-frontlit.session_token");
    expect(
      sessionCookieName(authCookieOptions({ baseURL: "http://localhost:4000" })),
    ).toBe("frontlit.session_token");
  });

  it("shares the cookie across subdomains only when a domain is set", () => {
    expect(
      authCookieOptions({
        baseURL: "https://api.frontlit.example",
        cookieDomain: "frontlit.example",
      }).crossSubDomainCookies,
    ).toEqual({ enabled: true, domain: "frontlit.example" });
    expect(
      authCookieOptions({ baseURL: "https://api.frontlit.example" })
        .crossSubDomainCookies,
    ).toBeUndefined();
  });

  it("reads the client address only from the internal header", () => {
    expect(authCookieOptions({ baseURL: "http://localhost:4000" }).ipAddress).toEqual({
      ipAddressHeaders: ["x-frontlit-client-ip"],
    });
  });
});
