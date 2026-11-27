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

- **Loader:** `apps/sites/app/sites/[teamId]/embed/chat.js/route.ts`
  serves a small script with bubble and docked layouts, using the team theme.
- **Chat iframe:** `apps/sites/app/sites/[teamId]/embed/chat/page.tsx`.
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

- **Bug (must fix):** the loader sets iframe URLs as relative paths
  (`frame.src = "/embed/chat"`, `dock.src = "/embed/chat?layout=docked"`).
  On a third-party site that loads the host's own `/embed/chat`, so the embed
  only works on FrontLit-hosted sites. (Found by reading the code; not yet
  confirmed in a browser.)
- **No JS API:** the loader runs in a self-contained function and exposes
  nothing to the page.
- **Anonymous chats:** the only link to a visitor is a token in
  localStorage. No identity, account or context, and no way to reach them
  after they close the tab.

## 5. User experience

**End user (CourseLit example)**

1. An upload fails. The error message has a **Contact support** button.
2. Clicking it opens the FrontLit chat over the dashboard. The first message
   ("My image upload failed") and the context are already attached.
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
- Add the snippet (queue stub plus loader) to the app.
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
      │                                                   │ creates ticket (+context)
      │◀──────────── { token, url } ◀─────────────────────┤ queues contact_sync
      │                                                   ▼
      └─ FrontLit.open({ token }) ─▶ widget iframe     SendLit upserts contact
                                     (loads ticket)     (customFields: externalId, account)
                                                          │
                                     tickets.contactId ◀──┘ written back by the worker
