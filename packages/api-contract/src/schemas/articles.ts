import { z } from "zod";
import {
    makeCreateDocumentBodySchema,
    makeDocumentSchema,
    makeUpdateDocumentBodySchema,
} from "./documents";

export const articleMetaSchema = z.object({
    tags: z.array(z.string()).default([]),
});

export const articleSchema = makeDocumentSchema(articleMetaSchema);
export const createArticleBodySchema =
    makeCreateDocumentBodySchema(articleMetaSchema);
export const updateArticleBodySchema = makeUpdateDocumentBodySchema(
    articleMetaSchema.partial(),
);
