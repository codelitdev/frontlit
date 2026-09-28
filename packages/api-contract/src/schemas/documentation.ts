import { z } from "zod";
import {
  makeCreateDocumentBodySchema,
  makeDocumentSchema,
  makeUpdateDocumentBodySchema,
} from "./documents";

export const documentationMetaSchema = z.object({
  sectionId: z.string().optional(),
  order: z.number().default(0),
  /** When false, the published page stays live but is not chunked for
   * search or the chatbot. Defaults to true when omitted. */
  indexable: z.boolean().optional(),
});

export const documentationIndexSchema = z.object({
  state: z.enum(["pending", "indexed", "failed", "excluded"]),
  lastError: z.string().nullable().optional(),
});
export type DocumentationIndex = z.infer<typeof documentationIndexSchema>;

export const documentationSchema = makeDocumentSchema(documentationMetaSchema).extend({
  index: documentationIndexSchema.nullable().optional(),
});
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
  kind: z.enum(["blog", "doc", "changelog"]).optional(),
});
