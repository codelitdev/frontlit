# Embedded support (in-app chat)

Scope: letting a customer's signed-in users reach support from inside the
customer's own app in one click. The ticket arrives already showing who the
user is, their account, and what failed, and the conversation continues by
email once they leave.
Tracking issue: [#41](https://github.com/codelitdev/frontlit/issues/41).

Status: ready for implementation. Target customers are small and medium SaaS teams; scope is
sized for them and for an early-stage product.

## 1. Problem

A CourseLit customer's image uploads were failing in app.courselit.app. To
reach us they had to:

1. find our Discord server and sign in to it;
2. describe the problem from scratch;
3. answer "which school are you?" and similar questions before we could
   start debugging.

If FrontLit's chatbot had been embedded in the CourseLit dashboard, the
customer could have clicked **Contact support** next to the error, and the
ticket would have arrived showing the user, their school, the page and the
error.

## 2. Goals and non-goals

**Goals**

- A signed-in user of a customer's app reaches support in one click from
  inside that app.
- Support sees who the user is, their account in the customer's system, and
  the error context, without asking.
- The AI answers first when the docs can help; a human is always one click
  away; product bugs reach a human fast.
- Replies reach the user in the widget if they're there, and by email if
  they've left.
- The person is synced to SendLit (the CRM), and the ticket is linked to
  that contact.

**Non-goals (for now)**

- Automatic capture of console errors or usage events (telemetry).
- Identity asserted from the browser (signed tokens, HMAC in JS).
- An allowed-domains list for the embed.
- A companies/accounts model in FrontLit.
- Live-chat seats, SLAs, or agent presence.

## 3. Users

- **End user:** a signed-in user of the customer's app (e.g. a CourseLit
  school admin) who hits a problem.
- **Support agent:** a FrontLit team member who answers in the inbox.
- **Integrating developer:** the customer's engineer who adds the backend
  route and the loader.

## 4. What exists today

- **Chat iframe:** `apps/sites/app/sites/[teamId]/embed/chat/page.tsx`
  renders the chat UI. FrontLit-hosted sites show it through the React
  `ChatWidget` (`apps/sites/components/chat-widget.tsx`, rendered in
  `apps/sites/app/sites/[teamId]/(site)/layout.tsx`). `ChatWidget` is
  already careful about page speed: it starts after idle (`runWhenIdle`),
  loads the panel lazily (`next/dynamic`), and mounts the iframe only while
  the panel is open, so polling stops when it's closed. It's still a React
  client component that every public page loads and hydrates.
- **Unused host-based loader:**
  `apps/sites/app/sites/[teamId]/embed/chat.js/route.ts` serves a script
  meant for external sites (`<script src="https://<team-host>/embed/chat.js">`,
  architecture.md §7.3). Nothing uses it: hosted sites use `ChatWidget`, and
  no dashboard screen or user doc points to it. It also sets iframe URLs as
  relative paths (`/embed/chat`), so on a third-party site it would load that
  site's own page. This PRD replaces it (§6.3).
- **Chats are tickets:** there is no separate chat entity. A widget chat is
  a `tickets` row with `source = "chatbot"`, and its messages are
  `ticket_messages` (`author`: `requester` | `agent` | `bot`). The widget
  polls for new messages every 2s (`apps/sites/lib/use-visitor-chat.ts`).
  Attachments work.
- **AI replies and handoff:** per-channel `autoReply` policy
  (`apps/api/src/inbox-ai/policy.ts`). The bot escalates when retrieval finds
  nothing, and, with `escalateOnVisitorRequest`, when the visitor asks for a
  human (`HANDOFF:visitor_request` in `apps/api/src/inbox-ai/completion.ts`).
- **Contacts live in SendLit.** FrontLit stores no contact data. Creating
  a ticket with a `requesterEmail` queues a `contact_sync` outbox job
  (`apps/api/src/tickets/queries.ts`) that upserts the SendLit contact and
  tags it (`apps/api/src/email/worker.ts`). Tickets have no link back to the
  contact, only `requesterEmail` / `requesterName` text.
- **Ticket mail:** `ticket_mail_outbox` with kinds `receipt` and `reply`.
  `reply` mail is sent today only for AI replies on the `tickets` channel
  (`apps/api/src/inbox-ai/generate.ts`), not for chatbot tickets or agent
  replies.

**Gaps**

