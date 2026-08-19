# Inbox AI agent PRD

**Status:** Ready for alpha implementation
**Last updated:** 2026-08-16
**Primary owners:** Product and API engineering

## 1. Summary

FrontLit will treat team AI credentials as a **capability**, and Chatbot /
Tickets as **channels that may use that capability**.

When a team has not configured AI, no inbox channel may generate a reply.
Chatbot may still collect live-chat messages for humans. Form, email, and
API tickets wait for a teammate.

When a team has configured AI, each channel independently opts in to
auto-reply. The bot answers from published help articles on the existing
ticket thread, then escalates to a human under configurable situations.
Escalation never opens a second ticket.

## 2. Background

FrontLit already has the pieces this feature composes:

- Team AI lives at `GET` / `PUT` / `DELETE /settings/ai`
  (`apps/api/src/ai/`). Provider, encrypted key, and per-purpose models
  (`chatbot`, `grammar`, `builder`) are stored on `ai_settings`.
- All generative calls run server-side via Vercel AI SDK Core. Routes never
  talk to a provider HTTP API directly.
- `getLanguageModel(config, purpose)` returns `null` when the team has no
  locally complete credential configuration.
- Public chat is `POST /public/:teamId/chat`. The first visitor message
  creates a `source: "chatbot"` ticket; later turns append to that thread.
  Bot replies are stored as `ticket_messages.author = "bot"`.
- Support tickets arrive through the form, inbound email, and the API/MCP
  (`source: "form" | "email" | "api"`). The workspace root `/` is one inbox
  for every source.
- Chatbot settings (`GET` / `PATCH /chatbot`) include `enabled` (show the
  site launcher) and `escalationEnabled` (offer “talk to a human”).
- Ticket status already encodes waiting vs needs-reply: `pending` after an
  agent reply, `open` after a visitor reply. The inbox websocket publishes
  `inbox.updated` after create / message / status change.

Architecture references: `docs/architecture.md` §6 (retrieval), §7
(chatbot), §11 (help desk).

## 3. Problem statement

The three existing switches do not match the product rule.

| Layer                       | What it does today                                         |
| --------------------------- | ---------------------------------------------------------- |
| Team AI                     | Stores provider + key + models.                            |
| Chatbot `enabled`           | Shows the launcher, then **always** calls `getChatAnswer`. |
| Chatbot `escalationEnabled` | Adds a “Talk to a human → `/help`” link on the widget.     |

If AI is not configured, chat does not stay silent. `getChatAnswer` falls
back to pasting the top retrieved doc chunk, or a fixed “I don’t have help
articles” line. That is still a bot reply.

Escalation does not hand the open chat thread to a teammate. The chat is
already a ticket; the widget points the visitor at a new form.

Form, email, and API tickets never call the model, so there is no way to
auto-answer those channels when AI **is** configured.

## 4. Goals

1. Hard gate: no locally complete team AI configuration means no generated inbox reply
   on any channel.
2. Per-channel opt-in: Chatbot and Tickets each choose whether to
   auto-reply once AI exists.
3. Auto-replies stay on the existing ticket thread as `author: "bot"`.
4. Escalation stops the bot, marks the ticket as needing a human, and
   tells the visitor a teammate will take over — same conversation.
5. Escalation situations are configurable per channel (visitor asks,
   bot is unsure, topics, turn cap).
6. Deleting team AI makes both channel toggles inert at runtime even if
   the stored flags remain on.
7. The live inbox updates when a bot replies or escalates, using the
   existing websocket.
8. A requester message produces at most one AI outcome, even across retries,
   concurrent messages, process restarts, AI removal, or human takeover.
9. Every generated inbox reply consumes the same per-team daily AI budget,
   regardless of whether it entered through chat, form, email, API, or MCP.

## 5. Non-goals

The first release will not include:

- a visual workflow / rules builder;
- separate bots or prompts per ticket type or brand;
- AI that assigns, snoozes, resolves, or closes without a human;
- wiring the `grammar` or `builder` model purposes into the inbox;
- a third model picker for tickets (both channels use the `chatbot`
  purpose until there is a proven need to split);
