import { describe, expect, it } from "vitest";
import {
  addRedirectDomainBodySchema,
  contract,
  domainSettingsSchema,
  setHideFromSearchBodySchema,
  setPrimaryCustomDomainBodySchema,
  setRedirectSubdomainBodySchema,
  updateRedirectDomainBodySchema,
} from "@frontlit/api-contract";

describe("domains contract", () => {
  it("exposes per-host records, a primary write and a subdomain redirect write", () => {
    expect(contract.domains.setRedirectSubdomain.method).toBe("PATCH");
    expect(contract.domains.setRedirectSubdomain.path).toBe(
      "/domain/subdomain-redirect",
    );
    expect(contract.domains.setPrimaryCustomDomain.path).toBe("/domain/custom/primary");
    expect(contract.public.resolveHost.description).toMatch(/redirect/i);

    const settings = domainSettingsSchema.parse({
      subdomain: { name: "acme", hostname: "acme.frontlit.app" },
      customDomains: [
        {
          hostname: "example.com",
          primary: true,
          status: "verified",
          verifiedAt: "2026-01-01T00:00:00.000Z",
          record: { type: "A", values: ["198.51.100.10"] },
          routingSatisfied: true,
        },
        {
          hostname: "www.example.com",
          primary: false,
          status: "pending",
          verifiedAt: null,
          record: { type: "CNAME", values: ["sites.frontlit.app"] },
          routingSatisfied: null,
        },
      ],
      verification: {
        txtName: "_frontlit-verify.example.com",
        txtValue: "token",
        txtSatisfied: true,
      },
      canonicalHost: "example.com",
      redirectSubdomain: true,
      hideFromSearch: false,
      platformDomain: "frontlit.app",
      redirectDomains: [],
    });
    expect(settings.customDomains).toHaveLength(2);
    expect(setRedirectSubdomainBodySchema.parse({ redirectSubdomain: false })).toEqual({
      redirectSubdomain: false,
    });
    expect(contract.domains.setHideFromSearch.path).toBe("/domain/search-visibility");
    expect(setHideFromSearchBodySchema.parse({ hideFromSearch: true })).toEqual({
      hideFromSearch: true,
    });
    expect(
      setPrimaryCustomDomainBodySchema.parse({ hostname: "WWW.Example.com" }),
    ).toEqual({ hostname: "www.example.com" });
  });

  it("validates redirect domain prefixes and per-path rules", () => {
    expect(contract.domains.updateRedirectDomain.path).toBe(
      "/domain/redirect-domains/:hostname",
    );
    expect(addRedirectDomainBodySchema.parse({ hostname: "Docs.Example.com" })).toEqual(
      {
        hostname: "docs.example.com",
        pathPrefix: "",
      },
    );
    for (const pathPrefix of ["/docs", "/docs/v2", ""])
      expect(updateRedirectDomainBodySchema.safeParse({ pathPrefix }).success).toBe(
        true,
      );
    for (const pathPrefix of ["docs", "/docs/", "/a b", "https://x.com"])
      expect(updateRedirectDomainBodySchema.safeParse({ pathPrefix }).success).toBe(
        false,
      );
    expect(
      updateRedirectDomainBodySchema.safeParse({
        rules: [{ from: "/api/uploadMedia", to: "/docs/api/upload-media" }],
      }).success,
    ).toBe(true);
    // A rule must be a site path, and each old path has one rule.
    expect(
      updateRedirectDomainBodySchema.safeParse({
        rules: [{ from: "/a", to: "https://evil.example" }],
      }).success,
    ).toBe(false);
    expect(
      updateRedirectDomainBodySchema.safeParse({
        rules: [
          { from: "/a", to: "/b" },
          { from: "/a/", to: "/c" },
        ],
      }).success,
    ).toBe(false);
  });
});
