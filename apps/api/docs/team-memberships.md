# Team memberships and permissions PRD

**Status:** Implemented (first release)
**Last updated:** 2026-08-13
**Primary owners:** Product and API engineering

## 1. Summary

FrontLit will allow multiple people to collaborate in one team while giving
each person an explicit, granular set of team permissions. A team will have
exactly one owner. Everyone else will be a member whose authority comes from
their assigned permissions rather than a stored role.

Human permissions and OAuth scopes will remain separate authorization systems:

- a membership permission describes what a person may do in a FrontLit team;
- an OAuth scope describes what a connected client may do on that person's
  behalf; and
- an OAuth request is allowed only when both grants permit the operation.

Roles are not part of the persisted authorization model. The product may show
named permission presets when inviting or editing a member, but selecting a
preset copies its permissions onto the membership. It does not assign a role.

The first release covers the permission model, server-side enforcement,
invitations, member administration, ownership safety, and the dashboard
experience required to use them.

## 2. Background

FrontLit is already multi-tenant:

- `accounts` represent FrontLit identities;
- `teams` are the tenant and website boundary;
- `team_members` links an account to a team;
- browser requests select a team with `X-Frontlit-Team-Id`;
- OAuth authorization binds a selected team into the token family; and
- API keys are pinned to one team.

`team_members.role` remains as a transitional compatibility column with the
values `owner` and `member`. It is not an authorization input: ownership is
derived from `teams.ownerAccountId`, and non-owner authority is derived from
the membership permission array. The column is still maintained while legacy
call sites are retired, so it must not be used in new authorization code.

MCP already has an OAuth scope policy such as `pages:read`, `pages:write`, and
`broadcasts:send`. Those scopes constrain OAuth clients, not signed-in humans.
They are useful vocabulary and an existing enforcement layer, but they are not
a replacement for team-member permissions.

## 3. Problem statement

FrontLit needs team collaboration with the following properties:

1. A team owner can invite people and decide what each person can do.
2. Trusted members can administer other memberships without being able to
   grant authority they do not possess.
3. Permission changes and membership removal take effect immediately for
   browser and OAuth access.
4. A connected OAuth client cannot gain more authority than either its token
   scopes or the authorizing member.
5. Sensitive ownership operations remain protected even if a member has broad
   product permissions.
6. Authorization behavior is consistent across REST, MCP, and the dashboard.
7. The system fails closed when a route or tool has no authorization policy.

## 4. Goals

- Support multiple accepted members and pending invitations per team.
- Store a granular permission set on every non-owner membership.
- Make the team owner an invariant rather than a configurable role bundle.
- Enforce permissions on every authenticated team operation.
- Prevent permission escalation through invitations and member editing.
- Preserve OAuth scopes as an independent, additional restriction.
- Make revoked permissions effective without waiting for OAuth access tokens
  to expire.
- Provide understandable permission presets without persisting roles.
- Record security-relevant membership and permission changes.
- Preserve FrontLit's existing tenant isolation and public-ID conventions.

## 5. Non-goals

- User-defined roles or user-defined permission types.
- Persisted `admin`, `editor`, `support`, or similar roles.
- Per-page, per-document, or per-ticket access control.
- Cross-team resource sharing.
- Nested groups, departments, or group membership.
- SCIM, SAML group synchronization, or enterprise directory provisioning.
- Redesigning OAuth consent, token formats, or the supported OAuth scope
  catalog, except where enforcement must compose with human permissions.
- Replacing Better Auth or migrating FrontLit teams into Better Auth's
  Organization plugin.
- Introducing OpenFGA, Cerbos, Casbin, or another external policy engine.
- Changing authorization for public visitor endpoints.
- Scoped API keys. Team API keys remain full-team credentials in this release,
  so only the team owner may list, create, or revoke them.
- A global FrontLit super-administrator role. Ownership and permissions are
  scoped independently to each team.

## 6. Terminology

| Term                 | Meaning                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Account              | A FrontLit human identity, linked to a Better Auth user after sign-in.                             |
| Team                 | The tenant boundary. One FrontLit team owns one website.                                           |
| Owner                | The one account named by `teams.ownerAccountId`; it has every team permission implicitly.          |
| Member               | An accepted, non-owner account with a stored set of team permissions.                              |
| Invitation           | A time-limited offer to join one team with a specified initial permission set.                     |
| Permission           | A durable grant from a team to a human member.                                                     |
| OAuth scope          | A grant from a human to an OAuth client for a particular token family.                             |
| Effective permission | A permission the member may exercise after ownership and permission implication rules are applied. |
| Permission preset    | A UI template that is copied into a membership; it is not persisted as a role.                     |

## 7. Product principles

### 7.1 Owner is a relationship, not a role

`teams.ownerAccountId` is the canonical ownership record. The owner always has
every current and future team permission. The owner's permissions must not be
stored as a snapshot because a snapshot would become stale whenever a new
permission is introduced.

There must be exactly one owner for every team. The owner cannot be removed,
leave the team, or have permissions edited. Ownership must first be transferred
to another accepted member.

The owner must also have a `team_members` row because team selection is based
on membership. Team creation, ownership transfer, and owner-account lifecycle
operations must preserve both facts transactionally. Deleting an account that
owns a team is rejected until ownership is transferred or the team is
explicitly deleted; the `teams.ownerAccountId` foreign key must not cascade an
account deletion into an implicit team deletion.

