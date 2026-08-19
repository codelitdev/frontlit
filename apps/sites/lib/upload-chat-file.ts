import { Upload as TUSUpload } from "tus-js-client";

export type ChatAttachment = {
    attachmentId: string;
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
    thumbnailUrl?: string | null;
};

export async function uploadChatFile(input: {
    apiBaseUrl: string;
    teamId: string;
    file: File;
    conversationId?: string;
    conversationToken?: string;
}): Promise<{
    attachment: ChatAttachment;
    conversationId: string;
    conversationToken: string;
}> {
    const presign = await fetch(
        `${input.apiBaseUrl}/public/${input.teamId}/chat/attachments/presign`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                conversationId: input.conversationId,
                conversationToken: input.conversationToken,
            }),
        },
    );
    if (!presign.ok) throw new Error("Failed to start upload");
    const signed = (await presign.json()) as {
        signature: string;
        endpoint: string;
        conversationId: string;
        conversationToken: string;
    };

    const media = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
            const upload = new TUSUpload(input.file, {
                endpoint: `${signed.endpoint}/media/create/resumable`,
                removeFingerprintOnSuccess: true,
                retryDelays: [0, 3000, 5000],
                headers: { "x-medialit-signature": signed.signature },
                metadata: {
                    fileName: input.file.name,
                    mimeType: input.file.type,
                    access: "private",
                },
                onError: reject,
                onSuccess: (payload) => {
                    try {
                        const raw = payload.lastResponse.getHeader("Media");
                        const parsed = raw ? JSON.parse(raw) : null;
                        if (!parsed)
                            throw new Error("Upload completed without media");
                        resolve(parsed);
                    } catch (error) {
                        reject(error);
                    }
                },
            });
            upload.start();
        },
    );

    const mediaLitId =
        typeof media.mediaId === "string"
            ? media.mediaId
            : typeof media.id === "string"
              ? media.id
              : "";
    if (!mediaLitId) throw new Error("Upload completed without a media id");

    const complete = await fetch(
        `${input.apiBaseUrl}/public/${input.teamId}/chat/attachments`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                conversationId: signed.conversationId,
                conversationToken: signed.conversationToken,
                mediaLitId,
                fileName: input.file.name,
                mimeType: input.file.type,
                size: input.file.size,
            }),
        },
    );
    if (!complete.ok) throw new Error("Failed to save attachment");
    const attachment = (await complete.json()) as ChatAttachment;
    return {
        attachment,
        conversationId: signed.conversationId,
        conversationToken: signed.conversationToken,
    };
}