- streaming chat in the public widget (the existing non-streaming path
  is enough);
- changing documentation search / support-form deflection (that is
  retrieval, not a generated inbox reply);
- FrontLit-hosted models (teams bring their own provider key).

## 6. Terminology

| Term            | Meaning                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team AI         | A locally complete `ai_settings` row: provider plus a decryptable key (and Azure endpoint when required). Remote credential/model validity is known only after a provider call. |
| Channel         | An inbox entry path that may auto-reply: **Chatbot** or **Tickets**.                                                                                                            |
| Tickets channel | Form, inbound email, and API/MCP submissions. One policy covers all three sources.                                                                                              |
| Auto-reply      | A generated `author: "bot"` message posted on the ticket thread.                                                                                                                |
| Escalation      | The bot stops generating on that thread, the ticket becomes `open` (needs reply), and the visitor is told a human will continue.                                                |
| Takeover        | An agent has already posted on the thread. The bot must not reply again.                                                                                                        |
| Trigger message | The requester message whose arrival caused one AI run to be considered. It is the idempotency key for that run.                                                                 |
| AI thread state | Durable automation state separate from ticket status: `idle`, `generating`, `waiting`, `escalated`, or `taken_over`.                                                            |
| Deflection      | Suggesting published docs **before** a ticket is filed. Not an inbox auto-reply.                                                                                                |

## 7. Product principles

### 7.1 Capability, then policy

Team AI is the capability. Channel auto-reply is the policy. Policy is
ignored when the capability is missing.

```
Team AI (provider + key + models)
        │
        ├── Chatbot: auto-reply?  + when to escalate
        └── Tickets: auto-reply?  + when to escalate
```

### 7.2 No silent “local AI”

The extractive top-chunk fallback in `apps/api/src/chatbot/completion.ts`
must not run as a substitute for a configured model. A missing credential
is not a cheaper model; it is “do not generate.”

### 7.3 One thread

Chat, form, and email are already tickets. The bot joins that thread. A
human joins that thread. Escalation never creates a second ticket and
must not send the visitor to `/help` to start over.

### 7.4 Humans always win

If an agent has replied, the ticket is `closed`, the thread has escalated,
auto-reply is off, or team AI disappears, the bot stays silent. The bot may
not override a human decision. A result generated before one of those events
must be discarded by a final conditional write; checking only before the
provider call is insufficient.

### 7.5 Same support-only contract

Auto-replies use the existing support-only instructions and retrieved
help articles. The inbox agent is not a general assistant, coder, or
site-wide chatbot. Prompt-injection rules in architecture.md §13.4 still
apply: visitor text and article text are untrusted data.

## 8. Current vs required behavior

### 8.1 AI not configured

| Surface                                    | Today                                                      | Required                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chatbot widget on, visitor sends a message | Extractive snippet or fixed no-docs line, stored as `bot`. | Persist the visitor message only. No `bot` message. Return `outcome: "human_only"`; the widget shows a local “Message sent” state and the thread sits in the inbox as `open`. |
| Chatbot widget off                         | Chat endpoint 403s.                                        | Unchanged.                                                                                                                                                                    |
| Form / email / API ticket                  | Human-only.                                                | Unchanged.                                                                                                                                                                    |
| Support-form doc suggestions               | Semantic search as the visitor types.                      | Unchanged. Search is not generation.                                                                                                                                          |

### 8.2 AI configured, channel auto-reply off

Identical to §8.1 for that channel. The widget / form / mailbox still
work; they just do not generate.

### 8.3 AI configured, channel auto-reply on

| Surface             | Required                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chatbot             | After the visitor message, generate a grounded reply, persist `author: "bot"`, return `outcome: "answered"` on `POST /public/:teamId/chat`. Status `pending` while waiting on the visitor.                                                              |
| Tickets             | After create or a visitor reply, generate in the background, persist `author: "bot"`, email the requester with the existing ticket-mail + magic-link path. Do not block form / inbound ingest on the model. Status `pending` while the bot is handling. |
| Either, on escalate | Durably set the AI thread state to `escalated`, set status `open`, and post one short `author: "bot"` handoff line. Chat returns `outcome: "escalated"`; ticket requesters receive the same line by email. Inbox shows **Needs reply**.                 |

