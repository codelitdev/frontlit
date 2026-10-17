import { Router } from "express";
import { changeGitHubCapabilities } from "./grants";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../../auth/middleware";
import { requireTeam } from "../../auth/require-team";
import { authorizeHandlers } from "../../auth/authorize";
import { serializeDates } from "../../utils/public";
import { documentationRequestError } from "../content-validation";
import { gitHubErrorResponse } from "./errors";
import { startGitHubSetup, listSetupRepositories, requireGitManager } from "./setup";
import {
  preflightGitHubSource,
  connectGitHubSource,
  getGitHubSource,
  changeGitHubSourceState,
} from "./source";
import { enqueueGitSync } from "./state";
import {
  disableGitPages,
  enableGitPages,
  previewGitPages,
} from "../../pages/git-source";
import { createPagesSetupPullRequest } from "../../pages/git-export";
import { submitGitProposal, getGitProposal, listGitProposals } from "./proposals";
import { getGitCheck, listGitChecks } from "./check-reports";
import { resolveGitPublisherCredential } from "./publisher";
import { submitGitMigrationPr } from "./migration-prs";
import {
  planGitMigration,
  getGitMigration,
  verifyGitMigration,
  activateGitMigration,
  cancelGitMigration,
} from "./migrations";
const router = Router();
router.use(
  "/content/documentation/github",
  requireAuth,
  requireTeam,
  (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Robots-Tag", "noindex");
    next();
  },
);
async function run(action: () => Promise<any>, status = 200): Promise<any> {
  try {
    return { status, body: serializeDates(await action()) };
  } catch (error) {
    const response = gitHubErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
const s = initServer();
const implementation = s.router(
  contract.content.documentationGithub,
  authorizeHandlers(
    {
      previewPages: async ({ req, body }: any) =>
        run(() => previewGitPages(req.teamId, req.authz, body)),
      enablePages: async ({ req, body }: any) =>
        run(() => enableGitPages(req.teamId, req.authz, body)),
      disablePages: async ({ req }: any) =>
        run(() => disableGitPages(req.teamId, req.authz)),
      exportPages: async ({ req, body }: any) =>
        run(() => {
          requireGitManager(req.teamId, req.authz, true);
          return createPagesSetupPullRequest(req.teamId, body);
        }, 201),
      getCheck: async ({ req, params }: any) =>
        run(() => getGitCheck(req.teamId, params.checkId)),
      listChecks: async ({ req, query }: any) =>
        run(() => listGitChecks(req.teamId, query)),
      listProposals: async ({ req, query }: any) =>
        run(() => listGitProposals(req.teamId, query)),
      submitProposal: async ({ req, body }: any) =>
        run(async () => {
          const credential = await resolveGitPublisherCredential(req.authz, {
            cookie: req.headers.cookie,
            bearer: req.oauthToken,
            clientId: req.clientId,
          });
          return submitGitProposal(req.teamId, credential, body);
        }, 202),
      getProposal: async ({ req, params }: any) =>
        run(() => getGitProposal(req.teamId, params.proposalId)),
      capabilities: async ({ req, body }: any) =>
        run(() => changeGitHubCapabilities(req.teamId, req.authz, body)),
      planMigration: async ({ req, body }: any) =>
        run(() => planGitMigration(req.teamId, req.authz, body), 201),
      getMigration: async ({ req, params, query }: any) =>
        run(() =>
          getGitMigration(
            req.teamId,
            req.authz,
            params.planId,
            query.offset,
            query.limit,
          ),
        ),
      verifyMigration: async ({ req, params, body }: any) =>
        run(() => verifyGitMigration(req.teamId, req.authz, params.planId, body)),
      createMigrationPr: async ({ req, params, body }: any) =>
        run(async () => {
          const credential = await resolveGitPublisherCredential(req.authz, {
            cookie: req.headers.cookie,
            bearer: req.oauthToken,
            clientId: req.clientId,
          });
          return submitGitMigrationPr(
            req.teamId,
            req.authz,
            credential,
            params.planId,
            body,
          );
        }, 202),
      activateMigration: async ({ req, params, body }: any) =>
        run(
          () => activateGitMigration(req.teamId, req.authz, params.planId, body),
          202,
        ),
      cancelMigration: async ({ req, params }: any) =>
        run(() => cancelGitMigration(req.teamId, req.authz, params.planId)),
      setup: async ({ req, body }: any) =>
        run(() => startGitHubSetup(req.teamId, req.authz, body), 201),
      repositories: async ({ req, params, query }: any) =>
        run(() => listSetupRepositories(req.teamId, params.setupId, req.authz, query)),
      preflight: async ({ req, body }: any) =>
        run(() => preflightGitHubSource(req.teamId, req.authz, body)),
      connect: async ({ req, body }: any) =>
        run(() => connectGitHubSource(req.teamId, req.authz, body), 202),
      get: async ({ req }: any) => run(() => getGitHubSource(req.teamId, req.authz)),
      sync: async ({ req }: any) =>
        run(async () => {
          requireGitManager(req.teamId, req.authz);
          const job = await enqueueGitSync(req.teamId, { trigger: "manual" });
          return {
            runId: job.runId,
            status: job.status,
            connectionGeneration: job.connectionGeneration,
            requestGeneration: job.requestGeneration,
          };
        }, 202),
      pause: async ({ req }: any) =>
        run(() => changeGitHubSourceState(req.teamId, req.authz, "pause")),
      resume: async ({ req }: any) =>
        run(() => changeGitHubSourceState(req.teamId, req.authz, "resume"), 202),
      disconnect: async ({ req }: any) =>
        run(() => changeGitHubSourceState(req.teamId, req.authz, "disconnect")),
    },
    {
      previewPages: "content.documentationGithub.previewPages",
      enablePages: "content.documentationGithub.enablePages",
      disablePages: "content.documentationGithub.disablePages",
      exportPages: "content.documentationGithub.exportPages",
      submitProposal: "content.documentationGithub.submitProposal",
      getProposal: "content.documentationGithub.getProposal",
      listProposals: "content.documentationGithub.listProposals",
      getCheck: "content.documentationGithub.getCheck",
      listChecks: "content.documentationGithub.listChecks",
      capabilities: "content.documentationGithub.capabilities",
      planMigration: "content.documentationGithub.planMigration",
      getMigration: "content.documentationGithub.getMigration",
      verifyMigration: "content.documentationGithub.verifyMigration",
      createMigrationPr: "content.documentationGithub.createMigrationPr",
      activateMigration: "content.documentationGithub.activateMigration",
      cancelMigration: "content.documentationGithub.cancelMigration",
      setup: "content.documentationGithub.setup",
      repositories: "content.documentationGithub.repositories",
      preflight: "content.documentationGithub.preflight",
      connect: "content.documentationGithub.connect",
      get: "content.documentationGithub.get",
      sync: "content.documentationGithub.sync",
      pause: "content.documentationGithub.pause",
      resume: "content.documentationGithub.resume",
      disconnect: "content.documentationGithub.disconnect",
    },
  ),
);
createExpressEndpoints(contract.content.documentationGithub, implementation, router, {
  requestValidationErrorHandler: documentationRequestError,
});
export default router;
