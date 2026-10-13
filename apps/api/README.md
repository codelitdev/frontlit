# FrontLit API

Contains FrontLit's business logic, REST API, OAuth-protected MCP server, and
team-scoped persistence.

## API documentation

With the API running on its default port:

- Swagger UI: `http://localhost:4000/docs/`
- OpenAPI JSON: `http://localhost:4000/openapi.json`
- Health check: `http://localhost:4000/health`

Like SendLit, FrontLit mounts Swagger UI at the organization-standard `/docs`
path. Typed authoring resources live below `/content`; for example,
documentation uses `/content/documentation`, while the published website can
still present that content at its human-facing `/docs` route.

The separate `@frontlit/docs` application also generates its interactive
`/api-reference` pages from the shared ts-rest contract.

## MCP

FrontLit exposes one authenticated Streamable HTTP endpoint at `POST /mcp`.
The direct server implementation uses the MCP TypeScript SDK 2 packages:

- modern `2026-07-28` requests use the stateless protocol core;
- older Streamable HTTP clients use SDK 2's stateless legacy mode; and
- standalone HTTP+SSE and `Mcp-Session-Id` sessions are not implemented.

OAuth uses CIMD-first client discovery with DCR compatibility. A fixed-team
FrontLit API key can also be supplied as `x-frontlit-apikey`. The exhaustive
tool-to-scope policy is in `src/mcp/policy.ts`.

Focused verification:

```bash
bun run --filter @frontlit/api test src/mcp src/auth/cimd-fetch.test.ts src/auth/better-auth-mcp.test.ts
bun run --filter @frontlit/api check-types
```