## 9. Escalation

### 9.1 Configurable situations (per channel)

| Situation                | Default     | Behavior                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitor asks for a human | On          | Before calling the model, match an explicit, server-maintained handoff phrase such as “talk to a person”, “agent”, or “human” against the normalized latest visitor message. This trigger is deterministic for alpha.                                                                         |
| Bot is unsure            | On          | Escalate without a model call when retrieval returns no useful chunks. Otherwise honor a structured model result with reason `unsure`. If this setting is off, the model may give a grounded answer, ask a clarification, or briefly say it lacks the detail; it must still not invent facts. |
| Topics                   | Off / empty | Optional list of words or phrases (e.g. `refund`, `cancel`, `legal`, `security`). Match normalized phrases on token boundaries against only the latest visitor message.                                                                                                                       |
| Turn cap                 | Off / unset | Permit N completed answer messages. Before attempting answer N+1, post the handoff message instead. Handoff messages do not count as answers.                                                                                                                                                 |

Normalization is Unicode NFKC, lowercase, trimmed, with internal whitespace
collapsed. Single words and multi-word phrases match on token boundaries, not
arbitrary substrings (`legal` must not match `illegal`). Topic order does not
affect behavior.

### 9.2 Hard stops (not configurable)

- An agent message already exists on the thread (takeover).
- Ticket status is `closed`.
- AI thread state is `escalated` or `taken_over`.
- Global `INBOX_AI_ENABLED` kill switch is off.
- Channel auto-reply is off.
- `getLanguageModel(..., "chatbot")` returns `null`.

### 9.3 Status mapping

Reuse the existing inbox meaning of status; do not add another user-facing
ticket status. AI thread state is persisted separately because `open` alone
cannot distinguish an ordinary requester turn from a sticky escalation.

| State                                                   | Status                | Inbox label         |
| ------------------------------------------------------- | --------------------- | ------------------- |
| Bot just replied, waiting on the visitor                | `pending`             | Waiting on customer |
| Escalated or visitor last spoke and a human must answer | `open`                | Needs reply         |
| Human resolved / closed                                 | `resolved` / `closed` | Done                |

### 9.4 Visitor-facing copy

On escalate, the bot posts one short message on the same thread, for
example that a teammate will continue here. The chat widget must **not**
render a link to `/help` as the escalation action.

If the visitor later writes again on an escalated thread and no agent has
replied yet, the bot stays silent (hard stop: the thread is already with
humans). If a team wants the bot to retry after escalation, that is a
later feature.

The fixed English handoff copy for alpha is: “I’m handing this conversation
to a teammate. They’ll continue with you here.” A model answer is never used
as handoff copy. Localization and per-team copy are later features.

## 10. Data requirements

### 10.1 Team AI (unchanged)

`ai_settings` remains the only place credentials and model selections
live. Inbox code reads `getResolvedAiConfig(teamId)` and
`getLanguageModel(config, "chatbot")`. It does not store a second key.

“AI configured” at runtime means: a row exists **and**
`getLanguageModel` returns a model. A row with a missing key or a
missing Azure endpoint is **not** configured.

Deleting AI (`DELETE /settings/ai`) leaves channel policy rows in place
but every generate path must no-op.

### 10.2 Channel policy

Store one policy per team per channel. Suggested shape (names may change at
implementation as long as the fields and constraints remain):

```ts
export const inboxAiSettings = pgTable(
    "inbox_ai_settings",
    {
        id: text("id").primaryKey(),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        channel: text("channel", {
            enum: ["chatbot", "tickets"],
        }).notNull(),
        autoReply: boolean("auto_reply").notNull().default(false),
        escalateOnVisitorRequest: boolean("escalate_on_visitor_request")
            .notNull()
            .default(true),
        escalateWhenUnsure: boolean("escalate_when_unsure")
            .notNull()
            .default(true),
        escalateTopics: text("escalate_topics").array().notNull().default([]),
        escalateAfterBotTurns: integer("escalate_after_bot_turns"),
        createdAt / updatedAt,
    },
    (table) => [
        uniqueIndex("inbox_ai_settings_team_channel_idx").on(
            table.teamId,
            table.channel,
        ),
    ],
);
```

