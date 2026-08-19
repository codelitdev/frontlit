import { z } from "zod";
import { teamPermissionSchema } from "./permissions";

export const invitationStatuses = [
    "pending",
    "accepted",
    "rejected",
    "revoked",
    "expired",
] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const membershipListQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const cursorPage = <T extends z.ZodTypeAny>(item: T) =>
    z.object({
        items: z.array(item),
        nextCursor: z.string().nullable(),
    });

export const teamMemberSchema = z.object({
    memberId: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    isOwner: z.boolean(),
    permissions: z.array(teamPermissionSchema),
    effectivePermissions: z.array(teamPermissionSchema),
    version: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

/** Invitation acceptance also identifies the joined team so the browser can
 * select it before entering the workspace. */
export const acceptedTeamMemberSchema = teamMemberSchema.extend({
    teamId: z.string(),
});
export type AcceptedTeamMember = z.infer<typeof acceptedTeamMemberSchema>;

export const teamMemberPageSchema = cursorPage(teamMemberSchema).extend({
    viewer: teamMemberSchema,
});

export const updateTeamMemberBodySchema = z.object({
    permissions: z.array(teamPermissionSchema),
    version: z.number().int().positive(),
});

export const transferOwnershipBodySchema = z.object({
    memberId: z.string().min(1),
    revokeApiKeys: z.boolean().optional(),
});

export const teamInvitationSchema = z.object({
    invitationId: z.string(),
    email: z.string(),
    permissions: z.array(teamPermissionSchema),
    effectivePermissions: z.array(teamPermissionSchema),
    status: z.enum(invitationStatuses),
    invitedByName: z.string().nullable(),
    expiresAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const createTeamInvitationBodySchema = z.object({
    email: z.string().email(),
    permissions: z.array(teamPermissionSchema),
});

export const invitationSecretBodySchema = z.object({
    invitationId: z.string().min(1),
    token: z.string().min(1),
});

export const invitationPreviewSchema = z.object({
    invitationId: z.string(),
    teamName: z.string(),
    inviterName: z.string().nullable(),
    expiresAt: z.string(),
    permissions: z.array(teamPermissionSchema),
    email: z.string(),
});
