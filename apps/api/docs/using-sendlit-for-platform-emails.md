# Using SendLit for platform-level emails PRD

**Status:** Ready for development
**Last updated:** 2026-08-23
**Primary owners:** Product and API engineering

## 1. Summary

All platform-level emails FrontLit sends — login OTPs, team invitations, and
help-desk ticket notifications — will be sent as **SendLit transactional
emails** (`POST /emails`) from one preconfigured SendLit platform team, using
templates that FrontLit **auto-creates and keeps in sync** inside that team. The
team's API key is supplied to FrontLit as `SENDLIT_PLATFORM_TEAM_API_KEY` in
every real-send deployment, including the production self-host stack. The
direct-SMTP platform mail path (nodemailer + `EMAIL_*` env vars) is removed
entirely. The design uses SendLit's existing public API and requires no SendLit
code, schema, or contract changes.

Tenant-facing email features are unchanged: each team still connects its own
SendLit integration for broadcasts/lead capture (architecture.md §10) and its
own ESP for delivery.

## 2. Background

Platform mail currently goes through `src/utils/mail.ts`, a thin nodemailer
wrapper configured with `EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASS/EMAIL_FROM`.
Callers:

- `auth/better-auth.ts` — login OTP emails;
- `team/invitation-email.ts` — member invitations;
- `tickets/notify.ts` — help-desk notifications (ticket created, agent reply,
  requester message to the team), including per-team `From:` identity and
  IMAP-style threading headers.

Problems with the SMTP path:

- a second set of sending credentials to provision and rotate per deployment;
- no send history, status, or bounce visibility for platform mail;
- no templates — every caller hand-builds HTML strings.

SendLit already exposes a transactional email resource (`POST /emails`,
contract `transactionalContract`; see SendLit
`packages/api-contract/src/schemas/transactional.ts`) that accepts either a
team-owned transactional template plus Liquid variables or inline HTML, and
returns `202` with a pollable `txeId`. FrontLit already speaks this API via
`src/email/sendlit-client.ts`.

### Why a dedicated platform team

SendLit scopes all resources to a team. Platform mail is not tenant mail: it
belongs to the deployment itself (login OTPs are cross-tenant). So all
platform sends run under one dedicated SendLit team whose API key is supplied
through the deployment environment. That team delivers through the
organization's shared ESP (`deliverySource: {type: "organization"}`).

### Provisioning caveat (verified against SendLit source)

A provisioned team receives an organization ESP grant when
`delivery.useOrganizationDefault: true` is passed at provision time (or the org
policy sets `autoGrantDefaultEsp: true`) **and** the policy has an active default
shared ESP (`organizationDeliveryPolicies.defaultEspConfigId`; see SendLit
`apps/api/src/team/queries.ts` `createTeam`). If organization delivery is not
requested, the team is created with no grant and `defaultSource = null`. If it
is requested but no active default exists, team creation rolls back with the
internal `organization_esp_unavailable` error. A team created without a grant
shows "No shared ESP" / "No default shared ESP", and organization sends fail
with `organization_delivery_disabled` (`apps/api/src/delivery/queries.ts`
`resolveDeliverySource`). The literal
`deliverySource: {type: "organization"}` in provisioning responses
(`provisioning/routes.ts`) describes intent, not independently verified grant
state.

The organization shared ESP/default policy, platform team, grant, and team key
must therefore be set up on the SendLit side before first real delivery. After
that one-time bootstrap, FrontLit automatically validates the team and manages
its code-owned templates (see §7 Self-hosting and §8 Rollout).

## 3. Goals

1. Every platform email is sent through `POST /emails` using a template
   (never inline HTML) from the platform team.
2. Templates are code-owned and idempotently synced into the platform team —
   no manual template authoring in SendLit.
3. The SMTP platform-mail path and its env vars are deleted.
4. Existing caller error semantics survive (`MailNotConfiguredError`,
   delivery failures) so OTP issuance fallback and invitation/ticket behavior
   do not change shape.
5. When `SENDLIT_PLATFORM_TEAM_API_KEY` is absent, platform emails are dumped
   to the API console in every environment; setting the key enables SendLit.
