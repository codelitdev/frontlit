import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  documentationGitErrorSchema,
  documentationGitSetupBodySchema,
  documentationGitSetupSchema,
  documentationGitRepositoriesQuerySchema,
  documentationGitRepositoriesSchema,
  documentationGitSelectionSchema,
  documentationGitPreflightSchema,
  documentationGitConnectBodySchema,
  documentationGitSourceSchema,
  documentationGitSyncSchema,
  documentationGitMigrationPlanBodySchema,
  documentationGitMigrationQuerySchema,
  documentationGitMigrationSchema,
  documentationGitMigrationPrBodySchema,
  documentationGitMigrationPrSchema,
  documentationGitMigrationVerifyBodySchema,
  documentationGitMigrationVerificationSchema,
  documentationGitMigrationActivateBodySchema,
  documentationGitMigrationCancellationSchema,
  documentationGitCapabilitiesBodySchema,
  documentationGitGrantSchema,
  documentationGitProposalBodySchema,
  documentationGitProposalSchema,
  documentationGitProposalListQuerySchema,
  documentationGitProposalListSchema,
  documentationGitCheckSchema,
  documentationGitCheckListQuerySchema,
  documentationGitCheckListSchema,
  gitPagesPreviewBodySchema,
  gitPagesPreviewSchema,
  gitPagesEnableBodySchema,
} from "./schemas/documentation-github";
const c = initContract();
const errors = {
  400: documentationGitErrorSchema,
  403: z.union([
    documentationGitErrorSchema,
    z.object({ error: z.string() }).passthrough(),
  ]),
  409: documentationGitErrorSchema,
  422: documentationGitErrorSchema,
  429: documentationGitErrorSchema,
  503: documentationGitErrorSchema,
};
const prefix = "/content/documentation/github";
export const documentationGithubContract = c.router(
  {
    previewPages: {
      method: "POST",
      path: `${prefix}/pages/preview`,
      body: gitPagesPreviewBodySchema,
      responses: { 200: gitPagesPreviewSchema, ...errors },
      summary: "Preview a pages folder",
      description:
        "Dry-runs the pages importer on the connected branch's head: routes, diagnostics and the live pages that would go offline.",
    },
    enablePages: {
      method: "PUT",
      path: `${prefix}/pages`,
      body: gitPagesEnableBodySchema,
      responses: { 200: documentationGitSourceSchema, ...errors },
      summary: "Sync pages from the repository",
      description:
        "Makes every page and the site chrome Git-owned: each push to the branch publishes the folder's pages (plus site.json) as one release.",
    },
    disablePages: {
      method: "DELETE",
      path: `${prefix}/pages`,
      body: c.noBody(),
      responses: { 200: documentationGitSourceSchema, ...errors },
      summary: "Stop syncing pages",
      description:
        "Hands pages back to the builder. The last release stays live until the next publish.",
    },
    listChecks: {
      method: "GET",
      path: `${prefix}/checks`,
      query: documentationGitCheckListQuerySchema,
      responses: { 200: documentationGitCheckListSchema, ...errors },
    },
    getCheck: {
      method: "GET",
      path: `${prefix}/checks/:checkId`,
      responses: {
        200: documentationGitCheckSchema,
        404: documentationGitErrorSchema,
        ...errors,
      },
    },
    listProposals: {
      method: "GET",
      path: `${prefix}/proposals`,
      query: documentationGitProposalListQuerySchema,
      responses: { 200: documentationGitProposalListSchema, ...errors },
    },
    submitProposal: {
      method: "POST",
      path: `${prefix}/proposals`,
      body: documentationGitProposalBodySchema,
      responses: { 202: documentationGitProposalSchema, ...errors },
    },
    getProposal: {
      method: "GET",
      path: `${prefix}/proposals/:proposalId`,
      responses: {
        200: documentationGitProposalSchema,
        404: documentationGitErrorSchema,
        ...errors,
      },
    },
    capabilities: {
      method: "POST",
      path: `${prefix}/capabilities`,
      body: documentationGitCapabilitiesBodySchema,
      responses: { 200: documentationGitGrantSchema, ...errors },
    },
    planMigration: {
      method: "POST",
      path: `${prefix}/migrations`,
      body: documentationGitMigrationPlanBodySchema,
      responses: { 201: documentationGitMigrationSchema, ...errors },
    },
    getMigration: {
      method: "GET",
      path: `${prefix}/migrations/:planId`,
      query: documentationGitMigrationQuerySchema,
      responses: { 200: documentationGitMigrationSchema, ...errors },
    },
    verifyMigration: {
      method: "POST",
      path: `${prefix}/migrations/:planId/verify`,
      body: documentationGitMigrationVerifyBodySchema,
      responses: { 200: documentationGitMigrationVerificationSchema, ...errors },
    },
    createMigrationPr: {
      method: "POST",
      path: `${prefix}/migrations/:planId/pr`,
      body: documentationGitMigrationPrBodySchema,
      responses: { 202: documentationGitMigrationPrSchema, ...errors },
    },
    activateMigration: {
      method: "POST",
      path: `${prefix}/migrations/:planId/activate`,
      body: documentationGitMigrationActivateBodySchema,
      responses: { 202: documentationGitSourceSchema, ...errors },
    },
    cancelMigration: {
      method: "DELETE",
      path: `${prefix}/migrations/:planId`,
      responses: { 200: documentationGitMigrationCancellationSchema, ...errors },
    },
    setup: {
      method: "POST",
      path: `${prefix}/setup`,
      body: documentationGitSetupBodySchema,
      responses: { 201: documentationGitSetupSchema, ...errors },
    },
    repositories: {
      method: "GET",
      path: `${prefix}/setup/:setupId/repositories`,
      query: documentationGitRepositoriesQuerySchema,
      responses: { 200: documentationGitRepositoriesSchema, ...errors },
    },
    preflight: {
      method: "POST",
      path: `${prefix}/preflight`,
      body: documentationGitSelectionSchema,
      responses: { 200: documentationGitPreflightSchema, ...errors },
    },
    connect: {
      method: "POST",
      path: `${prefix}/connect`,
      body: documentationGitConnectBodySchema,
      responses: { 202: documentationGitSourceSchema, ...errors },
    },
    get: {
      method: "GET",
      path: prefix,
      responses: { 200: documentationGitSourceSchema, ...errors },
    },
    sync: {
      method: "POST",
      path: `${prefix}/sync`,
      body: z.object({}).strict(),
      responses: { 202: documentationGitSyncSchema, ...errors },
    },
    pause: {
      method: "POST",
      path: `${prefix}/pause`,
      body: z.object({}).strict(),
      responses: { 200: documentationGitSourceSchema, ...errors },
    },
    resume: {
      method: "POST",
      path: `${prefix}/resume`,
      body: z.object({}).strict(),
      responses: { 202: documentationGitSourceSchema, ...errors },
    },
    disconnect: {
      method: "DELETE",
      path: prefix,
      responses: { 200: documentationGitSourceSchema, ...errors },
    },
  },
  { metadata: { tag: "Documentation: GitHub source" } },
);