### 7.2 Permissions are team-scoped

The same account may have different permissions in different teams. No team
permission is inferred from an account's permissions in another team.

Account-level actions remain outside the team permission model. For example,
listing the teams an account belongs to and creating a new team do not require
permission from an existing team.

An account may belong to zero teams while onboarding or before accepting an
invitation. Authentication creates or links only the account; it never creates
a team as a side effect. A team is created only through an explicit dashboard,
API, provisioning, or deployment-bootstrap action.

### 7.3 OAuth scopes attenuate human authority

Membership permissions and OAuth scopes have independent storage, management,
and lifecycles. They intersect only when authorizing an OAuth request.

For a browser session:

```text
allowed = member_has(required_permission)
```

For OAuth:

```text
allowed =
  member_has(required_permission)
  AND token_has(required_scope)
```

An owner satisfies `member_has(...)` for every team permission, but an owner
using OAuth is still constrained by the token's scopes. OAuth must never turn a
scope into a membership permission or increase the person's authority.

Permission changes do not rewrite OAuth grants or already issued tokens. The
resource server loads the current membership on each request, so a removed
permission or membership immediately prevents the corresponding OAuth action
even if the token still contains a matching scope.

Removing a membership also revokes the account's refresh-token/consent families
bound to that team. If the same account joins again later, the new membership
is a new authorization generation: access tokens issued before that membership
was created are rejected. An old OAuth grant must never become valid again
merely because the email/account was re-invited. This may be enforced with the
verified token issuance time plus membership creation time, or an equivalent
immutable membership-generation claim.

An OAuth token carrying a team claim is permanently bound to that team for its
lifetime. If the claim is missing, invalid, or no longer names a team the
account belongs to, a team-scoped request fails. It must never fall back to the
selected-team header, the account's sole remaining team, or another membership.

### 7.4 Authorization is server-side and fail-closed

The dashboard may hide or disable controls for usability, but the API is the
authority. Every protected REST operation and MCP tool must have an explicit
policy. Adding a protected operation without a policy must fail a test and must
not default to allowing all members.

### 7.5 Members cannot delegate authority they do not have

A member may administer another membership only when all of these conditions
hold:

- the actor has `members:manage`, or `members:invite` for a new invitation;
- both the target's current effective set and proposed effective set are
  subsets of the actor's effective permission set;
- the target is not the owner;
- the actor is not modifying their own permissions; and
- for removal, the target's effective permissions are a subset of the actor's
  effective permissions.

The owner is exempt from the subset checks but not from tenant isolation or
the ownership invariants.

## 8. Initial permission catalog

The catalog is defined in shared, typed code and persisted as stable string
identifiers. Unknown permissions are rejected on writes. Permission checks
must use constants rather than repeated string literals.

`@frontlit/api-contract` owns the identifiers, `TeamPermission` type, Zod
schema, implication metadata, and API shapes needed by the API and dashboard.
The server-only operation policy stays in `apps/api`; transport or UI packages
must not become authorization decision points.

The initial catalog is:

| Area       | Permissions                                                                                                                     | Grants                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team       | `team:update`                                                                                                                   | Rename and update ordinary team metadata. Team deletion and ownership transfer remain owner-only.                                                                                |
| Members    | `members:read`, `members:invite`, `members:manage`                                                                              | View members/invitations; create or resend invitations; edit permissions, cancel invitations, or remove eligible members.                                                        |
| Pages      | `pages:read`, `pages:write`                                                                                                     | View pages and drafts; create, edit, publish, discard, and delete pages.                                                                                                         |
| Themes     | `themes:read`, `themes:write`                                                                                                   | View themes; create, edit, and delete themes.                                                                                                                                    |
| Media      | `media:read`, `media:write`                                                                                                     | View media; upload, register, edit, and delete media.                                                                                                                            |
| Content    | `articles:read`, `articles:write`, `documentation:read`, `documentation:write`, `product-updates:read`, `product-updates:write` | Access the unified Content workspace with type-scoped authority over articles, documentation (including sections/search), and product updates (including GitHub release import). |
| Contacts   | `contacts:read`, `contacts:write`                                                                                               | View contacts; update tags and delete contacts.                                                                                                                                  |
| Segments   | `segments:read`, `segments:write`                                                                                               | View segments; create, edit, and delete segments.                                                                                                                                |
| Broadcasts | `broadcasts:read`, `broadcasts:write`, `broadcasts:send`                                                                        | View broadcasts, statistics, and email templates; create/edit broadcasts and templates; send a broadcast.                                                                        |
| ESP        | `esp:read`, `esp:write`                                                                                                         | View ESP configuration metadata; configure, test, or remove the provider. Secrets remain write-only.                                                                             |
| Chatbot    | `chatbot:read`, `chatbot:write`                                                                                                 | View or edit chatbot settings.                                                                                                                                                   |
| Help desk  | `helpdesk:read`, `helpdesk:write`                                                                                               | View tickets; create, reply, assign, and change status.                                                                                                                          |
| Domains    | `domains:read`, `domains:write`                                                                                                 | View domain state; claim a subdomain; attach, verify, or remove a custom domain; show or hide the platform subdomain after verify.                                               |
| AI         | `ai:read`, `ai:write`                                                                                                           | View AI provider/model metadata; configure or remove AI credentials and models.                                                                                                  |
| Settings   | `settings:read`, `settings:write`                                                                                               | View or update ordinary site and email settings. Arbitrary code injection remains owner-only.                                                                                    |