- **No working embed for other sites:** the only loader is the unused
  host-based one above, and it has no JS API.
- **Anonymous chats:** the only link to a visitor is a token in
  localStorage. No identity, account or context, and no way to reach them
  after they close the tab.
- **Eager loading and polling (old loader only):** the unused `chat.js`
  loader creates the iframe on page load and keeps it (hidden) when closed,
  so the widget polls every 2s whenever a conversation exists. `ChatWidget`
  doesn't have this problem.
- **No current users:** nobody uses the chat today, FrontLit included, so
  the widget can be reworked freely.

## 5. User experience

**End user (CourseLit example)**

1. An upload fails. The error message has a **Contact support** button.
2. Clicking it opens the FrontLit chat over the dashboard, with "My image
   upload failed" prefilled. If they already have an open conversation, they
   see it instead. The ticket is created when they send.
3. The AI replies. If the docs explain the error (e.g. a file size limit),
   it says so. If not, it says the team has been notified.
4. **Talk to a human** is visible from the first message.
5. After a handoff: "Handed to the team, we'll reply here or by email."
6. If they stay, replies appear in the chat. If they leave, they get an email
   and can continue from it.

**Support agent**

- The ticket header shows e.g. **Jane · Acme Academy · CourseLit user
  `user_8f2…`**, plus the page, error and request ID.
- They can search the inbox by the host app's user ID and find all of that
  user's tickets.

**Integrating developer**

- Add one backend route that calls `POST /support-sessions` with the API key.
- Add the snippet (queue stub, `init` with the team ID, and the static
  loader) to the app.
- Call `FrontLit.open({ token })` from a Help or Contact support button.

## 6. Design

### 6.1 Flow

A signed-in customer reaches out through the bot → FrontLit (ticket) →
SendLit (contact, the CRM). The host app's backend already knows the
signed-in user, their account and what just failed, so identity and context
come **from the host's server, at the moment the user asks for help**. The
browser never claims an identity.

```
Host frontend ──click──▶ Host backend ──API key──▶ FrontLit POST /support-sessions
      │                                                   │ saves a support_sessions row
      │◀──────────── { token, url } ◀─────────────────────┘ (no ticket yet)
      │
      └─ FrontLit.open({ token }) ─▶ widget iframe (created on first open)
                                       │ shows the user's open ticket, or a blank chat
                                       │ first message ──▶ ticket created
                                       │                   (requester snapshot + context)
                                       │                   queues contact_sync
                                       ▼                          │
                         widget switches to a ticket access grant  ▼
                                                    SendLit upserts contact
                                                    (customFields: externalId, account)
                                                          │
                                     tickets.contactId ◀──┘ written back by the worker
```

### 6.2 Support sessions

Server to server, API key with the `support:sessions` scope (§8):

```
POST /support-sessions
{
  contact: { email, name?, externalId? },   // externalId = host app's user ID
  account?: { id, name?, url? },            // e.g. the CourseLit school
  context?: { page?, error?, requestId?, appVersion?, ... },  // free-form JSON, size-capped
  message?: "My image upload failed"        // optional prefilled first message
}
→ { token, url, expiresAt }
```

- **Minting a session doesn't create a ticket.** It saves a short-lived
  `support_sessions` row: hashed token, team, requester (email, name,
  external ID, account), context, optional prefilled message, and
  `expiresAt` (about 1 hour). Opening Help and closing it again leaves
  nothing in the inbox.
- **Opening the widget** (public, called by the iframe):

  ```
  POST /public/{teamId}/support-sessions/open
  { token }
  → { ticket: { ticketId, accessToken } | null,
      prefill: "My image upload failed" | null,
      requester: { name } }
  ```

  - Rejects (`401`) a missing, expired or other-team token.
  - If the requester (matched by external ID, otherwise email) has an open
    `chatbot` ticket, returns it with a fresh ticket access grant
    (`ticket_access_grants`, `apps/api/src/inbox-ai/grants.ts`, the same
    kind the magic links in emails use) and replaces the ticket's context
    with the session's. The widget then loads it through the existing
    message endpoints, so someone who comes back after an email reply sees
    the ongoing thread.
  - Otherwise returns `ticket: null` and the widget shows a blank chat, with
    `prefill` in the composer.
  - Can be called more than once while the session is valid (e.g. the iframe
    reloads).
