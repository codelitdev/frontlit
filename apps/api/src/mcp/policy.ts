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
    blogsRead: "blogs:read",
    blogsWrite: "blogs:write",
    docsRead: "docs:read",
    docsWrite: "docs:write",
    changelogsRead: "changelogs:read",
    changelogsWrite: "changelogs:write",
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

    list_blog_posts: MCP_SCOPES.blogsRead,
    get_blog_post: MCP_SCOPES.blogsRead,
    create_blog_post: MCP_SCOPES.blogsWrite,
    update_blog_post: MCP_SCOPES.blogsWrite,
    publish_blog_post: MCP_SCOPES.blogsWrite,
    discard_blog_post_draft: MCP_SCOPES.blogsWrite,
    delete_blog_post: MCP_SCOPES.blogsWrite,

    list_help_docs: MCP_SCOPES.docsRead,
    get_help_doc: MCP_SCOPES.docsRead,
    create_help_doc: MCP_SCOPES.docsWrite,
    update_help_doc: MCP_SCOPES.docsWrite,
    publish_help_doc: MCP_SCOPES.docsWrite,
    discard_help_doc_draft: MCP_SCOPES.docsWrite,
    delete_help_doc: MCP_SCOPES.docsWrite,
    search_docs: MCP_SCOPES.docsRead,
    list_doc_sections: MCP_SCOPES.docsRead,
    create_doc_section: MCP_SCOPES.docsWrite,
    update_doc_section: MCP_SCOPES.docsWrite,
    delete_doc_section: MCP_SCOPES.docsWrite,

    // Preserve the existing public tool name. Renaming this typo would be a
    // separate catalog-breaking change, not part of the protocol migration.
    list_changelog_entrys: MCP_SCOPES.changelogsRead,
    get_changelog_entry: MCP_SCOPES.changelogsRead,
    create_changelog_entry: MCP_SCOPES.changelogsWrite,
    update_changelog_entry: MCP_SCOPES.changelogsWrite,
    publish_changelog_entry: MCP_SCOPES.changelogsWrite,
    discard_changelog_entry_draft: MCP_SCOPES.changelogsWrite,
    delete_changelog_entry: MCP_SCOPES.changelogsWrite,
    get_github_changelog_integration: MCP_SCOPES.changelogsRead,
    connect_github_changelog: MCP_SCOPES.changelogsWrite,
    disconnect_github_changelog: MCP_SCOPES.changelogsWrite,
    import_github_releases: MCP_SCOPES.changelogsWrite,

    get_newsletter_settings: MCP_SCOPES.settingsRead,
    update_newsletter_settings: MCP_SCOPES.settingsWrite,
    get_esp_config: MCP_SCOPES.espRead,
    update_esp_config: MCP_SCOPES.espWrite,
    test_esp_config: MCP_SCOPES.espWrite,
    remove_esp_config: MCP_SCOPES.espWrite,
    list_contacts: MCP_SCOPES.contactsRead,
    get_contact: MCP_SCOPES.contactsRead,
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

    get_chatbot_settings: MCP_SCOPES.chatbotRead,
    update_chatbot_settings: MCP_SCOPES.chatbotWrite,

    list_tickets: MCP_SCOPES.helpdeskRead,
    get_ticket: MCP_SCOPES.helpdeskRead,
    create_ticket: MCP_SCOPES.helpdeskWrite,
    reply_to_ticket: MCP_SCOPES.helpdeskWrite,
    update_ticket_status: MCP_SCOPES.helpdeskWrite,
    assign_ticket: MCP_SCOPES.helpdeskWrite,

    get_domain_settings: MCP_SCOPES.domainsRead,
    set_team_subdomain: MCP_SCOPES.domainsWrite,
    attach_custom_domain: MCP_SCOPES.domainsWrite,
    verify_custom_domain: MCP_SCOPES.domainsWrite,
    remove_custom_domain: MCP_SCOPES.domainsWrite,

    get_team_settings: MCP_SCOPES.settingsRead,
    update_team_settings: MCP_SCOPES.settingsWrite,
} as const satisfies Record<string, McpScope>;

export type McpToolName = keyof typeof toolScopes;

const accountOnlyTools = new Set<McpToolName>(["list_teams", "create_team"]);

export const HIGH_IMPACT_MCP_TOOLS = new Set<McpToolName>([
    "delete_team",
    "create_api_key",
    "delete_api_key",
    "delete_page",
    "publish_page",
    "delete_theme",
    "delete_media",
    "publish_blog_post",
    "delete_blog_post",
    "publish_help_doc",
    "delete_help_doc",
    "publish_changelog_entry",
    "delete_changelog_entry",
    "import_github_releases",
    "test_esp_config",
    "remove_esp_config",
    "send_broadcast",
    "attach_custom_domain",
    "remove_custom_domain",
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
    "delete_team",
    "list_api_keys",
    "create_api_key",
    "delete_api_key",
]);

const apiKeyDeniedTools = new Set<McpToolName>([
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

    if (authKind !== "oauth" || !authInfo.scopes.includes(policy.oauthScope)) {
        return errorResult(
            `insufficient_scope: this tool requires '${policy.oauthScope}'.`,
        );
    }

    if (policy.human.kind === "authenticated" && !extra?.account) {
        return errorResult("A FrontLit account is required.");
    }

    if (policy.tenant === "team" && !extra?.teamId) {
        return errorResult(
            "This OAuth token is not valid for a current team membership.",
        );
    }

    let human = policy.human;
    if (
        name === "update_team_settings" &&
        args &&
        (args.codeInjectionHead !== undefined ||
            args.codeInjectionBody !== undefined)
    ) {
        human = { kind: "owner" };
    }

    if (human.kind === "owner" && extra?.isOwner !== true) {
        return errorResult("owner_required: only the team owner can do this.");
    }

    if (human.kind === "permission") {
        const permissions = extra?.permissions ?? [];
        if (
            extra?.isOwner !== true &&
            !permissions.includes(human.permission)
        ) {
            return errorResult(
                `insufficient_permission: this tool requires '${human.permission}'.`,
            );
        }
    }

    return null;
}

export function listMcpToolPolicies(): Readonly<
    Record<McpToolName, McpToolPolicy>
> {
    return Object.fromEntries(
        (Object.keys(toolScopes) as McpToolName[]).map((name) => [
            name,
            getMcpToolPolicy(name),
        ]),
    ) as Record<McpToolName, McpToolPolicy>;
}
