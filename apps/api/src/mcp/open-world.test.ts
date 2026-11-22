import { describe, expect, it } from "vitest";
import { OPEN_WORLD_MCP_TOOLS } from "./policy";
import { registerAllTools } from "./server";
import { createMcpToolRegistrar } from "./tool-registry";

function advertisedAnnotations() {
  const annotations = new Map<string, Record<string, unknown>>();
  const server = {
    registerTool: (name: string, config: any) => {
      annotations.set(name, config.annotations);
    },
  };
  registerAllTools(createMcpToolRegistrar(server as any));
  return annotations;
}

describe("MCP openWorldHint", () => {
  const annotations = advertisedAnnotations();

  it("is true for tools that email people or call GitHub", () => {
    for (const name of [
      "send_broadcast",
      "reply_to_ticket",
      // Emails the requester a receipt as a side effect.
      "create_ticket",
      "test_esp_config",
      "create_documentation_git_migration_pr",
    ]) {
      expect(annotations.get(name)?.openWorldHint, name).toBe(true);
    }
  });

  it("is false for tools that stay in the team's own workspace", () => {
    for (const name of [
      "create_broadcast",
      "list_contacts",
      "publish_product_update",
      "update_ticket_status",
      "add_contact_tag",
      "get_documentation_github",
    ]) {
      expect(annotations.get(name)?.openWorldHint, name).toBe(false);
    }
  });

  it("is an explicit boolean on every tool, and the set names only real tools", () => {
    for (const [name, value] of annotations) {
      expect(typeof value?.openWorldHint, name).toBe("boolean");
    }
    for (const name of OPEN_WORLD_MCP_TOOLS) {
      expect(annotations.has(name), name).toBe(true);
    }
  });
});
