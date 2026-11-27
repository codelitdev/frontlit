# Embedded support (in-app chat)

Scope: letting a customer's signed-in users reach support from inside the
customer's own app in one click. The ticket arrives already showing who the
user is, their account, and what failed, and the conversation continues by
email once they leave.
Tracking issue: [#41](https://github.com/codelitdev/frontlit/issues/41).

Status: proposed. Target customers are small and medium SaaS teams; scope is
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
  `apps/sites/app/sites/[teamId]/(site)/layout.tsx`).
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
- **Eager loading and polling:** `ChatWidget` and the old loader create the
  iframe on page load, and the widget polls every 2s whenever a conversation exists, even with the
  panel closed. Fine on a marketing site; wasteful in a dashboard every user
  keeps open.

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
- **Opening the widget with a session token:**
  - If the requester (matched by external ID, otherwise email) has an open
    `chatbot` ticket, the widget shows that conversation, so someone who
    comes back after an email reply sees the ongoing thread. The new
    session's context replaces the ticket's context.
  - Otherwise the widget shows a blank chat, with `message` prefilled in the
    composer if it was given.
- **First message:** the public message endpoint accepts the session token,
  creates the ticket (`source = "chatbot"`, requester snapshot and context
  from the session, §6.4–6.5), adds the message (which triggers the AI as
  usual), and queues `contact_sync`.