6. Every real send has an idempotency key that is stable across all attempts
   for one logical delivery and a bounded request time, so a lost response can
   be retried without producing a second email. Persisted events use
   deterministic keys; ephemeral OTP callback invocations use a fresh key per
   invocation so a later issuance cannot collide when the numeric OTP repeats.
7. Platform mail adds no FrontLit database tables; the SendLit team key remains
   environment configuration and template IDs are cached only in process.

## 4. Non-goals

- No UI for editing platform templates; content lives in FrontLit's codebase.
- No changes to tenant marketing/broadcast flows or the per-team SendLit
  integration settings UI.
- No delivery-status polling/retry loop for accepted sends (`202` is
  fire-and-forget; failures are visible in SendLit's transactional log).
- No plain-text alternative part (SendLit transactional sends are HTML-only).
- No separation of OTP, invitation, and ticket mail into different SendLit
  teams. The platform team intentionally shares SendLit's team-level
  suppression list, quota, and rate limit across all platform mail for now.

## 5. Environment changes

| Variable                                                             | Change                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENDLIT_PLATFORM_TEAM_API_KEY`                                      | **Added.** Team-scoped API key of the preconfigured platform team. Set enables SendLit delivery; unset selects console dump.                               |
| `SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS`                                | **Added.** Timeout for each platform-mail SendLit HTTP attempt; defaults to `5000`. Tenant-facing SendLit requests retain their existing timeout behavior. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | **Removed** from `.env.example` (root + apps/api) and `docker-compose.yml`; reading them is an error-prone leftover — code paths deleted.                  |
| `nodemailer`, `@types/nodemailer`                                    | **Removed** from `apps/api/package.json`.                                                                                                                  |

`SENDLIT_API_URL` keeps its existing meaning and is required whenever the
platform-team key is set. `checkConfig()` validates the timeout and this URL.
When the key is unset under `NODE_ENV=production`, boot emits a prominent
warning because console messages can contain OTPs and invitation URLs.

The root `.env.example` documents the production self-host team key.
`apps/api/.env.example` documents host development's console default and the
optional real-send override. `docker-compose.local.yml` itself gains no
platform-mail variables because it does not run FrontLit.

## 6. Design

### 6.1 New module: `src/email/platform-mail.ts`

Replaces `src/utils/mail.ts` (deleted). Contents:

- **Error types** — `MailNotConfiguredError` and `MailDeliveryError` keep
  their names and semantics; callers import them from here.
- **Template registry** — static, in-code definitions:

    | Key                        | Canonical title (bootstrap/recovery) | Purpose       | Liquid variables                                                                                   |
    | -------------------------- | ------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------- |
    | `otp`                      | `FrontLit: Sign-in code`             | transactional | `otp`                                                                                              |
    | `invitation`               | `FrontLit: Team invitation`          | transactional | `teamName`, `inviterName` (guarded `{% if %}`, optional), `expiresAt`, `acceptUrl`, `inviteeEmail` |
    | `ticket-created`           | `FrontLit: Support notification`     | transactional | `subject`, `ticketUrl`                                                                             |
    | `ticket-reply`             | `FrontLit: Support reply`            | transactional | `replyText`, `ticketUrl`, `sourcesText`                                                            |
    | `ticket-requester-message` | `FrontLit: New ticket message`       | transactional | `inboxUrl`                                                                                         |

    Content uses SendLit block documents (`emailContentInputSchema`: text/link/
    image/separator blocks; **no footer block** — transactional templates must
    be footer-free) with a shared neutral `style` object lifted from SendLit's
    system templates. Every dynamic value uses Liquid's `escape` filter; the
    reply template applies `newline_to_br` after escaping reply/source prose.
    Dynamic action URLs are supplied to dedicated SendLit link blocks. The
    module defines a `PlatformTemplateVariables` mapping keyed by template key;
    `sendPlatformEmail<K>` accepts only the corresponding mapped variables.
    The brand is created in the renderer module, never by arbitrary call sites.
    SendLit computes `requiredVariables` server-side and rejects sends with
    `422 missing_template_variables` if any unguarded variable is absent.

- **Idempotent template sync without FrontLit state** —
  `ensurePlatformTemplates()` lists all SendLit templates, resolves each
  registry entry by exact canonical title, creates missing transactional
  templates, and PATCHes content drift. It re-lists after create so concurrent
  replicas converge on the canonical exact-title row. A canonical title owned
  by a marketing template is a readiness error. IDs are cached only in process;
  no FrontLit table or migration is added. The shared in-flight promise is
  cleared in `finally`, so failed initialization remains retryable. Manual
  renames are treated as a missing canonical template and may leave harmless
  clutter; this is the accepted concurrency/rename tradeoff.

- **Delivery preflight** — `ensurePlatformMailReady()` shares one in-flight
  initialization promise per process and, when the platform key is set:
    1. reads the required `SENDLIT_PLATFORM_TEAM_API_KEY`;
    2. calls the existing `GET /sending-options`, finds the organization option,
       and requires `available: true` plus a non-empty `fromEmail`;
    3. calls the existing `GET /settings/general` and requires a non-empty
       `mailingAddress`;
    4. calls `ensurePlatformTemplates()`.

    A missing/unavailable organization source, sender address, or mailing
    address is a sanitized platform-mail configuration error and leaves this
    process unready. These checks prove the static delivery prerequisites
    without sending a probe email and require no SendLit change. They run during
    initialization and after template cache invalidation, not before every
    message. Later quota exhaustion, recipient suppression, or transient
    SendLit/ESP failures remain send failures and metrics; they do not drain an
    otherwise initialized replica by flipping readiness. Authentication failure
    is the exception because the process can no longer perform any platform
    operation; recovery requires correcting the environment key and restarting
    the replica.

    The initialization promise is only an in-flight deduplication mechanism and
    is cleared in `finally`; readiness is stored separately. Failure therefore
    remains retryable. Template cache invalidation clears platform readiness as
    well as the template ID map, so the next initialization performs both
    preflight and reconciliation again. When initialization is triggered by a
    send, prerequisite/API failures are exposed to the caller as
    `MailDeliveryError`; a configured key with a missing SendLit URL remains
    `MailNotConfiguredError`.

- **Sender** — `sendPlatformEmail(templateKey, variables, meta)` where
  `meta = {to, subject, idempotencyKey, replyTo?, headers?}`:
    1. if `SENDLIT_PLATFORM_TEAM_API_KEY` is absent, log the complete logical
       message and return without contacting SendLit; otherwise require
       `SENDLIT_API_URL` and use the configured key;
    2. resolve template ID through `ensurePlatformMailReady()`;
    3. require a non-empty `idempotencyKey` and `POST /emails` with
       `{templateId, variables, deliverySource: {type: "organization"},
...meta}`. Selecting the delivery source explicitly prevents later team
       default-source edits from rerouting platform mail;
    4. retry once, with the same idempotency key, after a request timeout,
       network failure, or HTTP `408`, `502`, `503`, or `504`. Do not
       automatically retry validation/auth failures or `429`; the shared team
       limiter should not be amplified;
    5. map exhausted API/network failures to `MailDeliveryError` and missing
       configuration failures to `MailNotConfiguredError`;
    6. if the send reports the current SendLit missing-template response
       (`400` plus error `"Template not found"`) or
       `422 template_not_transactional`, invalidate the cache, race-safely
       re-sync once, and retry the send once with the same idempotency key. This
       repair retry is separate from, but still bounded alongside, the transport
       retry: one public call performs at most three `POST /emails` attempts.

- **Boot hook** — when the platform key is set, after `app.listen`, `index.ts` calls
  `ensurePlatformMailReady()` fire-and-forget, logging a warning on failure
  (same spirit as `createSuperAdminIfMissing`). A transient preflight/sync
  failure never blocks boot. While the process remains unready, a single
  background initializer retries with exponential backoff plus jitter (5
  seconds minimum, 60 seconds maximum); it stops after readiness succeeds and
  restarts after template cache invalidation. This prevents a
  readiness deadlock in which routing waits for `/ready` but no first send can
  trigger recovery. Static environment errors still fail earlier in
  `checkConfig()`.
- **Readiness and observability** — `/health` liveness remains independent of
  SendLit so a transient dependency outage does not restart FrontLit. A new
  `/ready` endpoint returns `503` when the key is set until this process completes
  one successful delivery preflight and template sync, then `200`; console mode
  is immediately ready. The state machine is explicit: configured delivery starts
  `initializing`; a failed initialization is `degraded`; a successful one is
  `ready`; template cache invalidation returns it to `initializing` until repair
  succeeds or to `degraded` if repair fails. Ordinary recipient/quota/transport
  send failures after initialization do not change readiness; platform-key
  authentication failure does. Failed sends/preflights/syncs update
  sanitized `platform_mail_*` counters and last-error status using template
  key, HTTP status, SendLit error code and retry count, never recipient,
  variables, URLs, API keys, or rendered bodies. A later successful
  initialization makes readiness healthy. Hosted deployment automation must
  use `/ready` as its readiness probe before routing traffic to a new replica;
  `/health` remains the liveness probe.

### 6.2 Client changes: `src/email/sendlit-client.ts`

- `request()` accepts an optional `timeoutMs`. When present it uses
  `AbortSignal.timeout(timeoutMs)` and maps timeout/network failures without
  logging API keys or message bodies; when absent it preserves the client's
  current behavior. Only platform-mail preflight, raw template operations, and
  `sendEmail()` calls pass the validated
  `SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS`. Tenant contacts, broadcasts, team
  provisioning, and public marketing-template operations are unchanged.
- `SendlitApiError` retains `status`, parsed JSON `body`, a string
  `errorCode` when `body.error` is present, and `retryAfter` from the response
  header. Non-JSON error bodies remain available only as a bounded sanitized
  message. FrontLit branches on the parsed current SendLit response, never on
  substring matching against the formatted exception message.
- `sendEmail()` body extended to
  `{to, subject, html?, templateId?, variables?, replyTo?, headers?,
idempotencyKey?, deliverySource?}`
  (mirrors `sendEmailBodySchema`; exactly one of `html`/`templateId`) and accepts
  the optional per-request timeout separately from the JSON body.
- Keep `FrontlitEmailTemplate` and FrontLit's public `emailTemplateSchema`
  unchanged. Add an internal `SendlitEmailTemplate` transport DTO containing
  `templateId`, `title`, `content`, `purpose`, timestamps, and SendLit's other
  list metadata needed by reconciliation. Purpose is validated from this raw
  response, never inferred from the query.
- Add raw, platform-capable helpers used beneath the existing marketing facade:
  `listSendlitEmailTemplates(apiKey, {purpose?, timeoutMs?})`,
  `createSendlitEmailTemplate(apiKey, input, {timeoutMs?})`,
  and `updateSendlitEmailTemplate(...)`.
  The raw list purpose accepts `"marketing"`, `"transactional"`, or omission;
  platform sync omits it to inspect both purposes. There is no default where an
  explicit `undefined` accidentally becomes `"marketing"`.
- Existing `listEmailTemplates`, `createEmailTemplate`, and
  `updateEmailTemplate` remain marketing-only facades that map the raw DTO to
  `FrontlitEmailTemplate`. Their public routes and API-contract response shape
  do not gain `purpose`. Platform creation passes `purpose: "transactional"` to
  the raw helper.
- Add `getSendlitSendingOptions(apiKey, {timeoutMs?})`; reuse the existing
  `getGeneralSettings` transport with the optional timeout for delivery
  preflight. Both call SendLit's existing endpoints.

### 6.3 Call-site migrations

- **`auth/better-auth.ts`** — `sendOtpEmail` calls
  `sendPlatformEmail("otp", { otp }, { to, subject, idempotencyKey })`.
  `sendVerificationOTP` generates `frontlit:otp:<random UUID>` once at the start
  of each callback invocation and passes it through `sendOtpEmail`; every
  timeout, transport retry, and template-repair retry within that invocation
  reuses it. A later callback always gets a new key even when Better Auth issues
  the same six-digit OTP to the same address, so SendLit's durable idempotency
  record cannot suppress a future valid challenge. Existing
  `MailNotConfiguredError` swallow (OTP issuance succeeds locally without
  mail) is preserved as a defensive runtime fallback; normal configured-send
  misconfiguration is rejected at boot.
- **`team/invitation-email.ts`** — supplies invitation variables to the
  transactional template; subject stays `Join <team> on FrontLit`;
  `InvitationDeliveryError` mapping unchanged. `InvitationEmailInput` gains
  `invitationId` and the exact persisted `tokenHash` from
  `teamInvitations`; the idempotency key hashes those two values. Retrying one
  issuance deduplicates, while resend's newly rotated `tokenHash` produces a
  new delivery.
- **`tickets/notify.ts`** — `mailboxHeaders` returns
  `{replyTo, headers}` where `headers` carries only `In-Reply-To` and
  `References`. SendLit owns the actual `Message-ID` because it persists that
  value in its outbound ledger and passes it to the ESP; FrontLit must not try
  to override it through custom headers. The three notify functions use their
  dedicated transactional templates and structured Liquid variables. The
  hand-built `text` part is dropped (HTML-only transport). Reply-token routing
  is unaffected: replies still go to `reply+<token>@…` via `replyTo`.

    Notification inputs also gain a stable event identifier. Ticket-mail outbox
    deliveries use `ticket_mail_outbox.id`. Every direct agent/requester
    notification—including a newly created ticket and an inbound-email
    reply—uses the corresponding persisted `ticket_messages.message_id`.
    `addTicketMessage()` results must therefore be retained and passed through
    by the public route, agent route, MCP tool, and inbound-mail path; the
    optional inbound RFC `Message-ID`/`inbound_emails` row remains only a receive
    deduplication mechanism. Keys are `frontlit:ticket:` plus a hash of
    notification kind, event ID, and recipient. No key is derived from mutable
    prose or ticket ID alone.

### 6.4 Accepted shared-team coupling

The one-team decision intentionally means all platform categories share
SendLit's team-scoped suppression list and transactional rate limit. A
recipient suppressed following a ticket email can therefore also be unable to
receive an OTP, and a ticket burst can consume the platform team's send
budget. This is accepted for the current scale. FrontLit will preserve
SendLit's stable `recipient_suppressed` / `too_many_requests` detail in
sanitized structured logs and metrics so the decision can be revisited with
evidence; it will not add a suppression bypass or a second team in this PRD.

## 7. Self-hosting

The two Compose files have deliberately different roles:

- `docker-compose.local.yml` runs development dependencies only; FrontLit runs
  on the host and defaults to console platform mail.
- `docker-compose.yml` is the production self-host product. Its FrontLit API
  uses SendLit when given a preconfigured platform-team key and otherwise dumps
  platform messages to its console.

### 7.1 Local host development

`docker-compose.local.yml` gains no FrontLit service and no platform-mail
credential plumbing. With the host API's default non-production configuration,
platform messages are dumped to the terminal and login works without an ESP or
platform team. Tenant SendLit development remains available through the
dependency container.

A developer who wants the real path provides
`SENDLIT_PLATFORM_TEAM_API_KEY`. This is optional local setup, not the default.

### 7.2 Production Compose contract

In `docker-compose.yml`'s `frontlit-api.environment`, the five `EMAIL_*`
passthroughs are replaced by:

```yaml
SENDLIT_PLATFORM_TEAM_API_KEY: ${SENDLIT_PLATFORM_TEAM_API_KEY:-}
SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS: ${SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS:-5000}
```

`SENDLIT_API_URL` keeps its existing in-network default. When present, the key
is a normal Compose environment secret reused by every replica and restart.
When absent, the API logs platform messages. `frontlit-api` starts only after
the existing SendLit healthcheck succeeds; with a key, its boot initializer
validates the preconfigured team's delivery prerequisites and synchronizes the
code-owned templates.

Compose's `frontlit-api` container healthcheck deliberately remains on
`/health`: Docker provides only one health status and this check is liveness,
not dependency readiness. The operator waits for application readiness before
exposing the deployment:

```bash
docker compose exec frontlit-api node -e "fetch('http://127.0.0.1:4000/ready').then(async r => { if (!r.ok) { console.error(await r.text()); process.exit(1); } }).catch(e => { console.error(e); process.exit(1); })"
```

Hosted deployment manifests use `/health` for liveness and `/ready` for
readiness. No deployment using a platform key may route a new replica based
only on the Compose/Docker liveness status.

### 7.3 First self-host bootstrap

SendLit organization, ESP, team, and key provisioning are one-time operator
setup; FrontLit owns template synchronization after that boundary.

1. Populate the existing required SendLit secrets, then start the SendLit side
   first:

    ```bash
    docker compose up -d postgres sendlit-redis sendlit-db-init sendlit-api
    ```

2. Read the one-time `organizationApiKey` from
   `docker compose logs sendlit-api` and store it as
   `SENDLIT_ORGANIZATION_API_KEY` in the root `.env`. FrontLit never scrapes the
   log itself.
3. Sign in to SendLit, connect/activate the organization's shared ESP, and make
   it the delivery policy's default. This must precede platform-team creation;
   otherwise SendLit's provisioning transaction rolls back with no partial team
   (the current public response is `500 server_error`).
4. Create the dedicated team with the stable external ID
   `frontlit-platform`, a legally correct mailing address, sender identity, and
   `delivery: {useOrganizationDefault: true}`. The provisioning response returns
   the team key on first creation; for a previously existing team, mint a team
   key deliberately through the UI or
   `POST /provisioning/teams/:teamId/keys`.
5. Store that value in the root `.env` as
   `SENDLIT_PLATFORM_TEAM_API_KEY`. It is the long-lived runtime credential and
   is not regenerated during normal FrontLit startup.
6. Start the full product with `docker compose up --build -d`. FrontLit validates
   delivery configuration, syncs the canonical templates, and becomes ready.
7. Run the §7.2 readiness command, then verify OTP, invitation, ticket reply
   threading, and SendLit's transactional log.

### 7.4 Key lifecycle

FrontLit only reads `SENDLIT_PLATFORM_TEAM_API_KEY`; it never creates, persists,
or rotates it. Normal restarts therefore reuse the same key without any SendLit
mutation. Operators rotate the key deliberately in SendLit, update the
deployment secret for all replicas, and restart them together.

## 8. Rollout

Self-host rollout follows §7.3: configure the organization/default shared ESP,
create the platform team and key once, put
`SENDLIT_PLATFORM_TEAM_API_KEY` in the root `.env`, and let
`docker-compose.yml` validate delivery and synchronize templates. Rollout waits
for `/ready` to catch an invalid key, unavailable organization delivery,
sender/mailing problems, or template collision.

Hosted/external-SendLit deployments use the same preconfigured-team key
contract. Hosted manifests configure separate `/health` liveness and `/ready`
readiness probes.

For both paths, delete `EMAIL_*` variables, drop nodemailer, then verify that a
sign-in OTP, invitation, and ticket notification arrive with working reply
threading and appear in the platform team's transactional log / org Activity.

Local development remains zero-config because `docker-compose.local.yml` does
not run FrontLit and an unset key selects console delivery. Providing the key
exercises the real path end-to-end.

Update the root/API environment examples, root `README.md`, and the self-hosting
documentation to use the §7.3 ordering and clearly distinguish the organization
provisioning key from the platform team's runtime key.

## 9. Behavior changes

- **From identity**: platform mail displays the platform team's sender
  (grant `fromName` / org ESP `fromEmail`). Ticket notifications no longer
  show `Support <support@<subdomain>>` as From; Reply-To still routes replies
  correctly.
- **Async acceptance**: `POST /emails` returning `202` means queued, not
  delivered. Synchronous SMTP errors disappear; async failures surface in
  SendLit (`GET /emails/:txeId`, dashboard logs), not at the call site.
- **Bounded synchronous dependency**: FrontLit waits at most the configured
  platform-mail timeout per attempt and retries only with an idempotency key
  stable across that logical delivery's attempts.
- **Credential ownership**: the platform-team key remains a deployment-managed
  environment secret. FrontLit reads it but never persists, rotates, or logs it.
- **No text/plain part** for platform mail.
- **Templates are code-owned config**: editing a registry entry updates the
  SendLit template on the next process boot or after cache invalidation. A
  successful process does not re-list on every send. Manual SendLit edits can
  therefore remain visible until the next sync, then are overwritten.

## 10. Testing

Unit tests (vitest):

- `email/platform-mail.test.ts` — console fallback whenever the key is absent;
  invalid platform key failing readiness;
  background initialization backoff/recovery; ordinary variables contain
  `| escape` while only the typed ticket body is raw; sync creates missing /
  patches drifted / reuses cached IDs across sends; rejected sync promises are
  cleared; and a transactional/marketing title collision fails cleanly.
- Sender tests assert explicit organization delivery, mandatory non-empty
  idempotency keys, timeout/transient retry with the same key and a global
  three-attempt ceiling, no retry for `429`, structured missing-template
  repair, and terminal API/network wrapping as `MailDeliveryError`.
- `email/sendlit-client.test.ts` — the raw unfiltered template list preserves
  purpose while the existing marketing facade/public DTO does not change; JSON
  and non-JSON errors are parsed/sanitized correctly; `Retry-After` and the
  platform-only timeout are retained; a tenant-facing request receives no new
  implicit timeout; request bodies and API keys never appear in error logs.
- `utils/mail.test.ts` deleted with the module.
- `tickets/notify.test.ts` — mocks `sendPlatformEmail`; asserts each dedicated
  template key, structured variables (reply prose, URLs, deduped sources),
  `replyTo` token, `In-Reply-To`/`References`, absence of caller-supplied
  `Message-ID`, and event-derived idempotency keys.
- Invitation/auth suites assert that all attempts inside one OTP callback reuse
  its generated UUID, while two callback invocations with the same email and
  identical OTP still get different keys. Invitation retries reuse the
  `invitationId` + `tokenHash` key and token rotation changes it.
- Config tests cover console fallback without a key, SendLit selection with a
  key, invalid timeouts, and a missing SendLit URL when the key is configured.
- Readiness/metrics tests cover console readiness; initializing; unavailable or
  missing organization sending option, sender email, and mailing address;
  failed sync; cache invalidation; later recovery; ordinary send failures not
  draining a ready replica; `401`/`403` invalidating credential readiness
  without rotating; and sanitization of recipient/template variables from
  status and logs.

FrontLit also gets a Compose integration-test overlay, gated for the
integration-test job. It reuses the normal SendLit/Postgres/Redis services and
adds test-only Mailpit plus setup that uses SendLit's public API to configure an
active organization SMTP ESP/default policy, provisions the platform team, and
mints its test key before FrontLit starts. It supplies that same key to two
concurrently starting FrontLit API processes, which must converge on one set of
canonical templates using SendLit's title handling. It also
exercises HTML-escaping probes, a lost-response retry with one transactional
row, and actual MIME threading headers. No SendLit fixture or production code
is modified for this test. For the lost-response case, a disposable FrontLit
test reverse proxy sits in front of SendLit: it forwards the first
`POST /emails`, consumes the upstream acceptance, then closes the
FrontLit-facing connection without returning that response; the retry is
forwarded normally. The assertion verifies one SendLit transactional row and
one Mailpit message for the idempotency key.

Checks: `pnpm --filter @frontlit/api check-types`, `test`, lint.

## 11. Resolved decisions

- Invitations and each ticket-notification type use dedicated code-owned
  transactional templates with escaped Liquid variables and dynamic SendLit
  link blocks; no platform sender uses inline HTML or a raw HTML variable.
- An absent `SENDLIT_PLATFORM_TEAM_API_KEY` selects console delivery in every
  environment; local login does not require SendLit.
- `docker-compose.local.yml` remains dependency-only host development and uses
  that console fallback. Production `docker-compose.yml` passes through the
  optional preconfigured platform-team key, with its one-time
  organization/default-ESP/team/key bootstrap documented in §7.3.
- The platform team and key are operator-managed SendLit configuration.
  FrontLit validates the team and synchronizes templates, but never creates the
  team or mints, persists, or rotates its key.
- Every caller supplies a key stable for one logical delivery in this rollout;
  persisted events derive it from their immutable event identity, while each
  ephemeral Better Auth OTP callback generates one fresh UUID and reuses it for
  that callback's attempts. Retry deduplication is part of the initial
  migration, not future work.
- SendLit owns the outgoing `Message-ID`; FrontLit supplies only threading
  references and reply routing.
- Team-level suppression/rate-limit coupling across platform categories is an
  explicitly accepted tradeoff for the current scale (§6.4).
