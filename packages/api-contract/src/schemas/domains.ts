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

const hostnameSchema = z
  .string()
  .min(1)
  .max(255)
  .toLowerCase()
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    "Must be a valid domain name",
  );

const sitePathSchema = z
  .string()
  .max(500)
  .regex(/^\/\S*$/, 'Must be a site path starting with "/".');

/** An exact old path on the redirect host and where it goes on the site. */
export const redirectRuleSchema = z.object({
  from: sitePathSchema,
  to: sitePathSchema,
});

/** Put in front of every redirected path, e.g. `/docs`. Empty keeps paths. */
export const redirectPathPrefixSchema = z
  .string()
  .max(200)
  .regex(
    /^(\/[A-Za-z0-9._~-]+)*$/,
    'Must be empty or a path like "/docs" with no trailing slash.',
  );

export const redirectRulesSchema = z
  .array(redirectRuleSchema)
  .max(500)
  .refine(
    (rules) =>
      new Set(rules.map((rule) => rule.from.replace(/\/+$/, "") || "/")).size ===
      rules.length,
    "Each old path can only have one rule.",
  );

/** A host that only 301-redirects to the team's website. Rules match the
 * exact request path first; any other path gets `pathPrefix` in front. */
export const redirectDomainSchema = z.object({
  hostname: z.string(),
  pathPrefix: z.string(),
  rules: z.array(redirectRuleSchema),
  status: domainStatusSchema,
  verifiedAt: z.string().nullable(),
  /** The routing record to create: A records (apex) or a CNAME. */
  record: z.object({
    type: z.enum(["A", "CNAME"]),
    values: z.array(z.string()),
  }),
  /** Null until the team has run a DNS check. */
  routingSatisfied: z.boolean().nullable(),
  /** This host's own ownership TXT record. */
  verification: domainVerificationSchema,
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
  /** Pre-launch: the whole site is hidden from search engines (`noindex`,
   * robots.txt disallows all, empty sitemap). On for new sites; turned off
   * automatically when a custom domain is first verified. */
  hideFromSearch: z.boolean(),
  /** `PLATFORM_SITE_DOMAIN` — used to render `.{suffix}` before a slug
   * is claimed. */
  platformDomain: z.string(),
  /** Extra hosts that 301 to the website, e.g. an old docs host. */
  redirectDomains: z.array(redirectDomainSchema),
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

export const setHideFromSearchBodySchema = z.object({
  hideFromSearch: z.boolean(),
});

export const attachCustomDomainBodySchema = z.object({
  hostname: hostnameSchema,
});

export const addRedirectDomainBodySchema = z.object({
  hostname: hostnameSchema,
  pathPrefix: redirectPathPrefixSchema.default(""),
});

export const updateRedirectDomainBodySchema = z.object({
  pathPrefix: redirectPathPrefixSchema.optional(),
  rules: redirectRulesSchema.optional(),
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
  /** Team-wide pre-launch switch: every host serves `noindex`, robots.txt
   * disallows everything and the sitemap is empty. */
  hideFromSearch: z.boolean(),
  /** Set for a redirect domain: where its paths go on `canonicalHost`. */
  redirectTo: z
    .object({ pathPrefix: z.string(), rules: z.array(redirectRuleSchema) })
    .optional(),
});
