import { z } from "zod";
import {
  makeCreateDocumentBodySchema,
  makeDocumentSchema,
  makeUpdateDocumentBodySchema,
} from "./documents";

export const articleMetaSchema = z.object({
  tags: z.array(z.string()).default([]),
  indexable: z.boolean().optional(),
});

export const articleSchema = makeDocumentSchema(articleMetaSchema).extend({
  index: z
    .object({
      state: z.enum(["pending", "indexed", "failed", "excluded"]),
      lastError: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export const createArticleBodySchema = makeCreateDocumentBodySchema(articleMetaSchema);
export const updateArticleBodySchema = makeUpdateDocumentBodySchema(
  articleMetaSchema.partial(),
);
