import { z } from "zod";

export const mediaSchema = z.object({
    mediaId: z.string(),
    mediaLitId: z.string(),
    url: z.string(),
    thumbnailUrl: z.string().nullable().optional(),
    fileName: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    size: z.number().nullable().optional(),
    alt: z.string().nullable().optional(),
    caption: z.string().nullable().optional(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const mediaUploadSignatureSchema = z.object({
    signature: z.string(),
    endpoint: z.string(),
});

export const createMediaBodySchema = z.object({
    mediaLitId: z.string().min(1),
    alt: z.string().optional(),
    caption: z.string().optional(),
});

export const updateMediaBodySchema = z.object({
    alt: z.string().optional(),
    caption: z.string().optional(),
});

export const listMediaQuerySchema = z.object({
    offset: z.coerce.number().int().min(1).optional(),
    itemsPerPage: z.coerce.number().int().min(1).optional(),
});
