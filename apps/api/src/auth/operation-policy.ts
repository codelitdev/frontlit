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
    "teams.list": accountOp(MCP_SCOPES.teamsRead),
    "teams.create": accountOp(MCP_SCOPES.teamsWrite),
    "teams.rename": teamPermission("team:update", MCP_SCOPES.teamsWrite),
    "teams.remove": teamOwner(MCP_SCOPES.teamsWrite, "deny"),
    "teams.listKeys": teamOwner(MCP_SCOPES.apiKeysRead, "deny"),
    "teams.createKey": teamOwner(MCP_SCOPES.apiKeysWrite, "deny"),
    "teams.removeKey": teamOwner(MCP_SCOPES.apiKeysWrite, "deny"),
    "teams.listMembers": teamPermission("members:read", "unsupported", "deny"),
    "teams.updateMember": teamPermission(
        "members:manage",
        "unsupported",
        "deny",
    ),
    "teams.removeMember": teamPermission(
        "members:manage",
        "unsupported",
        "deny",
    ),
    "teams.leave": teamMember("unsupported", "deny"),
    "teams.transferOwnership": teamOwner("unsupported", "deny"),
    "teams.listInvitations": teamPermission(
        "members:read",
        "unsupported",
        "deny",
    ),
    "teams.createInvitation": teamPermission(
        "members:invite",
        "unsupported",
        "deny",
    ),
    "teams.resendInvitation": teamPermission(
        "members:invite",
        "unsupported",
        "deny",
    ),
    "teams.revokeInvitation": teamPermission(
        "members:manage",
        "unsupported",
        "deny",
    ),
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

    "themes.create": teamPermission("themes:write", MCP_SCOPES.themesWrite),
    "themes.list": teamPermission("themes:read", MCP_SCOPES.themesRead),
    "themes.get": teamPermission("themes:read", MCP_SCOPES.themesRead),
    "themes.update": teamPermission("themes:write", MCP_SCOPES.themesWrite),
    "themes.remove": teamPermission("themes:write", MCP_SCOPES.themesWrite),

    "media.presigned": teamPermission("media:write", MCP_SCOPES.mediaWrite),
    "media.create": teamPermission("media:write", MCP_SCOPES.mediaWrite),
    "media.list": teamPermission("media:read", MCP_SCOPES.mediaRead),
    "media.get": teamPermission("media:read", MCP_SCOPES.mediaRead),
    "media.update": teamPermission("media:write", MCP_SCOPES.mediaWrite),
    "media.remove": teamPermission("media:write", MCP_SCOPES.mediaWrite),

    "blogs.create": teamPermission("blogs:write", MCP_SCOPES.blogsWrite),
    "blogs.list": teamPermission("blogs:read", MCP_SCOPES.blogsRead),
    "blogs.get": teamPermission("blogs:read", MCP_SCOPES.blogsRead),
    "blogs.update": teamPermission("blogs:write", MCP_SCOPES.blogsWrite),
    "blogs.publish": teamPermission("blogs:write", MCP_SCOPES.blogsWrite),
    "blogs.discardDraft": teamPermission("blogs:write", MCP_SCOPES.blogsWrite),
    "blogs.remove": teamPermission("blogs:write", MCP_SCOPES.blogsWrite),

    "docs.create": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docs.list": teamPermission("docs:read", MCP_SCOPES.docsRead),
    "docs.get": teamPermission("docs:read", MCP_SCOPES.docsRead),
    "docs.update": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docs.publish": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docs.discardDraft": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docs.remove": teamPermission("docs:write", MCP_SCOPES.docsWrite),

    "changelogs.create": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.list": teamPermission(
        "changelogs:read",
        MCP_SCOPES.changelogsRead,
    ),
    "changelogs.get": teamPermission(
        "changelogs:read",
        MCP_SCOPES.changelogsRead,
    ),
    "changelogs.update": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.publish": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.discardDraft": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.remove": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.connectGithub": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.getGithubIntegration": teamPermission(
        "changelogs:read",
        MCP_SCOPES.changelogsRead,
    ),
    "changelogs.disconnectGithub": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),
    "changelogs.importGithubReleases": teamPermission(
        "changelogs:write",
        MCP_SCOPES.changelogsWrite,
    ),

    "docSections.create": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docSections.list": teamPermission("docs:read", MCP_SCOPES.docsRead),
    "docSections.update": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docSections.remove": teamPermission("docs:write", MCP_SCOPES.docsWrite),
    "docSections.search": teamPermission("docs:read", MCP_SCOPES.docsRead),

    "contacts.list": teamPermission("contacts:read", MCP_SCOPES.contactsRead),
    "contacts.get": teamPermission("contacts:read", MCP_SCOPES.contactsRead),
    "contacts.remove": teamPermission(
        "contacts:write",
        MCP_SCOPES.contactsWrite,
    ),
    "contacts.addTag": teamPermission(
        "contacts:write",
        MCP_SCOPES.contactsWrite,
    ),
    "contacts.removeTag": teamPermission(
        "contacts:write",
        MCP_SCOPES.contactsWrite,
    ),

    "segments.create": teamPermission(
        "segments:write",
        MCP_SCOPES.segmentsWrite,
    ),
    "segments.list": teamPermission("segments:read", MCP_SCOPES.segmentsRead),
    "segments.update": teamPermission(
        "segments:write",
        MCP_SCOPES.segmentsWrite,
    ),
    "segments.remove": teamPermission(
        "segments:write",
        MCP_SCOPES.segmentsWrite,
    ),

    "newsletter.getSettings": teamPermission(
        "settings:read",
        MCP_SCOPES.settingsRead,
    ),
    "newsletter.updateSettings": teamPermission(
        "settings:write",
        MCP_SCOPES.settingsWrite,
    ),
    "newsletter.listTemplates": teamPermission(
        "broadcasts:read",
        MCP_SCOPES.broadcastsRead,
    ),
    "newsletter.createTemplate": teamPermission(
        "broadcasts:write",
        MCP_SCOPES.broadcastsWrite,
    ),
    "newsletter.updateTemplate": teamPermission(
        "broadcasts:write",
        MCP_SCOPES.broadcastsWrite,
    ),
    "newsletter.listBroadcasts": teamPermission(
        "broadcasts:read",
        MCP_SCOPES.broadcastsRead,
    ),
    "newsletter.createBroadcast": teamPermission(
        "broadcasts:write",
        MCP_SCOPES.broadcastsWrite,
    ),
    "newsletter.updateBroadcast": teamPermission(
        "broadcasts:write",
        MCP_SCOPES.broadcastsWrite,
    ),
    "newsletter.sendBroadcast": teamPermission(
        "broadcasts:send",
        MCP_SCOPES.broadcastsSend,
    ),
    "newsletter.getBroadcastStats": teamPermission(
        "broadcasts:read",
        MCP_SCOPES.broadcastsRead,
    ),

    "chatbot.get": teamPermission("chatbot:read", MCP_SCOPES.chatbotRead),
    "chatbot.update": teamPermission("chatbot:write", MCP_SCOPES.chatbotWrite),

    "ai.get": teamPermission("ai:read", "unsupported"),
    "ai.update": teamPermission("ai:write", "unsupported"),
    "ai.remove": teamPermission("ai:write", "unsupported"),

    "tickets.list": teamPermission("helpdesk:read", MCP_SCOPES.helpdeskRead),
    "tickets.create": teamPermission(
        "helpdesk:write",
        MCP_SCOPES.helpdeskWrite,
    ),
    "tickets.get": teamPermission("helpdesk:read", MCP_SCOPES.helpdeskRead),
    "tickets.reply": teamPermission("helpdesk:write", MCP_SCOPES.helpdeskWrite),
    "tickets.update": teamPermission(
        "helpdesk:write",
        MCP_SCOPES.helpdeskWrite,
    ),

    "domains.get": teamPermission("domains:read", MCP_SCOPES.domainsRead),
    "domains.setSubdomain": teamPermission(
        "domains:write",
        MCP_SCOPES.domainsWrite,
    ),
    "domains.attachCustomDomain": teamPermission(
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
    "settings.update": teamPermission(
        "settings:write",
        MCP_SCOPES.settingsWrite,
    ),
    "settings.updateCodeInjection": teamOwner(
        MCP_SCOPES.settingsWrite,
        "allow",
    ),
    "settings.esp.get": teamPermission("esp:read", MCP_SCOPES.espRead),
    "settings.esp.upsert": teamPermission("esp:write", MCP_SCOPES.espWrite),
    "settings.esp.remove": teamPermission("esp:write", MCP_SCOPES.espWrite),
    "settings.esp.test": teamPermission("esp:write", MCP_SCOPES.espWrite),
} as const satisfies Record<string, OperationPolicy>;

export const UNREGISTERED_OPERATION = "__unregistered__";

export function getRestOperationPolicy(
    operation: string,
): OperationPolicy | null {
    if (
        Object.prototype.hasOwnProperty.call(REST_OPERATION_POLICIES, operation)
    ) {
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
    return body.codeInjectionHead !== undefined ||
        body.codeInjectionBody !== undefined
        ? "settings.updateCodeInjection"
        : "settings.update";
}

export { TEAM_PERMISSIONS };
