import { describe, expect, it } from "vitest";
import {
  contract,
  domainSettingsSchema,
  setPrimaryCustomDomainBodySchema,
  setRedirectSubdomainBodySchema,
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
      platformDomain: "frontlit.app",
    });
    expect(settings.customDomains).toHaveLength(2);
    expect(setRedirectSubdomainBodySchema.parse({ redirectSubdomain: false })).toEqual({
      redirectSubdomain: false,
    });
    expect(
      setPrimaryCustomDomainBodySchema.parse({ hostname: "WWW.Example.com" }),
    ).toEqual({ hostname: "www.example.com" });
  });
});
