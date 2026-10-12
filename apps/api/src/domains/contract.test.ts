import { describe, expect, it } from "vitest";
import {
  contract,
  domainSettingsSchema,
  domainVerificationRecordsSchema,
  setSubdomainPublicBodySchema,
} from "@frontlit/api-contract";

describe("domains contract", () => {
  it("exposes subdomainPublic, expanded records, and a dedicated hide/show write", () => {
    expect(contract.domains.setSubdomainPublic.method).toBe("PATCH");
    expect(contract.domains.setSubdomainPublic.path).toBe("/domain/subdomain-public");
    expect(contract.public.resolveHost.description).toMatch(/public claimed/i);

    const records = domainVerificationRecordsSchema.parse({
      cnameTarget: "sites.frontlit.app",
      txtName: "_frontlit-verify.www.example.com",
      txtValue: "token",
      kind: "cname",
      txtSatisfied: true,
      routingSatisfied: true,
    });
    expect(records.txtSatisfied).toBe(true);
    expect(records.routingSatisfied).toBe(true);

    const settings = domainSettingsSchema.parse({
      subdomain: {
        name: "acme",
        hostname: "acme.frontlit.app",
      },
      customDomain: {
        hostname: "www.example.com",
        status: "verified",
        verifiedAt: "2026-01-01T00:00:00.000Z",
      },
      canonicalHost: "www.example.com",
      verificationRecords: records,
      subdomainPublic: false,
      platformDomain: "frontlit.app",
    });
    expect(settings.subdomainPublic).toBe(false);
    expect(setSubdomainPublicBodySchema.parse({ subdomainPublic: false })).toEqual({
      subdomainPublic: false,
    });
  });
});
