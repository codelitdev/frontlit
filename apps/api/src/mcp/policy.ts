import type { ServerContext } from "@modelcontextprotocol/server";
import type { TeamPermission } from "@frontlit/api-contract";
import { errorResult } from "./tools/responses";

export const MCP_SCOPES = {
  teamsRead: "teams:read",
  teamsWrite: "teams:write",
  apiKeysRead: "api_keys:read",
  apiKeysWrite: "api_keys:write",
  pagesRead: "pages:read",
  pagesWrite: "pages:write",
  themesRead: "themes:read",
  themesWrite: "themes:write",
  mediaRead: "media:read",
  mediaWrite: "media:write",
  articlesRead: "articles:read",
  articlesWrite: "articles:write",
  documentationRead: "documentation:read",
  documentationWrite: "documentation:write",
  documentationPublish: "documentation:publish",
  documentationManage: "documentation:manage",
  productUpdatesRead: "product-updates:read",
  productUpdatesWrite: "product-updates:write",
  contactsRead: "contacts:read",
  contactsWrite: "contacts:write",
  segmentsRead: "segments:read",
  segmentsWrite: "segments:write",
  broadcastsRead: "broadcasts:read",
  broadcastsWrite: "broadcasts:write",
  broadcastsSend: "broadcasts:send",
  espRead: "esp:read",
  espWrite: "esp:write",
  chatbotRead: "chatbot:read",
  chatbotWrite: "chatbot:write",
  helpdeskRead: "helpdesk:read",
  helpdeskWrite: "helpdesk:write",
  domainsRead: "domains:read",
  domainsWrite: "domains:write",
  settingsRead: "settings:read",
  settingsWrite: "settings:write",
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

export const MCP_SCOPES_SUPPORTED = Object.freeze(
  Object.values(MCP_SCOPES),
) as readonly McpScope[];

const toolScopes = {
  start_documentation_github_setup: MCP_SCOPES.documentationManage,
  list_documentation_github_repositories: MCP_SCOPES.documentationManage,
  validate_documentation_github_source: MCP_SCOPES.documentationManage,
  connect_documentation_github: MCP_SCOPES.documentationManage,
  get_documentation_github: MCP_SCOPES.documentationRead,
  sync_documentation_github: MCP_SCOPES.documentationManage,
  pause_documentation_github: MCP_SCOPES.documentationManage,
  resume_documentation_github: MCP_SCOPES.documentationManage,
  disconnect_documentation_github: MCP_SCOPES.documentationManage,
  grant_documentation_github_capabilities: MCP_SCOPES.documentationManage,
  submit_documentation_github_proposal: MCP_SCOPES.documentationPublish,
  get_documentation_github_proposal: MCP_SCOPES.documentationRead,
  get_documentation_github_check: MCP_SCOPES.documentationRead,
  list_documentation_github_checks: MCP_SCOPES.documentationRead,
  list_documentation_github_proposals: MCP_SCOPES.documentationRead,
  plan_documentation_git_migration: MCP_SCOPES.documentationManage,
  create_documentation_git_migration_pr: MCP_SCOPES.documentationManage,
  get_documentation_git_migration: MCP_SCOPES.documentationManage,
  verify_documentation_git_migration: MCP_SCOPES.documentationManage,
  activate_documentation_git_migration: MCP_SCOPES.documentationManage,
  cancel_documentation_git_migration: MCP_SCOPES.documentationManage,
  list_documentation_improvements: MCP_SCOPES.documentationRead,
  get_documentation_improvement: MCP_SCOPES.documentationRead,
  review_documentation_improvement: MCP_SCOPES.documentationWrite,
  create_documentation_improvement_draft: MCP_SCOPES.documentationWrite,
  list_documentation_publications: MCP_SCOPES.documentationRead,
  preview_documentation_page: MCP_SCOPES.documentationRead,
  list_documentation_revisions: MCP_SCOPES.documentationRead,
  get_documentation_revision: MCP_SCOPES.documentationRead,
  unpublish_documentation_page: MCP_SCOPES.documentationPublish,
  retry_documentation_publication: MCP_SCOPES.documentationPublish,
  publish_documentation_changes: MCP_SCOPES.documentationPublish,
  get_documentation_publication: MCP_SCOPES.documentationRead,
  preflight_documentation_purge: MCP_SCOPES.documentationManage,
  get_documentation_purge: MCP_SCOPES.documentationManage,
  purge_documentation: MCP_SCOPES.documentationManage,
  list_teams: MCP_SCOPES.teamsRead,
  create_team: MCP_SCOPES.teamsWrite,
  rename_team: MCP_SCOPES.teamsWrite,
  delete_team: MCP_SCOPES.teamsWrite,
  list_api_keys: MCP_SCOPES.apiKeysRead,
  create_api_key: MCP_SCOPES.apiKeysWrite,
  delete_api_key: MCP_SCOPES.apiKeysWrite,

  list_pages: MCP_SCOPES.pagesRead,
  get_page: MCP_SCOPES.pagesRead,
  create_page: MCP_SCOPES.pagesWrite,
  update_page: MCP_SCOPES.pagesWrite,
  delete_page: MCP_SCOPES.pagesWrite,
  publish_page: MCP_SCOPES.pagesWrite,
  discard_page_draft: MCP_SCOPES.pagesWrite,

  list_themes: MCP_SCOPES.themesRead,
  create_theme: MCP_SCOPES.themesWrite,
  update_theme: MCP_SCOPES.themesWrite,
  delete_theme: MCP_SCOPES.themesWrite,

  list_media: MCP_SCOPES.mediaRead,
  get_media: MCP_SCOPES.mediaRead,
  get_media_upload_signature: MCP_SCOPES.mediaWrite,
  register_media: MCP_SCOPES.mediaWrite,
  update_media: MCP_SCOPES.mediaWrite,
  delete_media: MCP_SCOPES.mediaWrite,

  list_articles: MCP_SCOPES.articlesRead,
  get_article: MCP_SCOPES.articlesRead,
  create_article: MCP_SCOPES.articlesWrite,
  update_article: MCP_SCOPES.articlesWrite,
  publish_article: MCP_SCOPES.articlesWrite,
  discard_article_draft: MCP_SCOPES.articlesWrite,
  delete_article: MCP_SCOPES.articlesWrite,

  list_documentation_pages: MCP_SCOPES.documentationRead,
  get_documentation_page: MCP_SCOPES.documentationRead,
  create_documentation_page: MCP_SCOPES.documentationWrite,
  update_documentation_page: MCP_SCOPES.documentationWrite,
  publish_documentation_page: MCP_SCOPES.documentationPublish,
  discard_documentation_page_draft: MCP_SCOPES.documentationWrite,
  delete_documentation_page: MCP_SCOPES.documentationWrite,
  validate_documentation: MCP_SCOPES.documentationRead,
  get_documentation_settings: MCP_SCOPES.documentationRead,
  update_documentation_settings: MCP_SCOPES.documentationManage,
  search_documentation: MCP_SCOPES.documentationRead,
  list_documentation_sections: MCP_SCOPES.documentationRead,
  create_documentation_section: MCP_SCOPES.documentationWrite,
  update_documentation_section: MCP_SCOPES.documentationWrite,
  delete_documentation_section: MCP_SCOPES.documentationWrite,

  list_product_updates: MCP_SCOPES.productUpdatesRead,
  get_product_update: MCP_SCOPES.productUpdatesRead,
  create_product_update: MCP_SCOPES.productUpdatesWrite,
  update_product_update: MCP_SCOPES.productUpdatesWrite,
  publish_product_update: MCP_SCOPES.productUpdatesWrite,
  discard_product_update_draft: MCP_SCOPES.productUpdatesWrite,
  delete_product_update: MCP_SCOPES.productUpdatesWrite,
  get_github_product_updates_integration: MCP_SCOPES.productUpdatesRead,
  connect_github_product_updates: MCP_SCOPES.productUpdatesWrite,
  disconnect_github_product_updates: MCP_SCOPES.productUpdatesWrite,
  import_github_releases: MCP_SCOPES.productUpdatesWrite,

  get_email_settings: MCP_SCOPES.settingsRead,
  update_email_settings: MCP_SCOPES.settingsWrite,
  get_esp_config: MCP_SCOPES.espRead,
  update_esp_config: MCP_SCOPES.espWrite,
  test_esp_config: MCP_SCOPES.espWrite,
  remove_esp_config: MCP_SCOPES.espWrite,
  list_contacts: MCP_SCOPES.contactsRead,
  get_contact: MCP_SCOPES.contactsRead,
  create_contact: MCP_SCOPES.contactsWrite,
  delete_contact: MCP_SCOPES.contactsWrite,
  add_contact_tag: MCP_SCOPES.contactsWrite,
  remove_contact_tag: MCP_SCOPES.contactsWrite,
  list_segments: MCP_SCOPES.segmentsRead,
  create_segment: MCP_SCOPES.segmentsWrite,
  update_segment: MCP_SCOPES.segmentsWrite,
  delete_segment: MCP_SCOPES.segmentsWrite,
  list_broadcasts: MCP_SCOPES.broadcastsRead,
  get_broadcast_stats: MCP_SCOPES.broadcastsRead,
  create_broadcast: MCP_SCOPES.broadcastsWrite,
  update_broadcast: MCP_SCOPES.broadcastsWrite,
  send_broadcast: MCP_SCOPES.broadcastsSend,
  delete_broadcast: MCP_SCOPES.broadcastsWrite,

  get_chatbot_settings: MCP_SCOPES.chatbotRead,
  update_chatbot_settings: MCP_SCOPES.chatbotWrite,
  get_inbox_ai_settings: MCP_SCOPES.chatbotRead,
  update_inbox_ai_settings: MCP_SCOPES.chatbotWrite,

  list_tickets: MCP_SCOPES.helpdeskRead,
  get_ticket: MCP_SCOPES.helpdeskRead,
  create_ticket: MCP_SCOPES.helpdeskWrite,
  reply_to_ticket: MCP_SCOPES.helpdeskWrite,
  update_ticket_status: MCP_SCOPES.helpdeskWrite,
  assign_ticket: MCP_SCOPES.helpdeskWrite,

  get_domain_settings: MCP_SCOPES.domainsRead,
  set_team_subdomain: MCP_SCOPES.domainsWrite,
  set_subdomain_redirect: MCP_SCOPES.domainsWrite,
  set_search_visibility: MCP_SCOPES.domainsWrite,
  attach_custom_domain: MCP_SCOPES.domainsWrite,
  set_primary_custom_domain: MCP_SCOPES.domainsWrite,
  verify_custom_domain: MCP_SCOPES.domainsWrite,
  remove_custom_domain: MCP_SCOPES.domainsWrite,
  add_redirect_domain: MCP_SCOPES.domainsWrite,
  update_redirect_domain: MCP_SCOPES.domainsWrite,
  verify_redirect_domain: MCP_SCOPES.domainsWrite,
  remove_redirect_domain: MCP_SCOPES.domainsWrite,

  get_team_settings: MCP_SCOPES.settingsRead,
  update_team_settings: MCP_SCOPES.settingsWrite,
} as const satisfies Record<string, McpScope>;

export type McpToolName = keyof typeof toolScopes;

const accountOnlyTools = new Set<McpToolName>(["list_teams", "create_team"]);

export const HIGH_IMPACT_MCP_TOOLS = new Set<McpToolName>([
  "submit_documentation_github_proposal",
  "delete_team",
  "create_api_key",
  "delete_api_key",
  "delete_page",
  "publish_page",
  "delete_theme",
  "delete_media",
  "publish_article",
  "delete_article",
  "publish_documentation_page",
  "delete_documentation_page",
  "publish_product_update",
  "delete_product_update",
  "import_github_releases",
  "test_esp_config",
  "remove_esp_config",
  "send_broadcast",
  "attach_custom_domain",
  "remove_custom_domain",
  "add_redirect_domain",
  "remove_redirect_domain",
]);

export type McpHumanRequirement =
  | { kind: "permission"; permission: TeamPermission }
  | { kind: "owner" }
  | { kind: "authenticated" };

export type McpToolPolicy = {
  tenant: "team" | "account";
  human: McpHumanRequirement;
  oauthScope: McpScope;
  apiKeyAccess: "allow" | "deny";
  /** @deprecated use oauthScope */
  scope: McpScope;
  /** @deprecated use apiKeyAccess */
  auth: "oauth" | "oauth_or_api_key";
  identity: "account" | "team";
};

const ownerOnlyTools = new Set<McpToolName>([
  "preflight_documentation_purge",
  "get_documentation_purge",
  "purge_documentation",
  "delete_team",
  "list_api_keys",
  "create_api_key",
  "delete_api_key",
]);

const apiKeyDeniedTools = new Set<McpToolName>([
  "start_documentation_github_setup",
  "list_documentation_github_repositories",
  "validate_documentation_github_source",
  "connect_documentation_github",
  "sync_documentation_github",
  "pause_documentation_github",
  "resume_documentation_github",
  "disconnect_documentation_github",
  "plan_documentation_git_migration",
  "create_documentation_git_migration_pr",
  "get_documentation_git_migration",
  "verify_documentation_git_migration",
  "activate_documentation_git_migration",
  "cancel_documentation_git_migration",
  "grant_documentation_github_capabilities",
  "preflight_documentation_purge",
  "get_documentation_purge",
  "purge_documentation",
  "list_teams",
  "create_team",
  "delete_team",
  "list_api_keys",
  "create_api_key",
  "delete_api_key",
]);

function humanForTool(name: McpToolName): McpHumanRequirement {
  if (ownerOnlyTools.has(name)) return { kind: "owner" };
  if (accountOnlyTools.has(name)) return { kind: "authenticated" };
  const scope = toolScopes[name];
  if (scope === "teams:write") {
    return { kind: "permission", permission: "team:update" };
  }
  if (scope.startsWith("api_keys:")) {
    return { kind: "owner" };
  }
  return { kind: "permission", permission: scope as TeamPermission };
}

export function isMcpToolName(name: string): name is McpToolName {
  return Object.prototype.hasOwnProperty.call(toolScopes, name);
}

export function isAccountOnlyMcpTool(name: string): boolean {
  return isMcpToolName(name) && accountOnlyTools.has(name);
}

export function getMcpToolPolicy(name: string): McpToolPolicy {
  if (!isMcpToolName(name)) {
    throw new Error(`MCP tool '${name}' has no authorization policy.`);
  }
  const accountOnly = accountOnlyTools.has(name);
  const apiKeyAccess = apiKeyDeniedTools.has(name) ? "deny" : "allow";
  return {
    tenant: accountOnly ? "account" : "team",
    human: humanForTool(name),
    oauthScope: toolScopes[name],
    apiKeyAccess,
    scope: toolScopes[name],
    auth: apiKeyAccess === "allow" ? "oauth_or_api_key" : "oauth",
    identity: accountOnly ? "account" : "team",
  };
}

export function authorizeMcpTool(
  name: string,
  ctx: ServerContext,
  args?: Record<string, unknown>,
) {
  const policy = getMcpToolPolicy(name);
  const authInfo = ctx.http?.authInfo;
  const extra = authInfo?.extra as
    | {
        authKind?: string;
        account?: unknown;
        isOwner?: boolean;
        permissions?: TeamPermission[];
        teamId?: string;
      }
    | undefined;
  const authKind = extra?.authKind;

  if (!authInfo) return errorResult("Authentication required.");

  if (authKind === "api_key") {
    return policy.apiKeyAccess === "allow"
      ? null
      : errorResult("OAuth user authentication is required.");
  }

  if (name === "get_inbox_ai_settings" || name === "update_inbox_ai_settings") {
    // Field-level: chatbot OR helpdesk is enough to call the tool.
  } else if (authKind !== "oauth" || !authInfo.scopes.includes(policy.oauthScope)) {
    return errorResult(
      `insufficient_scope: this tool requires '${policy.oauthScope}'.`,
    );
  }

  if (policy.human.kind === "authenticated" && !extra?.account) {
    return errorResult("A FrontLit account is required.");
  }

  if (policy.tenant === "team" && !extra?.teamId) {
    return errorResult("This OAuth token is not valid for a current team membership.");
  }

  let human = policy.human;
  if (
    name === "update_team_settings" &&
    args &&
    (args.codeInjectionHead !== undefined || args.codeInjectionBody !== undefined)
  ) {
    human = { kind: "owner" };
  }

  if (human.kind === "owner" && extra?.isOwner !== true) {
    return errorResult("owner_required: only the team owner can do this.");
  }

  if (name === "get_inbox_ai_settings" || name === "update_inbox_ai_settings") {
    const write = name === "update_inbox_ai_settings";
    const needed = write
      ? (["chatbot:write", "helpdesk:write"] as const)
      : (["chatbot:read", "helpdesk:read"] as const);
    const scopes = write
      ? [MCP_SCOPES.chatbotWrite, MCP_SCOPES.helpdeskWrite]
      : [MCP_SCOPES.chatbotRead, MCP_SCOPES.helpdeskRead];
    const hasScope =
      authKind === "api_key" || scopes.some((scope) => authInfo.scopes.includes(scope));
    const permissions = extra?.permissions ?? [];
    const hasPermission =
      extra?.isOwner === true ||
      needed.some((permission) => permissions.includes(permission));
    if (!hasScope) {
      return errorResult(
        `insufficient_scope: this tool requires '${scopes.join("' or '")}'.`,
      );
    }
    if (!hasPermission) {
      return errorResult(
        `insufficient_permission: this tool requires '${needed.join("' or '")}'.`,
      );
    }
    return null;
  }

  if (human.kind === "permission") {
    const permissions = extra?.permissions ?? [];
    if (extra?.isOwner !== true && !permissions.includes(human.permission)) {
      return errorResult(
        `insufficient_permission: this tool requires '${human.permission}'.`,
      );
    }
  }

  return null;
}

export function listMcpToolPolicies(): Readonly<Record<McpToolName, McpToolPolicy>> {
  return Object.fromEntries(
    (Object.keys(toolScopes) as McpToolName[]).map((name) => [
      name,
      getMcpToolPolicy(name),
    ]),
  ) as Record<McpToolName, McpToolPolicy>;
}
