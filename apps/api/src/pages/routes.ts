import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
  countPages,
  createPage,
  deletePage,
  discardPageDraft,
  getPageByPageId,
  listPages,
  publishPage,
  updatePage,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { db } from "../db/client";
import { activateRelease, getReleaseByReleaseId, listReleases } from "./releases";
import { createPagePullRequest, PageOwnedByGitError } from "./git-pr";
import { gitHubErrorResponse } from "../documentation/github/errors";
import { findTeamById } from "../team/queries";
import { revalidateTeam } from "../services/revalidate";
import { InvalidPageLayoutError } from "./shared-widgets";
import { InvalidSlugError, SlugConflictError } from "../utils/slug";

const router = Router();
router.use("/pages", requireAuth, requireTeam);
router.use("/site", requireAuth, requireTeam);

const s = initServer();

function toPublicPage<T extends Record<string, unknown>>(page: T) {
  return serializeDates(omitInternal(page, "teamId"));
}

/** Thin ts-rest adapter: every handler extracts `params`/`query`/`body`
 * (already validated against `@frontlit/api-contract`), delegates to the
 * framework-agnostic `./queries.ts` functions, and maps the result to
 * `{ status, body }`. No business logic lives here. */
const impl = s.router(
  contract.pages,
  authorizeHandlers(
    {
      create: async ({ body, req }) => {
        const page = await createPage({
          teamId: (req as any).teamId,
          ...body,
        });
        return { status: 201, body: toPublicPage(page) };
      },
      list: async ({ query, req }) => {
        const teamId = (req as any).teamId;
        const [items, total] = await Promise.all([
          listPages({
            teamId,
            q: query.q,
            offset: query.offset,
            itemsPerPage: query.itemsPerPage,
          }),
          countPages({ teamId, q: query.q }),
        ]);
        return {
          status: 200,
          body: {
            items: items.map((item) => toPublicPage(item)),
            total,
          },
        };
      },
      get: async ({ params, req }) => {
        const page = await getPageByPageId(params.pageId);
        if (!page || page.teamId !== (req as any).teamId) {
          return { status: 404, body: { error: "Page not found" } };
        }
        return { status: 200, body: toPublicPage(page) };
      },
      update: async ({ params, body, req }) => {
        try {
          const page = await updatePage((req as any).teamId, params.pageId, body);
          if (!page)
            return {
              status: 404,
              body: { error: "Page not found" },
            };
          if (body.slug !== undefined) {
            const team = await findTeamById((req as any).teamId);
            if (team) revalidateTeam(team.teamId).catch(() => {});
          }
          return { status: 200, body: toPublicPage(page) };
        } catch (error) {
          if (
            error instanceof InvalidPageLayoutError ||
            error instanceof InvalidSlugError
          ) {
            return { status: 400, body: { error: error.message } };
          }
          if (
            error instanceof SlugConflictError ||
            error instanceof PageOwnedByGitError
          ) {
            return { status: 409, body: { error: error.message } };
          }
          throw error;
        }
      },
      publish: async ({ params, req }) => {
        let page;
        try {
          page = await publishPage((req as any).teamId, params.pageId);
        } catch (error) {
          if (error instanceof PageOwnedByGitError)
            return { status: 409, body: { error: error.message } };
          throw error;
        }
        if (!page) return { status: 404, body: { error: "Page not found" } };
        const team = await findTeamById((req as any).teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        return { status: 200, body: toPublicPage(page) };
      },
      discardDraft: async ({ params, req }) => {
        const page = await discardPageDraft((req as any).teamId, params.pageId);
        if (!page) return { status: 404, body: { error: "Page not found" } };
        return { status: 200, body: toPublicPage(page) };
      },
      listReleases: async ({ req }) => {
        const items = await listReleases((req as any).teamId);
        return { status: 200, body: { items: items.map(serializeDates) } };
      },
      activateRelease: async ({ params, req }) => {
        const teamId = (req as any).teamId;
        const release = await getReleaseByReleaseId(teamId, params.releaseId);
        if (!release) return { status: 404, body: { error: "Release not found" } };
        await activateRelease(db, release);
        const team = await findTeamById(teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        const item = (await listReleases(teamId)).find(
          (row) => row.releaseId === params.releaseId,
        )!;
        return { status: 200, body: serializeDates(item) };
      },
      createPullRequest: async ({ params, req }) => {
        try {
          const pr = await createPagePullRequest((req as any).teamId, params.pageId);
          if (!pr) return { status: 404, body: { error: "Page not found" } };
          return { status: 201, body: pr };
        } catch (error) {
          const response = gitHubErrorResponse(error);
          if (response) return response as any;
          throw error;
        }
      },
      remove: async ({ params, req }) => {
        let result;
        try {
          result = await deletePage((req as any).teamId, params.pageId);
        } catch (error) {
          if (error instanceof PageOwnedByGitError)
            return { status: 409, body: { error: error.message } };
          throw error;
        }
        if (!result.ok && result.reason === "not_found")
          return { status: 404, body: { error: "Page not found" } };
        if (!result.ok && result.reason === "not_deletable") {
          return {
            status: 409,
            body: {
              error: "This is a standard page and can't be deleted.",
            },
          };
        }
        const team = await findTeamById((req as any).teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        return { status: 204, body: undefined };
      },
    },
    {
      create: "pages.create",
      list: "pages.list",
      get: "pages.get",
      update: "pages.update",
      publish: "pages.publish",
      discardDraft: "pages.discardDraft",
      createPullRequest: "pages.createPullRequest",
      listReleases: "pages.listReleases",
      activateRelease: "pages.activateRelease",
      remove: "pages.remove",
    },
  ),
);

createExpressEndpoints(contract.pages, impl, router);

export default router;
