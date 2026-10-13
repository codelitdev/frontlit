import { z } from "zod";

export const domainStatusSchema = z.enum(["pending", "verified", "failed"]);

/** One team owns one website. The subdomain is chosen explicitly during
 * setup and its full hostname is computed from `PLATFORM_SITE_DOMAIN`. */
export const subdomainSchema = z.object({
  name: z.string(),
  hostname: z.string(),
});

export const customDomainSchema = z.object({
  hostname: z.string(),
  status: domainStatusSchema,
  verifiedAt: z.string().nullable(),
});

/** The DNS records a team must create for their custom domain to verify —
 * present while a custom domain is attached (pending and verified). */
export const domainVerificationRecordsSchema = z.object({
  cnameTarget: z.string(),
  txtName: z.string(),
  txtValue: z.string(),
  /** Apex hosts use ALIAS/ANAME/CNAME-flattening; others use a CNAME. */
  kind: z.enum(["cname", "alias"]),
  /** Null until the team has run a DNS check. */
  txtSatisfied: z.boolean().nullable(),
  routingSatisfied: z.boolean().nullable(),
});

export const domainSettingsSchema = z.object({
  subdomain: subdomainSchema.nullable(),
  customDomain: customDomainSchema.nullable(),
  /** Null until the team has claimed a FrontLit subdomain. */
  canonicalHost: z.string().nullable(),
  verificationRecords: domainVerificationRecordsSchema.nullable(),
  /** True when no subdomain is claimed yet. May be false only while a
   * custom domain is verified. */
  subdomainPublic: z.boolean(),
  /** `PLATFORM_SITE_DOMAIN` — used to render `.{suffix}` before a slug
   * is claimed. */
  platformDomain: z.string(),
});

export const setTeamSubdomainBodySchema = z.object({
  /** The `<slug>` portion only, not the full hostname —
   * `.{PLATFORM_SITE_DOMAIN}` is
   * appended server-side. */
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Must be lowercase alphanumeric segments separated by single hyphens",
    ),
});

export const setSubdomainPublicBodySchema = z.object({
  subdomainPublic: z.boolean(),
});

export const attachCustomDomainBodySchema = z.object({
  hostname: z
    .string()
    .min(1)
    .max(255)
    .toLowerCase()
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      "Must be a valid domain name",
    ),
});

/** Answers `apps/sites`' tenant-resolution middleware and doubles as the
 * on-demand TLS "ask" (architecture.md §12.1/§12.2) — only ever answers
 * for hosts it actually knows. */
export const resolveHostQuerySchema = z.object({
  host: z.string().min(1),
});

export const resolveHostResponseSchema = z.object({
  teamId: z.string(),
  /** Both known hosts serve the same site. This is used for canonical URLs. */
  canonicalHost: z.string(),
});
