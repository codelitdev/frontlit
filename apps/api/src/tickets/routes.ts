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
    ticketMessageText,
    updateTicket,
} from "./queries";
import {
    attachFilesToMessage,
    attachmentsByMessage,
    registerTicketAttachment,
    signatureForTicketAttachments,
    toPublicAttachment,
} from "./attachments";
import { notifyRequesterOfReply } from "./notify";
import { omitInternal, serializeDates } from "../utils/public";
import { ticketAiOptics } from "../inbox-ai/optics";

const router = Router();
router.use("/tickets", requireAuth, requireTeam);

const s = initServer();

function toPublicTicket<T extends Record<string, unknown>>(ticket: T) {
    return serializeDates(
        omitInternal(
            ticket,
            "teamId",
            "accessTokenHash",
            "id",
            "aiGeneration",
            "aiTriggerMessageId",
            "aiStopReason",
            "aiStoppedAt",
        ),
    );
}

function toPublicMessage<T extends Record<string, unknown>>(message: T) {
    return serializeDates(omitInternal(message, "teamId", "ticketId"));
}

async function toTicketWithMessages(ticket: any) {
    const [messages, byMessage] = await Promise.all([
        getTicketMessages(ticket.id),
        attachmentsByMessage(ticket.id),
    ]);
    return {
        ...toPublicTicket(ticket),
        messages: messages.map((message) => ({
            ...toPublicMessage(message),
            attachments: (byMessage.get(message.id) ?? []).map(
                toPublicAttachment,
            ),
        })),
        ai: await ticketAiOptics(ticket.teamId, ticket, messages),
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
                const teamId = (req as any).teamId;
                const { ticket } = await createTicket({
                    teamId,
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
                const content = body.content ?? {
                    type: "doc",
                    content: [{ type: "paragraph", content: [] }],
                };
                if (
                    !ticketMessageText(content).trim() &&
                    !(body.attachmentIds && body.attachmentIds.length)
                ) {
                    return {
                        status: 400,
                        body: { error: "A message or attachment is required" },
                    };
                }
                const message = await addTicketMessage({
                    teamId,
                    ticketDbId: ticket.id,
                    author: "agent",
                    authorAccountId: accountId,
                    content,
                });
                if (body.attachmentIds?.length) {
                    await attachFilesToMessage({
                        teamId,
                        ticketDbId: ticket.id,
                        messageDbId: message.id,
                        attachmentIds: body.attachmentIds,
                    });
                }

                // Rotate the access token and email the fresh link to the requester
                // (architecture.md §13.4 — "every requester email re-sends a fresh
                // link"). Best-effort: notification failure never blocks the reply.
                if (ticket.requesterEmail) {
                    const token = await reissueTicketAccessToken(
                        teamId,
                        ticket.id,
                    );
                    notifyRequesterOfReply({
                        teamId,
                        ticketId: ticket.ticketId,
                        token,
                        requesterEmail: ticket.requesterEmail,
                        subject: ticket.subject,
                        replyText: ticketMessageText(content),
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
            presignAttachment: async ({ params, req }) => {
                const ticket = await getTicketByTicketId(
                    (req as any).teamId,
                    params.ticketId,
                );
                if (!ticket)
                    return { status: 404, body: { error: "Not found" } };
                try {
                    return {
                        status: 200,
                        body: await signatureForTicketAttachments(
                            (req as any).teamId,
                        ),
                    };
                } catch {
                    return {
                        status: 400,
                        body: { error: "Failed to create upload signature" },
                    };
                }
            },
            completeAttachment: async ({ params, body, req }) => {
                const teamId = (req as any).teamId;
                const ticket = await getTicketByTicketId(
                    teamId,
                    params.ticketId,
                );
                if (!ticket)
                    return { status: 404, body: { error: "Not found" } };
                try {
                    const row = await registerTicketAttachment({
                        teamId,
                        ticketDbId: ticket.id,
                        mediaLitId: body.mediaLitId,
                        fileName: body.fileName,
                        mimeType: body.mimeType,
                        size: body.size,
                    });
                    return {
                        status: 201,
                        body: toPublicAttachment(row),
                    };
                } catch (error) {
                    const code =
                        error instanceof Error ? error.message : "failed";
                    return {
                        status: 400,
                        body: {
                            error:
                                code === "attachment_too_large"
                                    ? "File is too large"
                                    : "Failed to save attachment",
                        },
                    };
                }
            },
        },
        {
            list: "tickets.list",
            create: "tickets.create",
            get: "tickets.get",
            reply: "tickets.reply",
            update: "tickets.update",
            presignAttachment: "tickets.presignAttachment",
            completeAttachment: "tickets.completeAttachment",
        },
    ),
);

createExpressEndpoints(contract.tickets, impl, router);

export default router;