- **First message** (when `open` returned `ticket: null`): the widget calls
  the existing chat endpoint with the session token instead of a
  conversation:

  ```
  POST /public/{teamId}/chat
  { message, sessionToken, attachmentIds? }
  → { conversationId, conversationToken, answer, ... }   // unchanged shape
  ```

  It creates the ticket (`source = "chatbot"`, requester snapshot and context
  from the session, §6.4–6.5, no receipt email), adds the message, runs the
  AI as usual, queues `contact_sync`, and returns a ticket access grant as
  `conversationToken`. If an open ticket appeared in the meantime (another
  tab), it adds the message to that ticket instead of creating a second
  one. The attachment presign endpoint takes `sessionToken` the same way,
  for a file sent before any text. Reusing the chat endpoint keeps one code
  path for AI replies and attachments; there is no separate
  `support-sessions/messages` endpoint.
- **After that the session token's job is done.** The widget uses the ticket
  access grant with the existing public ticket message endpoints. No second
  token type to maintain.
- `url` opens the same chat as a standalone page on the widget host (popup or
  new tab) for hosts that don't want the widget.

This works like Stripe Checkout sessions: no crypto in customer code, and
the identity and context can't be faked from the browser. The API key is the
trust boundary, so identified chats don't need an allowed-domains list.

Per the parity rule (architecture.md §2), the endpoint lives in
`packages/api-contract` and a `support` queries function, with a matching MCP
tool (cheap, since it's the same function).

### 6.3 Loader and JS API (GA-style snippet)

Replace the host-based loader with the conventional pattern used by Google
Analytics, Intercom and Crisp: **one static loader at a fixed address, and the
team ID passed in an `init` call.** The fixed address is
`https://embed.frontlit.app/chat.js`.

```html
<script>
  window.FrontLit = window.FrontLit || {
    q: [],
    push(...a) {
      this.q.push(a);
    },
  };
  FrontLit.push("init", { teamId: "tm_abc123" });
</script>
<script async src="https://embed.frontlit.app/chat.js"></script>
```

- **Dedicated host: `embed.frontlit.app`.** The sites app serves the widget
  on this one host, and serves nothing else there:
  - `/chat.js`: the static loader, identical for every team (caching in
    §6.8);
  - `/<teamId>/config`: public, cacheable widget settings (enabled, layout,
    bubble style, name, theme colours);
  - `/<teamId>/chat`: the chat UI iframe (the existing `/embed/chat` page,
    with the team taken from the path).

  In `apps/sites/proxy.ts`: if the host is the `EMBED_ORIGIN` host, serve these routes
  (outside `app/sites/[teamId]`) and skip team resolution. No other host
  serves the settings or the chat iframe. The one exception is the static
  loader file, also served as `/embed/chat.js` on every host for hosted
  sites (§6.8); it's our own code that runs in the host page anyway.
- **Why a dedicated host (security).** Sites render team-written HTML and
  scripts on the site's own origin (the Embed block uses
  `dangerouslySetInnerHTML`, `packages/page-builder/src/components/inline-embed.tsx`).
  If widget paths worked on every host, one team's page scripts could load
  and drive another team's chat on their own origin, and `frontlit.app`
  would share its origin with marketing scripts. A dedicated origin runs only
  FrontLit's widget code, the same pattern Intercom (`widget.intercom.io`)
  and Crisp (`client.crisp.chat`) use.
- **Setup:**
  - add `embed` to `RESERVED_SUBDOMAIN_LABELS`
    (`apps/api/src/domains/queries.ts`) so no team can claim it;
  - `/public/tls-ask` approves `embed.<PLATFORM_SITE_DOMAIN>`, so Caddy's on-demand TLS issues
    its certificate (today it only approves hosts `resolveHost` knows);
  - DNS: covered by the `*.frontlit.app` wildcard that team subdomains
    already use (confirm before rollout);
  - locally, e.g. `embed.localhost:3002`.
- **Why this pattern:** the address never changes when a team renames its subdomain or
  switches custom domains, the loader is one cacheable file, and the iframe
  always loads from a known origin (the old relative-URL problem can't
  happen). The cost is one small settings request before the bubble shows.
- **The team ID is public**, like a GA measurement ID. Anyone could already
  embed a team's anonymous bot by copying a tag, so nothing gets worse;
  allowed domains (§11) are the protection against misuse.
