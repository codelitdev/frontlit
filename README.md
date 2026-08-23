# Introduction

Build your SaaS website, publish content, support users, and send email from one place.

The front office of your SaaS.

Articles, documentation, and product updates share one content system and can be placed on pages as data-backed feeds.

API first. AI ready (MCP compatible).

## Local development

Start Postgres, Redis, and SendLit. Run FrontLit on the host:

```sh
docker compose -f docker-compose.local.yml up
```

In other terminals (or `pnpm dev` to run all three together):

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/sites/.env.example apps/sites/.env
pnpm --filter @frontlit/api-contract build
pnpm dev:api
pnpm dev:web
pnpm dev:sites
```

Wait for `FrontLit migrations applied.` in the Compose logs before
`pnpm dev:api`. Schema lives in Compose, not in the API process. Host
development defaults to console platform mail (OTP and invitation text
logged in the API process).

Do not use `pnpm dev:api && pnpm dev:web && pnpm dev:sites` — `&&` waits
for each process to exit. Use separate terminals or `pnpm dev`.

On first SendLit boot, copy the one-time `organizationApiKey` into
`apps/api/.env` as `SENDLIT_ORGANIZATION_API_KEY`:

```sh
docker compose -f docker-compose.local.yml logs sendlit-api
```

Postgres is on `127.0.0.1:5433`, SendLit on `http://localhost:3001`.
See [`apps/docs/content/docs/getting-started/overview.mdx`](apps/docs/content/docs/getting-started/overview.mdx).

Do not run this at the same time as the self-host stack — both bind those
ports.

## Self-hosting with Docker Compose

The root Compose file is the product: PostgreSQL (FrontLit + SendLit
databases), Redis, SendLit, and FrontLit's API, dashboard, and public sites.
Platform mail (login OTPs, invitations, ticket notifications) is sent as
SendLit transactional templates from a dedicated `frontlit-platform` team
when `SENDLIT_PLATFORM_TEAM_API_KEY` is configured. Without the key, FrontLit
writes platform emails to the API log.

```sh
cp .env.example .env
# Set the required secrets (commands are included as comments there).
```

1. Start SendLit first:

    ```sh
    docker compose up -d postgres sendlit-redis sendlit-db-init sendlit-api
    ```

2. Read the one-time `organizationApiKey` from `docker compose logs sendlit-api`
   and store it as `SENDLIT_ORGANIZATION_API_KEY`. FrontLit never scrapes the log.
3. Sign in to SendLit, connect an organization shared ESP, and make it the
   delivery policy default. This must happen before the platform team is created.
4. Create the dedicated SendLit platform team, grant it the shared ESP, mint a
   team API key, and set it as `SENDLIT_PLATFORM_TEAM_API_KEY` in `.env`.
5. Start the full product: `docker compose up --build -d`.
6. Wait for application readiness (Compose healthchecks use `/health` for
   liveness only):

    ```sh
    docker compose exec frontlit-api node -e "fetch('http://127.0.0.1:4000/ready').then(async r => { if (!r.ok) { console.error(await r.text()); process.exit(1); } }).catch(e => { console.error(e); process.exit(1); })"
    ```

Open the dashboard at `WEB_CLIENT` (`http://localhost:3000` by default), the
API at `API_PUBLIC_URL` (`http://localhost:4000`), public sites at
`SITES_BASE_URL` (`http://localhost:3002`), and SendLit at
`http://localhost:3001`.

## Tech stack

- ts-rest (for API)
- PostgreSQL (For DB and vector search)
- Next.js
- Tailwind CSS
- Shadcn UI
- Drizzle ORM
- fumadocs (with openapi extension) for docs

## Troubleshooting

### ESP settings say SendLit is still provisioning

`/settings/esp` shows _“It’s provisioned automatically in the background…”_ when FrontLit has no stored SendLit team key (`integrations.provider = 'sendlit'`). That is not the same as SendLit being down.

1. Confirm SendLit is up: `curl -s http://localhost:3001/health`. Local: `docker compose -f docker-compose.local.yml ps`. Self-host: `docker compose ps`.
2. Confirm `apps/api/.env` (local) or the root `.env` (self-host) has `SENDLIT_API_URL` and `SENDLIT_ORGANIZATION_API_KEY`. The org key is printed **once** on first SendLit boot:

    ```bash
    docker compose -f docker-compose.local.yml logs sendlit-api | grep organizationApiKey
    ```

    Recreating the SendLit database or container without updating this key produces `401 unauthorized` on `POST /provisioning/teams`.

3. Check the FrontLit outbox (FrontLit Postgres, not SendLit):

    ```sql
    SELECT type, status, attempts, last_error, next_attempt_at
    FROM outbox_jobs
    WHERE type = 'provision_sendlit'
    ORDER BY created_at DESC;
    ```

    After **8** failures a `provision_sendlit` row used to sit in `failed`
    forever (the banner on `/settings/esp`). The API now requeues those
    rows on boot and, unless `SENDLIT_PROVISION_RETRY_FOREVER=false`,
    keeps retrying provision jobs. Team admins can also click **Retry now**
    on `/settings/esp`. Older images still need the reset below:

    ```sql
    UPDATE outbox_jobs
    SET status = 'pending',
        attempts = 0,
        last_error = NULL,
        next_attempt_at = NOW()
    WHERE type = 'provision_sendlit'
      AND status = 'failed';
    ```

    Restart the FrontLit API so it picks up the new env, then reload `/settings/esp`.
