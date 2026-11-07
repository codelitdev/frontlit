import { z } from "zod";
import {
  makeCreateDocumentBodySchema,
  makeDocumentSchema,
  makeUpdateDocumentBodySchema,
} from "./documents";

/** Keep a Changelog change types (https://keepachangelog.com/). */
export const productUpdateLabels = [
  "added",
  "changed",
  "deprecated",
  "removed",
  "fixed",
  "security",
] as const;
export type ProductUpdateLabel = (typeof productUpdateLabels)[number];

export const productUpdateMetaSchema = z.object({
  version: z.string().max(64).optional(),
  labels: z
    .array(z.enum(productUpdateLabels))
    .max(productUpdateLabels.length)
    .refine((labels) => new Set(labels).size === labels.length, {
      message: "Labels must be unique",
    })
    .default([]),
  /** Calendar date of the release (`YYYY-MM-DD`). Falls back to the publish date. */
  releaseDate: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use the YYYY-MM-DD format")
    .optional(),
  indexable: z.boolean().optional(),
});

export const productUpdateSchema = makeDocumentSchema(productUpdateMetaSchema).extend({
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

/**
 * The date a changelog entry is shown and sorted by: its release date, or
 * the UTC calendar date it was published. Always `YYYY-MM-DD`.
 */
export function changelogDate(entry: {
  meta?: { releaseDate?: string | null } | null;
  publishedAt?: string | Date | null;
}): string | null {
  if (entry.meta?.releaseDate) return entry.meta.releaseDate;
  if (!entry.publishedAt) return null;
  const date = new Date(entry.publishedAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
