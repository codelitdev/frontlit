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
  gitPagesExportSchema,
  gitPagesStateSchema,
} from "./schemas/documentation-github";
import {
  apiReferencePreviewSchema,
  apiReferenceSettingsBodySchema,
  apiReferenceStatusSchema,
} from "./schemas/api-reference";
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
      summary: "Preview the pages folder",
      description:
        "Dry-runs the pages importer on the connected branch's head: routes, diagnostics and the live pages that would go offline.",
    },
    enablePages: {
      method: "PUT",
      path: `${prefix}/pages`,
      body: gitPagesEnableBodySchema,
      responses: { 200: gitPagesStateSchema, ...errors },
      summary: "Sync pages from the repository",
      description:
        "Makes every page and the site chrome Git-owned: each push to the branch publishes the folder's pages (plus site.json) as one release.",
    },
    exportPages: {
      method: "POST",
      path: `${prefix}/pages/export`,
      body: gitPagesPreviewBodySchema,
      responses: { 201: gitPagesExportSchema, ...errors },
      summary: "Export pages to the repository",
      description:
        "Opens a setup pull request with every page as a canonical JSON file plus site.json. Merging it turns pages sync on.",
    },
    disablePages: {
      method: "DELETE",
      path: `${prefix}/pages`,
      body: c.noBody(),
      responses: { 200: gitPagesStateSchema, ...errors },
      summary: "Stop syncing pages",
      description:
        "Hands pages back to the builder. The last release stays live until the next publish.",
    },
    getApiReference: {
      method: "GET",
      path: `${prefix}/api-reference`,
      responses: { 200: apiReferenceStatusSchema, ...errors },
      summary: "Get the API reference status",
      description:
        "The OpenAPI spec path and URL path, the live API reference and the latest failed import with its diagnostics.",
    },
    previewApiReference: {
      method: "POST",
      path: `${prefix}/api-reference/preview`,
      body: apiReferenceSettingsBodySchema,
      responses: { 200: apiReferencePreviewSchema, ...errors },
      summary: "Preview an OpenAPI spec",
      description:
        "Dry-runs the spec import on the connected branch's head: the operation pages it would publish and any problems.",
    },
    updateApiReference: {
      method: "PUT",
      path: `${prefix}/api-reference`,
      body: apiReferenceSettingsBodySchema,
      responses: { 200: apiReferenceStatusSchema, ...errors },
      summary: "Set the OpenAPI spec",
      description:
        "Saves the spec path and URL path and syncs right away. A null spec path unpublishes the API reference.",
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
