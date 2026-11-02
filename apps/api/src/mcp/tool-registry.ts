import {
  type McpServer,
  type ServerContext,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { logger } from "../services/log";
import { resolveTeamContext } from "../auth/team-context";
import type { FrontLitMcpAuthExtra } from "./auth-context";
import {
  authorizeMcpTool,
  getMcpToolPolicy,
  UNTRUSTED_CONTENT_MCP_TOOLS,
  UNTRUSTED_CONTENT_NOTE,
  type McpToolName,
} from "./policy";
import { toMcpObjectSchema, toMcpSchema } from "./schema";
import { errorResult } from "./tools/responses";

export type McpToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: ZodRawShape;
  outputSchema: ZodTypeAny | ZodRawShape;
  annotations?: ToolAnnotations;
};

export type McpToolHandler = (
  argsOrContext: any,
  context?: ServerContext,
) => Promise<any> | any;

export interface McpToolRegistrar {
  registerTool(name: McpToolName, config: McpToolConfig, handler: McpToolHandler): void;
}

type CompiledToolSchemas = {
  inputSchema: StandardSchemaWithJSON;
  outputSchema: StandardSchemaWithJSON;
};

// SDK 2 builds a request-local server, while FrontLit's tool schemas are
// immutable. Cache only compiled schema adapters; this is not client state.
const compiledSchemas = new Map<McpToolName, CompiledToolSchemas>();

function getCompiledSchemas(
  name: McpToolName,
  config: McpToolConfig,
): CompiledToolSchemas {
  const cached = compiledSchemas.get(name);
  if (cached) return cached;

  const schemas = {
    inputSchema: toMcpObjectSchema(config.inputSchema),
    outputSchema:
      "_def" in config.outputSchema
        ? toMcpSchema(config.outputSchema as ZodTypeAny)
        : toMcpObjectSchema(config.outputSchema as ZodRawShape),
  };
  compiledSchemas.set(name, schemas);
  return schemas;
}

const teamIdArgument = z
  .string()
  .optional()
  .describe(
    "Team ID from list_teams. Optional only if the user belongs to one team; otherwise required. Use a team the user named — never guess.",
  );

/**
 * Picks the team for one tool call and returns a context scoped to it.
 * OAuth tokens are account-wide, so this runs the live membership check on
 * every call; an API key may only name its own team.
 */
async function scopeContextToTeam(
  ctx: ServerContext,
  requestedTeamId: string | undefined,
): Promise<{ ctx: ServerContext } | { error: ReturnType<typeof errorResult> }> {
  const authInfo = ctx.http?.authInfo;
  const extra = authInfo?.extra as FrontLitMcpAuthExtra | undefined;
  // Missing credentials are reported by authorizeMcpTool.
  if (!authInfo || !extra) return { ctx };

  const resolution = await resolveTeamContext({
    authKind: extra.authKind === "api_key" ? "apikey" : "oauth",
    accountId: extra.accountId ?? extra.account?.id,
    apiKeyTeamId: extra.authKind === "api_key" ? extra.teamId : undefined,
    requestedTeamId,
  });
  if (!resolution.ok) {
    const { error, error_description, teams } = resolution.body;
    const choices = teams?.length
      ? ` Teams: ${teams.map((t) => `${t.name} (${t.teamId})`).join(", ")}.`
      : "";
    return { error: errorResult(`${error}: ${error_description}${choices}`) };
  }

  const { team, membership, isOwner, permissions } = resolution.context;
  const scopedExtra: FrontLitMcpAuthExtra = {
    ...extra,
    teamId: team.id,
    teamPublicId: team.teamId,
    teamName: team.name,
    isOwner,
    permissions,
    membershipId: membership?.memberId,
  };
  return {
    ctx: {
      ...ctx,
      http: { ...ctx.http, authInfo: { ...authInfo, extra: scopedExtra } },
    } as ServerContext,
  };
}

function withoutTeamId(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  const { teamId: _teamId, ...rest } = args as Record<string, unknown>;
  return rest;
}

/** Mutating results name the team they acted in, so a cross-team action is
 * visible to the user. */
