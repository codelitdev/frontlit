import { z } from "zod";
import {
    makeCreateDocumentBodySchema,
    makeDocumentSchema,
    makeUpdateDocumentBodySchema,
} from "./documents";

export const documentationMetaSchema = z.object({
    sectionId: z.string().optional(),
    order: z.number().default(0),
});

export const documentationSchema = makeDocumentSchema(documentationMetaSchema);
export const createDocumentationBodySchema = makeCreateDocumentBodySchema(
    documentationMetaSchema,
);
export const updateDocumentationBodySchema = makeUpdateDocumentBodySchema(
    documentationMetaSchema.partial(),
);

export const documentationSectionSchema = z.object({
    sectionId: z.string(),
    name: z.string(),
    slug: z.string(),
    order: z.number(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const createDocumentationSectionBodySchema = z.object({
    name: z.string().min(1),
    order: z.number().optional(),
});

export const updateDocumentationSectionBodySchema = z.object({
    name: z.string().optional(),
    order: z.number().optional(),
});

export const searchDocumentationQuerySchema = z.object({
    q: z.string().min(1),
    k: z.coerce.number().int().min(1).max(20).optional(),
});

export const documentationSearchResultSchema = z.object({
    documentId: z.string(),
    slug: z.string(),
    title: z.string().nullable(),
    heading: z.string().nullable(),
    anchor: z.string().nullable(),
    content: z.string(),
    similarity: z.number(),
});
