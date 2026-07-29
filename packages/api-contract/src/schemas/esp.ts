import { z } from "zod";

export const espProviders = [
    "smtp",
    "sendgrid",
    "mailgun",
    "postmark",
    "ses",
    "resend",
    "custom",
] as const;

export const espProviderSchema = z.enum(espProviders);

/** Public SendLit ESP shape. Credentials are write-only: SendLit returns only
 * `hasPassword`, and FrontLit passes that public shape through unchanged. */
export const espConfigSchema = z.object({
    espId: z.string(),
    name: z.string(),
    isDefault: z.boolean(),
    provider: z.string(),
    host: z.string(),
    port: z.number(),
    secure: z.boolean(),
    username: z.string().nullable().optional(),
    hasPassword: z.boolean(),
    fromName: z.string().nullable().optional(),
    fromEmail: z.string().nullable().optional(),
    lastTestedAt: z.string().nullable().optional(),
    lastTestStatus: z.enum(["success", "failed"]).nullable().optional(),
    lastTestError: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
});

export const upsertEspConfigBodySchema = z.object({
    provider: espProviderSchema,
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().optional(),
    /** Omit to retain the existing secret. */
    password: z.string().optional(),
    fromName: z.string().optional(),
    fromEmail: z.string().email().optional(),
});

export const testEspConfigBodySchema = z.object({
    to: z.string().email(),
});

export const testEspConfigResponseSchema = z.object({
    success: z.boolean(),
    error: z.string().optional(),
});
