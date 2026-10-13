import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
  countMedia,
  countMediaReferences,
  deleteMediaRecord,
  getMediaByMediaId,
  listMedia,
  registerMedia,
  updateMedia,
} from "./queries";
import { createLibraryUploadIntent, MediaProvenanceError } from "./provenance";
import {
  isUnsplashConfigured,
  searchUnsplash as searchUnsplashPhotos,
} from "./unsplash";
import { omitInternal, serializeDates } from "../utils/public";

const router = Router();
router.use("/media", requireAuth, requireTeam);

const s = initServer();

function toPublicMedia<T extends Record<string, unknown>>(item: T) {
  return serializeDates(omitInternal(item, "teamId"));
}

const impl = s.router(
  contract.media,
  authorizeHandlers(
    {
      presigned: async ({ req }) => {
        try {
          const result = await createLibraryUploadIntent((req as any).teamId);
          return { status: 200, body: result };
        } catch (error) {
          if (error instanceof MediaProvenanceError)
            return {
              status: error.status as any,
              body: { error: error.message, code: error.code },
            };
          return {
            status: 500,
            body: { error: "Failed to create upload signature" },
          };
        }
      },
      create: async ({ body, req }) => {
        try {
          const item = await registerMedia({
            teamId: (req as any).teamId,
            ...body,
          });
          if (!item)
            return {
              status: 500,
              body: { error: "Failed to register media" },
            };
          return { status: 201, body: toPublicMedia(item) };
        } catch (error) {
          if (error instanceof MediaProvenanceError)
            return {
              status: error.status as any,
              body: { error: error.message, code: error.code },
            };
          return {
            status: 500,
            body: { error: "Failed to register media" },
          };
        }
      },
      searchUnsplash: async ({ query }) => {
        if (!isUnsplashConfigured()) {
          return {
            status: 200,
            body: { configured: false, items: [] },
          };
        }
        const q = query.q?.trim();
        if (!q) {
          return {
            status: 200,
            body: { configured: true, items: [] },
          };
        }
        try {
          return {
            status: 200,
            body: {
              configured: true,
              items: await searchUnsplashPhotos(q),
            },
          };
        } catch {
          return {
            status: 502,
            body: { error: "Failed to search Unsplash" },
          };
        }
      },
      list: async ({ query, req }) => {
        const teamId = (req as any).teamId;
        const [items, total, references] = await Promise.all([
          listMedia({
            teamId,
            offset: query.offset,
            itemsPerPage: query.itemsPerPage,
          }),
          countMedia({ teamId }),
          countMediaReferences(teamId),
        ]);
        return {
          status: 200,
          body: {
            items: items.map((item) => ({
              ...toPublicMedia(item),
              referenceCount: references[item.mediaId] ?? 0,
            })),
            total,
          },
        };
      },
      get: async ({ params, req }) => {
        const item = await getMediaByMediaId((req as any).teamId, params.mediaId);
        if (!item) return { status: 404, body: { error: "Media not found" } };
        return { status: 200, body: toPublicMedia(item) };
      },
      update: async ({ params, body, req }) => {
        const item = await updateMedia((req as any).teamId, params.mediaId, body);
        if (!item) return { status: 404, body: { error: "Media not found" } };
        return { status: 200, body: toPublicMedia(item) };
      },
      remove: async ({ params, req }) => {
        let result;
        try {
          result = await deleteMediaRecord((req as any).teamId, params.mediaId);
        } catch (error) {
          if (error instanceof MediaProvenanceError)
            return {
              status: error.status as any,
              body: { error: error.message, code: error.code },
            };
          throw error;
        }
        if (!result.ok) return { status: 404, body: { error: "Media not found" } };
        return { status: 204, body: undefined };
      },
    },
    {
      presigned: "media.presigned",
      create: "media.create",
      list: "media.list",
      searchUnsplash: "media.searchUnsplash",
      get: "media.get",
      update: "media.update",
      remove: "media.remove",
    },
  ),
);

createExpressEndpoints(contract.media, impl, router);

export default router;
