import { z } from "zod";
import {
    makeCreateDocumentBodySchema,
    makeDocumentSchema,
    makeUpdateDocumentBodySchema,
} from "./documents";

export const blogMetaSchema = z.object({
    tags: z.array(z.string()).default([]),
});

export const blogSchema = makeDocumentSchema(blogMetaSchema);
export const createBlogBodySchema =
    makeCreateDocumentBodySchema(blogMetaSchema);
export const updateBlogBodySchema = makeUpdateDocumentBodySchema(
    blogMetaSchema.partial(),
);