- **Launcher option.** `init` takes `launcher`:
  - `true` (default): show the floating bubble, styled from the team's
    settings. Clicking it calls `FrontLit.open()`.
  - `false`: show nothing until the host calls `FrontLit.open(...)` from its
    own button. This is the in-app case (CourseLit's **Contact support**).
    The panel still has its own close button.

  ```js
  FrontLit.push("init", { teamId: "tm_abc123", launcher: false });
  ```
- **Lazy iframe.** The loader shows only the launcher (or nothing with
  `launcher: false`). The iframe is created on the first `open`. For the
  `text_input` variant the launcher is a composer look-alike; clicking it
  opens the docked chat, which the loader grows from 72px to at most 70%
  of the page height.
- **JS API**, a single global **`window.FrontLit`** (no aliases like `fl` or
  `frontlit`):
  - `FrontLit.push("init", { teamId, launcher? })`, or
    `FrontLit.init({ ... })` once loaded.
  - `FrontLit.open({ token })`: open the widget for a support session.
  - `FrontLit.open()`: open the anonymous chat.
  - `FrontLit.close()`.

  Calls made before the loader finishes go into `q`, and the loader replays
  them in order.
- **One loader, two delivery modes** (details in §6.8). FrontLit-hosted
  sites use the same loader with inline settings, served from the site's own
  origin, and `ChatWidget` is removed. Nobody uses the chat yet, so there's
  nothing to keep working in parallel.
- **Remove the old loader:** delete `embed/chat.js/route.ts`, its entry in
  the edge-cache rules (`apps/sites/lib/edge-cache.ts` and its test), and
  update architecture.md §7.3. There's no production deployment yet, so no
  migration is needed.
- The loader passes the token to the iframe in the URL fragment or by
  `postMessage`, not a query string, so it stays out of server logs.
- **Session chats are never written to localStorage.** The anonymous widget
  stores its conversation under `chat:<api>:<team>`
  (`apps/sites/lib/use-visitor-chat.ts`). A session chat stays in memory
  only, so it can't leak to the next person on a shared computer, survive the
  host app's logout, or show up in the anonymous widget on the marketing
  site. The host mints a fresh session on every Help click.
- **Poll only while the panel is open and the tab is visible.** Closing the
  panel removes the iframe (as `ChatWidget` does today), and a hidden tab
  pauses polling. The loader keeps the last session token in memory, so
  reopening calls `support-sessions/open` again and gets the same ticket
  with a fresh grant. If the session has expired (`401`), the widget says
  so and the host's button mints a new one on the next click. The same open-and-visible condition drives `seenAt`
  (§6.7).

### 6.4 Requester on the ticket, contact in SendLit

- **Snapshot on the ticket.** Like `requesterEmail` / `requesterName` today,
  the ticket stores `requesterExternalId` and a small `requesterAccount` JSON
  (`{ id, name, url }`) from the session. The inbox header and search read
  only the ticket, so support keeps working when SendLit is down or not set
  up.
- **SendLit stays the CRM.** SendLit contacts already support `customFields`
  (set on create, merged on update). `contact_sync` passes
  `{ externalId, accountId, accountName, accountUrl }` as custom fields and
  tags the contact `source:in-app`. `upsertContact` in
  `apps/api/src/email/sendlit-client.ts` currently sends only email, name and
  tags, so it needs extending.
- **`tickets.contactId`** (nullable text) holds the SendLit contact ID. The
  `contact_sync` payload carries the ticket ID, and the worker writes
  `contact.contactId` back after the upsert. This applies to every ticket
  source with an email (form, email, API, chatbot). It stays null for
  anonymous chats and for teams without SendLit, and gets filled if an
  anonymous chat later gets an email. Nothing in support depends on it
  being set.
- **Matching in both directions:**
  - Ticket → host system: the ticket view shows the external ID, account
    and request ID.
  - Host user → tickets: inbox search by external ID, a local query on
    `tickets.requesterExternalId`.

### 6.5 Incident context on the ticket

- A `context` JSONB column on `tickets`, for incident data only (page, error,
  request ID, app version).
- Size-capped (e.g. 8 KB) and stored as given. It's shown to agents and
  passed to the AI, never rendered as HTML.
- The inbox ticket view shows the requester snapshot (name, email, external
  ID, account) and the context fields.

### 6.6 Who answers: AI first, human one click away

The AI's reply is a head start, not a gate the user has to get past.

- The AI replies first under the existing chatbot `autoReply` policy. Session
  tickets are chatbot tickets, so there's no new setting.
- **Talk to a human** is visible from the first message. Clicking it
  escalates the ticket directly (the same outcome as
  `HANDOFF:visitor_request`), without going through the AI.
- The AI hands off when retrieval finds nothing, when the user asks for a
  person, or when the context shows a product bug.
- The ticket is in the inbox from the first message, so an agent can step in
  at any point.
- **Session has `context.error`:** treat it as a likely bug.
  - **In code:** if `context.error` is set and retrieval finds no relevant
    docs, escalate. This builds on the existing "no grounding → escalate"
    rule, so the common case doesn't depend on the prompt.
  - **In the prompt:** when docs do match, the AI acknowledges the error,
    checks for a known limit (size, format, etc.) and asks for any missing
    details. If the docs don't explain it, it escalates with a short summary
    for the agent. It must not reply with generic tips.
- **No error (a "how do I…" question):** normal AI-first answering.
- After a handoff, the user sees: "Handed to the team, we'll reply here or
  by email."

### 6.7 Reply delivery: widget if they're there, email if they're away

- `ticket_messages.seenAt` (nullable). The widget marks agent and bot
  messages seen only when the chat panel is open **and**
  `document.visibilityState === "visible"`.
- When an agent replies (or the AI replies on a ticket with a
  `requesterEmail`), queue a `reply` mail in `ticket_mail_outbox` with
  `nextAttemptAt = now + 2 minutes`. No new scheduler: the existing mail
  worker already picks up rows by `nextAttemptAt`.
- When the worker picks it up: all replies seen → mark the row done without
  sending. Any unseen → send one email with all unseen replies and a magic
  link back to the conversation. If a pending row already exists for the
  ticket, don't queue another, so a burst of replies becomes one email.
- Agent replies send no email today (only AI replies on the `tickets`
  channel do), so this adds that for chatbot tickets.
- Anonymous chats have no email address, so their replies only show up in
  the widget.

### 6.8 Page speed: public pages must not get slower

Fast, SEO-friendly sites and docs are FrontLit's main selling point, so the
widget must cost public pages nothing measurable.

**Where the loader lives and how it's served**

| What          | Where                                                 |
| ------------- | ----------------------------------------------------- |
| Loader source | `apps/sites/embed/chat.ts` (plain TS, no React)       |
| Built loader  | `apps/sites/public/embed/chat.js` (gitignored)        |
| Settings      | `apps/sites/app/embed/[teamId]/config/route.ts`       |
| Chat iframe   | `apps/sites/app/embed/[teamId]/chat/page.tsx`         |

`bun build apps/sites/embed/chat.ts --minify` runs before `next build` (and
in watch mode during `dev`). The loader is identical for every team, so
it's a static file, not a route handler. The sites image ships it; there's
nothing new to deploy.

**Two delivery modes for the same loader**

| | External sites (CourseLit) | FrontLit-hosted sites and docs |
| --- | --- | --- |
| Loader URL | `https://embed.frontlit.app/chat.js` | `/embed/chat.js` on the site's own host |
| Settings | fetched from `embed.frontlit.app/<teamId>/config` | written into `init` by the site layout: `FrontLit.push("init", { teamId, config })` |
| When it loads | `async` | after idle (`runWhenIdle`, as `ChatWidget` does today) |
| Requests to `embed.frontlit.app` before open | loader + settings | **none** |

- The **loader** (`/embed/chat.js`) is served on every host because it's our
  own static code running in the host page either way. The **chat iframe**
  (`/<teamId>/chat`) stays on `embed.frontlit.app` only, so the security
  reasoning in §6.3 still holds.
- Hosted pages don't open a connection to a new origin (DNS + TLS, roughly
  100–300 ms on mobile) or wait for a settings request.