The database stores the permissions selected directly for a member. A shared,
pure function computes the effective closure: write implies the corresponding
read permission, `broadcasts:send` implies `broadcasts:write`, and
`members:invite` and `members:manage` imply `members:read`. This keeps rows
small and makes implication changes central instead of rewriting every
membership. All authorization and delegation comparisons use the effective
closure, never the raw array.

Submitted grants are validated, deduplicated, and stored in catalog order so
equality checks and audit diffs are deterministic. An empty grant set is valid;
membership alone lets the account list/select the team but no protected product
operation is implicitly allowed.

These implication rules are conveniences inside the human permission model.
They do not imply or mint OAuth scopes.

Content is one top-level product area, but it deliberately retains three
permission pairs. A member may therefore write documentation without gaining
authority to publish articles or import product updates. The dashboard renders
these six permissions under one **Content** heading; it must not recreate
separate Articles, Documentation, or Product updates permission groups.

The matching OAuth scopes use the same identifiers for clarity, but remain an
independent attenuation layer. A session needs the team permission. An OAuth or
MCP request needs both the team permission and the identically named token
scope.

### 8.1 Permission presets

The initial dashboard offers these presets:

| Preset          | Contents                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Full access     | Every non-owner permission. The UI must warn that this includes member administration, domain changes, AI credentials, and broadcast sending. |
| Content manager | Pages, themes, media, articles, documentation, and product updates read/write.                                                                |
| Support         | Help-desk read/write plus documentation read.                                                                                                 |
| Marketing       | Contacts, segments, and broadcasts read/write; sending broadcasts is selected separately.                                                     |
| Read-only       | Every product-area read permission, excluding member administration unless explicitly selected.                                               |
| Custom          | Individually selected permissions.                                                                                                            |

The API accepts only permission sets. Preset names are never sent as authority,
stored on `team_members`, or checked by server code.

## 9. Authorization model

The runtime path stays deliberately small:

```text
authenticate
  -> resolve one account/team/API-key principal
  -> load one indexed membership when the principal is human
  -> evaluate one static operation policy
  -> run the existing team-scoped handler
```

There is no role lookup, policy service, permission join per action, or copy of
permissions inside OAuth state. Product query functions continue to enforce
the resource's `teamId`; the policy check does not replace tenant-scoped data
access.

### 9.1 Central policy registry

The API must have one typed policy registry mapping an application operation to
its authorization requirements:

```ts
type TeamOperationPolicy = {
    tenant: "team";
    human:
        | { kind: "permission"; permission: TeamPermission }
        | { kind: "owner" }
        | { kind: "member" };
    oauthScope: OAuthScope | "unsupported";
    apiKeyAccess: "allow" | "deny";
};

type AccountOperationPolicy = {
    tenant: "account";
    human: { kind: "authenticated" };
    oauthScope: OAuthScope | "unsupported";
    apiKeyAccess: "deny";
};

type OperationPolicy = TeamOperationPolicy | AccountOperationPolicy;
```

The exact implementation may differ, but the policy must be able to express
that membership permissions and OAuth scopes are different inputs. Reusing the
same string for a permission and scope is allowed where their semantics align;
it is a naming convenience, not shared state.

The discriminated union makes an ambiguous team policy with both or neither a
permission and owner requirement unrepresentable. `oauthScope: "unsupported"`
denies OAuth rather than accidentally treating a missing mapping as
unrestricted. API-key access is similarly explicit. Account-level operations
do not consult a team membership. Public, provisioning, health, and
OAuth-protocol endpoints remain outside this registry and keep their existing
dedicated boundaries.

Examples:

| Operation           | Human permission  | OAuth scope       | Additional rule                                                            |
| ------------------- | ----------------- | ----------------- | -------------------------------------------------------------------------- |
| Read a page         | `pages:read`      | `pages:read`      | Resource must belong to the selected team.                                 |
| Publish a page      | `pages:write`     | `pages:write`     | Resource must belong to the selected team.                                 |
| Send a broadcast    | `broadcasts:send` | `broadcasts:send` | Existing SendLit validation still applies.                                 |
| Rename a team       | `team:update`     | `teams:write`     | Selected team must match the route team.                                   |
| Delete a team       | Owner             | `teams:write`     | Owner-only and user-authenticated.                                         |
| Edit code injection | Owner             | `settings:write`  | Existing arbitrary-script trust boundary remains.                          |
| Create an API key   | Owner             | `api_keys:write`  | User-authenticated only; the resulting credential has full-team authority. |
| Update AI settings  | `ai:write`        | Unsupported       | Browser session only until a dedicated OAuth scope exists.                 |

Requests with field-dependent sensitivity are modeled as different operations.
For example, ordinary settings updates and code-injection updates may share an
HTTP handler, but the handler must select the stricter policy from the parsed
body before performing any mutation. A generic `settings:update` check must not
authorize owner-only fields.

Protected REST handlers are registered through an authorization wrapper that
requires an operation key; MCP tools retain their equivalent registry wrapper.
Route-level authentication alone is never considered authorization. A coverage
test compares the protected REST contract and MCP tool catalog with their
policy registries so a new operation cannot be mounted as an unclassified
member-allowed handler.

### 9.2 Request authorization context

After authentication and team resolution, downstream handlers receive a
request-scoped authorization context containing at least:

