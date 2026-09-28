import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract, type TeamPermission } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { serializeDates } from "../utils/public";
import { getResolvedAiConfig } from "../ai/queries";
import { getLanguageModel } from "../ai/provider";
import {
  InboxAiPolicyError,
  listInboxAiPolicies,
  upsertInboxAiPolicy,
  type InboxAiPolicy,
} from "./policy";

const router = Router();
router.use("/inbox/ai", requireAuth, requireTeam);

export async function isAiConfigured(teamId: string): Promise<boolean> {
  const config = await getResolvedAiConfig(teamId);
  const model = await getLanguageModel(config, "chatbot");
  return Boolean(model);
}

function permissionsOf(req: unknown): {
  isOwner: boolean;
  permissions: TeamPermission[];
} {
  const anyReq = req as {
    isOwner?: boolean;
    effectivePermissions?: TeamPermission[];
  };
  return {
    isOwner: Boolean(anyReq.isOwner),
    permissions: anyReq.effectivePermissions ?? [],
  };
}

function canRead(
  auth: { isOwner: boolean; permissions: TeamPermission[] },
  channel: "chatbot" | "tickets",
) {
  if (auth.isOwner) return true;
  return channel === "chatbot"
    ? auth.permissions.includes("chatbot:read")
    : auth.permissions.includes("helpdesk:read");
}

function canWrite(
  auth: { isOwner: boolean; permissions: TeamPermission[] },
  channel: "chatbot" | "tickets",
) {
  if (auth.isOwner) return true;
  return channel === "chatbot"
    ? auth.permissions.includes("chatbot:write")
    : auth.permissions.includes("helpdesk:write");
}

function toPublic(policy: InboxAiPolicy) {
  return serializeDates({
    ...policy,
    createdAt: policy.createdAt.getTime() === 0 ? null : policy.createdAt,
    updatedAt: policy.updatedAt.getTime() === 0 ? null : policy.updatedAt,
  });
}

async function payload(
  teamId: string,
  auth: { isOwner: boolean; permissions: TeamPermission[] },
) {
  const policies = await listInboxAiPolicies(teamId);
  const channels: Record<string, unknown> = {};
  for (const policy of policies) {
    if (canRead(auth, policy.channel)) {
      channels[policy.channel] = toPublic(policy);
    }
  }
  return {
    aiConfigured: await isAiConfigured(teamId),
    channels,
  };
}

const s = initServer();
const impl = s.router(
  contract.inboxAi,
  authorizeHandlers(
    {
      get: async ({ req }) => ({
        status: 200,
        body: await payload((req as any).teamId, permissionsOf(req)),
      }),
      update: async ({ body, req }) => {
        const teamId = (req as any).teamId as string;
        const auth = permissionsOf(req);
        const patches = body.channels;
        if (patches.chatbot && !canWrite(auth, "chatbot")) {
          return {
            status: 403 as const,
            body: {
              error: "insufficient_permission",
              error_description:
                "chatbot:write is required to update chatbot AI policy.",
            },
          };
        }
        if (patches.tickets && !canWrite(auth, "tickets")) {
          return {
            status: 403 as const,
            body: {
              error: "insufficient_permission",
              error_description:
                "helpdesk:write is required to update tickets AI policy.",
            },
          };
        }

        const aiConfigured = await isAiConfigured(teamId);
        try {
          if (patches.chatbot) {
            if (patches.chatbot.autoReply === true && !aiConfigured) {
              return {
                status: 409 as const,
                body: {
                  error: "ai_required",
                  error_description: "Configure AI before enabling auto-reply.",
                },
              };
            }
            await upsertInboxAiPolicy(teamId, "chatbot", patches.chatbot);
          }
          if (patches.tickets) {
            if (patches.tickets.autoReply === true && !aiConfigured) {
              return {
                status: 409 as const,
                body: {
                  error: "ai_required",
                  error_description: "Configure AI before enabling auto-reply.",
                },
              };
            }
            await upsertInboxAiPolicy(teamId, "tickets", patches.tickets);
          }
        } catch (error) {
          if (error instanceof InboxAiPolicyError) {
            return {
              status: 400 as const,
              body: {
                error: error.code,
                error_description: error.message,
              },
            };
          }
          throw error;
        }

        return {
          status: 200 as const,
          body: await payload(teamId, auth),
        };
      },
    },
    {
      get: "inboxAi.get",
      update: "inboxAi.update",
    },
  ),
);

createExpressEndpoints(contract.inboxAi, impl, router);

export default router;