Defaults when no row exists: `autoReply = false`, visitor-request and
unsure escalation on, empty topics, no turn cap.

Validation and patch semantics:

- `escalateTopics` contains at most 20 entries; each is 1–80 characters after
  normalization. Reject empty entries and deduplicate normalized values.
- `escalateAfterBotTurns` is `null` or an integer from 1 through 100.
- A PATCH changes only supplied fields. Supplying `null` for the turn cap
  disables it; an empty topic array disables topic escalation.
- Policy creation and update use an upsert on `(teamId, channel)`.

`chatbot_settings.escalationEnabled` is superseded by the chatbot
channel policy. Implementation may keep the column during migration and
map “offer talk to a human” onto `escalateOnVisitorRequest` /
`escalateWhenUnsure`, then stop reading it.

### 10.3 Ticket automation state

No new user-facing ticket status or message author is required, but durable
AI state is required. Add the equivalent of these fields to `tickets`:

```ts
aiState: "idle" | "generating" | "waiting" | "escalated" | "taken_over";
aiGeneration: integer; // monotonic compare-and-swap generation, default 0
aiTriggerMessageId: string | null;
aiStopReason:
    | "visitor_request"
    | "unsure"
    | "topic"
    | "turn_cap"
    | "agent_takeover"
    | null;
aiStoppedAt: timestamp | null;
```

`tickets.status` still controls inbox workflow. `aiState` controls whether an
AI result may be committed. An agent message atomically sets `taken_over` and
increments `aiGeneration`. Escalation sets `escalated` and its reason. A new
requester message increments `aiGeneration`, records the newer trigger, and
may move `waiting` to `idle`, but never clears `escalated` or `taken_over`. If
an older provider call still owns an unexpired lease, a newer Tickets job
waits; synchronous Chat returns `human_only` rather than starting another
call. The older result is stale and cannot commit.

Persist one run/job per trigger message with a unique constraint on
`(ticketId, triggerMessageId)`. It records `queued | generating | succeeded |
skipped | failed`, attempts, lease expiry, and timestamps. The row is for
idempotency and recovery; it must not contain raw provider keys, prompts, or
visitor text.

### 10.4 Ticket access grants

Requester notification links must not invalidate links returned by ticket
creation or delivered in earlier emails. Replace the single rotating ticket
hash behavior with multiple hashed, expiring access grants (or an equivalent
signed-token design). Minting a grant for a bot or agent email does not revoke
previous grants. Explicit revocation may revoke all grants; passive email
delivery may not. Default alpha expiry is 30 days.

### 10.5 Usage budget

Add a daily, per-team usage row (for example `ai_usage_daily`) with atomic
`reservedTokens` and `usedTokens` counters. Before any inbox provider call,
reserve the estimated input plus the maximum output allowance. If no provider
call starts, release the reservation. Once a call starts, charge actual usage
when available; otherwise charge the reservation even if the result fails or
is discarded as stale. A unique `(teamId, UTC date)` row and conditional
update prevent concurrent calls from overspending.

For alpha, `INBOX_AI_DAILY_TOKEN_BUDGET` defaults to 100,000 tokens per team
per UTC day. It covers generation from Chatbot and Tickets across form, email,
API, and MCP. A later plan system may supply the limit instead. Standalone
documentation search remains governed by its own search rate limit.

## 11. Runtime

### 11.1 Shared generate path

One orchestration function serves both channels. Chat executes it inline;
Tickets executes it from a durable worker.

1. In a transaction, insert or claim the run keyed by the trigger message.
   A succeeded or skipped run is not executed again, and no run may claim a
   ticket while another run has an unexpired provider-call lease.
2. Load team AI, channel policy, ticket, latest requester message, and recent
   persisted history. Client-supplied history is never authoritative.
3. Apply hard stops. A stopped run records a machine-readable skip reason and
   does not write a bot message.
