/**
 * Thin wrapper around the `medialit` SDK — FrontLit's only integration point
 * with MediaLit. Mirrors the service surface already proven in
 * `courselit/apps/web/services/medialit.ts` and `sendlit/apps/api/src/media/service.ts`:
 * `getSignature` (browser upload, direct-to-MediaLit), `seal` (promote a temp
 * upload to permanent storage), `get`, `delete`. FrontLit servers never
 * receive file bytes — see architecture.md §9.
 */
async function getMediaLitClient() {
    const { MediaLit } = await import("medialit");
    return new MediaLit({
        apiKey: process.env.MEDIALIT_APIKEY,
        endpoint: process.env.MEDIALIT_SERVER,
    });
}

export interface MediaLitMedia {
    mediaId: string;
    originalFileName: string;
    mimeType: string;
    size: number;
    access: "public" | "private";
    file: string;
    thumbnail?: string;
    caption?: string;
    group?: string;
}

/** `group` is the team's internal id — MediaLit's per-tenant isolation,
 * mirroring how courselit groups uploads by `domain`. */
export async function getMediaUploadSignature(
    group: string,
): Promise<{ signature: string; endpoint: string }> {
    const medialit = await getMediaLitClient();
    const signature = await medialit.getSignature({ group });
    return { signature, endpoint: medialit.endpoint };
}

export async function getMedia(mediaId: string): Promise<MediaLitMedia> {
    const medialit = await getMediaLitClient();
    return (await medialit.get(mediaId)) as unknown as MediaLitMedia;
}

/** Promotes a freshly-uploaded (temp/private) file to permanent storage.
 * Uploads are temp until sealed; FrontLit seals on library registration
 * (`POST /media`), matching courselit's flow of sealing when content is
 * actually committed rather than on every upload attempt. */
export async function sealMedia(mediaId: string): Promise<MediaLitMedia> {
    const medialit = await getMediaLitClient();
    return (await medialit.seal(mediaId)) as unknown as MediaLitMedia;
}

export async function deleteMedia(mediaId: string): Promise<void> {
    const medialit = await getMediaLitClient();
    await medialit.delete(mediaId);
}