- Replacing the React `ChatWidget` with a small vanilla loader started after
  idle means less JavaScript to load and hydrate than today.

**Budget**

- Loader ≤ 5 KB gzipped, no dependencies, no React. Checked in CI.
- No work before idle on hosted pages; `async` on external sites.
- The bubble is `position: fixed` and inserted outside the page flow, so it
  never shifts layout (CLS 0).
- Chatbot disabled → nothing is added to the page (as today).
- The iframe loads only on open. On bubble hover or focus, the loader adds a
  `preconnect` to `embed.frontlit.app`, so opening stays quick and only
  visitors about to chat pay for the connection.

**Caching**

| Resource                    | Cache-Control                                                   |
| --------------------------- | --------------------------------------------------------------- |
| `chat.js` (both hosts)      | `public, max-age=300`, longer at the CDN, purged on deploy      |
| `<teamId>/config`           | short browser cache, purged when chatbot settings are saved     |
| `<teamId>/chat` (iframe)    | `private, no-store` (dynamic; the token is in the URL fragment) |

With settings inlined into hosted pages, saving chatbot settings must also
purge the team's cached pages, using the existing edge-cache tags
(`apps/sites/lib/edge-cache.ts`). Pages stay host-independent and
cacheable.

**SEO:** no iframe or extra content is added to the HTML, and the bubble is
a `<button>` with an `aria-label`. Crawlers see nothing new.

