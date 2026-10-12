import {
  listDocumentationImprovements,
  getDocumentationImprovement,
  reviewDocumentationImprovement,
  createDocumentationImprovementDraft,
} from "./improvements";
import {
  publicationForReader,
  getDocsUiSettings,
  previewDocumentation,
  listPublicationHistory,
  getRetainedRevision,
  listDocumentRevisions,
  unpublishDocumentation,
  retryDocumentationPublication,
} from "./experience";
import {
  queuePublication,
  getPublication,
  preflightPurge,
  commitPurge,
  getPurge,
} from "./publications";
import { publicPublication, publicPurge } from "./projections";
import { updateDocsSettings, validateDocumentation } from "./authoring";
import { DocsContentError } from "@frontlit/text-editor/docs";
import {
  documentationRequestError,
  documentationErrorBody,
  documentationErrorStatus,
} from "./content-validation";
import { Router } from "express";
import { documentationPrincipal } from "./admission";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
  createDocSection,
  deleteDocSection,
  listDocSections,
  searchChunks,
  updateDocSection,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";

/** Documentation sections (help-center nav tree) plus semantic search.
 * Mounted before the generic `/content/documentation/:documentId` router so
 * its literal section/search routes cannot be shadowed by the wildcard. */
const router = Router();
router.use("/content/documentation", requireAuth, requireTeam, (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("X-Robots-Tag", "noindex");
  next();
});

const s = initServer();

function manages(req: any) {
  return Boolean(
    req.authz?.isOwner || req.authz?.permissions?.includes("documentation:manage"),
  );
}

function toPublicSection<T extends Record<string, unknown>>(section: T) {
  return serializeDates(omitInternal(section, "teamId"));
}