```text
auth kind
internal team id
account id, when acting as a human
membership id, when acting as a human
is owner
effective member permissions
OAuth scopes, when auth kind is OAuth
API-key id, when auth kind is API key
```

Membership should be fetched once per request and reused by all checks. The
first release should not cache permissions across requests. This prioritizes
immediate revocation and avoids invalidation complexity.

One indexed membership lookup per authenticated team request is the expected
performance model. Authorization must not issue a query per permission or per
resource field. A cross-request cache may be introduced only with an explicit,
tested revocation strategy.

`GET /teams` is intentionally membership-aware. In addition to ordinary team
metadata, each returned item contains `isOwner` and `effectivePermissions` for
the authenticated account. This is a display capability snapshot, not a source
of authorization: mutations and data reads always re-load and authorize the
current membership on the API.

### 9.3 Authentication-specific behavior

#### Browser session

- Requires a valid account and selected team membership.
- Uses the current membership permissions.
- Does not use the synthetic `web` scope as a product permission.

#### OAuth

- Requires a verified bearer token, selected team claim, and current
  membership in that team.
- Requires both the current member permission and the operation's OAuth scope.
- Applies the intersection to REST and MCP, not MCP alone.
- A removed member must lose team access immediately even if an access or
  refresh token remains otherwise valid.
- Membership removal revokes team-bound refresh/consent records, and tokens
  from an earlier membership generation stay invalid after re-invitation.
- A team-bound token whose membership check fails is rejected; ordinary team
  selection and sole-team fallback are not run for it.
- The access token must remain valid for the endpoint's configured resource
  audience. An MCP-resource token is not accepted by a different resource
  merely because its scope string happens to match.

OAuth authorization and consent issuance are not redesigned by this feature.
Runtime authorization is the required safety boundary. A later change may
down-scope consent based on current membership for better UX, but runtime
checks remain mandatory.

#### API key

- The key remains fixed to one team and has no human account or membership.
- Human membership permissions do not apply when a key authenticates a product
  request.
- Existing full-team API-key authority remains unchanged in this release.
- Only the team owner may list, create, or revoke keys. This prevents a
  restricted member from minting a key and bypassing their human permissions.
- OAuth additionally requires the existing matching API-key scope; API-key
  authentication itself cannot manage API keys.
- UI copy must clearly state that each created key has full-team authority.
- Keys belong to the team, not the person who created them. Membership removal
  or ownership transfer therefore does not silently revoke keys and break
  integrations. Those flows must show existing key metadata to the owner and
  offer an explicit revoke-all option for secure offboarding.

### 9.4 HTTP behavior

- Missing or invalid authentication returns `401` using existing conventions.
- A valid identity without team membership returns the existing team error.
- A valid member lacking a human permission returns `403` with a stable
  `insufficient_permission` error and the required permission when safe.
- An OAuth request lacking scope returns the existing OAuth/MCP
  `insufficient_scope` behavior and identifies the required scope.
- Owner-only failures return `403` with a stable `owner_required` error.
- Cross-team resource identifiers continue to return `404` where FrontLit
  intentionally avoids revealing resource existence.

## 10. Data requirements

### 10.1 Team members

Add the following to `team_members`:

```text
member_id   public tmem_... identifier, unique
permissions text[] not null default '{}'
version     integer not null default 1
updated_at timestamp not null
```

The application type for `permissions` must be the shared `TeamPermission`
union. The database remains uniquely indexed by `(team_id, account_id)`.
External contracts use `member_id`; internal membership and account primary
keys must not be exposed.

`team_members.role` remains temporarily for compatibility, but it is not the
source of authorization decisions. It will be removed only after remaining
legacy readers have been retired and production data has been verified.
Ownership is derived exclusively from `teams.ownerAccountId`. All existing
owner lookups, including ticket notification and code-injection checks, must be
migrated away from `team_members.role` before the column is removed.

Change the `teams.ownerAccountId` account foreign key from cascade-on-delete to
restrict/no-action. Team deletion remains an explicit team operation and still
cascades memberships and invitations. Account deletion must never implicitly
delete a team.

### 10.2 Invitations

Add `team_invitations` with:

```text
id                       internal UUIDv7 primary key
invitation_id            public tinv_... identifier
team_id                  internal team foreign key, cascade on team delete
email                    normalized email
permissions              typed text array
invited_by_account_id    nullable inviter account foreign key, set null on account deletion
token_hash               unique hash; raw token is never stored
status                    pending | accepted | rejected | revoked | expired
expires_at               timestamp
accepted_at              nullable timestamp
rejected_at              nullable timestamp
revoked_at               nullable timestamp
created_at               timestamp
updated_at               timestamp
```

There may be at most one `pending` invitation per normalized
`(team_id, email)`, enforced by a partial unique index. Invitations expire after
seven days. Creating/resending first transitions an expired pending row to
`expired` in the same transaction. Resending a still-pending invitation rotates
the token, resets expiry, updates the proposed permissions after authorization,
and invalidates the previous link. State transitions use a conditional update
from `pending` so only one concurrent terminal action can win.

Index invitations for `(team_id, created_at)`, active `(team_id, email)`, and
expiry cleanup. Member and invitation list endpoints use cursor pagination with
a default of 50 and maximum of 100 rows; they must not load an unbounded team
roster into memory.