4. Atomically set `aiState: "generating"`, increment `aiGeneration`, store the
   trigger message, and retain that generation value as the claim token.
5. Apply deterministic visitor-request, topic, and completed-answer turn-cap
   escalation, in that order. These cases do not retrieve or call the model.
6. Retrieve help chunks (`searchChunks`). If retrieval returns no useful
   chunks and unsure escalation is on, escalate without a provider call.
7. Atomically reserve the estimated tokens from the shared daily budget. If
   the budget is exhausted, skip generation and leave the ticket `open`.
8. Call the model with persisted recent messages and the existing support-only
   instructions, then validate the structured result. The schema is:

    ```ts
    {
        answer: string; // trimmed, 1–4,000 characters
        escalate: boolean;
        reason: "unsure" | null;
    }
    ```

    `reason` must be `unsure` when `escalate` is true and is honored only when
    unsure escalation is enabled. The prompt tells the model when that option
    is disabled; an escalation that violates the policy, malformed result,
    empty answer, timeout, or provider error is a failed run, not a bot reply.

9. In one final transaction, reload the ticket, policy, and locally complete
   AI configuration. Commit only when the generation claim still matches,
   the trigger is still the latest requester message, no agent message exists,
   and no hard stop now applies. Otherwise discard the stale result.
10. On escalation, persist the fixed handoff line, set `status: "open"`, set
    `aiState: "escalated"`, and record the reason.
11. On answer, persist `author: "bot"`, set `status: "pending"`, and set
    `aiState: "waiting"`.
12. Finalize token usage, mark the run succeeded/failed/skipped, and publish
    `inbox.updated` after the transaction commits.

Provider calls use at most the latest 20 persisted messages, 4,000 characters
per message, and an 800-output-token cap. Chat has a 20-second provider
timeout and no automatic retry in the request. Ticket jobs have a 30-second
timeout and retry transient provider failures at most twice with backoff.
Validation, policy, budget, and hard-stop failures are never retried.

### 11.2 Chatbot

`POST /public/:teamId/chat` stays synchronous.

- Chatbot `enabled` still gates whether the widget/endpoint exists.
- Persist the visitor message before retrieval or generation. The returned
  conversation id/token must therefore remain usable when generation fails.
- Run the shared path when eligible. Missing AI, auto-reply off, exhausted
  budget, a hard stop, timeout, or provider failure leaves the thread `open`
  and returns `outcome: "human_only"` without a bot message.
- A concurrent or repeated request with the same trigger message cannot
  produce a second bot message.
- The response is the union defined in §12. `escalate` remains as a deprecated
  compatibility field derived from `outcome === "escalated"`; it never means
  “go file another ticket.”

### 11.3 Tickets

On `createTicket` (form / email / API) and on a **requester**
`addTicketMessage`, enqueue the run keyed by the persisted requester message
**after the transaction commits**. Ticket creation and its first message must
therefore be one database transaction. Do not await the model inside the
public form, REST/MCP create, ticket-thread reply, or inbound-mail handler.

The queue is durable and lease-based; a bare unobserved Promise is not a job
queue. Expired leases may be reclaimed. Unique trigger-message idempotency and
the final generation check make retries safe. Final failure leaves the ticket
`open`, resets a non-stopped `aiState` to `idle`, and alerts a human through the
normal inbox path.

Do not generate on agent or bot messages.

### 11.4 Notifications and realtime

- Requester notifications use a durable, per-ticket ordered outbox. Ticket
  receipt is sequence 1; an initial AI answer or handoff is sequence 2. A
  requester reply receives only the resulting answer/handoff email, not a new
  receipt. Delivery retries are idempotent.
- Bot answers and escalation handoffs with a requester email use
  `notifyRequesterOfReply` (or the same mail helper) with a newly minted access
  grant that does not revoke earlier grants.
- If a ticket run finally fails or is skipped for capability/budget reasons,
  the receipt still goes out and the ticket remains visible to humans. Internal
  provider errors are never included in requester mail.
- `publishInboxUpdate` already runs from ticket queries; keep it there so
  the workspace inbox refreshes without a special bot event type.

