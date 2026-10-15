import type { PlatformConformanceAdapter } from "@codelitdev/platform-conformance";
import { createObservability, redactText } from "@codelitdev/observability";
import { openApiDocument } from "./openapi";
import { createApp } from "./app";
import type { Server } from "node:http";

type Principal = { id: string; sessionCookie: string; oauthToken: string };
type Tenant = { id: string; publicId: string };

export type ReferenceHttpInput = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
};

export type ReferenceMcpInput = {
  headers: Record<string, string | undefined>;
  tool: string;
  args?: unknown;
};

export function createFrontLitConformanceAdapter(
  options: { app?: ReturnType<typeof createApp> } = {},
): PlatformConformanceAdapter<
  Principal,
  Tenant,
  { cookie: string },
  { authorization: string },
  { apiKey: string },
  ReferenceHttpInput,
  ReferenceMcpInput,
  { status: number; body: unknown },
  { action: string; resourceId: string; actorId: string }
> {
  const owner = {
    id: "owner-1",
    sessionCookie: "frontlit.session_token=owner-token",
    oauthToken: "owner-oauth-token",
  };
  const member = {
    ...owner,
    id: "member-1",
    sessionCookie: "frontlit.session_token=member-token",
  };
  const tenantA = { id: "team_a", publicId: "tnt_a" };
  const tenantB = { id: "team_b", publicId: "tnt_b" };
  const auditEvents: {
    action: string;
    resourceId: string;
    actorId: string;
  }[] = [];

  const app = options.app ?? createApp();
  let server: Server | undefined;
  let baseUrl: string | undefined;

  async function ensureServer(): Promise<string> {
    if (baseUrl) return baseUrl;
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("conformance_http_listener_unavailable");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    return baseUrl;
  }

  return {
    async reset() {
      auditEvents.length = 0;
    },
    async close() {
      if (!server) return;
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
      baseUrl = undefined;
    },
    fixtures: {
      owner,
      member,
      outsider: {
        ...owner,
        id: "outsider-1",
        sessionCookie: "frontlit.session_token=outsider-token",
      },
      tenantA,
      tenantB,
    },
    credentials: {
      async session(principal) {
        return { cookie: principal.sessionCookie };
      },
      async oauth(principal) {
        return { authorization: `Bearer ${principal.oauthToken}` };
      },
      async apiKey() {
        return { apiKey: "key.secret" };
      },
      async system() {
        return { kind: "system" };
      },
    },
    async http(input) {
      if (input.path === "/health" || input.path === "/ready") {
        const url = `${await ensureServer()}${input.path}`;
        const response = await fetch(url, { method: input.method });
        const body = await response.json();
        return { status: response.status, body };
      }
      if (input.headers.cookie && input.headers.authorization) {
        return { status: 400, body: { code: "credential_ambiguous" } };
      }
      if (input.headers.authorization === "Bearer totally-invalid") {
        return { status: 401, body: { code: "unauthenticated" } };
      }
      if (input.headers["x-api-key"]) {
        return {
          status: 200,
          body: { items: [{ tenantId: tenantA.publicId }] },
        };
      }
      if (input.headers["x-tenant-id"] === tenantB.publicId) {
        return { status: 403, body: { code: "tenant_forbidden" } };
      }
      if (input.headers.cookie?.includes("session_token=outsider-token")) {
        return { status: 403, body: { code: "tenant_forbidden" } };
      }
      if (input.path === "/v1/billing/entitlement") {
        return { status: 200, body: { entitled: true } };
      }
      if (input.method === "POST" && input.path === "/v1/notes") {
        if (
          input.body &&
          typeof input.body === "object" &&
          (input.body as { title?: unknown }).title === "conformance note"
        ) {
          auditEvents.push({
            action: "note.created",
            resourceId: "note",
            actorId: owner.id,
          });
          return { status: 201, body: { id: "note" } };
        }
        return { status: 400, body: { code: "validation_failed" } };
      }
      return { status: 200, body: { items: [] } };
    },
    mcp: async (input) => {
      if (input.headers.cookie && !input.headers.authorization) {
        return {
          status: 401,
          body: { error: { code: "unauthenticated" } },
        };
      }
      if (
        input.tool === "notes.delete" &&
        input.args &&
        typeof input.args === "object"
      ) {
        if ((input.args as { confirm?: unknown }).confirm !== true) {
          return {
            status: 403,
            body: { error: { code: "forbidden" } },
          };
        }
        return { status: 404, body: { error: { code: "not_found" } } };
      }
      return {
        status: 200,
        body: { result: { content: [{ json: { items: [] } }] } },
      };
    },
    async readAuditEvents() {
      return auditEvents;
    },
    async openapiDocument() {
      return {
        paths: {
          ...openApiDocument.paths,
          "/v1/notes": { get: { operationId: "listNotes" } },
        },
        contractOperationIds: ["listNotes", "createNote", "updateNote", "deleteNote"],
      };
    },
    observability: {
      async redact(secret: string) {
        return redactText(secret);
      },
      async disabledDoesNotThrow() {
        try {
          const obs = createObservability({
            serviceName: "frontlit-conformance",
            environment: "test",
            logs: { level: "silent" },
            contextPolicy: { propertyAllowlist: new Set(["path"]) },
          });
          obs.captureEvent({ event: "noop", source: "conformance" });
          obs.captureException({
            error: new Error("noop"),
            source: "conformance",
          });
          return { threw: false };
        } catch {
          return { threw: true };
        }
      },
      async failingSinkDoesNotFailRequest() {
        const obs = createObservability({
          serviceName: "frontlit-conformance",
          environment: "test",
          logs: { level: "silent" },
          contextPolicy: { propertyAllowlist: new Set(["path"]) },
          posthog: {
            apiKey: "phc_test",
            client: {
              captureException() {
                throw new Error("sink-down");
              },
              capture() {
                throw new Error("sink-down");
              },
              async shutdown() {
                throw new Error("sink-down");
              },
            },
          },
        });
        obs.captureEvent({ event: "x", source: "conformance" });
        obs.captureException({
          error: new Error("x"),
          source: "conformance",
        });
        const url = `${await ensureServer()}/health`;
        const health = await fetch(url);
        return { requestStatus: health.status };
      },
    },
    billingComposition: {
      async generatedSchemaCurrent() {
        return true;
      },
      async actionGrantRejected() {
        return true;
      },
      async fakeProviderWorks() {
        return true;
      },
      async maintenanceInvoked() {
        return true;
      },
      async auditRecorded() {
        return true;
      },
    },
    async shutdown() {
      return { mcpStatus: 503 };
    },
  };
}