Invitation tokens must be generated from at least 256 bits of cryptographically
secure randomness, stored only as a one-way hash, redacted from logs, and
returned only to the email-delivery boundary. Hash comparison is constant-time.

Permission identifiers are stable API data. Before an identifier is removed or
renamed, a data migration must rewrite existing memberships and invitations.
Deploying code that merely stops recognizing a persisted permission is not an
acceptable migration strategy.

Changing an implication can expand every existing member who holds its source
permission. Such changes require the same security review, release note, and
migration analysis as adding a new permission; they are not ordinary refactors.

### 10.3 Authorization audit events

Record at least:

- invitation created, resent, accepted, rejected, expired, or revoked;
- member permissions changed, including before and after sets;
- member removed or self-left;
- ownership transferred; and
- API key created or revoked by a human actor.

Each event records the team, actor account when present, target account or
email when applicable, timestamp, and structured metadata. Raw invitation
tokens, API keys, OTPs, and other secrets must never be recorded.

Persist events in an append-only `authorization_audit_events` table with an
internal ID, event type, team public-ID snapshot, nullable actor account ID,
target member public ID or normalized invitation email when applicable,
before/after permission arrays when applicable, JSON metadata, `createdAt`, and
`expiresAt`. Actor foreign keys use `ON DELETE SET NULL`; the team public-ID
snapshot is retained after team deletion. Event insertion is part of the same
transaction as the security mutation. Index `(team_public_id, created_at)` and
`expires_at`; a bounded cleanup job deletes expired rows. There is no update
path or dashboard audit-log UI in this release. Structured application logs
remain required for operational diagnosis.

## 11. Invitation lifecycle

### 11.1 Create or resend

1. The inviter selects a team, enters an email, and chooses permissions.
2. The API verifies current membership and `members:invite`.
3. The API verifies every proposed permission is within the inviter's
   effective permission set.
4. If the email already belongs to a team member, the API returns a conflict.
5. The API creates or rotates an active invitation, records the current actor
   as its inviter, and sends the link.
6. The response exposes invitation metadata but never the raw token.

Owners may invite with any non-owner permission. An invitation cannot confer
ownership. Ownership is transferred only between accepted members through the
dedicated owner flow.

### 11.2 Accept

1. The invitee follows the link and signs in or creates a FrontLit identity.
2. The authenticated account's verified, normalized email must exactly match
   the invitation email.
3. The API verifies the token hash, expiry, and unused/unrevoked state.
4. The API locks or atomically claims the invitation so a resend, revocation,
   permission change, and acceptance cannot race.
5. In the same transaction, the API revalidates that the current inviter is
   still an owner or still has `members:invite` and may delegate every proposed
   permission. If not, it revokes the stale invitation instead of granting it.
6. The API creates the membership with the
   invitation's current permissions and marks the invitation accepted.
7. Acceptance is idempotent for the resulting account and team. It must never
   overwrite permissions on a membership that already existed independently.
8. The accept response identifies the joined public team ID. The dashboard
   selects that team and takes the new member to their first permitted area.

The system must not create an accepted membership before the invitation is
accepted. An existing bare `accounts` row may be linked during normal sign-in,
but email possession is still proven through Better Auth before acceptance.

### 11.3 Reject, revoke, and expire

- The matching invitee may reject an invitation after authentication.
- An authorized team member may revoke an active invitation if the target
  permission set is within their management authority.
- Expired, accepted, rejected, and revoked tokens cannot be reused.
- A background cleanup may delete old terminal invitations after the audit
  retention period; team deletion cascades all invitations immediately.

### 11.4 Acceptance-link handling

The email link uses the public invitation ID in its path and places the raw
secret in the URL fragment, for example:

```text
https://app.frontlit.example/team-invitations/tinv_123#token=<secret>
```

Fragments are not sent in HTTP requests or referrer headers. The first-party
page reads the secret, keeps it only in memory or session storage across the
sign-in redirect, and submits it in the accept/reject POST body. The page sets
`Referrer-Policy: no-referrer`, loads no third-party scripts, never sends the
secret to analytics or error reporting, and removes it from browser-visible
URLs after use. The raw secret must not appear in server access logs.

## 12. Member administration

### 12.1 View members

Members with `members:read` may view:

- member name and email;
- owner status;
- explicit/effective permissions;
- join date; and
- pending invitation metadata.

Members without `members:read` must not receive the roster through the API,
even if the dashboard does not link to it.

### 12.2 Edit permissions

- Only the owner or a member satisfying the non-escalation rules may edit a
  target membership.
- The complete resulting permission set is submitted and validated.
- The target's current and proposed effective permission sets must both be
  subsets of a non-owner actor's effective permission set. This prevents a
  lower-authority manager from stripping or modifying a higher-authority
  member.
- Updates use a transaction and must not partially apply. The actor's current
  membership, permissions, and owner status are rechecked inside that
  transaction so concurrent revocation cannot authorize the mutation.
- Concurrent edits must not silently overwrite one another. The endpoint uses
  the submitted membership `version`, increments it with a conditional update,
  and returns `409` when the membership changed since it was loaded.
- The owner cannot be edited through this endpoint.
- Members cannot edit their own permissions.

### 12.3 Remove or leave

- The owner may remove any non-owner member.
- A member with `members:manage` may remove only a non-owner whose effective
  permission set is a subset of their own.
- Any non-owner may leave a team without `members:manage`.
- The owner must transfer ownership before leaving.
- Removing or leaving deletes the membership and immediately prevents browser
  and OAuth access to the team.
