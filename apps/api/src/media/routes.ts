import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { countMedia, deleteMediaRecord, getMediaByMediaId, listMedia, registerMedia, updateMedia } from "./queries";
import { getMediaUploadSignature } from "./service";
import { omitInternal, serializeDates } from "../utils/public";

const router = Router();
router.use(requireAuth);
router.use(requireTeam);

const s = initServer();

function toPublicMedia<T extends Record<string, unknown>>(item: T) {
    return serializeDates(omitInternal(item, "teamId"));
}

const impl = s.router(contract.media, {
    presigned: async ({ req }) => {
        try {
            const result = await getMediaUploadSignature((req as any).teamId);
            return { status: 200, body: result };
        } catch {
            return { status: 500, body: { error: "Failed to create upload signature" } };
        }
    },
    create: async ({ body, req }) => {
        try {
            const item = await registerMedia({ teamId: (req as any).teamId, ...body });
            if (!item) return { status: 500, body: { error: "Failed to register media" } };
            return { status: 201, body: toPublicMedia(item) };
        } catch {
            return { status: 500, body: { error: "Failed to register media" } };
        }
    },
    list: async ({ query, req }) => {
        const teamId = (req as any).teamId;
        const [items, total] = await Promise.all([
            listMedia({ teamId, offset: query.offset, itemsPerPage: query.itemsPerPage }),
            countMedia({ teamId }),
        ]);
        return { status: 200, body: { items: items.map(toPublicMedia), total } };
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
        const result = await deleteMediaRecord((req as any).teamId, params.mediaId);
        if (!result.ok) return { status: 404, body: { error: "Media not found" } };
        return { status: 204, body: undefined };
    },
});

createExpressEndpoints(contract.media, impl, router);

export default router;