- **After that the session token's job is done.** The widget gets a normal
  ticket access grant (`ticket_access_grants`, `apps/api/src/inbox-ai/grants.ts`)
  for that ticket, the same kind the magic links in emails use. No second
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
team ID passed in an `init` call.**

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
<script async src="https://widget.<platform-domain>/chat.js"></script>
```

(`widget.<platform-domain>` is a placeholder; the real host depends on the
platform domain the sites app is set up with.)

- **Fixed widget host.** A reserved host in the sites app serves:
  - `/chat.js`: the static loader, identical for every team, cached for a
    long time;
  - `/t/<teamId>/config`: public, cacheable widget settings (enabled,
    layout, bubble style, name, theme colours);
  - `/t/<teamId>/chat`: the chat UI iframe (the existing `/embed/chat` page,
    with the team taken from the path).

  `apps/sites/proxy.ts` resolves a team from every host today, so this host
  skips the lookup.
- **Why:** the address never changes when a team renames its subdomain or
  switches custom domains, the loader is one cacheable file, and the iframe
  always loads from a known origin (the old relative-URL problem can't
  happen). The cost is one small settings request before the bubble shows.
- **The team ID is public**, like a GA measurement ID. Anyone could already
  embed a team's anonymous bot by copying a tag, so nothing gets worse;
  allowed domains (§11) are the protection against misuse.
- **Lazy iframe.** The loader shows only the bubble (or nothing, if the host
  opens the chat from its own button). The iframe is created on the first
  `open`.
- **JS API**, a single global **`window.FrontLit`** (no aliases like `fl` or
  `frontlit`):
  - `FrontLit.push("init", { teamId })`, or `FrontLit.init({ teamId })`
    once loaded.
  - `FrontLit.open({ token })`: open the widget for a support session.
  - `FrontLit.open()`: open the anonymous chat.
  - `FrontLit.close()`.

  Calls made before the loader finishes go into `q`, and the loader replays
  them in order.
- **One code path.** FrontLit-hosted sites get the same snippet injected by
  the site layout instead of rendering `ChatWidget` separately.
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
- **Poll only while the panel is open and the tab is visible.** Today the
  widget polls every 2s whenever a conversation exists, even with the panel
  closed. The same open-and-visible condition drives `seenAt` (§6.7).

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

## 7. Data model changes

| Table              | Change                                                        |
| ------------------ | ------------------------------------------------------------- |
| `support_sessions` | new: hashed token, team, requester, context, message, expiry  |
| `tickets`          | `requester_external_id text null`, `requester_account jsonb null` |
| `tickets`          | `contact_id text null` (SendLit contact ID)                   |
| `tickets`          | `context jsonb null` (incident context)                       |
| `ticket_messages`  | `seen_at timestamp null`                                      |

Plus: the `contact_sync` payload gains `ticketId`, `externalId` and
`account`; `upsertContact` accepts `customFields`. Expired
`support_sessions` rows can be deleted by any existing cleanup job, or left
alone; they're small.

## 8. Security and privacy

- `POST /support-sessions` needs a new, narrow **`support:sessions`** API
  key scope. Creating tickets today needs `helpdesk:write`
  (`apps/api/src/auth/operation-policy.ts`), which can also read, reply to
  and change any ticket. With the narrow scope, a leaked CourseLit server key
  can start chats under any name but can't read or change the inbox.
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

- [ ] Fixed widget host in the sites app (skips the host-to-team lookup):
      static `/chat.js`, public `/t/<teamId>/config`, and the chat iframe at
      `/t/<teamId>/chat`.
- [ ] Static loader: `init` with the team ID, `window.FrontLit` (`open`,
      `close`), replay queued calls, iframe created on first open.
- [ ] FrontLit-hosted sites use the same snippet instead of `ChatWidget`.
- [ ] Remove the old host-based loader (`embed/chat.js/route.ts`, its
      edge-cache entry and test) and update architecture.md §7.3.
- [ ] Widget: poll only while the panel is open and the tab is visible.
- [ ] `support:sessions` API key scope.
- [ ] `POST /support-sessions` (contract, queries, route, MCP tool) and the
      `support_sessions` table.
- [ ] Widget with a session token: show the requester's open ticket or a
      blank chat; keep it in memory only (no localStorage).
- [ ] Public message endpoint: accept a session token, create the ticket on
      the first message (requester snapshot, context), and hand back a ticket
      access grant.
- [ ] `tickets.requesterExternalId`, `requesterAccount`, `context`; inbox
      ticket view shows them; inbox search by external ID.
- [ ] `contact_sync`: `customFields` (external ID, account), carry the
      ticket ID, write `tickets.contactId` back.
- [ ] Pass ticket context to the AI prompt; escalate in code when
      `context.error` is set and retrieval finds nothing; prompt rules from
      §6.6.
- [ ] Widget: always-visible **Talk to a human**, and the post-handoff
      message.
- [ ] `ticket_messages.seenAt`, set by the widget only when the panel is
      open and the tab is visible.
- [ ] Delayed `reply` mail through `ticket_mail_outbox` (`nextAttemptAt`
      +2 min, skip if all seen, one pending row per ticket), including agent
      replies.
- [ ] Docs: "Add in-app support to your product" (backend session route,
      snippet, Contact support button).
- [ ] First integration: CourseLit dashboard (session route, snippet,
      Contact support on upload errors).

## 10. Acceptance criteria

- [ ] In CourseLit, a failed upload shows **Contact support**. Clicking it
      opens the widget, and after the first message the FrontLit ticket
      shows the user, the school (name and URL), the page and the error,
      without anyone asking.
- [ ] Opening Help and closing it without sending a message creates no
      ticket.
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
- [ ] The same snippet (fixed loader address plus team ID) works on
      app.courselit.app and on a FrontLit-hosted site, and `FrontLit.open()`
      works when called before the loader has finished.
- [ ] Changing the team's subdomain or custom domain doesn't break an
      existing embed.
- [ ] No iframe is loaded and no polling happens until the user opens the
      widget; polling stops when the panel is closed or the tab is hidden.
- [ ] After logging out of CourseLit (or on a shared browser), the previous
      user's support chat isn't visible in the widget.
- [ ] A `support:sessions` key can't list or read tickets; an expired or
      bad session token can't start or read a chat.
- [ ] Full e2e browser smoke, locally and on QA.

## 11. Later

- Copy-ready embed snippet and live preview on the Chatbot settings page.
- Allowed domains (`frame-ancestors`) for the anonymous embed, to protect AI
  usage.
- Opt-in telemetry: automatic capture of client errors and usage events, with
  consent and PII controls.
- Proper accounts/companies in SendLit, if account custom fields on contacts
  stop being enough.
- Support history on the SendLit contact view.
