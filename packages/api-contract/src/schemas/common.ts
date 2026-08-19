import { z } from "zod";

export const errorSchema = z.object({
    error: z.string(),
    error_description: z.string().optional(),
    permission: z.string().optional(),
    scope: z.string().optional(),
});

export const successMessageSchema = z.object({ message: z.string() });

export function paginated<T extends z.ZodTypeAny>(item: T) {
    return z.object({ items: z.array(item), total: z.number() });
}

export function itemsList<T extends z.ZodTypeAny>(item: T) {
    return z.object({ items: z.array(item) });
}