- Removal or leaving revokes the account's OAuth consent/refresh-token families
  whose team reference matches this team. Team deletion performs the same
  cleanup for every member.
- Resources created by the departing member remain owned by the team. Any
  fields requiring a valid assignee, such as ticket assignment, must be
  cleared or reassigned transactionally.
- Member removal rechecks the actor and target inside the transaction. A stale
  dashboard view is never sufficient authorization.

### 12.4 Transfer ownership

Only the current owner may transfer ownership. The target must be an accepted
member of the same team.

The transfer occurs in one transaction:

1. lock or otherwise serialize the team ownership update;
2. verify the actor is still the owner;
3. update `teams.ownerAccountId` to the target account;
4. give the former owner an explicit full non-owner permission set so they do
   not unexpectedly lose workspace access;
5. update any transitional legacy owner/member fields; and
6. if the owner selected secure offboarding, revoke all existing team API keys;
   and
7. append the audit event.

At no observable point may a team have zero or two owners.

Ownership transfer is a first-party browser-session operation. It requires
CSRF/origin protection, recent authentication, and an explicit confirmation.
OAuth clients and API keys cannot transfer ownership. Browser-initiated team
deletion receives the same protections; FrontLit's existing explicitly scoped
OAuth deletion path remains available to the current owner.

## 13. API requirements

The exact contract naming may follow existing ts-rest conventions. The product
requires equivalent operations to:

```text
GET    /teams/:teamId/members
PATCH  /teams/:teamId/members/:memberId
DELETE /teams/:teamId/members/:memberId
POST   /teams/:teamId/members/leave
POST   /teams/:teamId/transfer-ownership

GET    /teams/:teamId/invitations
POST   /teams/:teamId/invitations
POST   /teams/:teamId/invitations/:invitationId/resend
DELETE /teams/:teamId/invitations/:invitationId

POST   /team-invitations/preview
POST   /team-invitations/accept
POST   /team-invitations/reject
```

Requirements:

- Membership, invitation, leave, and ownership-transfer endpoints are
  first-party browser-session operations in this release. They do not accept
  OAuth or API-key authentication. This avoids inventing or overloading an
  OAuth scope before membership-management scopes are designed.
- Accept/reject endpoints require a browser session but do not require existing
  membership in the invited team.
- Preview also requires a browser session and matching account email. It
  accepts the secret in the request body and returns only the team name,
  inviter display name, expiry, and proposed permission set needed for the
  confirmation screen.
- Existing team operations such as list, create, rename, and API-key management
  retain their supported session/OAuth boundaries and use the central policy.
- Invitation secrets are submitted in request bodies, not exposed in response
  lists or query strings generated by the API.
- All request and response shapes live in `@frontlit/api-contract` and use Zod.
- OpenAPI output remains synchronized with the implemented REST contract.
- MCP membership-management tools are not included in the first release.
  Existing team/product MCP operations must still enforce human permissions
  for OAuth callers.

## 14. Dashboard requirements

Add a **Members** area to team settings with:

- accepted members and pending invitations in one understandable view;
- a distinct, non-editable Owner indicator;
- permission summaries rather than raw identifiers;
- an invitation dialog with preset and custom permission selection;
- a permission editor using the same grouped controls;
- clear indication of implied permissions;
- warnings for `members:manage`, `domains:write`, `ai:write`,
  `settings:write`, and `broadcasts:send`;
- resend and revoke controls for pending invitations;
- remove and ownership-transfer confirmation flows;
- a self-service Leave team action for non-owners; and
- disabled controls with a concise explanation when the viewer lacks authority.

The UI filters the selectable permission set to permissions the acting member
may delegate. The server repeats every check.

The workspace shell also consumes the `GET /teams` capability snapshot. It
hides product areas that the selected member cannot read, including empty
navigation groups. A direct, bookmarked, or stale link to an inaccessible
team-scoped area redirects to the first permitted workspace area; if the team
has no permitted product area, it redirects to **Account**. Switching teams
keeps the current route only when it is permitted in the destination team and
otherwise uses that same safe landing route. These are UX protections only;
the API remains the enforcement point.

Chrome-free content editors have the same treatment even though they are not
inside the workspace sidebar shell. A read permission opens the corresponding
library, while the editor requires that area's `:write` permission. A direct
editor URL without write authority returns the member to the readable library
or another safe landing area. The page editor also avoids loading or mutating
team settings when the member lacks the corresponding settings permission.

Invitation links must preserve the token through sign-in without exposing it
to third-party analytics, referrer headers, or application logs. After
acceptance, the token is removed from browser-visible URLs.

## 15. Email requirements

The invitation email contains:

- team name;
- inviter identity when available;
- invitation expiry;
- a single acceptance link; and
- guidance to sign in with the invited email address.

It must not enumerate sensitive internal permissions in a way that leaks team
configuration to an unverified recipient. A concise description such as
"Content and media access" is acceptable; the signed-in acceptance screen can
show the complete permission set before acceptance.

Email delivery failure must not create a membership. The invitation remains
pending and may be resent. The API returns a delivery-aware error without
exposing SMTP details.

## 16. Migration and rollout

### Phase 1: Permission foundation — delivered

- Introduce the typed catalog, permission implications, central policy, and
  authorization context.
- Add public `memberId`, `permissions`, `version`, and `updatedAt` fields to
  `team_members`.
