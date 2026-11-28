import { z } from "zod";

export const errorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  permission: z.string().optional(),
  scope: z.string().optional(),
});

/** 409 for a save based on an older draft: the draft changed since the
 * caller read `draftVersion`. Nothing was written. */
export const staleDraftErrorSchema = errorSchema.extend({
  code: z.literal("STALE_DRAFT"),
  draftVersion: z.number().int(),
});

/** Sent with every draft save: the `draftVersion` the caller last read. */
export const expectedDraftVersionSchema = z
  .number()
  .int()
  .positive()
  .describe(
    "The draftVersion you last read. If the draft changed since, nothing is saved and 409 STALE_DRAFT is returned with the current draftVersion.",
  );

export const successMessageSchema = z.object({ message: z.string() });

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), total: z.number() });
}

export function itemsList<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item) });
}
