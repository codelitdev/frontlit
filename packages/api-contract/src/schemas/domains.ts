import { z } from "zod";

/** `subdomain` is the always-available `<slug>.<DOMAIN>` host; `custom` is
 * the optional attached domain, once verified (architecture.md §12.1).
 * Not a stored column — derived server-side from whether the hostname ends
 * in the deployment's `DOMAIN`. */
export const domainKindSchema = z.enum(["subdomain", "custom"]);

export const domainStatusSchema = z.enum(["pending", "verified", "failed"]);

export const domainSchema = z.object({
    domainId: z.string(),
    hostname: z.string(),
    kind: domainKindSchema,
    status: domainStatusSchema,
    isPrimary: z.boolean(),
    verifiedAt: z.string().nullable(),
    createdAt: z.string().nullable(),
});

/** The DNS records a team must create for their custom domain to verify —
 * only present while a custom domain is attached. */
export const domainVerificationRecordsSchema = z.object({
    cnameTarget: z.string(),
    txtName: z.string(),
    txtValue: z.string(),
});

export const domainSettingsSchema = z.object({
    subdomain: domainSchema,
    customDomain: domainSchema.nullable(),
    verificationRecords: domainVerificationRecordsSchema.nullable(),
});

export const setTeamSubdomainBodySchema = z.object({
    /** The `<slug>` portion only, not the full hostname — `.{DOMAIN}` is
     * appended server-side. */
    slug: z
        .string()
        .min(1)
        .max(63)
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase alphanumeric segments separated by single hyphens"),
});

export const attachCustomDomainBodySchema = z.object({
    hostname: z
        .string()
        .min(1)
        .max(255)
        .toLowerCase()
        .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Must be a valid domain name"),
});

export const setPrimaryDomainBodySchema = z.object({
    primary: domainKindSchema,
});

/** Answers `apps/sites`' tenant-resolution middleware and doubles as the
 * on-demand TLS "ask" (architecture.md §12.1/§12.2) — only ever answers
 * for hosts it actually knows. */
export const resolveHostQuerySchema = z.object({
    host: z.string().min(1),
});

export const resolveHostResponseSchema = z.object({
    teamId: z.string(),
    /** True if `host` is already this team's primary host — the caller
     * should NOT redirect. False means the caller should 308 to `primaryHost`. */
    isPrimary: z.boolean(),
    primaryHost: z.string(),
});
