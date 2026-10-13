import { z } from "zod";
import {
  documentationGitSetupBodySchema,
  documentationGitSetupSchema,
  documentationGitRepositoriesQuerySchema,
  documentationGitRepositoriesSchema,
  documentationGitSelectionSchema,
  documentationGitPreflightSchema,
  documentationGitConnectBodySchema,
  documentationGitSourceSchema,
  documentationGitSyncSchema,
  documentationGitErrorSchema,
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
} from "@frontlit/api-contract";
import type { McpToolRegistrar } from "../tool-registry";
import type { AuthzContext } from "../../auth/authorize";
import { getTeamId } from "./auth";
import { AUTH_ERROR, INTERNAL_ERROR, jsonResult } from "./responses";
import {
  startGitHubSetup,
  listSetupRepositories,
  requireGitManager,
} from "../../documentation/github/setup";
import {
  preflightGitHubSource,
  connectGitHubSource,
  getGitHubSource,
  changeGitHubSourceState,
} from "../../documentation/github/source";
import { enqueueGitSync } from "../../documentation/github/state";
import { changeGitHubCapabilities } from "../../documentation/github/grants";
import {
  submitGitProposal,
  getGitProposal,
  listGitProposals,
} from "../../documentation/github/proposals";
import { getGitCheck, listGitChecks } from "../../documentation/github/check-reports";
import { resolveGitPublisherCredential } from "../../documentation/github/publisher";
import { submitGitMigrationPr } from "../../documentation/github/migration-prs";
import { gitHubErrorResponse } from "../../documentation/github/errors";
import {
  planGitMigration,
  getGitMigration,
  verifyGitMigration,
  activateGitMigration,
  cancelGitMigration,
} from "../../documentation/github/migrations";
export function registerDocumentationGitHubTools(server: McpToolRegistrar) {
  const commands = [
    {
      name: "get_documentation_github_check",
      description:
        "Read a private Git documentation validation/check-delivery report. Delivery failure is separate from validation truth; current restrictions redact diagnostic text.",
      input: { checkId: z.string().min(1) },
      output: documentationGitCheckSchema,
      read: true,
      run: (team: string, args: any) => getGitCheck(team, args.checkId),
    },
    {
      name: "list_documentation_github_checks",
      description:
        "List private Git documentation check summaries with stable cursor pagination. No Markdown, credentials or diagnostic prose.",
      input: documentationGitCheckListQuerySchema.shape,
      output: documentationGitCheckListSchema,
      read: true,
      run: (team: string, args: any) => listGitChecks(team, args),
    },
    {
      name: "list_documentation_github_proposals",
      description:
        "List workspace Git documentation proposals with stable pagination and restricted title/diagnostic redaction. Returns no Markdown or credentials.",
      input: documentationGitProposalListQuerySchema.shape,
      output: documentationGitProposalListSchema,
      read: true,
      run: (team: string, args: any) => listGitProposals(team, args),
    },
    {
      name: "submit_documentation_github_proposal",
      description:
        "Capture exact Git documentation draft versions for a delegated PR or direct commit. Requires publishing scope and a current publisher credential; never grants App or workspace write authority.",
      input: documentationGitProposalBodySchema.innerType().shape,
      output: documentationGitProposalSchema,
      run: async (team: string, args: any, actor: AuthzContext, auth: any) => {
        const credential = await resolveGitPublisherCredential(actor, {
          bearer: auth?.token,
          clientId: auth?.clientId,
        });
        return submitGitProposal(team, credential, args);
      },
    },
    {
      name: "get_documentation_github_proposal",
      description:
        "Read private proposal status, Git references and captured version/path metadata. Captured Markdown and credentials are never returned; restricted diagnostics are redacted.",
      input: { proposalId: z.string().min(1).max(100) },
      output: documentationGitProposalSchema,
      read: true,
      run: (team: string, args: any) => getGitProposal(team, args.proposalId),
    },
    {
      name: "grant_documentation_github_capabilities",
      description:
        "Review independent workspace PR/direct-commit delegation after a fresh GitHub administrator authorization. Final consent requires its original interactive browser account; MCP cannot finalize.",
      input: documentationGitCapabilitiesBodySchema.shape,
      output: documentationGitGrantSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        changeGitHubCapabilities(team, actor, args),
    },
    {
      name: "plan_documentation_git_migration",
      description:
        "Capture a private 24-hour editor documentation plan for a FrontLit-created setup PR. Requires manage/publish; does not change source or publish.",
      input: documentationGitMigrationPlanBodySchema.shape,
      output: documentationGitMigrationSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        planGitMigration(team, actor, args),
    },
    {
      name: "create_documentation_git_migration_pr",
      description:
        "Submit a reviewed captured setup plan for FrontLit to create its GitHub PR. Requires manage/publish scopes, current repository administrator setup proof and export disclosure acknowledgment. Does not merge, activate or publish.",
      input: {
        planId: z.string().min(1).max(100),
        ...documentationGitMigrationPrBodySchema.shape,
      },
      output: documentationGitMigrationPrSchema,
      run: async (team: string, args: any, actor: AuthzContext, auth: any) => {
        const credential = await resolveGitPublisherCredential(actor, {
          bearer: auth?.token,
          clientId: auth?.clientId,
        });
        const { planId, ...body } = args;
        return submitGitMigrationPr(team, actor, credential, planId, body);
      },
    },
    {
      name: "get_documentation_git_migration",
      description:
        "Read a bounded page of the original administrator's private captured Markdown export and plan status.",
      input: { planId: z.string(), ...documentationGitMigrationQuerySchema.shape },
      output: documentationGitMigrationSchema,
      read: true,
      run: (team: string, args: any, actor: AuthzContext) =>
        getGitMigration(team, actor, args.planId, args.offset, args.limit),
    },
    {
      name: "verify_documentation_git_migration",
      description:
        "Compare the merged setup PR target with the captured editor documentation at one immutable commit. Changes no public content.",
      input: { planId: z.string(), ...documentationGitMigrationVerifyBodySchema.shape },
      output: documentationGitMigrationVerificationSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        verifyGitMigration(team, actor, args.planId, args),
    },
    {
      name: "activate_documentation_git_migration",
      description:
        "Adopt reviewed equivalent Git content while preserving CMS identities/publication. Requires original administrator's interactive browser consent; MCP cannot finalize.",
      input: {
        planId: z.string(),
        ...documentationGitMigrationActivateBodySchema.shape,
      },
      output: documentationGitSourceSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        activateGitMigration(team, actor, args.planId, args),
    },
    {
      name: "cancel_documentation_git_migration",
      description:
        "Cancel an unfinished adoption plan without changing CMS content or remote files.",
      input: { planId: z.string() },
      output: documentationGitMigrationCancellationSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        cancelGitMigration(team, actor, args.planId),
    },
    {
      name: "start_documentation_github_setup",
      description:
        "Start account-bound interactive GitHub App authorization. Does not connect or publish.",
      input: documentationGitSetupBodySchema.shape,
      output: documentationGitSetupSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        startGitHubSetup(team, actor, args),
    },
    {
      name: "list_documentation_github_repositories",
      description:
        "List verified administrator-accessible repositories from the original account's setup context.",
      input: { setupId: z.string(), ...documentationGitRepositoriesQuerySchema.shape },
      output: documentationGitRepositoriesSchema,
      read: true,
      run: (team: string, args: any, actor: AuthzContext) =>
        listSetupRepositories(team, args.setupId, actor, args),
    },
    {
      name: "validate_documentation_github_source",
      description:
        "Read and validate an immutable GitHub documentation snapshot. Nothing becomes public.",
      input: documentationGitSelectionSchema.shape,
      output: documentationGitPreflightSchema,
      read: true,
      run: (team: string, args: any, actor: AuthzContext) =>
        preflightGitHubSource(team, actor, args),
    },
    {
      name: "connect_documentation_github",
      description:
        "Final connection requires the original interactive browser session, explicit publication consent, and current manage/publish authority. OAuth/MCP cannot finalize it.",
      input: documentationGitConnectBodySchema.shape,
      output: documentationGitSourceSchema,
      run: (team: string, args: any, actor: AuthzContext) =>
        connectGitHubSource(team, actor, args),
    },
    {
      name: "get_documentation_github",
      description:
        "Read sanitized source, observed/validated/live commit, and publication/sync status.",
      input: {},
      output: documentationGitSourceSchema,
      read: true,
      run: (team: string, _args: unknown, actor: AuthzContext) =>
        getGitHubSource(team, actor),
    },
    {
      name: "sync_documentation_github",
      description:
        "Reconcile the already delegated publishing branch through validation and immutable publication.",
      input: {},
      output: documentationGitSyncSchema,
      run: async (team: string, _args: any, actor: AuthzContext) => {
        requireGitManager(team, actor);
        const job = await enqueueGitSync(team, { trigger: "manual" });
        return {
          runId: job.runId,
          status: job.status,
          connectionGeneration: job.connectionGeneration,
          requestGeneration: job.requestGeneration,
        };
      },
    },
    {
      name: "pause_documentation_github",
      description:
        "Pause this team's sync and invalidate pending generations, keeping published docs.",
      input: {},
      output: documentationGitSourceSchema,
      run: (team: string, _args: any, actor: AuthzContext) =>
        changeGitHubSourceState(team, actor, "pause"),
    },
    {
      name: "resume_documentation_github",
      description: "Reverify App read access and resume the paused delegated source.",
      input: {},
      output: documentationGitSourceSchema,
      run: (team: string, _args: any, actor: AuthzContext) =>
        changeGitHubSourceState(team, actor, "resume"),
    },
    {
      name: "disconnect_documentation_github",
      description:
        "Disconnect this team's binding without uninstalling the shared App or deleting published docs.",
      input: {},
      output: documentationGitSourceSchema,
      run: (team: string, _args: any, actor: AuthzContext) =>
        changeGitHubSourceState(team, actor, "disconnect"),
    },
  ] as const;
  for (const command of commands)
    server.registerTool(
      command.name,
      {
        description: command.description,
        inputSchema: command.input,
        outputSchema: z.union([command.output, documentationGitErrorSchema]),
        annotations: {
          readOnlyHint: "read" in command && command.read,
          openWorldHint:
            command.name !== "get_documentation_github" &&
            command.name !== "get_documentation_github_proposal" &&
            command.name !== "list_documentation_github_proposals" &&
            command.name !== "get_documentation_github_check" &&
            command.name !== "list_documentation_github_checks",
        },
      },
      async (args: any, extra: any) => {
        const teamId = getTeamId(extra);
        if (!teamId) return AUTH_ERROR;
        const auth = extra.http?.authInfo;
        const actor: AuthzContext = {
          teamId,
          authKind: auth?.extra?.authKind === "api_key" ? "apikey" : "oauth",
          accountId: auth?.extra?.account?.id,
          isOwner: auth?.extra?.isOwner === true,
          permissions: auth?.extra?.permissions ?? [],
          scopes: auth?.scopes ?? [],
          audiences: [],
          apiKeyId: auth?.extra?.authKind === "api_key" ? auth.token : undefined,
        };
        try {
          return jsonResult(await command.run(teamId, args, actor, auth));
        } catch (error) {
          const response = gitHubErrorResponse(error);
          return response
            ? { ...jsonResult(response.body), isError: true }
            : INTERNAL_ERROR;
        }
      },
    );
}