- Treat `teams.ownerAccountId` as canonical owner.
- Change owner-account deletion from cascade to restrict/no-action.
- Inventory every authenticated REST operation and MCP tool and assign a
  policy before enabling invitations.
- Enforce permissions for session and OAuth callers.
- Return `isOwner` and `effectivePermissions` from `GET /teams` for
  permission-aware dashboard navigation and controls.

For a later production rollout, owner rows need no stored permission snapshot;
existing non-owner rows would require an explicit grant mapping. The current
platform is in early development, so the database baseline is reset instead:
no compatibility aliases or backfill from superseded permission identifiers
is retained.

### Phase 2: Membership lifecycle — delivered

- Add invitations and acceptance.
- Add member listing, permission editing, leaving, removal, and ownership
  transfer.
- Add email delivery and dashboard surfaces.
- Add structured audit events.

### Phase 3: Cleanup — remaining follow-up

- Remove authorization checks against `team_members.role`.
- Remove the legacy role column after production data and code are verified.
- Review API-key scoping as a separate security feature.
- Consider consent-time OAuth down-scoping as a UX improvement.

The early-development baseline uses the unified content identifiers directly:
`articles:*`, `documentation:*`, and `product-updates:*`. The superseded
`blogs:*`, `docs:*`, and `changelogs:*` grants are not accepted aliases and do
not appear in the reset baseline. REST routes live under `/content`, and the
OAuth/MCP scope catalog uses the same current identifiers.

Invitations must remain disabled until Phase 1 enforcement and its policy
coverage tests are deployed.

### Authentication-schema follow-up — delivered

Sensitive browser actions (team deletion and ownership transfer) require a
fresh email-OTP verification. Better Auth records session creation separately
from that verification, so the baseline schema includes
`auth_session.reauthenticated_at`. The timestamp is set only on the current
session after successful re-verification; session creation time is never
rewritten. FrontLit is still in resettable early development, so its former
incremental migration history has been replaced by one current-schema baseline.

## 17. Security and privacy requirements

- Every resource query remains constrained by the resolved internal `teamId`.
- A route `teamId`, OAuth team claim, selected-team header, and resource tenant
  may never be trusted without server-side resolution and membership checks.
- A failed membership check for an OAuth token's claimed team terminates the
  request. It must not enter the session/header/sole-team selection path.
- Permission checks occur after authentication and team resolution and before
  business mutations or external calls.
- Invitation and permission mutations are rate-limited per actor and team.
- Invitation acceptance is additionally rate-limited per IP and token prefix
  or equivalent non-secret identifier.
- Responses do not reveal whether an arbitrary email has a FrontLit account.
- Account emails are normalized consistently but not rewritten with
  provider-specific rules such as stripping `+suffixes`.
- Invitation tokens, API-key secrets, OAuth tokens, OTPs, and SMTP credentials
  are redacted from logs and audit metadata.
- Permission mutation, membership removal, and ownership transfer use database
  transactions.
- Sensitive membership transactions re-read and lock or conditionally update
  the actor, target, and team rows needed for the decision; authorization
  loaded earlier in the HTTP request is not reused as proof inside the write.
- State-changing browser endpoints enforce FrontLit's same-site cookie policy
  plus an Origin/CSRF check. Ownership transfer and team deletion additionally
  require authentication completed within the preceding ten minutes; otherwise
  the user completes a fresh verification with FrontLit's existing email-OTP
  mechanism.
- Owner-only code injection remains owner-only for human requests.
- Full-team API-key listing, creation, and revocation remain owner-only until
  scoped keys exist.
- Account deletion is rejected while the account owns any team; it never
  cascades into team deletion.

## 18. Observability

Emit structured logs and metrics for:

- invitations created, delivered, accepted, expired, revoked, or rejected;
- invitation delivery failures;
- membership additions/removals and ownership transfers;
- permission update conflicts;
- authorization denials by operation, auth kind, and required permission or
  scope, without logging secrets or sensitive resource contents; and
- OAuth requests denied because current member permissions are narrower than
  token scopes.

Useful product measures include invitation acceptance rate, median time to
accept, teams with more than one active member, and the distribution of
permission presets selected at invitation time.

## 19. Testing requirements

### Authorization unit tests

- Owner receives every human permission without a stored permission list.
- Members receive only their stored permissions plus documented implications.
- Unknown persisted or submitted permissions are rejected, and effective
  permission closure is deterministic.
- A non-owner cannot grant, revoke, or manage beyond their authority.
- A non-owner manager cannot alter or remove a member whose current effective
  permission set exceeds their own.
- A member cannot edit their own permissions or any owner's permissions.
- Owner-only operations cannot be reached through broad ordinary permissions.
- Policy lookup fails closed for an unregistered protected operation.

### REST and MCP integration tests

- Every protected route has allowed and denied member cases.
- Every MCP tool retains its OAuth scope check and additionally respects the
  current human permission.
- REST OAuth requests require both permission and scope.
- Session requests require permission but no OAuth scope.
- API-key behavior remains fixed-team and is not accidentally bound to a human
  membership.
- Only the owner can manage full-team API keys; a restricted member cannot mint
  a key to escape their restrictions.
- Permission removal and membership removal affect the next request made with
  an already-issued OAuth token.
- A team-bound OAuth token never falls back to a different sole team after its
  claimed membership is removed.
