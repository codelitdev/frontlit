import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { ticketAttachments } from "../db/schema";
import { getMedia, getMediaUploadSignature, sealMedia } from "../media/service";
import { generateTicketToken } from "./token";
import { seedLegacyGrant } from "../inbox-ai/grants";
import { tickets } from "../db/schema";

export const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_MESSAGE = 5;

export function attachmentUploadGroup(teamId: string) {
    return `ticket-attachments:${teamId}`;
}

export async function signatureForTicketAttachments(teamId: string) {
    return getMediaUploadSignature(attachmentUploadGroup(teamId));
}

export async function createChatConversation(teamId: string) {
    const { token, tokenHash } = generateTicketToken();
    const [ticket] = await db
        .insert(tickets)
        .values({
            teamId,
            subject: "Chat conversation",
            requesterEmail: null,
            source: "chatbot",
            accessTokenHash: tokenHash,
        })
        .returning();
    await seedLegacyGrant(teamId, ticket.id, tokenHash);
    return { ticket, token };
}

export function toPublicAttachment(row: typeof ticketAttachments.$inferSelect) {
    return {
        attachmentId: row.attachmentId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        url: row.url,
        thumbnailUrl: row.thumbnailUrl,
        createdAt: row.createdAt.toISOString(),
    };
}

export async function listAttachmentsForTicket(ticketDbId: string) {
    return db.query.ticketAttachments.findMany({
        where: eq(ticketAttachments.ticketId, ticketDbId),
    });
}

export async function registerTicketAttachment(input: {
    teamId: string;
    ticketDbId: string;
    mediaLitId: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
}) {
    let mediaLitId = input.mediaLitId;
    let fileName = input.fileName?.trim() || "file";
    let mimeType = input.mimeType?.trim() || "application/octet-stream";
    let size = input.size ?? 0;
    let url = "";
    let thumbnailUrl: string | null = null;
    try {
        const media = await getMedia(input.mediaLitId);
        mediaLitId = media.mediaId || mediaLitId;
        fileName = media.originalFileName || fileName;
        mimeType = media.mimeType || mimeType;
        size = media.size || size;
        url = media.file || "";
        thumbnailUrl = media.thumbnail || null;
    } catch {
        // Draft metadata from the browser is enough until send seals the file.
    }
    if (size > ATTACHMENT_MAX_BYTES) {
        throw new Error("attachment_too_large");
    }
    const [row] = await db
        .insert(ticketAttachments)
        .values({
            teamId: input.teamId,
            ticketId: input.ticketDbId,
            mediaLitId,
            url,
            thumbnailUrl,
            fileName,
            mimeType,
            size,
        })
        .returning();
    return row;
}

export async function attachFilesToMessage(input: {
    teamId: string;
    ticketDbId: string;
    messageDbId: string;
    attachmentIds: string[];
}) {
    const ids = [...new Set(input.attachmentIds)].slice(
        0,
        ATTACHMENT_MAX_PER_MESSAGE,
    );
    if (ids.length === 0) return [];

    const drafts = await db.query.ticketAttachments.findMany({
        where: and(
            eq(ticketAttachments.teamId, input.teamId),
            eq(ticketAttachments.ticketId, input.ticketDbId),
            isNull(ticketAttachments.messageId),
            inArray(ticketAttachments.attachmentId, ids),
        ),
    });

    const sealedIds: string[] = [];
    for (const draft of drafts) {
        const sealed = await sealMedia(draft.mediaLitId);
        if (sealed.size > ATTACHMENT_MAX_BYTES) continue;
        await db
            .update(ticketAttachments)
            .set({
                mediaLitId: sealed.mediaId,
                url: sealed.file,
                thumbnailUrl: sealed.thumbnail || null,
                fileName: sealed.originalFileName || draft.fileName,
                mimeType: sealed.mimeType || draft.mimeType,
                size: sealed.size,
                messageId: input.messageDbId,
            })
            .where(eq(ticketAttachments.id, draft.id));
        sealedIds.push(draft.id);
    }

    if (sealedIds.length === 0) return [];
    return db.query.ticketAttachments.findMany({
        where: inArray(ticketAttachments.id, sealedIds),
    });
}

export async function attachmentsByMessage(ticketDbId: string) {
    const rows = await listAttachmentsForTicket(ticketDbId);
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
        if (!row.messageId) continue;
        const list = map.get(row.messageId) ?? [];
        list.push(row);
        map.set(row.messageId, list);
    }
    return map;
}
