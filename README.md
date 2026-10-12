<div align="center">

<img src="assets/logo.svg" alt="FrontLit logo" width="72" height="72" />

# FrontLit

**The front office of your SaaS.**

Build your website, publish content, support users and send email from one place,<br />
through a block-based page builder, a REST API, an MCP server and a dashboard.

[![npm](https://img.shields.io/npm/v/@frontlit/page-builder?label=page-builder)](https://www.npmjs.com/package/@frontlit/page-builder)
[![npm](https://img.shields.io/npm/v/@frontlit/text-editor?label=text-editor)](https://www.npmjs.com/package/@frontlit/text-editor)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](./LICENSE)
[![Discord](https://img.shields.io/badge/chat-Discord-5865F2)](https://discord.gg/AysdDP4wxe)
[![Testing](https://github.com/codelitdev/frontlit/actions/workflows/test.yaml/badge.svg)](https://github.com/codelitdev/frontlit/actions/workflows/test.yaml)
[![Code quality](https://github.com/codelitdev/frontlit/actions/workflows/code-quality.yaml/badge.svg)](https://github.com/codelitdev/frontlit/actions/workflows/code-quality.yaml)

[Website](https://frontlit.app) · [Docs](apps/docs/content/docs/index.mdx) · [Getting started](apps/docs/content/docs/getting-started/overview.mdx) · [Self-hosting](apps/docs/content/docs/self-hosting/index.mdx)

</div>

---

## Why FrontLit

A SaaS needs more than a product. It needs a marketing site, a blog, documentation, a changelog, a help desk and a way to email people, and these usually live in five different tools that don't share content, themes or users. FrontLit is one system for all of it, and it gives apps, AI agents and people one place to work on the same content.

- **One content system.** Articles, documentation and product updates share the same model and can be placed on any page as data-backed feeds.
- **A real page builder.** Draft and publish pages from a block-based WYSIWYG editor, themed per team. The editor and renderer are published as React packages you can embed.
- **API first.** Every capability is defined once in a typed [ts-rest](https://ts-rest.com) contract, which drives server validation, the OpenAPI reference and the typed dashboard client. Nothing ships dashboard-only.
- **AI ready.** The same capabilities are exposed over a remote MCP server, with OAuth for assistants and API keys for scripts.
- **Multi-tenant.** Every team gets a subdomain and can attach its own custom domain to its public site.
- **Email built in.** Lead capture on pages and sending through [SendLit](https://github.com/codelitdev/sendlit), provisioned automatically for each team.
- **Open source and portable.** Self-host the whole stack with one Docker Compose file.

## Quick start

Run the full stack (PostgreSQL, Redis, SendLit, and FrontLit's API, dashboard and public sites):

```bash
git clone https://github.com/codelitdev/frontlit.git
cd frontlit
cp .env.example .env
# Set the required secrets (commands are included as comments in the file).
docker compose up --build -d
```

Then open the dashboard at <http://localhost:3000>. See [Self-hosting](#self-hosting) for the one-time keys you need to save.

Embed the page builder in your own React app:

```bash
npm install @frontlit/page-builder
```

See the [page builder](apps/docs/content/docs/components/page-builder.mdx) and [text editor](apps/docs/content/docs/components/text-editor.mdx) guides for usage.

Connect an AI agent: add `https://api.frontlit.app/mcp` as a remote MCP server in your client and sign in. See [MCP connections](apps/docs/content/docs/developers/mcp.mdx).

## Packages

| Package                                               | Description                                                  | Version                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [`@frontlit/page-builder`](packages/page-builder)     | Block-based WYSIWYG page builder and renderer for React      | [![npm](https://img.shields.io/npm/v/@frontlit/page-builder)](https://www.npmjs.com/package/@frontlit/page-builder) |
| [`@frontlit/text-editor`](packages/text-editor)       | TipTap-based rich text editor and static renderer            | [![npm](https://img.shields.io/npm/v/@frontlit/text-editor)](https://www.npmjs.com/package/@frontlit/text-editor)   |
| [`@frontlit/api-contract`](packages/api-contract)     | Shared ts-rest contract (Zod schemas and routes), internal   | private                                                                                                             |
| [`@frontlit/media-uploader`](packages/media-uploader) | Media upload dialog with library and Unsplash tabs, internal | private                                                                                                             |

The repository also contains the API (`apps/api`), which owns all product behavior; the dashboard (`apps/web`), a thin client over the API; the public sites server (`apps/sites`); and the docs site (`apps/docs`). A runnable demo of the component packages is in [`examples/components-demo`](examples/components-demo).

## Architecture

- **API** (`apps/api`): ts-rest routes, MCP tools, PostgreSQL with Drizzle ORM, pgvector for search.
- **Dashboard** (`apps/web`): the authenticated team workspace, built on Next.js.
- **Public sites** (`apps/sites`): serves each team's published site, resolving the tenant from the request host.
- **SendLit**: the email layer, run alongside FrontLit.

For the full design, see [docs/architecture.md](docs/architecture.md).

## Self-hosting

The root Compose file runs everything: PostgreSQL (FrontLit and SendLit databases), Redis, SendLit, and FrontLit's API, dashboard and public sites.

```bash
cp .env.example .env
docker compose up --build -d
docker compose logs frontlit-api
docker compose logs sendlit-api
```

Set `SUPER_ADMIN_EMAIL` and `SENDLIT_SUPER_ADMIN_EMAIL` before the first start. Each process logs a one-time API key; save both. After SendLit prints `organizationApiKey`, put it in `.env` as `SENDLIT_ORGANIZATION_API_KEY` and run `docker compose up -d frontlit-api`.

| Service      | Default URL             |
| ------------ | ----------------------- |
| Dashboard    | <http://localhost:3000> |
| API          | <http://localhost:4000> |
| Public sites | <http://localhost:3002> |
| SendLit      | <http://localhost:3001> |

For a public deployment, use externally reachable HTTPS origins and set `ENABLE_TRUST_PROXY=true`. The [self-hosting guide](apps/docs/content/docs/self-hosting/index.mdx) has the details.

## Development

**Requirements:** [Bun](https://bun.sh) 1.4.1 or newer and Docker. We develop on Linux; on Windows, use WSL.

```bash
bun install

# Postgres, Redis and SendLit. FrontLit itself runs on your machine.
docker compose -f docker-compose.local.yml up
```

Wait for `FrontLit migrations applied.` in the Compose logs, then configure and start the apps in separate terminals (or use `bun run dev` to run all three together):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/sites/.env.example apps/sites/.env
bun run --filter @frontlit/api-contract build

bun run dev:api     # API on http://localhost:4000
bun run dev:web     # Dashboard on http://localhost:3000
bun run dev:sites   # Public sites on http://localhost:3002
bun run dev:docs    # Docs site
```

Don't chain them with `&&`: each command waits for the previous process to exit.

On the first SendLit boot, copy the one-time `organizationApiKey` into `apps/api/.env` as `SENDLIT_ORGANIZATION_API_KEY`:

```bash
docker compose -f docker-compose.local.yml logs sendlit-api
```

Postgres is on `127.0.0.1:5433` and SendLit on <http://localhost:3001>. Don't run this at the same time as the self-host stack, since both bind the same ports.

### Tests

```bash
bun run --filter @frontlit/api-contract build
bun run test
```

Other useful scripts: `bun run typecheck`, `bun run format:check` (Biome) and `bun run check:drift` (verifies the generated auth and billing schemas are up to date). Documentation management and GitHub sync are described in [docs/docs-management.md](docs/docs-management.md).

### Tech stack

ts-rest, PostgreSQL (with pgvector), Drizzle ORM, Next.js, Tailwind CSS, Shadcn UI, and fumadocs for the docs.

## Troubleshooting

**ESP settings say SendLit is still provisioning.** This means FrontLit has no stored SendLit team key, not that SendLit is down.

1. Check SendLit is up: `curl -s http://localhost:3001/health`.
2. Check `SENDLIT_API_URL` and `SENDLIT_ORGANIZATION_API_KEY` are set in `apps/api/.env` (local) or the root `.env` (self-host). The organization key is printed once on first SendLit boot. Recreating the SendLit database without updating the key causes `401 unauthorized` on provisioning.
3. Check the outbox in the FrontLit database:

    ```sql
    SELECT type, status, attempts, last_error, next_attempt_at
    FROM outbox_jobs
    WHERE type = 'provision_sendlit'
    ORDER BY created_at DESC;
    ```

    The API requeues failed provisioning jobs on boot and keeps retrying them unless `SENDLIT_PROVISION_RETRY_FOREVER=false`. Team admins can also click **Retry now** on `/settings/esp`. Restart the API after changing env, then reload the page.

## Contributing

Contributions are welcome. For anything larger than a small fix, please open an issue first so we can agree on the approach.

1. Fork the repository and create a branch.
2. Make your change, with tests. If you change a published package, add a changeset with `bun run changeset`.
3. Run `bun run lint`, `bun run format`, `bun run typecheck` and `bun run test`.
4. Open a pull request. Tests and code quality checks run on every pull request and must pass.

Public site UI must be built from `@frontlit/page-builder` primitives; see [AGENTS.md](AGENTS.md) for the rules.

Questions are welcome on [Discord](https://discord.gg/AysdDP4wxe) or in [GitHub issues](https://github.com/codelitdev/frontlit/issues).

## Security

Please don't report security issues in public issues. Report them privately through [GitHub's security advisories](https://github.com/codelitdev/frontlit/security/advisories/new).

## Licensing

FrontLit is split into two licenses:

- **AGPL-3.0-or-later** covers the server (`apps/api`) and the web app (`apps/web`). If you run a modified FrontLit as a hosted service, you must share your changes under the same license. Self-hosting is free.
- **MIT** covers the packages you embed in your own products: `@frontlit/page-builder`, `@frontlit/text-editor`, `@frontlit/media-uploader` and `@frontlit/api-contract`. Each of these has its own `LICENSE` file.

The AGPL license text is in [LICENSE](./LICENSE). For a commercial license that allows a private modified fork, contact the maintainers.