- Removing and later recreating a membership does not revive access or refresh
  tokens from the earlier membership generation.
- REST and MCP reject tokens with the wrong resource audience even when scopes
  match.
- Cross-team resource and membership operations fail without leaking data.
- Existing owner-only team deletion and code-injection boundaries remain.

### Invitation and ownership tests

- Duplicate active invitations are handled deterministically.
- Resend rotates the token and invalidates the previous token.
- Expired, rejected, accepted, and revoked tokens cannot be reused.
- The accepting account email must match the invitation.
- Acceptance rejects an invitation whose inviter no longer has authority to
  delegate its proposed permissions.
- Concurrent acceptance creates one membership.
- Concurrent permission edits return a conflict rather than losing an update.
- Concurrent permission revocation and a membership mutation cannot let the
  stale actor mutation commit.
- Owner transfer is atomic and leaves exactly one owner.
- Owner-account deletion is restricted and cannot cascade team deletion.
- Team deletion cleans up invitations and membership data.

### Contract and migration tests

- ts-rest schemas, implementations, and generated OpenAPI remain aligned.
- Migration preserves existing non-owner access and identifies ownership
  invariant violations, with the documented owner-only API-key exception.
- Contracts expose public member/invitation IDs and never internal primary
  keys.
- Member and invitation listing respects pagination limits.
- The full repository test, lint, type-check, and formatting commands pass.

## 20. Acceptance criteria

The feature is complete when:

1. A team owner can invite a person with an explicit permission set.
2. The invitee can authenticate, inspect, and accept the invitation only with
   the invited email.
3. The accepted member can access exactly the permitted dashboard and API
   operations.
4. A member with delegated membership authority cannot grant or manage
   permissions beyond their own.
5. Permission changes and removal affect the next browser or OAuth request.
6. OAuth operations require both a current human permission and a matching
   token scope.
7. Owner-only actions remain inaccessible to non-owners.
8. Every authenticated REST operation and MCP tool is registered in a
   fail-closed policy.
9. Membership and invitation actions are covered by audit events and tests.
10. No persisted authorization role other than the transitional legacy column
    controls access.
11. A restricted member cannot use OAuth team fallback or full-team API-key
    creation to escape their human permissions.
12. Account deletion and ownership transfer preserve exactly one owner and one
    accepted owner membership without implicit team deletion.

## 21. Resolved first-release decisions

The first release uses these decisions so implementation does not depend on
unresolved product behavior:

1. Content publishing and deletion remain under each content type's `:write`
   permission: articles, documentation, or product updates. The three pairs
   appear under one Content UI group but remain independently grantable.
   Broadcast sending remains separate because it causes an immediate external
   side effect.
2. Full-team API keys are owner-managed. A future scoped-key design may reuse
   permission names, but keys keep a distinct stored grant and lifecycle just
   as OAuth does.
3. Hosted deployments retain membership security audit events for 180 days.
   Self-hosted deployments default to 180 days and may configure retention.
4. Invitations expire after seven days in the first release. Configuration is
   deferred until a demonstrated self-hosting need.
5. The invitation UI has no preselected preset. The inviter must explicitly
   choose a preset or Custom, preventing accidental full access.
6. Membership-management and ownership-transfer endpoints are session-only.
   OAuth support requires dedicated scopes and is a separate feature.

## 22. Implementation record

The first release is implemented with the following operational details. This
section records the deployed behavior where it is more specific than the PRD.

1. `GET /teams` returns only accepted memberships and includes the viewer's
   `isOwner` flag and effective (implication-expanded) permissions. The web
   dashboard refreshes this snapshot after team changes.
2. Permission implications are computed from the shared catalog. For example,
   a `:write` grant includes its matching `:read` grant, `broadcasts:send`
   includes broadcast read/write, and invitation/management grants include
   member read. Owners receive the complete current catalog implicitly.
3. The API uses a fail-closed REST-operation registry and equivalent MCP
   checks. OAuth callers must satisfy both the current human permission and
   the token scope. API keys retain their existing full-team authority only
   for operations explicitly marked API-key compatible; managing keys remains
   owner-only and user-authenticated.
4. Content operations use one public vocabulary across surfaces: REST paths
   under `/content/articles`, `/content/documentation`, and
   `/content/product-updates`; OAuth scopes named `articles:*`,
   `documentation:*`, and `product-updates:*`; and MCP tools named for
   articles, documentation pages/sections, and product updates. The database
   discriminator (`blog | doc | changelog`) is internal storage detail only.
5. Invitations have a seven-day lifetime, a hashed fragment-held secret,
   cursor-paginated roster/invitation lists, and bounded in-process hourly
   maintenance for invitation expiry and expired audit-event cleanup. The
   authorization audit retention defaults to 180 days and can be configured
   with `AUTHZ_AUDIT_RETENTION_DAYS`.
6. Membership and invitation management are browser-session operations.
   `preview`, `accept`, and `reject` require the invited account's matching
   email but do not require prior membership in that team. Members may leave;
   owners must transfer ownership first.
7. The legacy `team_members.role` column is still written for compatibility,
   but no authorization decision may depend on it. `teams.ownerAccountId` is
   the only ownership authority.
8. Ordinary sign-in may create a teamless account. The Account screen presents
   explicit create-or-join onboarding, and invitation acceptance creates only
   the invited membership. The deployment super-admin bootstrap remains an
   explicit exception that creates its initial team and API key.