## 12. API and contract

Team-scoped, twins on REST and MCP like other settings:

- `GET /inbox/ai` returns `{ aiConfigured, channels }`. `channels` contains
  only policies the caller may read.
- `PATCH /inbox/ai` accepts `{ channels: { chatbot?, tickets? } }`, requires at
  least one channel, and returns the same shape as GET. It patches supplied
  fields only.
- Invalid policy values return `400`. Enabling `autoReply` without locally
  complete AI configuration returns `409`. Runtime still rechecks capability,
  so concurrent AI removal is safe.

`aiConfigured` means the provider configuration is locally complete: the key
decrypts and required fields such as Azure endpoint exist. It does not promise
that the remote credential or model is valid; that is known only after a
provider call. Provider authentication failure follows the failure behavior in
§11 and is visible in logs/metrics.

Chatbot `PATCH /chatbot` no longer grows new AI fields. Launcher,
greeting, and accent stay there.

Public ticket contracts remain unchanged. Public chat changes to:

```ts
type ChatResponse = {
    outcome: "answered" | "human_only" | "escalated";
    answer: string | null;
    sources: ChatSource[];
    conversationId: string;
    conversationToken: string;
    escalate: boolean; // deprecated; true only for `escalated`
};
```

`answer` is non-null only for `answered` and `escalated`; `sources` is empty
for `human_only` and `escalated`, because escalation uses fixed handoff copy.
The widget appends an assistant message only when `answer` is non-null. For
`human_only`, it shows a non-message “Message sent — a teammate will reply
here” state and continues polling the same thread.

Public chat request validation requires a 1–4,000-character `message` and
either both `conversationId` and `conversationToken` or neither. The legacy
client `history` field may be accepted during rollout but is ignored; persisted
ticket messages are the only history supplied to the model.

Permissions are field-level:

- chatbot policy read/write requires `chatbot:read` / `chatbot:write`;
- tickets policy read/write requires `helpdesk:read` / `helpdesk:write`;
- a request touching both channels requires permission for both;
- `ai:write` is not required because this endpoint never changes credentials.

REST authorization applies the same rules as MCP tools
`get_inbox_ai_settings` and `update_inbox_ai_settings`, using the existing
chatbot/helpdesk MCP scopes. Unauthorized channel reads are omitted; writes
return `403`.

## 13. Dashboard requirements

### 13.1 Settings → AI

Unchanged: provider, key, embeddings, per-purpose models. Copy should
say that Chatbot and Tickets only generate after this is saved, and that
each channel is enabled separately.

Removing AI must immediately stop generation. The inbox AI screen then
shows the channel toggles as disabled with a link back here.

### 13.2 Website → Chatbot

Keep launcher, name, greeting, accent, variants.

Replace the current “Offer talk to a human” switch with:

- **Use AI to auto-reply** — disabled, with “Configure AI in Settings,”
  unless `aiConfigured`.
- Escalation checklist: visitor asks; bot is unsure; topics (tag input);
  turn cap (optional number).

`enabled` remains “show the chat launcher.” It is independent of
auto-reply: a team can take live chat with no bot.

### 13.3 Settings → Help desk

Add a **Help desk** settings page with the same auto-reply and escalation
controls for the **Tickets** channel. Form, email, API, and MCP share this
policy. Do not add per-source toggles in v1. Hide or make read-only the
controls when the member lacks the corresponding help-desk permission.

### 13.4 Inbox thread

Bot messages already have `author: "bot"`. Show them as the assistant
name (chatbot `name`, default “Assistant”), not as a teammate.

After escalation the thread stays selected; status reads **Needs reply**.
No extra “AI” filter is required in v1.

## 14. Security and abuse

- Generation only on the server with the team’s stored key.
- Implement the Postgres-backed, team-aware public limits described in
  architecture.md §13.2 before exposed alpha; the current in-memory IP-only
  limiter is not the release target.
- Enforce the atomic shared daily budget in §10.5 before every provider call.
  Email, API, and MCP entry paths cannot bypass it.