function withTeamNote(result: any, extra: FrontLitMcpAuthExtra | undefined) {
  if (!result || result.isError || !extra?.teamPublicId) return result;
  const note = {
    type: "text" as const,
    text: `Team: ${extra.teamName} (${extra.teamPublicId})`,
  };
  return { ...result, content: [...(result.content ?? []), note] };
}

/**
 * Adapts FrontLit's canonical Zod 3 schemas and existing thin tool handlers to
 * the SDK 2 Standard Schema/context APIs. Policy lookup is intentionally part
 * of registration so an unmapped tool fails closed during server creation.
 */
export function createMcpToolRegistrar(server: McpServer): McpToolRegistrar {
  return {
    registerTool(name, config, handler) {
      const policy = getMcpToolPolicy(name);
      const hasDeclaredInput = config.inputSchema !== undefined;
      const teamScoped = policy.tenant === "team";
      // A tool that declares its own `teamId` (delete_team) keeps it as a
      // required, handler-visible argument.
      const declaresTeamId = Boolean(
        config.inputSchema && "teamId" in config.inputSchema,
      );
      const injectsTeamId = teamScoped && !declaresTeamId;
      const mutating = config.annotations?.readOnlyHint !== true;
      const schemas = getCompiledSchemas(
        name,
        injectsTeamId
          ? {
              ...config,
              inputSchema: { ...config.inputSchema, teamId: teamIdArgument },
            }
          : config,
      );

      server.registerTool(
        name,
        {
          title: config.title,
          description: UNTRUSTED_CONTENT_MCP_TOOLS.has(name)
            ? `${config.description ?? ""} ${UNTRUSTED_CONTENT_NOTE}`.trim()
            : config.description,
          ...schemas,
          annotations: config.annotations,
        },
        async (rawArgs, rawCtx) => {
          const startedAt = performance.now();
          const authKind = rawCtx.http?.authInfo?.extra?.authKind;

          let ctx = rawCtx;
          if (teamScoped) {
            const requested = (rawArgs as Record<string, unknown> | undefined)?.teamId;
            const scoped = await scopeContextToTeam(
              rawCtx,
              typeof requested === "string" && requested ? requested : undefined,
            );
            if ("error" in scoped) {
              logger.warn(
                { tool: name, authKind, scopeDecision: "denied" },
                "MCP tool team resolution denied",
              );
              return scoped.error;
            }
            ctx = scoped.ctx;
          }
          const scopedExtra = ctx.http?.authInfo?.extra as
            | FrontLitMcpAuthExtra
            | undefined;
          const teamId = scopedExtra?.teamPublicId;
          // Handlers spread their args after the internal team ID, so the
          // public `teamId` argument must never reach them.
          const args = injectsTeamId ? withoutTeamId(rawArgs) : rawArgs;

          const denied = authorizeMcpTool(
            name,
            ctx,
            hasDeclaredInput && args && typeof args === "object"
              ? (args as Record<string, unknown>)
              : undefined,
          );
          if (denied) {
            logger.warn(
              {
                tool: name,
                requiredScope: policy.scope,
                authKind,
                teamId,
                scopeDecision: "denied",
              },
              "MCP tool authorization denied",
            );
            return denied;
          }

          try {
            const output = await (hasDeclaredInput ? handler(args, ctx) : handler(ctx));
            const result =
              teamScoped && mutating ? withTeamNote(output, scopedExtra) : output;
            logger.info(
              {
                tool: name,
                requiredScope: policy.scope,
                authKind,
                teamId,
                scopeDecision: "allowed",
                outcome: result?.isError ? "tool_error" : "success",
                durationMs: Math.round(performance.now() - startedAt),
              },
              "MCP tool completed",
            );
            return result;
          } catch (error) {
            logger.error(
              {
                tool: name,
                requiredScope: policy.scope,
                authKind,
                teamId,
                scopeDecision: "allowed",
                outcome: "exception",
                durationMs: Math.round(performance.now() - startedAt),
                errorType: error instanceof Error ? error.name : typeof error,
              },
              "MCP tool failed",
            );
            throw error;
          }
        },
      );
    },
  };
}
