import { z } from "zod";

/**
 * In-app support sessions (docs/embedded-support.md §6.2). Minted by the
 * host app's server with a `support:sessions` API key when a signed-in user
 * asks for help; the widget opens with the returned token.
 */
export const createSupportSessionBodySchema = z.object({
  contact: z.object({
    email: z.string().email(),
    name: z.string().trim().max(200).optional(),
    /** The user's ID in the host app. Shown on the ticket and searchable
     * in the inbox; sent to SendLit as a custom field. */
    externalId: z.string().trim().min(1).max(200).optional(),
  }),
  /** The user's account in the host app, e.g. a CourseLit school. */
  account: z
    .object({
      id: z.string().trim().min(1).max(200),
      name: z.string().trim().max(200).optional(),
      url: z.string().url().max(2000).optional(),
    })
    .optional(),
  /** What the user was doing: page, error, request ID, app version... Free
   * form, at most 8 KB of JSON. Shown to agents and the AI as data. */
  context: z.record(z.unknown()).optional(),
  /** Prefilled into the chat composer; the user still has to send it. */
  message: z.string().trim().max(4000).optional(),
});

export const supportSessionSchema = z.object({
  /** Pass to `FrontLit.open({ token })`. Valid for about an hour. */
  token: z.string(),
  /** The same chat as a standalone page, for hosts that don't embed it. */
  url: z.string(),
  expiresAt: z.string(),
});

export const openSupportSessionBodySchema = z.object({
  token: z.string().min(1),
});

export const openSupportSessionResponseSchema = z.object({
  /** The requester's open chat, if they have one, with a fresh access
   * token for the public ticket message endpoints. */
  ticket: z.object({ ticketId: z.string(), accessToken: z.string() }).nullable(),
  prefill: z.string().nullable(),
  requester: z.object({ name: z.string().nullable() }),
});

export type CreateSupportSessionBody = z.infer<typeof createSupportSessionBodySchema>;
