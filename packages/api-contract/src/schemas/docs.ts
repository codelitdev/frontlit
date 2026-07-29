import { z } from "zod";
import {
    makeCreateDocumentBodySchema,
    makeDocumentSchema,
    makeUpdateDocumentBodySchema,
} from "./documents";

export const docMetaSchema = z.object({
    sectionId: z.string().optional(),
    order: z.number().default(0),
});

export const docSchema = makeDocumentSchema(docMetaSchema);
export const createDocBodySchema = makeCreateDocumentBodySchema(docMetaSchema);
export const updateDocBodySchema = makeUpdateDocumentBodySchema(
    docMetaSchema.partial(),
);

export const docSectionSchema = z.object({
    sectionId: z.string(),
    name: z.string(),
    slug: z.string(),
    order: z.number(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const createDocSectionBodySchema = z.object({
    name: z.string().min(1),
    order: z.number().optional(),
});

export const updateDocSectionBodySchema = z.object({
    name: z.string().optional(),
    order: z.number().optional(),
});

export const searchDocsQuerySchema = z.object({
    q: z.string().min(1),
    k: z.coerce.number().int().min(1).max(20).optional(),
});

export const docSearchResultSchema = z.object({
    documentId: z.string(),
    slug: z.string(),
    title: z.string().nullable(),
    heading: z.string().nullable(),
    anchor: z.string().nullable(),
    content: z.string(),
    similarity: z.number(),
});
