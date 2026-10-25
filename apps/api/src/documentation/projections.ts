import { serializeDates } from "../utils/public";
export function publicPublication(row: any) {
  const {
    publicationId,
    basePublicationId,
    source,
    generation,
    docsDraftVersion,
    status,
    diagnostics,
    attempts,
    createdAt,
    activatedAt,
    finishedAt,
  } = row;
  return serializeDates({
    publicationId,
    basePublicationId,
    source,
    generation,
    docsDraftVersion,
    status,
    diagnostics,
    attempts,
    createdAt,
    activatedAt,
    finishedAt,
  });
}
export function publicPurge(row: any) {
  const { purgeId, planHash, manifest, status, expiresAt, createdAt, completedAt } =
    row;
  return serializeDates({
    purgeId,
    planHash,
    manifest,
    status,
    expiresAt,
    createdAt,
    completedAt,
    deliveredAt: row.deliveredAt ?? null,
  });
}