async function command(
  run: () => Promise<any>,
  project: (row: any) => any,
  status: 200 | 201 | 202 = 200,
): Promise<any> {
  try {
    const result = await run();
    return result
      ? { status, body: project(result) }
      : { status: 404, body: { error: "Not found" } };
  } catch (error) {
    if (error instanceof DocsContentError)
      return {
        status: documentationErrorStatus(error),
        body: documentationErrorBody(error),
      };
    throw error;
  }
}
const impl = s.router(
  contract.content.documentationSections,
  authorizeHandlers(
    {
      listImprovements: async ({ query, req }) =>
        command(
          () =>
            listDocumentationImprovements(
              (req as any).teamId,
              query,
              (req as any).authz,
            ),
          (value) => value,
        ),
      getImprovement: async ({ params, req }) =>
        command(
          () =>
            getDocumentationImprovement(
              (req as any).teamId,
              params.itemId,
              (req as any).authz,
            ),
          (value) => value,
        ),
      reviewImprovement: async ({ params, body, req }) =>
        command(
          () =>
            reviewDocumentationImprovement(
              (req as any).teamId,
              params.itemId,
              body,
              (req as any).authz,
            ),
          (value) => value,
        ),
      createImprovementDraft: async ({ params, body, req }) =>
        command(
          () =>
            createDocumentationImprovementDraft(
              (req as any).teamId,
              params.itemId,
              body,
              (req as any).authz,
            ),
          (value) => value,
          201,
        ),
      listPublications: async ({ query, req }: any) =>
        command(
          () => listPublicationHistory(req.teamId, query, manages(req)),
          (x) => x,
        ),
      preview: async ({ params, body, req, res }: any) => {
        res.set("Cache-Control", "private, no-store");
        res.set("X-Robots-Tag", "noindex");
        return command(
          () =>
            previewDocumentation(
              req.teamId,
              params.documentId,
              body.expectedDraftVersion,
              manages(req),
            ),
          (x) => x,
        );
      },
      listRevisions: async ({ params, req, res }: any) => {
        res.set("Cache-Control", "private, no-store");
        return command(
          () => listDocumentRevisions(req.teamId, params.documentId, manages(req)),
          (x) => x,
        );
      },
      getRevision: async ({ params, req, res }: any) => {
        res.set("Cache-Control", "private, no-store");
        res.set("X-Robots-Tag", "noindex");
        return command(
          () =>
            getRetainedRevision(
              req.teamId,
              params.documentId,
              params.revisionId,
              manages(req),
            ),
          (x) => x,
        );
      },
      unpublish: async ({ params, body, req }: any) =>
        command(
          () => unpublishDocumentation(req.teamId, params.documentId, body),
          publicPublication,
          202,
        ),
      retryPublication: async ({ params, body, req }: any) =>
        command(
          () =>
            retryDocumentationPublication(
              req.teamId,
              params.publicationId,
              body.idempotencyKey,
            ),
          publicPublication,
          202,
        ),
      queuePublication: async ({ body, req }: any) =>
        command(() => queuePublication(req.teamId, body), publicPublication, 202),
      getPublication: async ({ params, req }: any) =>
        command(
          async () => {
            const row = await getPublication(req.teamId, params.publicationId);
            return row ? publicationForReader(req.teamId, row, manages(req)) : null;
          },
          (x) => x,
        ),
      preflightPurge: async ({ body, req }: any) =>
        command(
          () => preflightPurge(req.teamId, body.documentIds, req.authz?.accountId),
          publicPurge,
          201,
        ),
      commitPurge: async ({ body, req }: any) =>
        command(() => commitPurge(req.teamId, body, req.authz), publicPurge),
      getPurge: async ({ params, req }: any) =>
        command(() => getPurge(req.teamId, params.purgeId), publicPurge),
      validate: async ({ body, req }: any) => {
        try {
          const report = await validateDocumentation(
            (req as any).teamId,
            body,
            documentationPrincipal(req.authz),
          );
          return report
            ? { status: 200, body: report }
            : { status: 404, body: { error: "Not found" } };
        } catch (error) {
          if (error instanceof DocsContentError)
            return {
              status: documentationErrorStatus(error),
              body: documentationErrorBody(error),
            };
          throw error;
        }
      },
      getSettings: async ({ req }: any) => ({
        status: 200,
        body: omitInternal(await getDocsUiSettings((req as any).teamId), "teamId"),
      }),
      updateSettings: async ({ body, req }: any) => {
        try {
          return {
            status: 200,
            body: omitInternal(
              await updateDocsSettings((req as any).teamId, body),
              "teamId",
            ),
          };
        } catch (error) {
          if (error instanceof DocsContentError)
            return { status: 409, body: documentationErrorBody(error) };
          throw error;
        }
      },
      create: async ({ body, req }) => {
        try {
          const section = await createDocSection({
            teamId: (req as any).teamId,
            ...body,
          });
          return { status: 201, body: toPublicSection(section) };
        } catch (error) {
          if (error instanceof DocsContentError)
            return { status: 409, body: documentationErrorBody(error) };
          throw error;
        }
      },
      list: async ({ req }) => {
        const items = await listDocSections((req as any).teamId);
        return {
          status: 200,
          body: { items: items.map(toPublicSection) },
        };
      },
      update: async ({ params, body, req }) => {
        try {
          const section = await updateDocSection(
            (req as any).teamId,
            params.sectionId,
            body,
          );
          if (!section)
            return {
              status: 404,
              body: { error: "Section not found" },
            };
          return { status: 200, body: toPublicSection(section) };
        } catch (error) {
          if (error instanceof DocsContentError)
            return { status: 409, body: documentationErrorBody(error) };
          throw error;
        }
      },
      remove: async ({ params, query, req }) => {
        try {
          const result = await deleteDocSection(
            (req as any).teamId,
            params.sectionId,
            query.expectedDocsDraftVersion,
          );
          if (!result.ok)
            return {
              status: 404,
              body: { error: "Section not found" },
            };
          return { status: 204, body: undefined };
        } catch (error) {
          if (error instanceof DocsContentError)
            return { status: 409, body: documentationErrorBody(error) };
          throw error;
        }
      },
      search: async ({ query, req }) => {
        const results = await searchChunks((req as any).teamId, query.q, query.k);
        return { status: 200, body: { items: results } };
      },
    },
    {
      listImprovements: "content.documentationSections.listImprovements",
      getImprovement: "content.documentationSections.getImprovement",
      reviewImprovement: "content.documentationSections.reviewImprovement",
      createImprovementDraft: "content.documentationSections.createImprovementDraft",
      listPublications: "content.documentationSections.listPublications",
      preview: "content.documentationSections.preview",
      listRevisions: "content.documentationSections.listRevisions",
      getRevision: "content.documentationSections.getRevision",
      unpublish: "content.documentationSections.unpublish",
      retryPublication: "content.documentationSections.retryPublication",
      queuePublication: "content.documentationSections.queuePublication",
      getPublication: "content.documentationSections.getPublication",
      preflightPurge: "content.documentationSections.preflightPurge",
      commitPurge: "content.documentationSections.commitPurge",
      getPurge: "content.documentationSections.getPurge",
      validate: "content.documentationSections.validate",
      getSettings: "content.documentationSections.getSettings",
      updateSettings: "content.documentationSections.updateSettings",
      create: "content.documentationSections.create",
      list: "content.documentationSections.list",
      update: "content.documentationSections.update",
      remove: "content.documentationSections.remove",
      search: "content.documentationSections.search",
    },
  ),
);

createExpressEndpoints(contract.content.documentationSections, impl, router, {
  requestValidationErrorHandler: documentationRequestError,
});

export default router;
