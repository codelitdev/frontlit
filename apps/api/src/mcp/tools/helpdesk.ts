import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  ticketSchema,
  ticketWithMessagesSchema,
  textEditorContentSchema,
} from "@frontlit/api-contract";
import {
  addTicketMessage,
  countTickets,
  createTicket,
  getTicketByTicketId,
  getTicketMessages,
  listTickets,
  reissueTicketAccessToken,
  ticketMessageText,
  updateTicket,
} from "../../tickets/queries";
import { notifyRequesterOfReply } from "../../tickets/notify";
import { omitInternal, serializeDates } from "../../utils/public";
import { AUTH_ERROR, INTERNAL_ERROR, jsonResult, NOT_FOUND } from "./responses";
import { getAuthAccount, getTeamId } from "./auth";

function toPublicTicket(ticket: Record<string, unknown>) {
  return serializeDates(omitInternal(ticket, "teamId", "accessTokenHash"));
}

function toPublicMessage(message: Record<string, unknown>) {
  return serializeDates(omitInternal(message, "teamId", "ticketId"));
}

async function toTicketWithMessages(ticket: Record<string, unknown> & { id: string }) {
  const messages = await getTicketMessages(ticket.id);
  return {
    ...toPublicTicket(ticket),
    messages: messages.map(toPublicMessage),
  };
}

/** Support ticket inbox (architecture.md §11.3) — team-scoped CRUD twin of
 * the `contract.tickets` REST router. Public submission and the magic-link
 * thread endpoints are visitor-facing only and have no MCP equivalent. */
export function registerHelpdeskTools(server: McpToolRegistrar): void {
  server.registerTool(
    "create_ticket",
    {
      description:
        "Creates a support ticket on behalf of a requester (source: api) — the headless door of the three ticket submission paths.",
      inputSchema: {
        subject: z.string().min(1),
        message: z.string().min(1),
        requesterEmail: z.string().email(),
        requesterName: z.string().optional(),
      },
      outputSchema: ticketWithMessagesSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const { ticket } = await createTicket({
          teamId,
          ...args,
          source: "api",
        });
        return jsonResult(await toTicketWithMessages(ticket));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "list_tickets",
    {
      description:
        "Lists the team's support tickets, optionally filtered by status, assignee, or a search term.",
      inputSchema: {
        status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
        assigneeAccountId: z.string().optional(),
        q: z.string().optional(),
        offset: z.number().int().min(1).optional(),
        itemsPerPage: z.number().int().min(1).optional(),
      },
      outputSchema: { items: z.array(ticketSchema), total: z.number() },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const [items, total] = await Promise.all([
          listTickets({ teamId, ...args }),
          countTickets({ teamId, ...args }),
        ]);
        return jsonResult({ items: items.map(toPublicTicket), total });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "get_ticket",
    {
      description: "Gets a support ticket with its full message thread.",
      inputSchema: { ticketId: z.string().min(1) },
      outputSchema: ticketWithMessagesSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const ticket = await getTicketByTicketId(teamId, args.ticketId);
        if (!ticket) return NOT_FOUND;
        return jsonResult(await toTicketWithMessages(ticket));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "reply_to_ticket",
    {
      description:
        "Replies to a support ticket as an agent. Rotates and emails the requester a fresh magic-link token if SendLit is connected.",
      inputSchema: {
        ticketId: z.string().min(1),
        content: textEditorContentSchema,
      },
      outputSchema: ticketWithMessagesSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const ticket = await getTicketByTicketId(teamId, args.ticketId);
        if (!ticket) return NOT_FOUND;

        const account = getAuthAccount(extra);
        await addTicketMessage({
          teamId,
          ticketDbId: ticket.id,
          author: "agent",
          authorAccountId: account?.id,
          content: args.content,
        });

        if (ticket.requesterEmail) {
          const token = await reissueTicketAccessToken(teamId, ticket.id);
          notifyRequesterOfReply({
            teamId,
            ticketId: ticket.ticketId,
            token,
            requesterEmail: ticket.requesterEmail,
            subject: ticket.subject,
            replyText: ticketMessageText(args.content),
          }).catch(() => {});
        }

        const updated = await getTicketByTicketId(teamId, args.ticketId);
        return jsonResult(await toTicketWithMessages(updated ?? ticket));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_ticket_status",
    {
      description:
        "Updates a support ticket's status (open, pending, resolved, closed).",
      inputSchema: {
        ticketId: z.string().min(1),
        status: z.enum(["open", "pending", "resolved", "closed"]),
      },
      outputSchema: ticketSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const ticket = await updateTicket(teamId, args.ticketId, {
          status: args.status,
        });
        if (!ticket) return NOT_FOUND;
        return jsonResult(toPublicTicket(ticket));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "assign_ticket",
    {
      description:
        "Assigns (or unassigns, with assigneeAccountId omitted) a support ticket to a team member account.",
      inputSchema: {
        ticketId: z.string().min(1),
        assigneeAccountId: z.string().nullable().optional(),
      },
      outputSchema: ticketSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const ticket = await updateTicket(teamId, args.ticketId, {
          assigneeAccountId: args.assigneeAccountId ?? null,
        });
        if (!ticket) return NOT_FOUND;
        return jsonResult(toPublicTicket(ticket));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );
}