- Honeypot + CAPTCHA on public ticket create stay in front of any
  generate scheduling.
- Signed inbound-email verification and duplicate `Message-ID` handling stay
  in front of email scheduling. Authenticated API/MCP writes retain their
  principal rate limits.
- Visitor and article text remain untrusted in the prompt.
- Normalize and length-limit visitor messages before retrieval/model input;
  render model output through the existing text-message renderer, never raw
  HTML.
- Do not put the API key, system prompt, or escalate reason internals in
  public responses.
- Do not log raw prompts, help chunks, visitor text, access tokens, or email
  bodies. At most one provider call may hold an active lease per ticket.

## 15. Observability

Log, without storing raw keys:

- generate skipped (`no_ai`, `auto_reply_off`, `takeover`, `closed`,
  `already_escalated`, `global_disabled`, `stale_trigger`,
  `budget_exhausted`);
- job queued / claimed / lease-reclaimed / retried / exhausted;
- generate started / succeeded / failed (`timeout`, `provider_auth`,
  `provider_transient`, `invalid_output`);
- generated result discarded (`newer_requester_message`, `agent_takeover`,
  `ai_removed`, `policy_disabled`, `generation_mismatch`);
- escalated (`visitor_request`, `unsure`, `topic`, `turn_cap`).

Reuse existing metrics style (`incrementCounter`) and add provider duration,
reserved/used tokens, budget rejections, job age, and failure counters. Labels
may include provider, channel, source, outcome, and reason, but never ticket id,
team id, message text, model output, or other unbounded values. A later
dashboard can expose these; alpha only needs structured logs + counters.

## 16. Testing requirements

- No team AI + chatbot enabled: visitor message persists; **no** bot
  message; no `generateText`; response is `human_only` with `answer: null`.
- Team AI + chatbot auto-reply off: same.
- Team AI + chatbot auto-reply on: bot message, status `pending`.
- Global kill switch off: all channels preserve requester messages, call no
  model, and produce no bot messages without changing stored channel policy.
- Unsure / empty retrieval with escalate-when-unsure: status `open`,
  fixed handoff copy, durable `escalated` state, and no model call.
- Topic match escalates without a model call.
- With cap N, N answers are allowed and the next requester turn escalates
  without a model call.
- Normalized topic/visitor-request matching respects token boundaries.
- A visitor message after escalation persists but cannot queue or generate.
- Agent has already replied: further visitor messages do not generate.
- Agent reply while a provider call is running invalidates the claim and the
  late result is discarded.
- A newer requester message while a provider call is running invalidates the
  older claim; at most the latest trigger can commit.
- `DELETE /settings/ai` then a visitor message: no generate even if
  `autoReply` is still true in the policy row.
- `DELETE /settings/ai` during generation causes the final write to discard
  the result.
- Ticket auto-reply: form create eventually writes a bot message and
  sends requester mail; the HTTP create response does not wait on the
  model.
- Form, inbound email, public thread reply, REST, and MCP each enqueue exactly
  one run for the persisted requester message; duplicate delivery/job retry
  does not duplicate bot messages or emails.
- Ticket create and its first requester message commit atomically; no orphan
  ticket can schedule a run.
- Provider timeout, invalid credentials, malformed structure, and empty answer
  leave the ticket `open`, write no bot message, and follow the documented
  retry policy.
- Chat provider failure returns a usable conversation token with
  `outcome: "human_only"`.
- `answered`, `human_only`, and `escalated` responses render correctly in the
  widget; only non-null answers become assistant messages.
- PATCH auto-reply true without AI: rejected.
- Channel reads/writes enforce the exact chatbot/helpdesk permissions on REST
  and MCP, including a mixed two-channel patch.
- Topic count/length and turn-cap bounds are validated.
- Shared budget is atomic under concurrent chat/ticket calls and covers email,
  API, and MCP; budget exhaustion calls no model and leaves the ticket open.
- Receipt and AI reply/handoff mail are ordered and idempotent. Every access
  link returned by creation or delivered by either email remains valid until
  expiry/revocation.
