import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { getSendlitApiKey } from "../integrations/queries";
import {
    addContactTag,
    createBroadcast,
    createSegment,
    deleteContact,
    deleteSegment,
    getBroadcastStats,
    getContact,
    getGeneralSettings,
    listBroadcasts,
    listContacts,
    listSegments,
    removeContactTag,
    sendBroadcast,
    toBroadcast,
    updateBroadcast,
    updateGeneralSettings,
    updateSegment,
} from "./sendlit-client";
import { withSendlitKey } from "./proxy";

/** Every handler in this module is a thin, team-scoped proxy over the
 * team's provisioned SendLit team \u2014 FrontLit stores no contact, segment or
 * broadcast data of its own (architecture.md \u00a710.2/\u00a710.3). A team without a
 * SendLit integration yet (provisioning still retrying, or newsletter
 * disabled in this deployment) gets a 409 rather than a crash. */
const router = Router();
router.use(["/contacts", "/newsletter"], requireAuth, requireTeam);

const s = initServer();

const contactsImpl = s.router(contract.contacts, {
    list: async ({ query, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            listContacts(apiKey, {
                ...query,
                subscribed:
                    query.subscribed === undefined
                        ? undefined
                        : String(query.subscribed),
            }),
        ) as any,
    get: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            getContact(apiKey, params.contactId),
        ) as any,
    remove: async ({ params, req }) => {
        const result = await withSendlitKey(
            (req as any).teamId,
            async (apiKey) => {
                await deleteContact(apiKey, params.contactId);
                return undefined;
            },
        );
        if (result.status === 409) return result as any;
        return { status: 204, body: undefined };
    },
    addTag: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            addContactTag(apiKey, params.contactId, params.tag),
        ) as any,
    removeTag: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            removeContactTag(apiKey, params.contactId, params.tag),
        ) as any,
});

const segmentsImpl = s.router(contract.segments, {
    create: async ({ body, req }) => {
        const result = await withSendlitKey((req as any).teamId, (apiKey) =>
            createSegment(apiKey, body),
        );
        return (
            result.status === 200 ? { status: 201, body: result.body } : result
        ) as any;
    },
    list: async ({ req }) =>
        withSendlitKey(
            (req as any).teamId,
            async (apiKey) => (await listSegments(apiKey)).items,
        ) as any,
    update: async ({ params, body, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            updateSegment(apiKey, params.segmentId, body),
        ) as any,
    remove: async ({ params, req }) => {
        const result = await withSendlitKey(
            (req as any).teamId,
            async (apiKey) => {
                await deleteSegment(apiKey, params.segmentId);
                return undefined;
            },
        );
        if (result.status === 409) return result as any;
        return { status: 204, body: undefined };
    },
});

const newsletterImpl = s.router(contract.newsletter, {
    getSettings: async ({ req }) => {
        const teamId = (req as any).teamId;
        const apiKey = await getSendlitApiKey(teamId);
        if (!apiKey) return { status: 200, body: { connected: false } };
        try {
            const settings = await getGeneralSettings(apiKey);
            return { status: 200, body: { connected: true, ...settings } };
        } catch {
            return { status: 200, body: { connected: true } };
        }
    },
    updateSettings: async ({ body, req }) =>
        withSendlitKey((req as any).teamId, async (apiKey) => ({
            connected: true,
            ...(await updateGeneralSettings(apiKey, body)),
        })) as any,
    listBroadcasts: async ({ req }) =>
        withSendlitKey((req as any).teamId, async (apiKey) => {
            const { items } = await listBroadcasts(apiKey);
            return items.map(toBroadcast);
        }).then((r) =>
            r.status === 200 ? { status: 200, body: { items: r.body } } : r,
        ) as any,
    createBroadcast: async ({ body, req }) => {
        const result = await withSendlitKey(
            (req as any).teamId,
            async (apiKey) => {
                const created = await createBroadcast(apiKey, body);
                return toBroadcast(created);
            },
        );
        return (
            result.status === 200 ? { status: 201, body: result.body } : result
        ) as any;
    },
    updateBroadcast: async ({ params, body, req }) =>
        withSendlitKey((req as any).teamId, async (apiKey) => {
            const updated = await updateBroadcast(
                apiKey,
                params.broadcastId,
                body,
            );
            return toBroadcast(updated);
        }) as any,
    sendBroadcast: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            sendBroadcast(apiKey, params.broadcastId),
        ) as any,
    getBroadcastStats: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            getBroadcastStats(apiKey, params.broadcastId),
        ) as any,
});

createExpressEndpoints(contract.contacts, contactsImpl, router);
createExpressEndpoints(contract.segments, segmentsImpl, router);
createExpressEndpoints(contract.newsletter, newsletterImpl, router);

export default router;
