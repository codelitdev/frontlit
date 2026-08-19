import {
    type McpServer,
    type ServerContext,
    type StandardSchemaWithJSON,
    type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type { ZodRawShape, ZodTypeAny } from "zod";
import { logger } from "../services/log";
import { authorizeMcpTool, getMcpToolPolicy, type McpToolName } from "./policy";
import { toMcpObjectSchema, toMcpSchema } from "./schema";

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
    registerTool(
        name: McpToolName,
        config: McpToolConfig,
        handler: McpToolHandler,
    ): void;
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
            const schemas = getCompiledSchemas(name, config);

            server.registerTool(
                name,
                {
                    title: config.title,
                    description: config.description,
                    ...schemas,
                    annotations: config.annotations,
                },
                async (args, ctx) => {
                    const startedAt = performance.now();
                    const authKind = ctx.http?.authInfo?.extra?.authKind;
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
                                scopeDecision: "denied",
                            },
                            "MCP tool authorization denied",
                        );
                        return denied;
                    }

                    try {
                        const result = await (hasDeclaredInput
                            ? handler(args, ctx)
                            : handler(ctx));
                        logger.info(
                            {
                                tool: name,
                                requiredScope: policy.scope,
                                authKind,
                                scopeDecision: "allowed",
                                outcome: result?.isError
                                    ? "tool_error"
                                    : "success",
                                durationMs: Math.round(
                                    performance.now() - startedAt,
                                ),
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
                                scopeDecision: "allowed",
                                outcome: "exception",
                                durationMs: Math.round(
                                    performance.now() - startedAt,
                                ),
                                errorType:
                                    error instanceof Error
                                        ? error.name
                                        : typeof error,
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
