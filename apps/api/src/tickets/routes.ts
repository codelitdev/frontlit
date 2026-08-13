import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
    addTicketMessage,
    countTickets,
    createTicket,
    getTicketByTicketId,
    getTicketMessages,
    listTickets,
    reissueTicketAccessToken,
    updateTicket,
} from "./queries";
import { notifyRequesterOfReply } from "./notify";
import { findTeamById } from "../team/queries";
import { omitInternal, serializeDates } from "../utils/public";

const router = Router();
router.use("/tickets", requireAuth, requireTeam);

const s = initServer();

function toPublicTicket<T extends Record<string, unknown>>(ticket: T) {
    return serializeDates(omitInternal(ticket, "teamId", "accessTokenHash"));
}

function toPublicMessage<T extends Record<string, unknown>>(message: T) {
    return serializeDates(omitInternal(message, "teamId", "ticketId"));
}

async function toTicketWithMessages(ticket: any) {
    const messages = await getTicketMessages(ticket.id);
    return {
        ...toPublicTicket(ticket),
        messages: messages.map(toPublicMessage),
    } as any;
}

const impl = s.router(
    contract.tickets,
    authorizeHandlers(
        {
            list: async ({ query, req }) => {
                const teamId = (req as any).teamId;
                const [items, total] = await Promise.all([
                    listTickets({
                        teamId,
                        status: query.status,
                        assigneeAccountId: query.assigneeAccountId,
                        q: query.q,
                        offset: query.offset,
                        itemsPerPage: query.itemsPerPage,
                    }),
                    countTickets({
                        teamId,
                        status: query.status,
                        assigneeAccountId: query.assigneeAccountId,
                        q: query.q,
                    }),
                ]);
                return {
                    status: 200,
                    body: { items: items.map(toPublicTicket), total },
                };
            },
            create: async ({ body, req }) => {
                const { ticket } = await createTicket({
                    teamId: (req as any).teamId,
                    ...body,
                    source: "api",
                });
                return {
                    status: 201,
                    body: await toTicketWithMessages(ticket),
                };
            },
            get: async ({ params, req }) => {
                const ticket = await getTicketByTicketId(
                    (req as any).teamId,
                    params.ticketId,
                );
                if (!ticket)
                    return { status: 404, body: { error: "Not found" } };
                return {
                    status: 200,
                    body: await toTicketWithMessages(ticket),
                };
            },
            reply: async ({ params, body, req }) => {
                const teamId = (req as any).teamId;
                const ticket = await getTicketByTicketId(
                    teamId,
                    params.ticketId,
                );
                if (!ticket)
                    return { status: 404, body: { error: "Not found" } };

                const accountId = (req as any).accountId;
                await addTicketMessage({
                    teamId,
                    ticketDbId: ticket.id,
                    author: "agent",
                    authorAccountId: accountId,
                    content: body.content,
                });

                // Rotate the access token and email the fresh link to the requester
                // (architecture.md §13.4 — "every requester email re-sends a fresh
                // link"). Best-effort: notification failure never blocks the reply.
                const team = await findTeamById(teamId);
                if (team && ticket.requesterEmail) {
                    const token = await reissueTicketAccessToken(ticket.id);
                    notifyRequesterOfReply({
                        teamId,
                        teamPublicId: team.teamId,
                        ticketId: ticket.ticketId,
                        token,
                        requesterEmail: ticket.requesterEmail,
                        subject: ticket.subject,
                    }).catch(() => {});
                }

                const updated = await getTicketByTicketId(
                    teamId,
                    params.ticketId,
                );
                return {
                    status: 201,
                    body: await toTicketWithMessages(updated ?? ticket),
                };
            },
            update: async ({ params, body, req }) => {
                const ticket = await updateTicket(
                    (req as any).teamId,
                    params.ticketId,
                    body,
                );
                if (!ticket)
                    return { status: 404, body: { error: "Not found" } };
                return { status: 200, body: toPublicTicket(ticket) };
            },
        },
        {
            list: "tickets.list",
            create: "tickets.create",
            get: "tickets.get",
            reply: "tickets.reply",
            update: "tickets.update",
        },
    ),
);

createExpressEndpoints(contract.tickets, impl, router);

export default router;
