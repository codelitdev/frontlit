import { lockSettings } from "../documentation/authoring";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { withDbTransaction } from "../db/transaction";
import { media, mediaUploadIntents } from "../db/schema";
import {
  getMedia,
  getMediaUploadSignature,
  sealMedia,
  mediaLitBindsSignedGroups,
} from "./service";
export class MediaProvenanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
async function requireGroupBinding() {
  if (!(await mediaLitBindsSignedGroups()))
    throw new MediaProvenanceError(
      "MEDIA_GROUP_BINDING_UNAVAILABLE",
      "Public library uploads are unavailable: the provider has not verified signed upload-group binding.",
      503,
    );
}
export async function createLibraryUploadIntent(teamId: string) {
  await requireGroupBinding();
  const intentId = `upload_${randomUUID().replaceAll("-", "")}`;
  const providerGroup = `frontlit-library:${teamId}:${intentId}`;
  const result = await getMediaUploadSignature(providerGroup);
  await db.insert(mediaUploadIntents).values({
    intentId,
    teamId,
    providerGroup,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return { ...result, intentId };
}
export async function registerVerifiedMedia(input: {
  teamId: string;
  mediaLitId: string;
  intentId?: string;
  url?: string;
  alt?: string | null;
  caption?: string | null;
}) {
  if (!input.mediaLitId || /^(?:https?:|ext_)/.test(input.mediaLitId))
    throw new MediaProvenanceError("UNVERIFIED_MEDIA", "Invalid media reference.");
  await requireGroupBinding();
  let provider: Awaited<ReturnType<typeof getMedia>>;
  try {
    provider = await getMedia(input.mediaLitId);
  } catch {
    throw new MediaProvenanceError(
      "MEDIA_PROVIDER_UNAVAILABLE",
      "Media verification failed. Retry registration.",
      503,
    );
  }
  if (provider.mediaId !== input.mediaLitId || !provider.group)
    throw new MediaProvenanceError("UNVERIFIED_MEDIA", "Invalid media reference.");
  if (input.url && input.url !== provider.file)
    throw new MediaProvenanceError(
      "UNVERIFIED_MEDIA",
      "The supplied URL does not match the provider.",
    );
  return withDbTransaction(async (tx) => {
    await lockSettings(tx, input.teamId);
    const existing = await tx.query.media.findFirst({
      where: and(
        eq(media.teamId, input.teamId),
        eq(media.mediaLitId, input.mediaLitId),
      ),
    });
    if (existing?.access === "deleting")
      throw new MediaProvenanceError(
        "MEDIA_DELETING",
        "This asset is being deleted.",
        409,
      );
    if (input.intentId) {
      // Claim only the provider object belonging to this exact server-generated group.
      // The row update serializes competing registrations before any sealing occurs.
      const [intent] = await tx
        .update(mediaUploadIntents)
        .set({ intentId: input.intentId })
        .where(
          and(
            eq(mediaUploadIntents.intentId, input.intentId),
            eq(mediaUploadIntents.teamId, input.teamId),
          ),
        )
        .returning();
      if (
        !intent ||
        provider.group !== intent.providerGroup ||
        (intent.mediaLitId && intent.mediaLitId !== input.mediaLitId) ||
        (!intent.mediaLitId && intent.expiresAt.getTime() < Date.now())
      )
        throw new MediaProvenanceError(
          "UNVERIFIED_MEDIA",
          "Invalid or expired upload intent.",
        );
      if (!intent.mediaLitId) {
        await tx
          .update(mediaUploadIntents)
          .set({ mediaLitId: input.mediaLitId })
          .where(eq(mediaUploadIntents.intentId, intent.intentId));
        try {
          await sealMedia(input.mediaLitId);
          provider = await getMedia(input.mediaLitId);
        } catch {
          throw new MediaProvenanceError(
            "MEDIA_PROVIDER_UNAVAILABLE",
            "Media verification failed. Retry registration.",
            503,
          );
        }
      }
    } else if (
      provider.group !== input.teamId &&
      (!existing?.verifiedAt || existing.providerGroup !== provider.group)
    ) {
      throw new MediaProvenanceError(
        "UNVERIFIED_MEDIA",
        "A matching public library upload intent is required.",
      );
    }
    if (
      provider.mediaId !== input.mediaLitId ||
      (input.intentId &&
        provider.group !==
          (
            await tx.query.mediaUploadIntents.findFirst({
              where: eq(mediaUploadIntents.intentId, input.intentId),
            })
          )?.providerGroup)
    )
      throw new MediaProvenanceError(
        "UNVERIFIED_MEDIA",
        "Provider ownership changed during registration.",
      );
    if (
      provider.access?.toLowerCase() !== "public" ||
      !provider.file.startsWith("https://")
    )
      throw new MediaProvenanceError(
        "PRIVATE_MEDIA",
        "Only verified public library assets may be registered.",
      );
    const values = {
      url: provider.file,
      thumbnailUrl: provider.thumbnail ?? null,
      fileName: provider.originalFileName,
      mimeType: provider.mimeType,
      size: provider.size,
      providerGroup: provider.group,
      access: "public",
      verifiedAt: new Date(),
      ...(input.alt !== undefined ? { alt: input.alt } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
    };
    if (existing) {
      const [row] = await tx
        .update(media)
        .set(values)
        .where(eq(media.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await tx
      .insert(media)
      .values({ teamId: input.teamId, mediaLitId: input.mediaLitId, ...values })
      .onConflictDoUpdate({ target: [media.teamId, media.mediaLitId], set: values })
      .returning();
    return row;
  });
}
