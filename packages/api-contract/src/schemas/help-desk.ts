import { z } from "zod";
import { textEditorContentSchema } from "./documents";

export const ticketStatusSchema = z.enum(["open", "pending", "resolved", "closed"]);
export const ticketSourceSchema = z.enum(["form", "chatbot", "api"]);
export const ticketMessageAuthorSchema = z.enum(["requester", "agent", "bot"]);

export const ticketMessageSchema = z.object({
    messageId: z.string(),
    author: ticketMessageAuthorSchema,
    authorAccountId: z.string().nullable().optional(),
    content: textEditorContentSchema,
    createdAt: z.string().nullable(),
});

export const ticketSchema = z.object({
    ticketId: z.string(),
    subject: z.string(),
    status: ticketStatusSchema,
    requesterEmail: z.string(),
    requesterName: z.string().nullable().optional(),
    source: ticketSourceSchema,
    assigneeAccountId: z.string().nullable().optional(),
    lastMessageAt: z.string().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const ticketWithMessagesSchema = ticketSchema.extend({
    messages: z.array(ticketMessageSchema),
});

// ---- Dashboard (authed) -----------------------------------------------------

export const listTicketsQuerySchema = z.object({
    status: ticketStatusSchema.optional(),
    assigneeAccountId: z.string().optional(),
    q: z.string().optional(),
    offset: z.coerce.number().int().min(1).optional(),
    itemsPerPage: z.coerce.number().int().min(1).optional(),
});

/** Headless API/MCP ticket creation (source: "api") — the third of the
 * three submission doors in architecture.md §11.2. */
export const createTicketBodySchema = z.object({
    subject: z.string().min(1),
    message: z.string().min(1),
    requesterEmail: z.string().email(),
    requesterName: z.string().optional(),
});

export const replyToTicketBodySchema = z.object({
    content: textEditorContentSchema,
});

export const updateTicketBodySchema = z.object({
    status: ticketStatusSchema.optional(),
    assigneeAccountId: z.string().nullable().optional(),
});

// ---- Public submission + magic-link thread ----------------------------------

export const publicCreateTicketBodySchema = z.object({
    subject: z.string().min(1),
    message: z.string().min(1),
    email: z.string().email(),
    name: z.string().optional(),
    source: z.enum(["form", "chatbot"]).default("form"),
    /** Chatbot escalation attaches the conversation transcript as the
     * first message (architecture.md §11.2). */
    transcript: z.string().optional(),
    /** Honeypot field, same convention as lead capture (architecture.md
     * §13.3) — non-empty means bot, silently dropped with a 200. */
    website: z.string().optional(),
    turnstileToken: z.string().optional(),
});

export const publicCreateTicketResponseSchema = z.object({
    ticketId: z.string(),
    /** Only ever returned once, at creation — the caller uses it to build
     * the magic thread link immediately; it's also emailed for durable
     * access (architecture.md §11.2/§13.4). */
    token: z.string(),
});

export const publicTicketThreadQuerySchema = z.object({
    token: z.string().min(1),
});

export const publicReplyToTicketBodySchema = z.object({
    token: z.string().min(1),
    message: z.string().min(1),
    turnstileToken: z.string().optional(),
});
