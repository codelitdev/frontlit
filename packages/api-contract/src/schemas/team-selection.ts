import { z } from "zod";

/** User-authenticated credentials (browser sessions and account-wide OAuth
 * tokens) choose the team per request with this header. API keys are bound
 * to one team and only accept their own. */
export const TEAM_ID_HEADER = "X-Frontlit-Team-Id";

export const teamSelectionErrorCodeSchema = z.enum([
  "team_required",
  "no_team",
  "invalid_team_id",
  "not_a_team_member",
  "team_mismatch",
]);
export type TeamSelectionErrorCode = z.infer<typeof teamSelectionErrorCodeSchema>;

export const teamSelectionErrorSchema = z.object({
  error: teamSelectionErrorCodeSchema,
  error_description: z.string(),
  /** Present on `team_required`: the caller's own teams to choose from. */
  teams: z.array(z.object({ teamId: z.string(), name: z.string() })).optional(),
});
export type TeamSelectionError = z.infer<typeof teamSelectionErrorSchema>;
