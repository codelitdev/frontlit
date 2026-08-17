import { z } from "zod";
import {
    makeCreateDocumentBodySchema,
    makeDocumentSchema,
    makeUpdateDocumentBodySchema,
} from "./documents";

export const productUpdateMetaSchema = z.object({
    version: z.string().optional(),
    labels: z.array(z.string()).default([]),
    releaseDate: z.string().optional(),
    github: z
        .object({
            releaseId: z.number(),
            releaseUrl: z.string(),
            tagName: z.string(),
        })
        .optional(),
    indexable: z.boolean().optional(),
});

export const productUpdateSchema = makeDocumentSchema(
    productUpdateMetaSchema,
).extend({
    index: z
        .object({
            state: z.enum(["pending", "indexed", "failed", "excluded"]),
            lastError: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
});
export const createProductUpdateBodySchema = makeCreateDocumentBodySchema(
    productUpdateMetaSchema,
);
export const updateProductUpdateBodySchema = makeUpdateDocumentBodySchema(
    productUpdateMetaSchema.partial(),
);

export const githubIntegrationConfigSchema = z.object({
    token: z.string().min(1),
    repo: z.string().min(1).describe("owner/repo, e.g. courselit/courselit"),
});

export const githubIntegrationSchema = z.object({
    connected: z.boolean(),
    repo: z.string().nullable(),
});

export const importGithubReleasesResponseSchema = z.object({
    imported: z.number(),
    skipped: z.number(),
});
