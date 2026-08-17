# Introduction

Build your SaaS website, publish content, support users, and send email from one place.

The front office of your SaaS.

Articles, documentation, and product updates share one content system and can be placed on pages as data-backed feeds.

API first. AI ready (MCP compatible).

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

1. Confirm Compose SendLit is up: `docker compose ps` and `curl -s http://localhost:3001/health`.
2. Confirm `apps/api/.env` has `SENDLIT_API_URL` and `SENDLIT_ORGANIZATION_API_KEY`. The org key is printed **once** on first SendLit boot:

    ```bash
    docker compose logs sendlit-api | grep organizationApiKey
    ```

    Recreating the SendLit database or container without updating this key produces `401 unauthorized` on `POST /provisioning/teams`.

3. Check the FrontLit outbox (FrontLit Postgres, not SendLit):

    ```sql
    SELECT type, status, attempts, last_error, next_attempt_at
    FROM outbox_jobs
    WHERE type = 'provision_sendlit'
    ORDER BY created_at DESC;
    ```

    After **8** failures the row is `failed` and the worker stops. Fix the key, then retry:

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
