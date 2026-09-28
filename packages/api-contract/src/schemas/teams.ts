import { z } from "zod";
import { teamPermissionSchema } from "./permissions";

export const teamSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  ownerAccountId: z.string(),
  externalId: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

/** A team as seen by one of its human members. Authorization context belongs
 * on membership-aware list responses, not on the team record itself. */
export const teamMembershipSchema = teamSchema.extend({
  isOwner: z.boolean(),
  effectivePermissions: z.array(teamPermissionSchema),
});

/** The key's secret is stored hashed and never returned after creation —
 * list/read surfaces only ever see `keyPrefix` (e.g. `fl_live_a1b2`). */
export const apiKeySchema = z.object({
  id: z.string(),
  keyPrefix: z.string(),
  name: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

/** Creation is the one response that carries the full `fl_live_...` secret. */
export const createdApiKeySchema = apiKeySchema.extend({
  key: z.string(),
});

import { widgetInstanceSchema } from "./pages";

export const provisionPageItemSchema = z.union([
  z.string(),
  z.object({
    slug: z.string(),
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    socialImage: z.union([z.string(), z.record(z.any())]).optional(),
    deletable: z.boolean().optional(),
    layout: z.array(widgetInstanceSchema).optional(),
  }),
]);

export type ProvisionPageItem = z.infer<typeof provisionPageItemSchema>;

export const createTeamBodySchema = z.object({
  name: z.string().min(1),
  pages: z.array(provisionPageItemSchema).optional(),
});
export const renameTeamBodySchema = z.object({ name: z.string().min(1) });
export const createApiKeyBodySchema = z.object({ name: z.string().min(1) });

export const provisionTeamBodySchema = z.object({
  externalId: z.string().min(1),
  ownerEmail: z.string().email(),
  name: z.string().min(1),
  pages: z.array(provisionPageItemSchema).optional(),
  customDomainCnameTarget: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .regex(
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.?$/i,
      "Must be a DNS hostname",
    )
    .transform((value) => value.toLowerCase().replace(/\.$/, ""))
    .optional(),
  customDomainTxtRecordName: z
    .string()
    .trim()
    .regex(/^_[a-z0-9-]{1,62}$/i, "Must be a single relative DNS label")
    .transform((value) => value.toLowerCase())
    .optional(),
});

export const provisionTeamResponseSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  /** Full API key secret — present only on the call that actually created
   * the team. Keys are stored hashed, so repeat (idempotent) calls cannot
   * return it again; the consumer must store it on first provision. */
  apiKey: z.string().optional(),
});
