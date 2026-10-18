import { z } from "zod";

export const domainStatusSchema = z.enum(["pending", "verified", "failed"]);

/** One team owns one website. The subdomain is chosen explicitly during
 * setup and its full hostname is computed from `PLATFORM_SITE_DOMAIN`. */
export const subdomainSchema = z.object({
  name: z.string(),
  hostname: z.string(),
});

/** One host of the team's custom domain. Attaching an apex or `www.` host
 * adds its pair; each host's routing is verified independently. */
export const customDomainSchema = z.object({
  hostname: z.string(),
  /** Canonical once verified. Exactly one host is primary. */
  primary: z.boolean(),
  status: domainStatusSchema,
  verifiedAt: z.string().nullable(),
  /** The routing record to create: A records (apex) or a CNAME. */
  record: z.object({
    type: z.enum(["A", "CNAME"]),
    values: z.array(z.string()),
  }),
  /** Null until the team has run a DNS check. */
  routingSatisfied: z.boolean().nullable(),
});

/** The ownership TXT record shared by every custom host — present while a
 * custom domain is attached. */
export const domainVerificationSchema = z.object({
  txtName: z.string(),
  txtValue: z.string(),
  /** Null until the team has run a DNS check. */
  txtSatisfied: z.boolean().nullable(),
});

export const domainSettingsSchema = z.object({
  subdomain: subdomainSchema.nullable(),
  /** Empty when no custom domain is attached. */
  customDomains: z.array(customDomainSchema),
  verification: domainVerificationSchema.nullable(),
  /** The verified primary custom host, else the other verified custom
   * host, else the FrontLit subdomain. Null until a subdomain is claimed. */
  canonicalHost: z.string().nullable(),
  /** When true (default) every non-canonical host, including the FrontLit
   * subdomain, 301-redirects to the canonical host. When false the
   * subdomain keeps serving the site. */
  redirectSubdomain: z.boolean(),
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

export const setRedirectSubdomainBodySchema = z.object({
  redirectSubdomain: z.boolean(),
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

export const setPrimaryCustomDomainBodySchema = z.object({
  /** One of the attached custom hosts. */
  hostname: z.string().min(1).max(255).toLowerCase(),
});

/** Answers `apps/sites`' tenant-resolution middleware and doubles as the
 * on-demand TLS "ask" (architecture.md §12.1/§12.2) — only ever answers
 * for hosts it actually knows. */
export const resolveHostQuerySchema = z.object({
  host: z.string().min(1),
});

export const resolveHostResponseSchema = z.object({
  teamId: z.string(),
  /** Used for canonical URLs and as the redirect target. */
  canonicalHost: z.string(),
  /** True when the requested host should 301 to `canonicalHost`. */
  redirect: z.boolean(),
});
