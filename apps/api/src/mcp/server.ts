import { McpServer } from "@modelcontextprotocol/server";
import {
  articleMetaSchema,
  productUpdateMetaSchema,
  documentationMetaSchema,
} from "@frontlit/api-contract";
import { createMcpToolRegistrar, type McpToolRegistrar } from "./tool-registry";
import { registerTeamTools } from "./tools/teams";
import { registerPageTools } from "./tools/pages";
import { registerThemeTools } from "./tools/themes";
import { registerMediaTools } from "./tools/media";
import { registerDocumentTools } from "./tools/documents";
import { registerProductUpdateTools } from "./tools/changelogs";
import { registerEmailTools } from "./tools/email";
import { registerDocumentationTools } from "./tools/documentation";
import { registerDocumentationGitHubTools } from "./tools/documentation-github";
import { registerChatbotTools } from "./tools/chatbot";
import { registerInboxAiTools } from "./tools/inbox-ai";
import { registerHelpdeskTools } from "./tools/helpdesk";
import { registerDomainTools } from "./tools/domains";
import { registerSettingsTools } from "./tools/settings";

const FRONTLIT_MCP_VERSION = "2.0.0";

export function registerAllTools(tools: McpToolRegistrar): void {
  // Keep registration deterministic for discovery and upstream caches.
  registerTeamTools(tools);
  registerPageTools(tools);
  registerThemeTools(tools);
  registerMediaTools(tools);
  registerDocumentTools(tools, "blog", "article", articleMetaSchema);
  registerDocumentTools(tools, "doc", "documentation_page", documentationMetaSchema);
  registerDocumentTools(tools, "changelog", "product_update", productUpdateMetaSchema);
  registerProductUpdateTools(tools);
  registerEmailTools(tools);
  registerDocumentationTools(tools);
  registerDocumentationGitHubTools(tools);
  registerChatbotTools(tools);
  registerInboxAiTools(tools);
  registerHelpdeskTools(tools);
  registerDomainTools(tools);
  registerSettingsTools(tools);
}

/**
 * Builds one request-local server for both modern 2026 and older stateless
 * Streamable HTTP requests. Tenant and principal data arrives through the SDK
 * request context; durable product state remains in FrontLit's services.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "FrontLit",
      version: FRONTLIT_MCP_VERSION,
      description:
        "FrontLit MCP server — build and operate a FrontLit team's website, content, email, support, domains, media, chatbot, and settings.",
    },
    {
      instructions:
        "Inspect existing state with read tools before mutations. Publishing, sending, deletion, key management, ESP changes, and domain changes have external or destructive effects; confirm the target and inputs before calling them.",
      cacheHints: {
        "server/discover": {
          ttlMs: 300_000,
          cacheScope: "private",
        },
        "tools/list": {
          ttlMs: 300_000,
          cacheScope: "private",
        },
      },
    },
  );
  registerAllTools(createMcpToolRegistrar(server));
  return server;
}
