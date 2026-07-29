import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    blogMetaSchema,
    docMetaSchema,
    changelogMetaSchema,
} from "@frontlit/api-contract";
import { registerTeamTools } from "./tools/teams";
import { registerPageTools } from "./tools/pages";
import { registerThemeTools } from "./tools/themes";
import { registerMediaTools } from "./tools/media";
import { registerDocumentTools } from "./tools/documents";
import { registerChangelogTools } from "./tools/changelogs";
import { registerNewsletterTools } from "./tools/newsletter";
import { registerDocumentationTools } from "./tools/documentation";
import { registerChatbotTools } from "./tools/chatbot";
import { registerHelpdeskTools } from "./tools/helpdesk";
import { registerDomainTools } from "./tools/domains";
import { registerSettingsTools } from "./tools/settings";

function registerAllTools(server: McpServer): void {
    registerTeamTools(server);
    registerPageTools(server);
    registerThemeTools(server);
    registerMediaTools(server);
    registerDocumentTools(server, "blog", "blog_post", blogMetaSchema);
    registerDocumentTools(server, "doc", "help_doc", docMetaSchema);
    registerDocumentTools(
        server,
        "changelog",
        "changelog_entry",
        changelogMetaSchema,
    );
    registerChangelogTools(server);
    registerNewsletterTools(server);
    registerDocumentationTools(server);
    registerChatbotTools(server);
    registerHelpdeskTools(server);
    registerDomainTools(server);
    registerSettingsTools(server);
}

/**
 * Create a new MCP session (transport + server pair). Each connecting client
 * must get its own session — the StreamableHTTPServerTransport is
 * single-session by design.
 */
export function createMCPSession(
    onsessioninitialized: (sessionId: string) => void,
    onsessionclosed: (sessionId: string) => void,
): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized,
        onsessionclosed,
    });
    const server = new McpServer({
        name: "FrontLit",
        version: "1.0.0",
        description:
            "FrontLit MCP server — build and manage pages for a FrontLit team. Supports team management (teams, API keys), pages (create, edit block layout, SEO metadata), saved themes, the team's MediaLit-backed media library, blog posts, help docs (draft/publish, TipTap content, help-center sections, semantic search), a RAG chatbot over the published docs, a help-desk ticket inbox, domains (default subdomain, custom domain attach/verify), and team-wide branding + code-injection settings.",
    });
    registerAllTools(server);
    server.connect(transport);
    return transport;
}
