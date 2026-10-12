# FrontLit MCP server architecture (2026-07-28)

## Purpose and status

This is the implementation reference for FrontLit's MCP server. It describes
the code that exists after the MCP 2026-07-28 migration, the invariants future
changes must preserve, and the checks needed to diagnose client failures.

The migration was implemented and verified on 2026-08-10. FrontLit now uses
the MCP TypeScript SDK 2 directly. It supports the modern stateless
2026-07-28 protocol and older stateless Streamable HTTP through the SDK's
official compatibility mode. It does not support standalone HTTP+SSE or
stateful MCP sessions.

The implementation was exercised during development with VS Code, Claude,
Cloudflare AI Playground, and MCP Inspector. A successful historical smoke
test is not a substitute for testing the currently deployed build.

## Authoritative sources

- [MCP 2026-07-28 announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

The sibling SendLit implementation and its migration record are useful
precedent, but the specification, SDK, and FrontLit's tests are authoritative
for FrontLit.

## Architecture at a glance

```text
MCP client
  -> OAuth protected-resource and authorization-server discovery
  -> CIMD or DCR client onboarding
  -> authorization code + PKCE + explicit scopes + team binding
  -> POST /mcp
       CORS
       IP rate limit
       OAuth/API-key authentication
       team resolution
       SDK AuthInfo adaptation
       principal/operation rate limit
       request logging
       SDK 2 Node handler
         -> request-local McpServer
         -> schema adapter + default-deny policy
         -> existing FrontLit service/query functions
         -> normalized text and structured output
```

The API process stores no MCP transport session state. Durable product state
continues to live in FrontLit's database and services.

## Protocol and HTTP behavior

FrontLit exposes exactly this MCP transport surface:

- `POST /mcp` handles authenticated Streamable HTTP requests.
- `OPTIONS /mcp` handles MCP-specific browser preflight.
- `GET /mcp` is not implemented and returns the normal Express 404.
- `DELETE /mcp` is not implemented and returns the normal Express 404.

`apps/api/src/mcp/routes.ts` constructs the protocol handler as:

```ts
createMcpHandler(() => buildMcpServer(), { legacy: "stateless" });
```

The SDK therefore owns both supported protocol paths:

- modern clients use the 2026-07-28 stateless envelope and headers; and
- older clients use the older Streamable HTTP initialize/list/call flow in
  SDK 2's stateless legacy mode.

FrontLit has no SDK 1 server, transport map, generated MCP session ID, sticky
session requirement, `Mcp-Session-Id` routing, standalone SSE endpoint, or
application-level protocol-version switch. Do not add any of those to fix a
client error without first proving that the supported Streamable HTTP request
itself is incorrect.

The MCP router is mounted before global CORS and Express body parsers in
`apps/api/src/app.ts`. The official SDK Node adapter owns JSON parsing,
content-type checks, and MCP protocol errors. The route does not rewrite
`Accept`; supported clients must send a protocol-valid header.

For a browser origin, the MCP CORS contract permits:

- methods `POST` and `OPTIONS`; and
- `Content-Type`, `Accept`, `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`,
  `Authorization`, and `x-frontlit-apikey` headers.

It intentionally does not advertise `Mcp-Session-Id`.

## Server construction and tool catalog

`apps/api/src/mcp/server.ts` builds a fresh `McpServer` for each request and
registers tools in deterministic order. The server currently exposes 89 tools
covering:

- teams and API keys;
- pages and themes;
- media;
- blogs, help documents, and changelogs;
- email settings, contacts, segments, broadcasts, and ESP configuration;
- documentation search and sections;
- chatbot settings;
- helpdesk tickets;
- domains; and
- team settings.

The server exposes tools only. FrontLit does not currently add MCP prompts,
resources, tasks, elicitation, or sampling.

Tool handlers remain thin adapters over existing FrontLit query and service
functions. MCP transport code must not duplicate REST business logic or
create a second product model.

The server advertises private five-minute cache hints for server discovery and
the tool catalog. This cache contains no client or tenant state.

## Authentication and identity

`POST /mcp` accepts two authentication methods:

1. an OAuth bearer token issued by FrontLit's Better Auth authorization
   server; or
2. an existing FrontLit API key in `x-frontlit-apikey`.

A browser session cookie alone is deliberately rejected at the MCP boundary,
even though browser sessions remain valid for appropriate REST/dashboard
routes.

The request passes through `mcpAuth` and `requireTeam` before reaching the SDK.
`apps/api/src/mcp/auth-context.ts` then builds SDK `AuthInfo` with explicit
identity boundaries:

| Value                         | Meaning                                              |
| ----------------------------- | ---------------------------------------------------- |
| `authKind`                    | `oauth` or `api_key`                                 |
| SDK `clientId` for OAuth      | OAuth client application ID                          |
| SDK `clientId` for an API key | Stable `api-key:<key-id>` identifier                 |
| `account`                     | Signed-in FrontLit account when OAuth supplies one   |
| `teamId`                      | Resolved FrontLit tenant for the request             |
| `scopes`                      | Scopes from the verified OAuth access token          |
| SDK `token` for OAuth         | The verified bearer token required by SDK `AuthInfo` |
| SDK `token` for an API key    | Stable API-key ID, never the submitted secret        |

Never overload an OAuth client ID with a team ID. Never copy a raw FrontLit
API-key secret into SDK context or logs. Tools read tenant and account data
from `ctx.http.authInfo.extra` through the helpers in
`apps/api/src/mcp/tools/auth.ts`.

### Tenant selection

OAuth authorization binds a team to the consent/token family:

- zero teams: the hosted OAuth page stops before consent and links the user to
  `/teams` to create or join one;
- one team: that internal team ID is selected automatically and becomes the
  consent `reference_id`; and
- multiple teams: the user chooses a team on the hosted selection page.

`requireTeam` remains the server-side enforcement boundary even though the
hosted flow handles the zero-team case earlier for better client UX.

An API key is always pinned to the team stored with that key. Client-supplied
tenant overrides are not trusted.

## OAuth discovery and client onboarding

The MCP resource identifier is the public API origin plus `/mcp`. For example:

```text
https://api.example.com/mcp
```

Important discovery endpoints include:

```text
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server/api/auth
```

Protected-resource metadata points clients to the authorization server at
`/api/auth`. Authorization-server metadata advertises issuer protection, CIMD
support, the DCR registration endpoint, and the supported scope set.

FrontLit uses both onboarding mechanisms because client support is not
uniform:

- CIMD is the primary MCP 2026 onboarding mechanism; and
- public Dynamic Client Registration remains enabled for clients such as MCP
  Inspector.

This is OAuth client-onboarding compatibility, not a second MCP transport
implementation.

### Better Auth configuration

`apps/api/src/auth/better-auth.ts` configures Better Auth 1.7 with:

- `oauthProvider` resource registration for the exact MCP resource URL;
- `clientRegistrationDefaultResources` containing that MCP resource;
- identity-only registration defaults: `openid`, `profile`, and `email`;
- requestable `offline_access` plus every MCP tool scope;
- an authorization hook that rejects missing or blank `scope`; and
- `@better-auth/cimd` using the `mcp-2026-07-28` metadata profile.

Better Auth can persist the union of default and allowed scopes as a client's
capability set. A consent screen or DCR record listing many scopes therefore
does not prove those scopes were granted. The authorization request must name
its scopes, the user approves that request, the issued token contains the
grant, and the tool policy enforces it.

OAuth 1.7 resources are configured through `oauthProvider({ resources })`.
The shared `createOAuthProviderOptions` helper does not accept the obsolete
Better Auth 1.6 `validAudiences` option. Bearer-token verification separately
receives FrontLit's accepted audiences.

### CIMD metadata fetch hardening

`apps/api/src/auth/cimd-fetch.ts` supplies a pinned HTTPS fetcher because
client metadata URLs are untrusted network input and Better Auth 1.7.0-rc.4
has a Node 24 lookup incompatibility.

The fetcher:

- permits only HTTPS;
- accepts only `GET` and `HEAD`;
- resolves every address and rejects non-public destinations;
- pins the actual request to a validated DNS result while preserving TLS SNI
  and the HTTP Host header;
- does not follow redirects;
- enforces a ten-second timeout;
- limits responses to one MiB; and
- propagates upstream aborts.

Two exact compatibility transforms are allowed:

- remove `urn:ietf:params:oauth:grant-type:device_code` only from VS Code's
  canonical metadata document; and
- remove `urn:ietf:params:oauth:grant-type:jwt-bearer` only from Claude's
  canonical metadata document.

Both clients use authorization code with PKCE for this integration. Do not
strip unsupported grant types from arbitrary CIMD documents or weaken
provider validation globally.

VS Code's metadata may be served with `Cache-Control: no-store`, so the CIMD
configuration uses a zero minimum fetch interval to permit refetching during
token exchange.

### Bearer-token verification

Bearer verification is implemented in `apps/api/src/auth/resolve-auth.ts`
through Better Auth's resource client:

```ts
oauthResourceClient.getActions().verifyBearerToken(...)
```

Do not replace this with the published OAuth kit's legacy token-verification
helper or regress it to the removed `verifyAccessToken()` action. Verification
checks signature, issuer, expiry, and resource audience before FrontLit maps
the subject to an account and tenant. This matches SendLit's Better Auth 1.7
integration.

## Tool authorization

`apps/api/src/mcp/policy.ts` is the single source of truth for MCP scopes and
tool authorization. The mapping is exhaustive and default-deny:

- every registered tool name must have one policy;
- a policy must not name a missing tool;
- an unknown name throws during policy lookup; and
- tests require exact equality between the 89 registered names and policy
  names.

Each policy records the required OAuth scope, accepted auth kinds, and whether
the tool needs an account or team identity. High-impact throttling is kept in
the separate `HIGH_IMPACT_MCP_TOOLS` set rather than duplicated in each policy
object.

The supported MCP scopes are:

```text
teams:read              teams:write
api_keys:read           api_keys:write
pages:read              pages:write
themes:read             themes:write
media:read              media:write
articles:read           articles:write
documentation:read      documentation:write
product-updates:read    product-updates:write
contacts:read           contacts:write
segments:read           segments:write
broadcasts:read         broadcasts:write         broadcasts:send
esp:read                esp:write
chatbot:read            chatbot:write
helpdesk:read           helpdesk:write
domains:read            domains:write
settings:read           settings:write
```

OAuth calls must contain the policy's required scope. Read scopes do not grant
writes, and `send_broadcast` specifically requires `broadcasts:send`.

Unauthenticated and invalid-token responses include a Bearer challenge with
the protected-resource metadata URL. Missing OAuth scopes are rejected by the
tool-level policy for both supported protocol eras.

Team API keys do not currently have per-scope grants and preserve their
existing fixed-team access. Account-only tools reject API-key authentication.
At present, `list_teams`, `create_team`, and `delete_team` are account-only;
changes to that set require an explicit authorization review.

## Schema and result boundary

FrontLit's REST contracts remain on Zod 3. MCP SDK 2 consumes Standard Schema,
so `apps/api/src/mcp/schema.ts` provides the only bridge:

```text
Zod 3 -> zod-to-json-schema -> SDK 2 fromJsonSchema()
```

`apps/api/src/mcp/tool-registry.ts` compiles and caches immutable input/output
schema adapters by tool name. This cache contains only schemas; it contains no
request, credential, client, or tenant state.

The same registrar also:

- fails closed through policy lookup during registration;
- checks authorization before invoking a handler;
- records scope decisions, outcome, and duration without content or secrets;
  and
- invokes the existing domain handler with the SDK 2 request context.

`jsonResult()` in `apps/api/src/mcp/tools/responses.ts` recursively converts
all `Date` instances to ISO strings before constructing both text content and
`structuredContent`. This prevents a database write from succeeding while the
client reports output validation failure for fields such as `createdAt` or
`updatedAt`.

Domain serializers still remove internal fields and shape public results.
Central date normalization is the final MCP boundary, not a replacement for
those serializers.

## Rate limiting, proxy trust, and logging

The MCP route applies two limits:

| Limit                       | Position              | Key                                               | Requests/minute |
| --------------------------- | --------------------- | ------------------------------------------------- | --------------- |
| Network limit               | Before authentication | Express client IP                                 | 120             |
| Principal limit             | After authentication  | auth kind + client/key ID + team ID               | 60              |
| High-impact principal limit | After authentication  | same principal key when `Mcp-Name` is high impact | 20              |

The high-impact set includes destructive or externally visible actions such
as team deletion, API-key changes, publishing/deletion, broadcast sending,
ESP tests/removal, imports, and domain attachment/removal.

The lower high-impact limit depends on the modern `Mcp-Name` HTTP header.
Older Streamable HTTP calls that do not provide it receive the normal
60-request principal limit; tool authorization and destructive annotations
still apply normally.

When the API is behind exactly one trusted reverse proxy, set:

```dotenv
ENABLE_TRUST_PROXY=true
```

This configures Express with one trusted hop so `express-rate-limit` can use
`X-Forwarded-For`. Leave it false for direct connections. Do not suppress
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` or trust an arbitrary proxy chain; fix the
deployment topology/configuration.

Request and tool logs include method/tool, auth kind, required scope, policy
decision, outcome, status, and duration where available. They must not include
bearer tokens, API-key secrets, authorization codes, OTPs, CIMD bodies, or tool
content.

Better Auth's `onAPIError` hook records sanitized unexpected server errors
because production Better Auth responses may deliberately contain an empty
500 body. Expected OAuth 4xx rejections are not logged as operational errors,
and request URLs are excluded because they can contain authorization codes.

## OAuth persistence and migrations

Better Auth initializes the configured MCP resource when the auth instance is
created. The OAuth schema must therefore exist before starting the API.

The current baseline migration implements the Better Auth 1.7 schema:

- `apps/api/drizzle/0000_baseline.sql` includes OAuth resource,
  client-resource, assertion, client metadata, token resource/rotation, and
  consent fields; and
- it includes nullable `alg` and `crv`
  fields required by the current JWT plugin's JWKS model.

The baseline has one matching Drizzle snapshot and journal entry. It represents
the complete current schema for a fresh database; early-development databases
using the superseded incremental history must be reset before applying it.

For a built API, apply migrations before starting it:

```bash
bun run --filter @frontlit/api build
bun run --filter @frontlit/api db:migrate
bun run dev:api
```

If the API crashes with `relation "auth_oauth_resource" does not exist`, the
application was started before `0000_baseline` was applied. Local Compose
applies this via `frontlit-migrate` (`docker compose -f docker-compose.local.yml up`). If token exchange
reports that `alg` does not exist in the JWKS Drizzle schema, reset the
database and re-apply the baseline so the deployed application and schema
match.

The migration ledger is normally under `drizzle.__drizzle_migrations`, not
necessarily the default PostgreSQL schema. Row counts in OAuth tables do not
prove token correctness; verify migration hashes, columns, the real OAuth
flow, and JWT claims.

## Code map

| Path                                        | Responsibility                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/api/src/app.ts`                       | Mount MCP before global CORS/body parsers; configure optional one-hop proxy trust |
| `apps/api/src/mcp/routes.ts`                | Discovery, MCP CORS, limits, authentication, observability, SDK 2 Node handler    |
| `apps/api/src/mcp/server.ts`                | Request-local server construction and deterministic catalog registration          |
| `apps/api/src/mcp/auth-context.ts`          | Typed OAuth/API-key/account/team SDK context                                      |
| `apps/api/src/mcp/policy.ts`                | Scope constants, complete tool policy, account-only and high-impact sets          |
| `apps/api/src/mcp/schema.ts`                | Zod 3 to SDK 2 Standard Schema bridge                                             |
| `apps/api/src/mcp/tool-registry.ts`         | Cached schemas, authorization wrapper, tool logs and timing                       |
| `apps/api/src/mcp/tools/*`                  | Domain handlers using existing FrontLit services                                  |
| `apps/api/src/auth/better-auth.ts`          | OAuth resources, scopes, CIMD/DCR, metadata, error logging                        |
| `apps/api/src/auth/cimd-fetch.ts`           | Hardened and pinned client-metadata transport                                     |
| `apps/api/src/auth/middleware.ts`           | Product auth adaptation and browser-session rejection for MCP                     |
| `apps/api/src/auth/oauth-team-selection.ts` | Zero/one/multi-team OAuth binding                                                 |
| `apps/api/src/auth/oauth-team-pages.ts`     | Hosted team-selection and no-team UX                                              |
| `apps/api/src/auth/resolve-auth.ts`         | Session/OAuth/API-key resolution and verified identity mapping                    |
| `apps/api/src/db/auth-schema.ts`            | FrontLit model names for Better Auth/OAuth persistence                            |
| `apps/api/drizzle/0000_baseline.sql`        | Current application and Better Auth schema baseline                               |
| `apps/docs/content/docs/developers/mcp.mdx` | User-facing connection and troubleshooting guide                                  |
| `@codelitdev/oauth-server-kit`              | Shared discovery, hosted OAuth helpers, and neutral auth types                    |

## Dependencies

The API directly uses:

- `@modelcontextprotocol/server@^2.0.0`;
- `@modelcontextprotocol/node@^2.0.0`;
- `@modelcontextprotocol/client@^2.0.0` for tests;
- `better-auth`, `@better-auth/oauth-provider`, and `@better-auth/cimd` at
  `1.7.0-rc.4`;
- `zod@^3.25.76`; and
- `zod-to-json-schema@^3.25.2`.

FrontLit no longer directly imports `@modelcontextprotocol/sdk` version 1.
SDK 1 may still appear transitively in the workspace lockfile; that does not
mean the FrontLit MCP server runs it. Check imports and the direct dependency
graph rather than searching the lockfile alone.

The aligned Better Auth packages must be upgraded together. Mixing 1.6 and
1.7 provider, resource-client, schema, or kit code caused several of the
failures recorded below.

## Automated verification

The focused protocol and OAuth checks are:

```bash
bun run --filter @frontlit/api test \
  src/mcp \
  src/auth/cimd-fetch.test.ts \
  src/auth/better-auth-mcp.test.ts \
  src/auth/oauth-team-selection.test.ts
```

The normal repository checks are:

```bash
bun run --filter @frontlit/api check-types
bun run --filter @frontlit/api test
bun run --filter @frontlit/api build
bun run lint
bun run --filter @frontlit/docs build
git diff --check
```

The tests cover, among other things:

- a client pinned to protocol `2026-07-28`;
- the exact deterministic 89-tool catalog and policy set;
- an older stateless Streamable HTTP initialize request;
- absence of an MCP session header and standalone SSE route;
- protocol/header mismatch and unsupported media-type handling;
- browser preflight headers and one-hop proxy behavior;
- OAuth scope and account-only policy enforcement;
- identity-only registration defaults and explicit-scope rejection;
- authorization-server metadata, CIMD, and DCR advertisement;
- hardened CIMD fetch behavior and exact client exceptions;
- OAuth team selection, including sole-team binding;
- credential-safe SDK auth context; and
- real migration application through the database test harness.

The sibling OAuth kit must also pass its type-check, tests, and build whenever
its Better Auth integration changes.

## Public smoke testing

Use an HTTPS endpoint for hosted clients. For a local API exposed through
Tailscale Funnel or another controlled proxy, enable one-hop proxy trust and
keep the tunnel lifecycle outside the API process.

Run checks in this order:

1. Local application health.
2. Local unauthenticated MCP challenge.
3. Local protected-resource and authorization-server metadata.
4. Database migrations and Better Auth startup logs.
5. Tunnel/Funnel process and target listener.
6. Public DNS, TLS, health, and discovery.
7. Direct protocol probes.
8. GUI client OAuth and tool calls.

Useful discovery probes:

```bash
MCP_ORIGIN=https://api.example.com

curl -fsS "$MCP_ORIGIN/.well-known/oauth-protected-resource/mcp" | jq
curl -fsS "$MCP_ORIGIN/.well-known/oauth-authorization-server/api/auth" | jq
curl -i "$MCP_ORIGIN/mcp"
```

The final command should return 404 because standalone SSE is intentionally
absent. To inspect the authentication challenge, send a protocol-shaped POST
without credentials:

```bash
curl -i -X POST "$MCP_ORIGIN/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

It should return `401` with a `WWW-Authenticate` challenge pointing at the MCP
protected-resource metadata. With a valid `x-frontlit-apikey`, the same older
Streamable HTTP request should succeed without returning `Mcp-Session-Id`.
Use the SDK 2 test client rather than hand-authoring modern 2026 envelopes.

Test at least:

1. VS Code with an HTTP MCP server entry.
2. Claude with the public HTTPS `/mcp` URL.
3. Cloudflare AI Playground.
4. MCP Inspector, including DCR.
5. A direct API-key connection.

For each OAuth client, complete login and consent, confirm reconnection after
the callback, list tools, call a read tool, call a reversible write tool, and
confirm the resulting structured output. Also test a new user with no team,
then create a team and restart authorization.

Clients may cache discovery documents, client registration, access tokens,
and tool schemas. Remove/re-add or restart a client after changing public URL,
OAuth metadata, scopes, team membership, or the tool catalog.

## Troubleshooting guide

Diagnose the first failing layer rather than the last error a client displays.

| Symptom                                                                  | Likely cause and action                                                                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public URL times out                                                     | Check local `/health`, Funnel/tunnel process, listener target, public DNS, and TLS before inspecting MCP code.                                                        |
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`                                     | Set `ENABLE_TRUST_PROXY=true` only for the intended one-hop proxy deployment.                                                                                         |
| `auth_oauth_resource` does not exist                                     | Reset the early-development database and apply `0000_baseline` before starting Better Auth.                                                                           |
| JWKS schema says `alg` is missing                                        | Apply `0000_baseline` to a fresh database and confirm deployed schema/code alignment.                                                                                 |
| `invalid_client` fetching a metadata URL                                 | Check HTTPS, public DNS resolution, fetch timeout/size policy, redirect behavior, and the exact client metadata URL.                                                  |
| `invalid_client_metadata` for Device Code or JWT Bearer                  | Confirm the request uses the canonical VS Code or Claude metadata URL and the exact grant filter is active. Do not add a global filter.                               |
| Browser OAuth succeeds, then `/mcp` returns `invalid_token`              | Confirm `resolve-auth.ts` calls Better Auth 1.7 `verifyBearerToken()` and validates the exact public MCP audience. Clear stale client tokens after deploying the fix. |
| OAuth client remains “Authenticating”                                    | Inspect token exchange and the first authenticated `POST /mcp`; browser callback success alone does not prove token issuance or MCP initialization.                   |
| Client reports `404 Cannot GET /mcp` after a `400`, `401`, or `409` POST | The GET is an expected SSE fallback and secondary symptom. Keep GET as 404 and fix the earlier POST.                                                                  |
| Consent lists every MCP scope                                            | This can be the registered client capability set. Verify the requested scope, issued token scope, and per-tool enforcement before treating it as an over-grant.       |
| Client shows generic failure for a new user                              | Confirm the user belongs to a FrontLit team and that the no-team page appears before consent.                                                                         |
| Single-team token lacks `team_id`                                        | Confirm the sole-team path returns that team's ID as the consent `reference_id`.                                                                                      |
| Tool mutation succeeds but client reports output validation failure      | Inspect `structuredContent` for unnormalized `Date` values and ensure the result went through `jsonResult()`.                                                         |
| VS Code works but Inspector or Claude fails                              | Test protocol era and OAuth onboarding separately: older Streamable HTTP, modern 2026, CIMD, and DCR are independent compatibility axes.                              |

## Maintenance rules for future changes

1. Keep one SDK 2 handler with `legacy: "stateless"`; do not add an SDK 1 or
   standalone SSE server.
2. Keep `/mcp` before Express body parsing and global CORS.
3. Build a request-local server and store no protocol session state in memory.
4. Add every new tool to `policy.ts`; the exact catalog/policy test must pass.
5. Add new scopes to the shared scope constants so policy, OAuth metadata,
   resource registration, and tests remain aligned.
6. Treat OAuth client ID, account ID, team ID, and credentials as distinct
   values.
7. Never place raw API-key secrets or sensitive OAuth URL data in context or
   logs.
8. Keep OAuth registration defaults identity-only and require explicit
   authorization scopes.
9. Keep arbitrary CIMD URLs behind the pinned public-network fetch policy;
   add client exceptions only for exact canonical URLs and exact fields.
10. Keep REST schemas canonical on Zod 3 until a separate repository-wide
    migration is approved; bridge only at the MCP boundary.
11. Route every structured result through `jsonResult()` so SDK output
    validation sees JSON values.
12. Add Better Auth schema changes as new Drizzle migrations and test both
    fresh and upgrade paths; do not rewrite unrelated migration history.
13. Re-run the shared OAuth kit integration tests after Better Auth upgrades.
14. Diagnose the first failing MCP POST before reacting to a client's later
    SSE fallback error.

## Last verified state

On 2026-08-10, after the July 2026 migration:

- FrontLit API type-check passed;
- all 226 FrontLit API tests passed;
- the FrontLit API production build passed;
- repository ESLint passed;
- the documentation production build passed;
- all 99 shared OAuth-kit tests passed; and
- the shared OAuth kit type-check and build passed.

These numbers are a historical baseline. Future sessions should report the
current results rather than copying this status forward unchanged.
