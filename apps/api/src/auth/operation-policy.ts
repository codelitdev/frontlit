import { type TeamPermission, TEAM_PERMISSIONS } from "@frontlit/api-contract";
import { MCP_SCOPES, type McpScope } from "../mcp/policy";

export type OAuthScope = McpScope | "unsupported";

export type TeamOperationPolicy = {
  tenant: "team";
  human:
    | { kind: "permission"; permission: TeamPermission }
    | { kind: "owner" }
    | { kind: "member" };
  oauthScope: OAuthScope;
  apiKeyAccess: "allow" | "deny";
};

export type AccountOperationPolicy = {
  tenant: "account";
  human: { kind: "authenticated" };
  oauthScope: OAuthScope;
  apiKeyAccess: "deny";
};

export type OperationPolicy = TeamOperationPolicy | AccountOperationPolicy;

export type RestOperation = keyof typeof REST_OPERATION_POLICIES;

function teamPermission(
  permission: TeamPermission,
  oauthScope: OAuthScope,
  apiKeyAccess: "allow" | "deny" = "allow",
): TeamOperationPolicy {
  return {
    tenant: "team",
    human: { kind: "permission", permission },
    oauthScope,
    apiKeyAccess,
  };
}

function teamOwner(
  oauthScope: OAuthScope,
  apiKeyAccess: "allow" | "deny" = "deny",
): TeamOperationPolicy {
  return {
    tenant: "team",
    human: { kind: "owner" },
    oauthScope,
    apiKeyAccess,
  };
}

function teamMember(
  oauthScope: OAuthScope,
  apiKeyAccess: "allow" | "deny" = "deny",
): TeamOperationPolicy {
  return {
    tenant: "team",
    human: { kind: "member" },
    oauthScope,
    apiKeyAccess,
  };
}

function accountOp(oauthScope: OAuthScope): AccountOperationPolicy {
  return {
    tenant: "account",
    human: { kind: "authenticated" },
    oauthScope,
    apiKeyAccess: "deny",
  };
}

/**
 * Fail-closed registry. A protected REST operation without an entry here
 * must not run. Public, provisioning, health, and OAuth-protocol routes
 * stay outside this map.
 */
