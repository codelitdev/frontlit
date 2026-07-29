# FrontLit API

Contains FrontLit's business logic, REST API, OAuth-protected MCP server, and
team-scoped persistence.

## API documentation

With the API running on its default port:

- Swagger UI: `http://localhost:4000/docs/`
- OpenAPI JSON: `http://localhost:4000/openapi.json`
- Health check: `http://localhost:4000/health`

Like SendLit, FrontLit mounts Swagger UI at the organization-standard `/docs`
path. Private help-document CRUD uses `/help-docs`; published site pages keep
their public `/public/:teamId/docs/*` URLs.

The separate `@frontlit/docs` application also generates its interactive
`/api-reference` pages from the shared ts-rest contract.