- Inbox live: a bot write publishes `inbox.updated` for that team.
- Tenant-isolation tests prove a run, policy, usage row, access grant, and
  websocket event cannot cross team boundaries.

## 17. Acceptance criteria

1. A team with no AI configuration never produces an `author: "bot"`
   message from Chatbot or Tickets, including the old extractive
   fallback.
2. A team with AI can leave both channels off and still use the widget
   as live chat and the form/email as a human inbox.
3. Enabling Chatbot auto-reply answers in the same chat ticket and
   marks the thread waiting on the customer.
4. Enabling Tickets auto-reply answers form and email tickets on that
   thread and emails the requester.
5. Each configured escalation situation stops the bot and marks the
   ticket **Needs reply** without opening another ticket.
6. A teammate reply permanently takes the thread over.
7. Removing AI stops generation immediately.
8. The workspace inbox updates without a manual refresh.
9. Every requester message has at most one committed AI outcome, and stale
   provider results never override a newer visitor or human action.
10. Chat always returns a usable conversation when the visitor message was
    persisted, including no-AI, disabled-policy, budget, and provider failures.
11. All inbox channels share one enforced per-team daily budget.
12. Requester notification ordering cannot produce an invalid or superseded
    magic link.
13. REST, MCP, and dashboard controls enforce channel-specific permissions.

## 18. Resolved first-release decisions

- Two channels only: `chatbot` and `tickets`. Email is not a third
  policy.
- Both channels use the `chatbot` model purpose.
- No new ticket status; reuse `open` / `pending`.
- Persist separate AI thread/run state; `open` alone is not an escalation
  marker.
- Escalation does not create a ticket or link to `/help`.
- Ticket generation is async; chat generation stays in-request.
- Ticket async work uses a durable idempotent queue, not bare fire-and-forget.
- Channel policy may be stored while AI is absent, but `autoReply`
  cannot be turned on until AI is locally complete.
- Public chat has explicit `answered | human_only | escalated` outcomes and a
  nullable answer.
- Requester access supports multiple simultaneously valid grants.
- Alpha uses a 100,000-token shared daily team budget.
- Support-form doc search is out of scope for this PRD (not generation).

## 19. Rollout

1. Add channel policy, ticket AI state/run jobs, multi-grant ticket access,
   usage budget, and durable ordered-mail storage. Add query/state-machine
   tests before wiring provider calls.
2. Add the GET/PATCH REST+MCP contract and both dashboard surfaces with exact
   authorization and validation.
3. Deploy the new public chat response union and widget handling while the old
   generation behavior remains behind a temporary server feature flag.
4. Switch chat to the shared claim/finalize path, structured output, budget,
   fixed escalation copy, and the no-AI hard gate. Remove the production local
   answer path in the same release so the client never sees an undefined empty
   response.
5. Wire durable Tickets jobs for create and requester replies across form,
   email, public thread, REST, and MCP. Enable ordered requester mail.
6. Enable Postgres-backed team-aware public rate limits, exercise provider
   failure/budget/concurrency tests, and run a limited internal-team canary.
7. Remove or stop reading `chatbot_settings.escalationEnabled` and remove the
   temporary compatibility flag after canary verification.

Scratch migrations are acceptable (see repo `AGENTS.md`). Rewrite the
inbox-AI migration as needed rather than preserving
`escalationEnabled` indefinitely.

## 20. Alpha release gate

The feature is eligible for alpha only when:

- all §16 tests pass in CI, including concurrency and tenant isolation;
- no extractive/local fallback can write an inbox bot message;
- the durable worker, ordered mail outbox, shared budget, and Postgres-backed
  public limits are enabled in the alpha environment;
- dashboards make auto-reply opt-in and visibly show missing AI setup;
- a canary verifies no duplicate replies, late bot takeover, invalid ticket
  links, cross-team events, or unbounded provider spend;
- `INBOX_AI_ENABLED=false` stops new calls and causes in-flight final writes to
  discard without deleting credentials, policies, tickets, messages, or queued
  mail.

Alpha is not a promise of provider uptime or answer quality. It is a promise
that failures become human-visible open tickets without duplicate, stale,
unsafe, or unbounded automated actions.