export const REST_OPERATION_POLICIES = {
  "content.documentationSections.listImprovements": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.getImprovement": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.reviewImprovement": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
    "deny",
  ),
  "content.documentationSections.createImprovementDraft": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "tickets.documentationFeedback": teamPermission(
    "helpdesk:write",
    MCP_SCOPES.helpdeskWrite,
  ),
  "content.documentationSections.listPublications": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.preview": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.listRevisions": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.getRevision": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.unpublish": teamPermission(
    "documentation:publish",
    MCP_SCOPES.documentationPublish,
  ),
  "content.documentationSections.retryPublication": teamPermission(
    "documentation:publish",
    MCP_SCOPES.documentationPublish,
  ),
  "content.documentationSections.queuePublication": teamPermission(
    "documentation:publish",
    MCP_SCOPES.documentationPublish,
  ),
  "content.documentationSections.getPublication": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.preflightPurge": teamOwner(
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationSections.commitPurge": teamOwner("unsupported", "deny"),
  "content.documentationSections.getPurge": teamOwner(
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "teams.list": accountOp(MCP_SCOPES.teamsRead),
  "teams.create": accountOp(MCP_SCOPES.teamsWrite),
  "teams.rename": teamPermission("team:update", MCP_SCOPES.teamsWrite),
  "teams.remove": teamOwner(MCP_SCOPES.teamsWrite, "deny"),
  "teams.listKeys": teamOwner(MCP_SCOPES.apiKeysRead, "deny"),
  "teams.createKey": teamOwner(MCP_SCOPES.apiKeysWrite, "deny"),
  "teams.removeKey": teamOwner(MCP_SCOPES.apiKeysWrite, "deny"),
  "teams.listMembers": teamPermission("members:read", "unsupported", "deny"),
  "teams.updateMember": teamPermission("members:manage", "unsupported", "deny"),
  "teams.removeMember": teamPermission("members:manage", "unsupported", "deny"),
  "teams.leave": teamMember("unsupported", "deny"),
  "teams.transferOwnership": teamOwner("unsupported", "deny"),
  "teams.listInvitations": teamPermission("members:read", "unsupported", "deny"),
  "teams.createInvitation": teamPermission("members:invite", "unsupported", "deny"),
  "teams.resendInvitation": teamPermission("members:invite", "unsupported", "deny"),
  "teams.revokeInvitation": teamPermission("members:manage", "unsupported", "deny"),
  "teamInvitations.preview": accountOp("unsupported"),
  "teamInvitations.accept": accountOp("unsupported"),
  "teamInvitations.reject": accountOp("unsupported"),

  "pages.create": teamPermission("pages:write", MCP_SCOPES.pagesWrite),
  "pages.list": teamPermission("pages:read", MCP_SCOPES.pagesRead),
  "pages.get": teamPermission("pages:read", MCP_SCOPES.pagesRead),
  "pages.update": teamPermission("pages:write", MCP_SCOPES.pagesWrite),
  "pages.remove": teamPermission("pages:write", MCP_SCOPES.pagesWrite),
  "pages.publish": teamPermission("pages:write", MCP_SCOPES.pagesWrite),
  "pages.discardDraft": teamPermission("pages:write", MCP_SCOPES.pagesWrite),
  "pages.createPullRequest": teamPermission("pages:write", MCP_SCOPES.pagesWrite),
  "pages.listReleases": teamPermission("pages:read", MCP_SCOPES.pagesRead),
  "pages.activateRelease": teamPermission("pages:write", MCP_SCOPES.pagesWrite),

  "themes.create": teamPermission("themes:write", MCP_SCOPES.themesWrite),
  "themes.list": teamPermission("themes:read", MCP_SCOPES.themesRead),
  "themes.get": teamPermission("themes:read", MCP_SCOPES.themesRead),
  "themes.update": teamPermission("themes:write", MCP_SCOPES.themesWrite),
  "themes.remove": teamPermission("themes:write", MCP_SCOPES.themesWrite),

  "media.presigned": teamPermission("media:write", MCP_SCOPES.mediaWrite),
  "media.create": teamPermission("media:write", MCP_SCOPES.mediaWrite),
  "media.list": teamPermission("media:read", MCP_SCOPES.mediaRead),
  "media.searchUnsplash": teamPermission("media:read", MCP_SCOPES.mediaRead),
  "media.get": teamPermission("media:read", MCP_SCOPES.mediaRead),
  "media.update": teamPermission("media:write", MCP_SCOPES.mediaWrite),
  "media.remove": teamPermission("media:write", MCP_SCOPES.mediaWrite),

  "content.articles.create": teamPermission("articles:write", MCP_SCOPES.articlesWrite),
  "content.articles.list": teamPermission("articles:read", MCP_SCOPES.articlesRead),
  "content.articles.get": teamPermission("articles:read", MCP_SCOPES.articlesRead),
  "content.articles.update": teamPermission("articles:write", MCP_SCOPES.articlesWrite),
  "content.articles.publish": teamPermission(
    "articles:write",
    MCP_SCOPES.articlesWrite,
  ),
  "content.articles.discardDraft": teamPermission(
    "articles:write",
    MCP_SCOPES.articlesWrite,
  ),
  "content.articles.remove": teamPermission("articles:write", MCP_SCOPES.articlesWrite),

  "content.documentation.create": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "content.documentation.list": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentation.get": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentation.update": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "content.documentation.publish": teamPermission(
    "documentation:publish",
    MCP_SCOPES.documentationPublish,
  ),
  "content.documentation.discardDraft": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "content.documentation.remove": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),

  "content.productUpdates.create": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.list": teamPermission(
    "product-updates:read",
    MCP_SCOPES.productUpdatesRead,
  ),
  "content.productUpdates.get": teamPermission(
    "product-updates:read",
    MCP_SCOPES.productUpdatesRead,
  ),
  "content.productUpdates.update": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.publish": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.discardDraft": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.remove": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.connectGithub": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.getGithubIntegration": teamPermission(
    "product-updates:read",
    MCP_SCOPES.productUpdatesRead,
  ),
  "content.productUpdates.disconnectGithub": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),
  "content.productUpdates.importGithubReleases": teamPermission(
    "product-updates:write",
    MCP_SCOPES.productUpdatesWrite,
  ),

  "content.documentationSections.validate": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.getSettings": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.updateSettings": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
  ),
  "content.documentationGithub.previewPages": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.enablePages": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.exportPages": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.disablePages": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.getApiReference": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
    "deny",
  ),
  "content.documentationGithub.previewApiReference": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.updateApiReference": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.setup": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.capabilities": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.submitProposal": teamPermission(
    "documentation:publish",
    MCP_SCOPES.documentationPublish,
  ),
  "content.documentationGithub.getProposal": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationGithub.getCheck": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationGithub.listChecks": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationGithub.listProposals": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationGithub.repositories": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.preflight": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.connect": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.get": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationGithub.sync": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.pause": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.resume": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.disconnect": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.planMigration": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.createMigrationPr": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.getMigration": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.verifyMigration": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationGithub.activateMigration": teamPermission(
    "documentation:manage",
    "unsupported",
    "deny",
  ),
  "content.documentationGithub.cancelMigration": teamPermission(
    "documentation:manage",
    MCP_SCOPES.documentationManage,
    "deny",
  ),
  "content.documentationSections.create": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "content.documentationSections.list": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),
  "content.documentationSections.update": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "content.documentationSections.remove": teamPermission(
    "documentation:write",
    MCP_SCOPES.documentationWrite,
  ),
  "content.documentationSections.search": teamPermission(
    "documentation:read",
    MCP_SCOPES.documentationRead,
  ),

  "contacts.list": teamPermission("contacts:read", MCP_SCOPES.contactsRead),
  "contacts.get": teamPermission("contacts:read", MCP_SCOPES.contactsRead),
  "contacts.update": teamPermission("contacts:write", MCP_SCOPES.contactsWrite),
  "contacts.create": teamPermission("contacts:write", MCP_SCOPES.contactsWrite),
  "contacts.remove": teamPermission("contacts:write", MCP_SCOPES.contactsWrite),
  "contacts.addTag": teamPermission("contacts:write", MCP_SCOPES.contactsWrite),
  "contacts.removeTag": teamPermission("contacts:write", MCP_SCOPES.contactsWrite),

  "segments.create": teamPermission("segments:write", MCP_SCOPES.segmentsWrite),
  "segments.list": teamPermission("segments:read", MCP_SCOPES.segmentsRead),
  "segments.update": teamPermission("segments:write", MCP_SCOPES.segmentsWrite),
  "segments.remove": teamPermission("segments:write", MCP_SCOPES.segmentsWrite),

  "email.getSettings": teamPermission("settings:read", MCP_SCOPES.settingsRead),
  "email.updateSettings": teamPermission("settings:write", MCP_SCOPES.settingsWrite),
  "email.retryProvision": teamPermission("settings:write", MCP_SCOPES.settingsWrite),
  "email.listTemplates": teamPermission("broadcasts:read", MCP_SCOPES.broadcastsRead),
  "email.listSystemTemplates": teamPermission(
    "broadcasts:read",
    MCP_SCOPES.broadcastsRead,
  ),
  "email.createTemplate": teamPermission(
    "broadcasts:write",
    MCP_SCOPES.broadcastsWrite,
  ),
  "email.updateTemplate": teamPermission(
    "broadcasts:write",
    MCP_SCOPES.broadcastsWrite,
  ),
  "email.listBroadcasts": teamPermission("broadcasts:read", MCP_SCOPES.broadcastsRead),
  "email.createBroadcast": teamPermission(
    "broadcasts:write",
    MCP_SCOPES.broadcastsWrite,
  ),
  "email.updateBroadcast": teamPermission(
    "broadcasts:write",
    MCP_SCOPES.broadcastsWrite,
  ),
  "email.sendBroadcast": teamPermission("broadcasts:send", MCP_SCOPES.broadcastsSend),
  "email.removeBroadcast": teamPermission(
    "broadcasts:write",
    MCP_SCOPES.broadcastsWrite,
  ),
  "email.getBroadcastStats": teamPermission(
    "broadcasts:read",
    MCP_SCOPES.broadcastsRead,
  ),

  "chatbot.get": teamPermission("chatbot:read", MCP_SCOPES.chatbotRead),
  "chatbot.update": teamPermission("chatbot:write", MCP_SCOPES.chatbotWrite),

  "ai.get": teamPermission("ai:read", "unsupported"),
  "ai.update": teamPermission("ai:write", "unsupported"),
  "ai.remove": teamPermission("ai:write", "unsupported"),
  "inboxAi.get": teamMember(MCP_SCOPES.chatbotRead),
  "inboxAi.update": teamMember(MCP_SCOPES.chatbotWrite),

  "tickets.list": teamPermission("helpdesk:read", MCP_SCOPES.helpdeskRead),
  "tickets.create": teamPermission("helpdesk:write", MCP_SCOPES.helpdeskWrite),
  "tickets.get": teamPermission("helpdesk:read", MCP_SCOPES.helpdeskRead),
  "tickets.reply": teamPermission("helpdesk:write", MCP_SCOPES.helpdeskWrite),
  "tickets.presignAttachment": teamPermission(
    "helpdesk:write",
    MCP_SCOPES.helpdeskWrite,
  ),
  "tickets.completeAttachment": teamPermission(
    "helpdesk:write",
    MCP_SCOPES.helpdeskWrite,
  ),
  "tickets.update": teamPermission("helpdesk:write", MCP_SCOPES.helpdeskWrite),

  "domains.get": teamPermission("domains:read", MCP_SCOPES.domainsRead),
  "domains.setSubdomain": teamPermission("domains:write", MCP_SCOPES.domainsWrite),
  "domains.setRedirectSubdomain": teamPermission(
    "domains:write",
    MCP_SCOPES.domainsWrite,
  ),
  "domains.setHideFromSearch": teamPermission("domains:write", MCP_SCOPES.domainsWrite),
  "domains.attachCustomDomain": teamPermission(
    "domains:write",
    MCP_SCOPES.domainsWrite,
  ),
  "domains.setPrimaryCustomDomain": teamPermission(
    "domains:write",
    MCP_SCOPES.domainsWrite,
  ),
  "domains.verifyCustomDomain": teamPermission(
    "domains:write",
    MCP_SCOPES.domainsWrite,
  ),
  "domains.removeCustomDomain": teamPermission(
    "domains:write",
    MCP_SCOPES.domainsWrite,
  ),

  "settings.get": teamPermission("settings:read", MCP_SCOPES.settingsRead),
  "settings.update": teamPermission("settings:write", MCP_SCOPES.settingsWrite),
  "settings.updateCodeInjection": teamOwner(MCP_SCOPES.settingsWrite, "allow"),
  "settings.esp.get": teamPermission("esp:read", MCP_SCOPES.espRead),
  "settings.esp.upsert": teamPermission("esp:write", MCP_SCOPES.espWrite),
  "settings.esp.remove": teamPermission("esp:write", MCP_SCOPES.espWrite),
  "settings.esp.test": teamPermission("esp:write", MCP_SCOPES.espWrite),
} as const satisfies Record<string, OperationPolicy>;

export const UNREGISTERED_OPERATION = "__unregistered__";

export function getRestOperationPolicy(operation: string): OperationPolicy | null {
  if (Object.prototype.hasOwnProperty.call(REST_OPERATION_POLICIES, operation)) {
    return REST_OPERATION_POLICIES[operation as RestOperation];
  }
  return null;
}

export function listRestOperations(): RestOperation[] {
  return Object.keys(REST_OPERATION_POLICIES) as RestOperation[];
}

export function settingsUpdateOperation(body: {
  codeInjectionHead?: unknown;
  codeInjectionBody?: unknown;
}): RestOperation {
  return body.codeInjectionHead !== undefined || body.codeInjectionBody !== undefined
    ? "settings.updateCodeInjection"
    : "settings.update";
}

export { TEAM_PERMISSIONS };
