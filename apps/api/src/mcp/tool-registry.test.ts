import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ resolveTeamContext: vi.fn() }));
vi.mock("../auth/team-context", () => ({
  resolveTeamContext: mocks.resolveTeamContext,
}));

import { createMcpToolRegistrar } from "./tool-registry";
import { UNTRUSTED_CONTENT_NOTE } from "./policy";
import { jsonResult } from "./tools/responses";

type Registered = { config: any; callback: (args: any, ctx: any) => Promise<any> };

function registry() {
  const tools = new Map<string, Registered>();
  const server = {
    registerTool: (name: string, config: any, callback: any) => {
      tools.set(name, { config, callback });
    },
  };
  return { registrar: createMcpToolRegistrar(server as any), tools };
}

function inputProperties(config: any): Record<string, unknown> {
  const schema = config.inputSchema["~standard"].jsonSchema.input({
    target: "draft-07",
  });
  return (schema.properties ?? {}) as Record<string, unknown>;
}

function oauthCtx(scopes: string[]) {
  return {
    http: {
      authInfo: {
        token: "token",
        clientId: "client",
        scopes,
        extra: {
          authKind: "oauth",
          accountId: "account-1",
          account: { id: "account-1", email: "u@example.com" },
        },
      },
    },
  };
}

const teams = {
  team_a: { id: "internal-a", teamId: "team_a", name: "Acme" },
  team_b: { id: "internal-b", teamId: "team_b", name: "Side" },
};

describe("MCP tool registry team resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The user may write pages in Acme but only read them in Side.
    mocks.resolveTeamContext.mockImplementation(async ({ requestedTeamId }) => {
      if (!requestedTeamId) {
        return {
          ok: false,
          status: 409,
          body: {
            error: "team_required",
            error_description: "Pick a team.",
            teams: [
              { teamId: "team_a", name: "Acme" },
              { teamId: "team_b", name: "Side" },
            ],
          },
        };
      }
      const team = teams[requestedTeamId as keyof typeof teams];
      if (!team) {
        return {
          ok: false,
          status: 403,
          body: { error: "not_a_team_member", error_description: "Not a member." },
        };
      }
      return {
        ok: true,
        context: {
          team,
          membership: { memberId: `tmem_${team.teamId}` },
          isOwner: false,
          permissions:
            team.teamId === "team_a" ? ["pages:read", "pages:write"] : ["pages:read"],
        },
      };
    });
  });

  it("adds an optional teamId to team-scoped tools only", () => {
    const { registrar, tools } = registry();
    const output = z.object({});
    registrar.registerTool("list_pages", { outputSchema: output }, async () =>
      jsonResult({}),
    );
    registrar.registerTool("list_teams", { outputSchema: output }, async () =>
      jsonResult({}),
    );
    registrar.registerTool(
      "delete_team",
      { inputSchema: { teamId: z.string() }, outputSchema: output },
      async () => jsonResult({}),
    );

    expect(inputProperties(tools.get("list_pages")!.config)).toHaveProperty("teamId");
    expect(inputProperties(tools.get("list_teams")!.config)).not.toHaveProperty(
      "teamId",
    );
    const deleteSchema = tools
      .get("delete_team")!
      .config.inputSchema["~standard"].jsonSchema.input({ target: "draft-07" });
    expect(deleteSchema.required).toContain("teamId");
  });

  it("scopes the call to the named team and strips teamId from handler args", async () => {
    const { registrar, tools } = registry();
    const handler = vi.fn(async (_args: any, _ctx: any) => jsonResult({ ok: true }));
    registrar.registerTool(
      "create_page",
      { inputSchema: { name: z.string() }, outputSchema: z.object({}) },
      handler,
    );

    const result = await tools
      .get("create_page")!
      .callback({ name: "Home", teamId: "team_a" }, oauthCtx(["pages:write"]));

    expect(result.isError).toBeUndefined();
    const [args, ctx] = handler.mock.calls[0];
    expect(args).toEqual({ name: "Home" });
    expect(ctx.http.authInfo.extra).toMatchObject({
      teamId: "internal-a",
      teamPublicId: "team_a",
      membershipId: "tmem_team_a",
    });
    expect(result.content.at(-1).text).toBe("Team: Acme (team_a)");
  });

  it("applies the user's permissions in each team to the same token", async () => {
    const { registrar, tools } = registry();
    const handler = vi.fn(async () => jsonResult({ ok: true }));
    registrar.registerTool(
      "create_page",
      { inputSchema: { name: z.string() }, outputSchema: z.object({}) },
      handler,
    );
    const call = (teamId: string) =>
      tools
        .get("create_page")!
        .callback({ name: "x", teamId }, oauthCtx(["pages:write"]));

    expect((await call("team_a")).isError).toBeUndefined();
    const denied = await call("team_b");
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain("insufficient_permission");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("lists the user's teams when the team is ambiguous, without running the tool", async () => {
    const { registrar, tools } = registry();
    const handler = vi.fn(async () => jsonResult({}));
    registrar.registerTool("list_pages", { outputSchema: z.object({}) }, handler);

    const result = await tools
      .get("list_pages")!
      .callback({}, oauthCtx(["pages:read"]));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("team_required");
    expect(result.content[0].text).toContain("Acme (team_a)");
    expect(handler).not.toHaveBeenCalled();

    const outsider = await tools
      .get("list_pages")!
      .callback({ teamId: "team_x" }, oauthCtx(["pages:read"]));
    expect(outsider.content[0].text).toContain("not_a_team_member");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not add a team note to read-only results", async () => {
    const { registrar, tools } = registry();
    registrar.registerTool(
      "list_pages",
      { outputSchema: z.object({}), annotations: { readOnlyHint: true } },
      async () => jsonResult({ items: [] }),
    );
    const result = await tools
      .get("list_pages")!
      .callback({ teamId: "team_b" }, oauthCtx(["pages:read"]));
    expect(result.content).toHaveLength(1);
  });

  it("leaves account-level tools team-free", async () => {
    const { registrar, tools } = registry();
    const handler = vi.fn(async (_ctx: any) => jsonResult({ items: [] }));
    registrar.registerTool("list_teams", { outputSchema: z.object({}) }, handler);
    await tools.get("list_teams")!.callback({}, oauthCtx(["teams:read"]));
    expect(mocks.resolveTeamContext).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("marks tools that return outside-written text as untrusted", () => {
    const { registrar, tools } = registry();
    registrar.registerTool(
      "list_tickets",
      { description: "Lists tickets.", outputSchema: z.object({}) },
      async () => jsonResult({}),
    );
    expect(tools.get("list_tickets")!.config.description).toBe(
      `Lists tickets. ${UNTRUSTED_CONTENT_NOTE}`,
    );
  });
});
