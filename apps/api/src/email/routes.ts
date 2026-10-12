import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { getSendlitApiKey } from "../integrations/queries";
import { retryProvisionSendlitNow } from "./provisioning";
import {
  addContactTag,
  createBroadcast,
  createEmailTemplate,
  createSegment,
  deleteBroadcast,
  deleteContact,
  deleteSegment,
  getBroadcastStats,
  getContact,
  getGeneralSettings,
  listBroadcasts,
  listEmailTemplates,
  listSystemEmailTemplates,
  listContacts,
  listSegments,
  removeContactTag,
  upsertContact,
  updateContact,
  sendBroadcast,
  toBroadcast,
  updateBroadcast,
  updateEmailTemplate,
  updateGeneralSettings,
  updateSegment,
} from "./sendlit-client";
import { withSendlitKey } from "./proxy";

/** Every handler in this module is a thin, team-scoped proxy over the
 * team's provisioned SendLit team \u2014 FrontLit stores no contact, segment or
 * broadcast data of its own (architecture.md \u00a710.2/\u00a710.3). A team without a
 * SendLit integration yet (provisioning still retrying, or email
 * disabled in this deployment) gets a 409 rather than a crash. */
const router = Router();
router.use(["/contacts", "/email"], requireAuth, requireTeam);

const s = initServer();

const contactsImpl = s.router(
  contract.contacts,
  authorizeHandlers(
    {
      list: async ({ query, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          listContacts(apiKey, {
            ...query,
            subscribed:
              query.subscribed === undefined ? undefined : String(query.subscribed),
          }),
        ) as any,
      get: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          getContact(apiKey, params.contactId),
        ) as any,
      update: async ({ params, body, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          updateContact(apiKey, params.contactId, body),
        ) as any,
      create: async ({ body, req }) => {
        const result = await withSendlitKey((req as any).teamId, (apiKey) =>
          upsertContact(apiKey, body),
        );
        return (
          result.status === 200 ? { status: 201, body: result.body } : result
        ) as any;
      },
      remove: async ({ params, req }) => {
        const result = await withSendlitKey((req as any).teamId, async (apiKey) => {
          await deleteContact(apiKey, params.contactId);
          return undefined;
        });
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
    },
    {
      list: "contacts.list",
      get: "contacts.get",
      update: "contacts.update",
      create: "contacts.create",
      remove: "contacts.remove",
      addTag: "contacts.addTag",
      removeTag: "contacts.removeTag",
    },
  ),
);

const segmentsImpl = s.router(
  contract.segments,
  authorizeHandlers(
    {
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
        const result = await withSendlitKey((req as any).teamId, async (apiKey) => {
          await deleteSegment(apiKey, params.segmentId);
          return undefined;
        });
        if (result.status === 409) return result as any;
        return { status: 204, body: undefined };
      },
    },
    {
      create: "segments.create",
      list: "segments.list",
      update: "segments.update",
      remove: "segments.remove",
    },
  ),
);

const emailImpl = s.router(
  contract.email,
  authorizeHandlers(
    {
      getSettings: async ({ req }) => {
        const teamId = (req as any).teamId;
        const apiKey = await getSendlitApiKey(teamId);
        if (!apiKey) return { status: 200, body: { connected: false } };
        try {
          const settings = await getGeneralSettings(apiKey);
          return {
            status: 200,
            body: { connected: true, ...settings },
          };
        } catch {
          return { status: 200, body: { connected: true } };
        }
      },
      updateSettings: async ({ body, req }) =>
        withSendlitKey((req as any).teamId, async (apiKey) => ({
          connected: true,
          ...(await updateGeneralSettings(apiKey, body)),
        })) as any,
      retryProvision: async ({ req }) => {
        const result = await retryProvisionSendlitNow((req as any).teamId);
        return { status: 200 as const, body: result };
      },
      listTemplates: async ({ req }: any) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          listEmailTemplates(apiKey),
        ).then((r) =>
          r.status === 200 ? { status: 200, body: { items: r.body } } : r,
        ) as any,
      listSystemTemplates: async ({ req }: any) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          listSystemEmailTemplates(apiKey),
        ).then((r) =>
          r.status === 200 ? { status: 200, body: { items: r.body } } : r,
        ) as any,
      createTemplate: async ({ body, req }: any) => {
        const result = await withSendlitKey((req as any).teamId, (apiKey) =>
          createEmailTemplate(apiKey, body),
        );
        return (
          result.status === 200 ? { status: 201, body: result.body } : result
        ) as any;
      },
      updateTemplate: async ({ params, body, req }: any) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          updateEmailTemplate(apiKey, params.templateId, body),
        ) as any,
      listBroadcasts: async ({ req }) =>
        withSendlitKey((req as any).teamId, async (apiKey) => {
          const { items } = await listBroadcasts(apiKey);
          return items.map(toBroadcast);
        }).then((r) =>
          r.status === 200 ? { status: 200, body: { items: r.body } } : r,
        ) as any,
      createBroadcast: async ({ body, req }) => {
        const result = await withSendlitKey((req as any).teamId, async (apiKey) => {
          const created = await createBroadcast(apiKey, body);
          return toBroadcast(created);
        });
        return (
          result.status === 200 ? { status: 201, body: result.body } : result
        ) as any;
      },
      updateBroadcast: async ({ params, body, req }) =>
        withSendlitKey((req as any).teamId, async (apiKey) => {
          const updated = await updateBroadcast(apiKey, params.broadcastId, body);
          return toBroadcast(updated);
        }) as any,
      sendBroadcast: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          sendBroadcast(apiKey, params.broadcastId),
        ) as any,
      removeBroadcast: async ({ params, req }) => {
        const result = await withSendlitKey((req as any).teamId, async (apiKey) => {
          await deleteBroadcast(apiKey, params.broadcastId);
          return undefined;
        });
        if (result.status === 409) return result as any;
        return { status: 204, body: undefined };
      },
      getBroadcastStats: async ({ params, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          getBroadcastStats(apiKey, params.broadcastId),
        ) as any,
    },
    {
      getSettings: "email.getSettings",
      updateSettings: "email.updateSettings",
      retryProvision: "email.retryProvision",
      listTemplates: "email.listTemplates",
      listSystemTemplates: "email.listSystemTemplates",
      createTemplate: "email.createTemplate",
      updateTemplate: "email.updateTemplate",
      listBroadcasts: "email.listBroadcasts",
      createBroadcast: "email.createBroadcast",
      updateBroadcast: "email.updateBroadcast",
      sendBroadcast: "email.sendBroadcast",
      removeBroadcast: "email.removeBroadcast",
      getBroadcastStats: "email.getBroadcastStats",
    },
  ),
);

createExpressEndpoints(contract.contacts, contactsImpl, router);
createExpressEndpoints(contract.segments, segmentsImpl, router);
createExpressEndpoints(contract.email, emailImpl, router);

export default router;