**Measuring:** compare LCP, CLS and INP on a hosted page and a docs page
before and after, with Lighthouse and the existing `WebVitalsBeacon` RUM
data the sites app already collects.

## 7. Data model changes

| Table              | Change                                                       |
| ------------------ | ------------------------------------------------------------ |
| `support_sessions` | new: hashed token, team, requester, context, message, expiry |
| `tickets`          | `requester_external_id text null`                            |
| `tickets`          | `requester_account jsonb null`                               |
| `tickets`          | `contact_id text null` (SendLit contact ID)                  |
| `tickets`          | `context jsonb null` (incident context)                      |
| `ticket_messages`  | `seen_at timestamp null`                                     |

Plus: the `contact_sync` payload gains `ticketId`, `externalId` and
`account`; `upsertContact` accepts `customFields`. Expired
`support_sessions` rows can be deleted by any existing cleanup job, or left
alone; they're small.

## 8. Security and privacy

- `POST /support-sessions` accepts a new, narrow **`support:sessions`** API
  key scope (`api_keys.scope`, chosen when the key is created; existing keys
  are `full`). Team API keys otherwise have full-team authority, including
  reading and changing every ticket. A `support:sessions` key is refused
  (403) on every other REST route and on MCP, checked in the auth middleware
  every API-key request passes. A leaked CourseLit server key can start
  chats under any name but can't read or change the inbox.
- The endpoint must only be called from the host's server, never from the
  browser. The docs say so explicitly.
- Session tokens are random, stored hashed, expire after about 1 hour, and
  can only start or resume that requester's chat. After the first message
  the widget uses a normal ticket access grant.
- Session chats are kept in memory only, never in localStorage (§6.3).
- Tokens are passed to the iframe outside the query string.
- `context` is untrusted text from the customer's app. It's size-capped,
  escaped when shown, and treated as data (not instructions) in the AI
  prompt.
- External IDs and account data are sent to SendLit, which is already the
  team's system of record for contacts.

## 9. Tasks

Four phases, each a PR with its own e2e smoke. CourseLit integrates after
the whole of #41 is released.

**Phase 1: widget and loader**

- [ ] `embed.frontlit.app` (`EMBED_ORIGIN`) in `apps/sites/proxy.ts`, served
      only on that host: static `/chat.js`, public `/<teamId>/config`, and
      the chat iframe at `/<teamId>/chat`. Reserve the `embed` subdomain
      label; approve the host in `/public/tls-ask`.
- [ ] Static loader: `init` (`teamId`, `launcher`), `window.FrontLit`
      (`open`, `close`), replay queued calls, iframe created on first open.
- [ ] Widget: poll only while the panel is open and the tab is visible.
- [ ] Loader build (`bun build` before `next build`, watch in `dev`); serve
      `/embed/chat.js` on every host and on `embed.frontlit.app/chat.js`
      with the caching in §6.8; CI check on gzipped size (≤ 5 KB).
- [ ] FrontLit-hosted sites: loader from the site's own origin after idle,
      settings inlined into `init`, `preconnect` on bubble hover/focus;
      remove `ChatWidget`. Saving chatbot settings purges the team's cached
      pages.
- [ ] Remove the old host-based loader (`embed/chat.js/route.ts`, its
      edge-cache handling and test) and update architecture.md §7.3.

**Phase 2: support sessions and requester**

- [ ] `support:sessions` API key scope.
- [ ] `support_sessions` table; `POST /support-sessions` (contract, queries,
      route, MCP tool).