```

### 6.2 Support sessions

Server to server, API key auth:

```
POST /support-sessions
{
  contact: { email, name?, externalId? },   // externalId = host app's user ID
  account?: { id, name?, url? },            // e.g. the CourseLit school
  context?: { page?, error?, requestId?, appVersion?, ... },  // free-form JSON, size-capped
  message?: "My image upload failed"        // optional first requester message
}
→ { token, url, ticketId }
```

- Reuses the requester's open `chatbot` ticket for this contact if there is
  one; otherwise creates a ticket (`source = "chatbot"`) with
  `requesterEmail` / `requesterName` from `contact` and `context` attached.
  A new session on a reused ticket replaces `context` with the latest one.
- If `message` is set, it's added as the first requester message, which
  triggers the AI as usual.
- Queues `contact_sync` with the external ID and account (§6.4).
- Returns a short-lived token scoped to that one ticket, plus a `url` for use
  without the widget (popup or new tab).

This works like Stripe Checkout sessions: no crypto in customer code, and
the identity and context can't be faked from the browser. The API key is the
trust boundary, so identified chats don't need an allowed-domains list.

Per the parity rule (architecture.md §2), the endpoint lives in
`packages/api-contract` and a `tickets`/`support` queries function, with a
matching MCP tool.

### 6.3 Loader and JS API

- **Fix:** build iframe URLs from the loader's own origin
  (`new URL(document.currentScript.src).origin`).
- Expose a single global, **`window.FrontLit`** (no aliases like `fl` or
  `frontlit`):
  - `FrontLit.open({ token })`: open the widget on the session's ticket.
  - `FrontLit.open()`: open the anonymous chat (current behaviour).
  - `FrontLit.close()`.
- The loader is async, so the snippet includes a queue stub that the loader
  replays once it has loaded:

  ```html
  <script>
    window.FrontLit = window.FrontLit || {
      q: [],
      open(o) {
        this.q.push(["open", o]);
      },
      close() {
        this.q.push(["close"]);
      },
    };
  </script>
  <script async src="https://<team-host>/embed/chat.js"></script>
  ```

- The loader passes the token to the iframe (in the iframe URL fragment or
  by `postMessage`, not a query string, so it stays out of server logs). With
  a token, the widget loads that ticket instead of the one in localStorage.
- The anonymous embed keeps working as it does today.

### 6.4 Contact in SendLit, linked from the ticket

- **The person lives on the SendLit contact.** SendLit contacts already
  support `customFields` (set on create, merged on update).
  `contact_sync` passes `{ externalId, accountId, accountName, accountUrl }`
  as custom fields, and tags the contact `source:in-app`. `upsertContact` in
  `apps/api/src/email/sendlit-client.ts` currently sends only email, name and
  tags, so it needs extending.
- **`tickets.contactId`** (nullable text) holds the SendLit contact ID. The
  `contact_sync` payload carries the ticket ID, and the worker writes
  `contact.contactId` back after the upsert. This applies to every ticket
  source with an email (form, email, API, chatbot). It stays null for
  anonymous chats and for teams without SendLit, and gets filled if an
  anonymous chat later gets an email.
- `requesterEmail` / `requesterName` stay on the ticket as a snapshot, so
  the ticket still shows correctly when SendLit is unavailable or not set up.
- **Matching in both directions:**
  - Ticket → host system: the ticket view shows the external ID, account
    and request ID.
  - Host user → tickets: inbox search by external ID. FrontLit queries the
    SendLit contact list with an inline `customField` equals filter on
    `externalId`, then lists tickets by `contactId`.

### 6.5 Incident context on the ticket

- A `context` JSONB column on `tickets`, for incident data only (page, error,
  request ID, app version). Identity and account live in SendLit.
- Size-capped (e.g. 8 KB) and stored as given. It's shown to agents and
  passed to the AI, never rendered as HTML.
- The inbox ticket view shows the SendLit contact (name, email, external ID,
  account) and the context fields.

### 6.6 Who answers: AI first, human one click away

The AI's reply is a head start, not a gate the user has to get past.

- The AI replies first under the existing chatbot `autoReply` policy. Session
  tickets are chatbot tickets, so there's no new setting.
- **Talk to a human** is visible from the first message. Clicking it
  escalates the ticket directly (the same outcome as
  `HANDOFF:visitor_request`), without going through the AI.
- The AI hands off when retrieval finds nothing, when the user asks for a
  person, or when the context shows a product bug.
- The ticket is in the inbox from the start, so an agent can step in at any
  point.
- **Session has `context.error`:** treat it as a likely bug. The AI
  acknowledges it, checks the docs for a known limit (size, format, etc.) and
  asks for any missing details. If the docs don't explain it, it escalates
  straight away with a short summary for the agent. It must not reply with
  generic tips.
- **No error (a "how do I…" question):** normal AI-first answering.
- After a handoff, the user sees: "Handed to the team, we'll reply here or
  by email."

### 6.7 Reply delivery: widget if they're there, email if they're away

- When an agent (or the AI, after the user has gone quiet) replies on a
  ticket with a `requesterEmail`, schedule a check about 2 minutes later.
- `ticket_messages.seenAt` (nullable). The widget marks agent and bot
  messages seen only when the chat panel is open **and**
  `document.visibilityState === "visible"`.
- When the check runs: all seen → do nothing. Any unseen → send one `reply`
  email (via `ticket_mail_outbox`) with all unseen replies and a magic link
  back to the conversation.
- This avoids the race of a presence check, sends nothing when someone
  briefly switches tabs, and groups a burst of replies into one email.
- Anonymous chats have no email address, so their replies only show up in
  the widget.

## 7. Data model changes

| Table             | Change                                      |
| ----------------- | ------------------------------------------- |
| `tickets`         | `contact_id text null` (SendLit contact ID) |
| `tickets`         | `context jsonb null` (incident context)     |
| `ticket_messages` | `seen_at timestamp null`                    |

Plus: the `contact_sync` payload gains `ticketId`, `externalId` and
`account`; `upsertContact` accepts `customFields`.

## 8. Security and privacy

- `POST /support-sessions` requires a team API key with ticket write scope.
  It must only be called from the host's server, never from the browser. The
  docs say so explicitly.
- Session tokens are random, stored hashed (like ticket access grants),
  scoped to one ticket, and expire (e.g. 1 hour). An expired token can't
  read the conversation; the user starts a new session from the host app.
- The token is passed to the iframe outside the query string.
- `context` is untrusted text from the customer's app. It's size-capped,
  escaped when shown, and treated as data (not instructions) in the AI
  prompt.
- External IDs and account data are sent to SendLit, which is already the
  team's system of record for contacts.

## 9. Tasks

- [ ] **Must fix:** loader builds iframe URLs from its own origin.
- [ ] Loader: expose `window.FrontLit` (`open`, `close`) wired to the
      existing open state and `paint()`, and replay queued calls.
- [ ] `POST /support-sessions` (contract, queries, route, MCP tool): ticket
      create/reuse, `context`, short-lived ticket token.
- [ ] Widget: `FrontLit.open({ token })` loads the session's ticket.
- [ ] `contact_sync`: `customFields` (external ID, account), carry the
      ticket ID, write `tickets.contactId` back.
- [ ] `tickets.context`; inbox ticket view shows the SendLit contact and the
      context.
- [ ] Inbox search by external ID.
- [ ] Pass ticket context to the AI prompt; error rules from §6.6.
- [ ] Widget: always-visible **Talk to a human**, and the post-handoff
      message.
- [ ] `ticket_messages.seenAt`, set by the widget only when the panel is
      open and the tab is visible.
- [ ] Delayed unseen-reply email with a link back to the chat.
- [ ] Docs: "Add in-app support to your product" (backend session route,
      snippet, Contact support button).
- [ ] First integration: CourseLit dashboard (session route, snippet,
      Contact support on upload errors).

## 10. Acceptance criteria

- [ ] In CourseLit, a failed upload shows **Contact support**. Clicking it
      opens the widget, and the FrontLit ticket shows the user, the school
      (name and URL), the page and the error, without anyone asking.
- [ ] The SendLit contact has the CourseLit user ID and school in custom
      fields, the ticket's `contactId` points to it, and searching the inbox
      by that user ID finds the ticket.
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
- [ ] The widget loads from FrontLit's origin when embedded on
      app.courselit.app, and `FrontLit.open()` works when called before the
      loader has finished.
- [ ] Session tokens are scoped to one ticket and expire; a bad or expired
      token can't read the conversation.
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