- [ ] `POST /public/{teamId}/support-sessions/open`, and `sessionToken` on
      the public chat and attachment presign endpoints.
- [ ] Widget with a session token: call `open`, show the open ticket or a
      blank chat with the prefill, create the ticket on the first message;
      keep it in memory only (no localStorage).
- [ ] `tickets.requesterExternalId`, `requesterAccount`, `context`; inbox
      ticket view shows them; inbox search by external ID.
- [ ] `contact_sync`: `customFields` (external ID, account), carry the
      ticket ID, write `tickets.contactId` back.
- [ ] Docs: "Add in-app support to your product" (backend session route,
      snippet with `launcher: false`, Contact support button).
- [ ] Copy-ready embed snippet on the Chatbot settings page (team ID and
      this environment's embed host filled in; bubble or own button).

**Phase 3: who answers**

- [ ] Pass ticket context to the AI prompt; escalate in code when
      `context.error` is set and retrieval finds nothing; prompt rules from
      §6.6.
- [ ] Widget: always-visible **Talk to a human**, and the post-handoff
      message.

**Phase 4: reply delivery**

- [ ] `ticket_messages.seenAt`, set by the widget only when the panel is
      open and the tab is visible.
- [ ] Delayed `reply` mail through `ticket_mail_outbox` (`nextAttemptAt`
      +2 min, skip if all seen, one pending row per ticket), including agent
      replies.

**After release**

CourseLit integrates only once #41 has shipped:

- [ ] First integration: CourseLit dashboard (session route, snippet,
      Contact support on upload errors).

## 10. Acceptance criteria

- [ ] In CourseLit, a failed upload shows **Contact support**. Clicking it
      opens the widget, and after the first message the FrontLit ticket
      shows the user, the school (name and URL), the page and the error,
      without anyone asking.
- [ ] Opening Help and closing it without sending a message creates no
      ticket; reopening within the session (or reloading) works.
- [ ] A user with an open ticket who clicks Help again sees the same
      conversation.
- [ ] The ticket shows the CourseLit user ID and school, and searching the
      inbox by that user ID finds it, even with SendLit unavailable.
- [ ] The SendLit contact has the CourseLit user ID and school in custom
      fields, and the ticket's `contactId` points to it.
- [ ] The AI answers from docs when it can, and handing off keeps all the
      context.
- [ ] For the CourseLit upload bug, the AI doesn't reply with generic tips.
      It hands off quickly with a summary, and the user is told a human will
      reply.
- [ ] **Talk to a human** works from the first message and escalates the
      ticket.
- [ ] With the widget open and visible, an agent's reply appears in the
      widget and no email is sent.
- [ ] With the widget closed, the user gets one email with the reply(ies)
      and can continue the conversation from it.
- [ ] The same snippet (`https://embed.frontlit.app/chat.js` plus team ID)
      works on app.courselit.app and on a FrontLit-hosted site, and
      `FrontLit.open()` works when called before the loader has finished.
- [ ] With `launcher: false` no bubble appears, and the chat opens only from
      the host's own button.
- [ ] Widget routes respond only on `embed.frontlit.app` (not on team
      hosts), and no team can claim the `embed` subdomain.
- [ ] Changing the team's subdomain or custom domain doesn't break an
      existing embed.
- [ ] No iframe is loaded and no polling happens until the user opens the
      widget; polling stops when the panel is closed or the tab is hidden.
- [ ] On a FrontLit-hosted page, no request goes to `embed.frontlit.app`
      before the chat is opened.
- [ ] LCP, CLS and INP on a hosted page and a docs page don't regress
      compared with before (Lighthouse and `WebVitalsBeacon` data); CLS
      from the bubble is 0.
- [ ] The loader is ≤ 5 KB gzipped, enforced in CI.
- [ ] After logging out of CourseLit (or on a shared browser), the previous
      user's support chat isn't visible in the widget.
- [ ] A `support:sessions` key can't list or read tickets; an expired or
      bad session token can't start or read a chat.
- [ ] Full e2e browser smoke, locally and on QA.

## 11. Later

- Allowed domains (`frame-ancestors`) for the anonymous embed, to protect AI
  usage.
- Opt-in telemetry: automatic capture of client errors and usage events, with
  consent and PII controls.
- Proper accounts/companies in SendLit, if account custom fields on contacts
  stop being enough.
- Support history on the SendLit contact view.
