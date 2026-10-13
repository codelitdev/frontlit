# FrontLit Docs Management — PRD, Implementation, and Testing Guide

Status: D1–D7 implemented and signed off for local/staging use on 2026-10-03.  
Requirements originated 2026-09-30; setup-PR scope revised 2026-10-02; consolidated 2026-10-03.  
Scope: Authoring, organization, review, publication, delivery, and improvement of product documentation.

This is the single authoritative feature document. §§1–26 define the product and acceptance contracts; §27 describes the delivered implementation; §28 explains how to verify it; §29 records acceptance evidence and release disposition; §30 is the operator runbook. §31 retains dated implementation and smoke evidence, including fixture identities and recovery observations. Update this file when requirements, implementation, evidence, or release status change.

**Current disposition:** Every V01–V49 scenario has passing local, real-PostgreSQL, or live evidence at its recorded scope. Production backup/retention and deployed scale/cache exercises remain gates. MEDIA-01 no longer applies: media verification was removed (2026-10-13) and MediaLit is treated as plain storage (§24.2). Detailed remaining checks and their scope are in [release disposition](#requirement-and-release-disposition).

The latest recorded full API scope is 713 passing tests and one MEDIA-01 failure; dashboard 97 and sites 45 passed. These are prior feature-verification results, not tests rerun during this documentation consolidation. Evidence scopes overlap and must not be added together. Verification results and limitations are retained in this document. Raw smoke logs and browser snapshots were removed during cleanup on 2026-10-03; historical `/tmp` artifact paths are provenance only and may no longer exist. Rerun the commands in §28 for fresh evidence.

Historical reports in §31 describe their original checkpoints. Their statements that D6/D7, source activation, empty-repository setup, or individual scenarios were pending are superseded by §29. Old manual export/commit setup, synchronous mutable-column publication, development-vector retrieval, and 60-second public cache behavior describe earlier implementations. Use the current contracts and guides for new work. A recorded environment outage or fixture state is not a statement about today's running services.

Reading guide:

- [Product requirements and requirement index](#product-requirements): §§1–16 overview, §§17–24 detailed contracts.
- [Work packages and expected acceptance scenarios](#25-implementation-work-packages-and-executable-acceptance-scenarios): D1–D7 and V01–V49.
- [Implementation guide](#implementation-guide): code map, migrations, and current behavior.
- [Testing guide](#testing-guide): local, database, provider, and visible-browser procedures.
- [Acceptance audit](#acceptance-audit): recorded evidence and production gates.
- [Operations runbook](#operations-runbook): App setup, delivery recovery, rotation, and restore.
- [Historical evidence](#historical-evidence): detailed dated browser results, fixes, fixture IDs, and logs.

Requirement IDs remain stable. Each implementation and acceptance test cites its relevant ID. If requirements conflict, correct the contract before implementing; there is no blanket “later section wins” rule. The dated evidence archive is not an alternate requirements source. Preserve unrelated blog, changelog, Pages, email, and support behavior, and keep admin and learner identities separate.

<a id="product-requirements"></a>

| ID | Authoritative contract | Verification |
| --- | --- | --- |
| DM-SOURCE | §§4–5, one source, Sections, Markdown metadata | V12, V14, V42–V44, V46–V49 |
| DM-ROUTE | §6, URL mapping and internal-link rules | V03, V11–V12 |
| DM-VALIDATE | §§18.1–18.6, validation and transport parity | V02–V06 |
| DM-AUTH | §18.7 and §20.4, permissions and Git delegation | V24–V25, V35–V36, V48 |
| DM-EDITOR | §19, editor-only lifecycle and preview | V01, V05–V06, V40 |
| DM-NAV | §19.2, Section snapshot concurrency | V10, V34 |
| DM-GITHUB | §§20–22, setup, sync, proposals and review | V13–V23, V28, V46–V49 |
| DM-PUBLISH | §§23.1–23.2, preparation and activation | V07–V09, V15 |
| DM-DELIVERY | §23.3, active reads, caches and outbox | V31 |
| DM-RETENTION | §23.6, retention, cleanup and sensitive-data purge | V38–V39 |
| DM-CONVERT | §24.1, conversion/heading fixtures | V29 |
| DM-MEDIA | §24.2, media verification and references | V26, V37 |
| DM-FEEDBACK | §24.3, evidence, review and injection containment | V30, V41 |
| DM-MIGRATE | §21.5, platform-created setup/adoption PRs | V42–V44, V46–V49 |
| DM-OPERATE | §23.4 and §26, bounded jobs and release gates | V16, V27, V45 |

## 1. Product direction

FrontLit is the connected front office of a SaaS: website, content, shared inbox, AI answers, help desk, and email. Documentation is the shared product knowledge behind these surfaces.

**One published document supplies the website page, chatbot citation, and ticket reply.** Engineering and coding agents can maintain Markdown beside the code. Founders and support teams can use the visual editor. Customer questions identify what needs improving next.

FrontLit supports both editor-owned and Git-owned documentation. Agent access is independent of Git: authenticated agents can also read content and propose drafts through the FrontLit API and existing administrative MCP surface.

MediaLit owns all file bytes. FrontLit owns document metadata, content revisions, publication state, and derived retrieval data. Do not store uploaded binaries in Git or FrontLit's database.

This PRD defines intended behavior, not a claim that the features already exist. For documentation management, it supersedes the JSON-only/no-Markdown storage restriction in [architecture.md](./architecture.md). It preserves that document's shared content engine, team-scoped API conventions, and separation of the dashboard and public sites. TipTap JSON remains the editor and rendering representation; Markdown is the Git source and interchange representation.

## 2. Problem and intended customers

Product documentation becomes disconnected from releases and customer support. Engineers work in repositories, support works in an editor, and customers encounter inconsistent explanations across the site and answers. Repeated questions rarely become reviewed documentation updates.

Initial customers:

- Technical solo founders who want coding agents to update docs while implementing features.
- Small SaaS teams where engineering and support share responsibility for product knowledge.
- Editor-first SaaS teams that want useful docs and grounded support without adopting Git.

FrontLit itself is the first Git-backed dogfood customer. It must be able to publish a configured Markdown directory in its repository. The directory does not need to be named `docs/`, and its previous rendering framework is irrelevant.

## 3. Goals and non-goals

### Goals

- Offer instant editor-first onboarding without requiring or creating a repository.
- Publish Markdown from a selected repository directory and branch.
- Give the team's docs area one explicit canonical source.
- Separate drafts and review from customer-visible publication.
- Keep site content, retrieval, and citations tied to the same active publication.
- Surface actionable validation errors without damaging live docs.
- Turn evidence from customer questions into reviewed documentation improvements.
- Keep authoring and publication capabilities accessible through APIs.

### Non-goals for the initial release

- Hosting arbitrary Next.js, Fumadocs, or other documentation applications.
- Executing arbitrary MDX, JSX, imports, or repository code.
- Reproducing existing documentation frameworks and their plugins.
- Generating an entire help center autonomously from source code.
- Using Notion, Confluence, or another help desk as a canonical source.
- Automatic customer replies based on unpublished content.
- Enterprise ITSM, multilingual publishing, branch-specific chatbot previews, or screenshot automation.

## 4. Product model and source ownership

A team has one docs area, mounted at the fixed public route `/docs`. There is no user-facing collection resource, configurable public prefix, or separately mounted `/developers` docs area in this scope. The team configures one documentation authoring source: `editor` or `git`, with at most one connected repository, branch, and directory. This choice applies to documentation only; it does not change ownership of blog posts, changelog entries, or page-builder Pages.

Documents are organized using the existing Sections. Sections are navigation groups within `/docs`, not independently published sites or source boundaries. Existing implementation names such as `DocsCollection`, `ThemedDocCollection`, and `/docs/collections/:slug` refer to section presentation; they do not imply the configurable collection product previously proposed. Renaming these implementation identifiers is not required by this PRD.

| Concern | Editor-owned docs | Git-owned docs |
| --- | --- | --- |
| Canonical authored content | FrontLit database | Markdown in configured Git branch |
| Editor save | Save database draft | Save database draft based on a Git revision |
| Publication | Validate and activate database revision | Commit or PR; import accepted publishing-branch revision |
| Production reads | Active database publication | Active database projection |
| Embeddings | Derived from published content | Derived from published content |

Saving never publishes. A document may have both a published revision and a newer draft; a single `draft | published` status cannot represent this lifecycle.

For Git-owned docs, opening a PR or pushing a feature branch does not make content live. Only the configured publishing branch is eligible. Git remains canonical even when a commit cannot be published: the live database projection stays on the last successful revision until the repository is corrected.

Source switching and repository disconnection never silently change ownership or delete content. Disconnection preserves Git ownership and the last publication. The Git dogfood milestone includes the reviewed, platform-created editor-to-Git adoption PR in §21.5; FrontLit-created setup/adoption PRs are required in that milestone; switching Git repositories and Git-to-editor conversion remain later scope.

## 5. Authoring and organization

### Visual editor

Use `@frontlit/text-editor`, built on TipTap, with TipTap JSON as its in-memory document representation. Support titles, descriptions, slugs, navigation placement, and content editing separately from publication.

Initial content vocabulary: paragraphs, headings, emphasis, links, ordered and unordered lists, blockquotes, code blocks, horizontal rules, images, and simple tables. Every enabled block must have a tested Markdown representation. Additional blocks such as callouts require explicit parsing and serialization support before being enabled for docs.

Show save state, unpublished changes, publication state, validation errors, and the last successful publication. Git-owned docs additionally show the source path, commit, sync status, and any associated PR. During the narrow Git dogfood phase, imported docs are read-only in the editor with an edit-in-repository link.

### Markdown directory

Configure a repository, publishing branch, and content directory. Default the directory suggestion to `docs/`; allow any selected directory within the repository. Scan `.md` files recursively inside that boundary. Do not follow symlinks outside it or execute repository content.

Example:

```text
docs/
  index.md
  getting-started.md
  custom-domains.md
  support/
    index.md
    inbox.md
```

```markdown
---
title: Custom domains
description: Connect your domain to your FrontLit site.
slug: custom-domains
nav_order: 20
published: true
---

Connect a domain from your workspace settings.
```

Initial frontmatter contract:

| Field | Rule |
| --- | --- |
| `title` | Required nonempty string |
| `description` | Optional string |
| `slug` | Optional route relative to `/docs`; defaults to relative file path without extension |
| `nav_title` | Optional navigation label; defaults to title |
| `nav_order` | Optional integer; lower values appear first among siblings |
| `published` | Optional boolean, default `true`; `false` excludes the page from public delivery and retrieval |
| `indexable` | Optional boolean, default `true`; `false` retains a published page but excludes it from search and AI retrieval |
| `featured_image` | Optional verified public image object `{ url, alt }`; uses the same managed/external URL rules as body images |

For the initial release, retain the existing flat Sections model. The first directory below the configured source root maps to a Section. Root-level documents are unsectioned and use the existing fallback group (currently "More"). A folder's name supplies a default display label and its path segment supplies the section slug. Empty Git folders do not create sections. Editor-owned docs continue to support manually created Sections.

Deeply nested files are supported, but do not require nested Sections in v1. For example, `docs/a/b/c/d/e/f/g/h/intro.md`, with source directory `docs/`, belongs to Section `a` and defaults to `/docs/a/b/c/d/e/f/g/h/intro`. Intermediate folders remain part of the source path and default URL; they are not additional Section records. Nested section navigation is later scope. Sort documents within a Section by explicit order, then deterministically by path; Git-derived Sections use deterministic path ordering initially.

An `index.md` is an ordinary article: `support/index.md` defaults to `/docs/support`, while root `index.md` defaults to `/docs/index`. Neither replaces the existing `/docs` documentation feed or the section listing pages. Frontmatter is stored separately from TipTap nodes; preserve unknown metadata when editing Git documents rather than silently dropping it.

Navigation and URL are distinct: a frontmatter slug override changes the route without moving the source file or its Section. In Git mode, moving a file between first-level folders changes its Section on publication. Full UI-to-Git support must represent Section membership changes as file moves; do not maintain a competing database-only organization. Optional root `_sections.json` defines Section labels/order and preserves empty authored Sections as specified in §21.5; it does not define routes or nested collections. Validate links against resolved routes.

### Document lifecycle

- Create and save drafts without exposing them publicly.
- Preview a draft through authenticated, explicitly unpublished preview access.
- Publish a new document or a revision of an existing document.
- Unpublish while retaining authoring content.
- Delete with an explicit confirmation in the editor; Git deletions are represented by the accepted repository revision.
- Treat slug changes as URL changes. Show affected internal links; do not silently create redirects. Redirect management is later scope.

In Git mode, unpublishing and deleting must be represented in Git, not only in the projection. Setting `published: false` removes a previously published page when that candidate is activated.

## 6. Validation and publication

### Core invariant

**Validate a complete candidate before activating it. If validation or preparation fails, the last successful publication remains live.** No partial Git docs publication is allowed.

Editor publishing validates the selected changes together with the rest of the resulting docs area. Other unrelated drafts are excluded. Git publishing validates the full configured directory at a specific immutable commit, including additions, changes, and deletions.

### Routes and uniqueness

Default routes under the fixed `/docs` route:

```text
getting-started.md     → /docs/getting-started
support/inbox.md       → /docs/support/inbox
support/index.md       → /docs/support
index.md               → /docs/index
```

Proposed v1 slug policy: lowercase ASCII letters, digits, and hyphens within slash-separated segments. Lowercase before collision checks; remove a trailing slash. Reject empty interior segments, leading slashes in explicit slugs, dot segments, query strings, fragments, URL schemes, and encoded path separators. Use Latin slugs initially even if article text uses other scripts; broader URL policies belong with later localization work.

Validate the final route after combining `/docs` and the resolved slug. `/docs` remains the existing documentation feed, rendered inside the site's shared header and footer. The source directory is configurable; the public prefix is not.

Document routes must be unique within the team's docs area. Reserve section-listing routes (currently `/docs/collections/:slug`) and other docs infrastructure routes so article slugs cannot shadow them. Reserve the `/docs` namespace from arbitrary page-builder Pages while retaining the existing configured `/docs` feed integration. Multiple teams may use the same route on their own sites. Enforce active-route uniqueness in the database as a final concurrency backstop.

Example error:

```text
Cannot publish documentation

Duplicate route: /docs/getting-started

  docs/getting-started.md
  docs/setup.md

Both resolve to "getting-started".
Set distinct slugs or remove one of the pages.
```

### Validation and publication contracts

DM-VALIDATE (§18) defines save versus publication checks, diagnostics, and REST/MCP behavior. DM-PUBLISH (§23) defines preparation, activation, idempotency, and recovery. Failed candidates never partially replace live docs.

Relative Markdown links resolve against original source paths and are projected to resolved public routes. Heading links use §24.1. Preserve authored links in source/authoring content; derive route rewrites for rendering/export so editing does not convert repository-relative links into stale website URLs. Links to other FrontLit site pages use the site route registry; external URLs are not recursively crawled.

Validate supported syntax/frontmatter for every managed Git file, including unpublished files. Public route uniqueness, public links, and delivery preparation apply to the candidate public set. Unpublish follows candidate validation.

## 7. Git integration and review

GitHub setup, permissions, synchronization, and failure reporting are defined in §§20–22 (DM-GITHUB). Initial dogfooding includes inbound sync; UI-to-PR/direct-commit authoring and GitHub checks are v1.1. Git wins accepted source conflicts while recoverable editor proposals are preserved. Save, submit, merge, and successful publication are distinct states.

## 8. Media

All managed bytes stay in MediaLit. The authoritative upload, ownership/visibility verification, URL handling, and deletion contract is §24.2 (DM-MEDIA). Reuse and harden the existing Media API rather than adding a second upload service. Public asset URLs are accessible even when their documents are drafts; the editor must make this distinction clear.

## 9. Public docs and machine consumption

Serve published docs only under `/docs`, using the site's domain and theme. Reuse the existing documentation feed, Section listings, article navigation, breadcrumbs, and search. Extend article routing to resolve nested slug paths; deep Git paths must not be truncated to one segment. Preserve stable heading anchors wherever content permits.

Page-builder Pages are separate custom JSON documents rendered into web pages. Markdown import creates documentation records, not page-builder Pages. The page-renderer/site-shell integration renders the shared header and footer widgets, with the themed documentation feed, Section listing, or article (`apps/sites/components/themed-docs.tsx`) between them. Preserve that composition and the existing `/docs` feed integration; do not introduce a separate docs theme or replace the site's shared shell.

All visual components in `apps/sites` use `@frontlit/page-builder` primitives and the themed `TextRenderer`. Add missing primitives in that package; do not substitute one-off typography or controls in the host. Keep `@frontlit/text-editor` decoupled from the page builder.

In v1.1, expose published Markdown routes such as `/docs/:slug.md` (including nested slug paths) and a generated `llms.txt` discovery document. These are projections of published articles, not alternate sources of truth. `/docs/index.md` exports the article at `/docs/index` if present, not the documentation feed.

Later, provide a reader-facing hosted MCP surface with `search_docs` and `read_page`. This is distinct from the existing authenticated administrative MCP tools used to manage drafts and publications.

## 10. Retrieval, citations, and support

Use one published knowledge pipeline for site search, chatbot answers, and help-desk suggestions. The initial corpus is published docs. Add changelog content in v1.1; this resolves the earlier brief's conflicting placement of changelog in both initial and v1.1 scope.

| Reader | Allowed sources | Output |
| --- | --- | --- |
| Public docs and search | Active published docs | Pages and search results |
| Customer-facing chat | Active published eligible content | Grounded answer with page/heading citations, or handoff |
| Help-desk copilot | Active published eligible content | Suggested reply with the same citations |

Customer-facing factual product answers require supporting citations. A citation alone is insufficient: the cited passage must support the claim. When available evidence is inadequate, ask a useful clarification or offer a ticket/handoff instead of inventing an answer. Greetings and clarification prompts do not require artificial citations.

Scope all retrieval by team, publication, and allowed content type. No drafts, unmerged branches, private attachments, or another team's content may enter public retrieval. Later use of resolved tickets is restricted to internal assistance with explicit access controls; it does not automatically make ticket content public knowledge.

Blog, docs, and changelog share the document engine with a `kind` discriminator, but do not automatically share retrieval eligibility. Current docs take precedence over historical announcements for present product behavior. Blog ingestion into answer retrieval is outside initial scope.

Record question, retrieved document/revision references, answer citations, feedback, and escalation outcome with appropriate retention and access controls. Autopilot is later scope; its release gate must be based on evaluated answer quality, not an arbitrary model-reported confidence number.

## 11. Customer-question feedback loop

A retrieval miss, negative feedback, or escalation becomes review evidence. Reviewers can turn a grouped issue into a draft or proposal, then use the normal publish workflow. The grouping rule, permissions, REST/MCP contracts, state transitions, and safety tests are defined in §24.3 (DM-FEEDBACK). Creating a draft is not proof that a customer issue has been resolved.

## 12. Logical data requirements

Use the existing shared document engine and flat Sections. §23.1 (DM-PUBLISH) defines persisted responsibilities and uniqueness; §23.6 (DM-RETENTION) defines lifetime and cleanup. These are data responsibilities, not a requirement for a separate table per concept.

## 13. API and permissions

The UI, REST API, administrative MCP tools, and workers share services and validation. §18 (DM-VALIDATE, DM-AUTH) owns authoring/preview/publication contracts; §21.4 owns Git operations; §24.3 owns feedback operations. Public readers receive the active publication through §23.3. FrontLit's API-host Swagger route is unrelated to tenant documentation routes.

## 14. Delivery plan

### v1 foundation and initial support loop

1. Shared document model, existing Sections, and team docs settings with separate drafts and published revisions.
2. TipTap JSON editor and document organization.
3. Headless Markdown import/export and a fixture corpus covering the supported vocabulary.
4. MediaLit picker and asset-reference handling.
5. Validation and publish pipeline: site projection, extraction, retrieval preparation, activation.
6. Published-content chat and ticket-reply suggestions with citations.
7. Customer-question improvement items leading to reviewed drafts.

Expose document conversion independently of React, for example `TextEditor.import(markdown)` and `TextEditor.markdown(doc)`, using a shared document extension schema. Browser-only picker/node-view integrations must not be prerequisites for worker conversion. Pin conversion dependencies and test semantic round trips; do not promise byte-identical Markdown formatting.

### Early Git dogfood milestone

Once the publication foundation works, add one-way repository-directory sync for FrontLit's own docs. This deliberately brings narrow Git support forward from v1.1 because it exercises the intended founder/coding-agent workflow with real content. It may run alongside completion of the v1 support loop; it does not require full editor-to-PR authoring.

Required: initial import, push sync, manual retry, full-candidate validation, deletion handling, FrontLit-created reviewed setup/adoption PRs, last-good publication, and visible commit/error status. Unsupported MDX and generated API-reference applications remain outside this milestone.

### v1.1

- Full GitHub App authoring: UI drafts to commits/PRs, conflict recovery, and PR checks.
- Markdown delivery routes and `llms.txt`.
- Changelog as an eligible, explicitly typed source in the shared index.
- Reviewed improvement items to GitHub issues/PRs.

### Later

- Branch previews and isolated preview embeddings/chatbot.
- Public reader MCP.
- Evaluated and controlled autopilot.
- Multilingual content and navigation.
- Nested Sections and navigation features beyond the flat `_sections.json` contract; independently mounted docs collections only if later demand warrants them.
- Redirect management, broader source migrations beyond §21.5, and asset-inclusive offboarding exports.
- Screenshot automation and additional source integrations where validated demand exists.

## 15. Acceptance criteria

The requirement index and scenario matrix in §25 are the acceptance authority. Implementations must satisfy normal workflows, negative inputs, authorization, and recovery for their milestone. §26 defines release gates; report unchecked scenarios rather than silently considering them complete.

## 16. Success measures and validation

Track time to first published document, publication success/failure and latency, and the share of teams receiving ongoing docs updates. Separate Git and editor workflows to learn which customers use each.

For the support loop, measure time from a recurring question to an approved correction, suggestion acceptance and rewrite effort, citation correctness on a reviewed question set, and recurrence of the original issue after publication. Do not optimize for article count or apparent deflection alone.

Validate the first complete workflow by implementing a FrontLit feature, updating its Markdown docs in the same change, publishing them, and asking a support question whose answer depends on the update. Also test with an editor-first customer; successful internal Git dogfooding does not establish demand for every customer segment.

Before release, set operational limits for file size, docs area size, job duration, and retries from measured dogfood behavior. Set answer-quality release criteria using representative questions and human review. These values remain implementation/release decisions rather than invented product guarantees.

## 17. Historical implementation baseline and required changes

This table records the pre-implementation baseline inspected when the PRD was written. Its gap descriptions are historical; §27 maps the delivered implementation. Recheck the current code before changing it, and reuse existing subsystems.

| Existing location | Current responsibility or gap | Required action |
| --- | --- | --- |
| `packages/api-contract/src/schemas/documents.ts` | Shared document schema accepts arbitrary records as TipTap children; slug updates are documented as immediate | Add docs-specific validation, draft versions, staged slugs, and diagnostic/result schemas |
| `packages/api-contract/src/schemas/documentation.ts` | Section membership, ordering, and `indexable` metadata | Retain these fields; validate references and give their changes publication semantics |
| `packages/api-contract/src/contract.ts` | CRUD under `/content/documentation`, Section endpoints, public reads | Extend these contracts; register literal paths before `:documentId` paths |
| `apps/api/src/documents/queries.ts` | Shared authoring engine; saves currently update live slugs and may change live indexing eligibility | For docs, save all authored fields to drafts only; route every publication through the new publication service |
| `apps/api/src/documents/docs-routes.ts` and `routes.ts` | Thin REST adapters over shared queries | Keep thin; shared services own validation, concurrency, and source rules |
| `apps/api/src/mcp/tools/documents.ts` | Tools use shared queries, but define some input schemas separately and often return generic errors | Reuse docs wire schemas and map structured domain errors without losing diagnostics |
| `apps/api/src/auth/operation-policy.ts`, `mcp/policy.ts` | Central operation permissions and MCP scopes; docs writes currently include publication | Add distinct publish/manage permissions and update policy coverage tests |
| `apps/api/src/db/schema.ts` | Draft/live columns, one mutable slug, flat Sections, chunks attached to documents | Add revision/publication identity; preserve flat Sections; prevent draft changes leaking into live routes |
| `apps/api/src/documentation/index-jobs.ts` and `worker.ts` | Durable leased jobs, but indexing runs after document promotion | Reuse queue/lease patterns; docs chunks must be prepared for immutable revisions before activation |
| `apps/api/src/integrations/github.ts` and `queries.ts` | Personal-token GitHub Releases import for product updates | Implement docs GitHub App access separately; do not overwrite the existing `github` integration's token/config |
| `packages/text-editor/src/extensions.ts` | Includes presentation/browser extensions, Highlight, and custom CodeMirror nodes | Extract a headless docs schema and explicitly map or reject unsupported nodes |
| `apps/sites/app/sites/[teamId]/docs/[slug]/page.tsx` | Single-segment article route | Replace with a catch-all article route while preserving static Section routes |
| `apps/sites/lib/docs-tree.ts` | Flat Section grouping and a fixed 500-item fetch | Paginate completely or expose a complete publication navigation projection; never silently truncate |
| `apps/sites/components/themed-docs.tsx` | Themed docs feed, Section list, and article body | Reuse inside existing shared page shell; expose publication-consistent navigation |

The existing API host's `/docs` Swagger route is unrelated to the tenant site's `/docs` product documentation. Do not rename or replace Swagger as part of this work.

## 18. Shared validation contract: REST, MCP, UI, and workers

### 18.1 Three different meanings of valid

1. **Valid request:** authenticated, authorized, within limits, well-typed, and associated with the correct team and resource.
2. **Safe draft:** valid document structure, supported nodes/marks/attributes, safe URLs, valid referenced Section/media ownership, and a current base revision. Safe drafts may still have incomplete titles, broken links, or a conflicting proposed route.
3. **Publishable candidate:** a safe draft or valid Git import whose complete resulting docs set passes routing, links, media, metadata, and delivery preparation checks.

These checks establish structural and publishing correctness. They cannot prove that prose accurately describes the product. Human review and grounded evidence remain necessary; a successful validation response must not claim factual verification.

Never rely on the caller first invoking a validation tool. Every save runs request and safe-draft checks before persistence; every publish repeats publication checks against the authoritative current state. A dry-run report is advisory and does not reserve routes or authorize a later write.

### 18.2 Headless document validation

Provide one server-safe document module used by import, editor, REST, MCP, and jobs. It must not instantiate React node views, depend on `window`/`document`, or import upload controls. Keep the shared schema and serializer behavior aligned with the editor; browser-only extensions are composed on top.

Validate the entire TipTap tree recursively with the document schema, including child ordering/cardinality, allowed marks, attribute types, and heading levels. Explicitly detect unknown nodes, marks, and attributes before parsing can discard them. Construct and check the schema document after validation. Normalize only documented nonsemantic differences, such as an omitted root content array; never convert an invalid supplied document into an empty one.

Initial supported marks: bold, italic, strike, inline code, and link. Highlight/underline/custom CodeMirror nodes from the general-purpose editor are not automatically supported in docs. Disable unsupported controls in the docs editor; importing an unsupported node returns `UNSUPPORTED_NODE` or `UNSUPPORTED_MARK`. A later mapping requires conversion fixtures before enabling the control.

Simple tables allow one paragraph per cell and no merged cells or nested blocks. Images export alt text and stable URLs; editor-only resize metadata must either have a tested supported representation or be excluded from the docs editing profile. Use a fixture to settle every allowed attribute; do not claim arbitrary TipTap JSON round trips.

Reject executable HTML/MDX, unsafe link protocols, `data:`/`blob:` image sources, and private or expiring attachment URLs in docs saves. Allow HTTPS images and normal safe links, including relative documentation links and `mailto:` links. Content inside code fences is literal text. Use a YAML parser configuration that rejects duplicate keys, custom executable tags, and excessive alias expansion. Unknown frontmatter is retained as bounded plain data, never used as execution/configuration input.

### 18.3 Save versus publish validation matrix

| Condition | Draft save | Publish or Git candidate |
| --- | --- | --- |
| Wrong types, invalid document tree, unsupported nodes/marks | Reject, no write | Reject |
| Unsafe URLs, data URLs, known private attachment references | Reject, no write | Reject |
| Malformed explicitly supplied slug | Reject, no write | Reject |
| Missing/blank draft title | Save with blocking diagnostic | Reject |
| Route duplicates another live or proposed document | Save with blocking diagnostic | Reject full candidate |
| Broken internal page/anchor link | Save with blocking diagnostic | Reject full candidate |
| Section or managed media ID belongs to another team | Reject with non-disclosing reference error | Reject |
| Valid owned media reference temporarily unavailable upstream | Save; report availability unknown | Retry preparation if delivery verification is required |
| Empty article or missing alt text | Save with warning | Warn, do not block |
| Stale `expectedDraftVersion` | Reject `409`, no write | Reject stale selected revision |
| `indexable: false` | Stage draft metadata only | Publish page; omit it from search/RAG |

Route collisions are not a database uniqueness requirement for drafts. Two drafts may propose the same route; neither can create duplicate live routes. Return `saved: true` and `publishable: false` explicitly so agents cannot confuse a saved draft with a ready publication.

### 18.4 Required service behavior

The shared authoring service accepts the authenticated team/principal from trusted server context, not a `teamId` supplied in content. Its contract is:

1. Authorize the operation and resolve the document with a team-scoped query. Apply support-evidence and media-availability checks when relevant. Another team's ID behaves as not found.
2. Decode the shared wire schema. Reject unknown mutation fields rather than silently ignoring agent typos.
3. Require the expected draft version on updates. Merge an explicit patch into the stored draft; omitted fields remain unchanged, `null` clears only nullable fields, arrays replace their previous values, and metadata keys merge explicitly. Never merge raw objects with prototype-sensitive keys.
4. Parse exactly one content representation when provided: TipTap JSON or Markdown. When Markdown frontmatter and explicit metadata supply the same field, reject conflicting values instead of guessing precedence. Supplying both JSON and Markdown is an error.
5. Run safe-draft checks and compute publication diagnostics from a snapshot of current live docs plus this draft. No external URL fetching is required on each keystroke.
6. In a transaction under the team docs settings lock, compare-and-swap the draft version, save normalized content and derived fields, increment its version and the team docs draft version. A concurrent update that won the race yields `STALE_DRAFT`; no partial fields or media registrations are written.
7. Return the saved draft version, normalized draft, content hash, diagnostics, and the live publication ID used for advisory validation. Do not enqueue embeddings or change live routes during save.

If the live publication changes during advisory validation, the response's `validatedAgainstPublicationId` records the snapshot actually checked; later publish always revalidates. Rejecting a save leaves its prior draft version intact, including when derived Markdown serialization fails. A network failure must not leave half of the JSON/Markdown/metadata fields updated.

The media upload/registration operation precedes the save and is separately authorized. A rejected save may leave an uploaded, unused MediaLit object; apply reference-aware cleanup rather than deleting it immediately.

### 18.5 Diagnostics and transport mapping

Every diagnostic has `code`, `severity`, `blocksSave`, `blocksPublish`, `message`, and an optional `fieldPath`, `documentId`, `file`, `line`, `column`, `route`, and related-file list. JSON paths use a consistent representation such as `content.content[2].attrs.src`. Markdown locations refer to the original source, including frontmatter lines. Sort reports deterministically by file/document, location, and code.

Minimum codes: `STALE_DOCS_DRAFT`, `UNVERIFIED_MEDIA`, `MIGRATION_STALE`, `BUDGET_EXHAUSTED`, `INVALID_REQUEST`, `INVALID_DOCUMENT`, `UNSUPPORTED_NODE`, `UNSUPPORTED_MARK`, `UNSUPPORTED_ATTRIBUTE`, `INVALID_FRONTMATTER`, `MISSING_TITLE`, `INVALID_SLUG`, `RESERVED_ROUTE`, `DUPLICATE_ROUTE`, `BROKEN_LINK`, `BROKEN_ANCHOR`, `INVALID_REFERENCE`, `UNSAFE_URL`, `UNMANAGED_BINARY`, `STALE_DRAFT`, `STALE_PUBLICATION`, `SOURCE_REQUIRES_GIT`, `SOURCE_MIGRATION_REQUIRED`, `UPSTREAM_CHANGED`, `GITHUB_PERMISSION_REQUIRED`, `GITHUB_RATE_LIMITED`, and `PREPARATION_FAILED`.

| Situation | REST | MCP |
| --- | --- | --- |
| Malformed transport/schema input | `400` with field errors | SDK argument validation error or equivalent structured `INVALID_REQUEST`; no service write |
| Semantically unsafe document | `422` with diagnostic report | Tool result with `isError: true` and the same report |
| Stale version/source conflict | `409` with current version and code | `isError: true`, same conflict payload |
| Missing/forbidden resource | `404`/`403`, according to ownership rules | Structured not-found/permission error |
| Safe but unpublishable draft saved | `200`/`201`, `saved: true`, `publishable: false` | Successful structured result carrying identical diagnostics |
| Publication accepted | `202`, job ID and queued state | Successful result with the same job ID/state; no claim of being live |
| Dry-run finds errors | `200`, `publishable: false`, report | Successful validation-tool result with the report; validation itself completed |

Extend MCP result schemas to permit the documented success/error envelopes; do not declare a document-only output schema and return arbitrary errors that violate it. Include machine-readable `structuredContent` and a concise text representation. Do not collapse expected validation failures into `INTERNAL_ERROR`. Provider secrets and raw stack traces never appear in either transport.

### 18.6 Concrete proposed API/MCP contract

All private routes below are relative to the API origin. Existing CRUD paths stay under `/content/documentation`; names in this table are normative proposed additions or revisions. UI uses these operations and does not bypass them.

| REST operation | Administrative MCP tool | Required input and result |
| --- | --- | --- |
| `POST /content/documentation` | `create_documentation_page` | Title, optional slug/content/Markdown/meta; creates draft version 1 and returns diagnostics |
| `GET /content/documentation/:documentId` | `get_documentation_page` | Returns draft version, draft fields, published revision, source info, and pending proposal state |
| `PATCH /content/documentation/:documentId` | `update_documentation_page` | `expectedDraftVersion` plus explicit patch; returns new version and diagnostics |
| `POST /content/documentation/validate` | `validate_documentation` | Either an unsaved document candidate or selected saved document/version pairs plus proposed removals; no writes |
| `POST /content/documentation/publications` | `publish_documentation_changes` | `expectedPublicationId` (nullable initially), selected document/version pairs, removals, `includeSectionChanges`, required `expectedDocsDraftVersion` when including Sections, and idempotency key; returns job |
| `POST /content/documentation/:documentId/publish` | `publish_documentation_page` | Same preconditions for a single document; delegates to publication service |
| `GET /content/documentation/publications` | `list_documentation_publications` | Cursor, limit (default 20, maximum 100), optional state filter; team-scoped history, no document bodies |
| `GET /content/documentation/:documentId/revisions/:revisionId` | `get_documentation_revision` | Retained revision after ownership/media-availability checks; administrative access only |
| `POST /content/documentation/:documentId/preview` | `preview_documentation_page` | Expected draft version; normalized body, navigation, diagnostics, published-shell metadata; no public share URL |
| `GET /content/documentation/publications/:publicationId` | `get_documentation_publication` | State, input, attempts, diagnostics, old/new live identity and timestamps |
| `POST /content/documentation/publications/:publicationId/retry` | `retry_documentation_publication` | Idempotency key; retries same immutable input only if still eligible |
| `POST /content/documentation/:documentId/unpublish` | `unpublish_documentation_page` | Expected live publication; proposes removal while retaining draft |
| `POST /content/documentation/:documentId/discard-draft` | `discard_documentation_page_draft` | Expected draft version; copies last accepted source revision into a new draft version |
| `DELETE /content/documentation/:documentId` | `delete_documentation_page` | Expected draft version; only removes an unpublished, unreferenced authoring record directly |
| `GET /content/documentation/settings` | `get_documentation_settings` | Source mode, Git status, active publication, pending Section changes |
| `PATCH /content/documentation/settings` | `update_documentation_settings` | Expected docs version and supported indexing settings only; source changes use explicit Git setup operations |
| `GET/POST/PATCH/DELETE /content/documentation/sections[/:sectionId]` | Existing Section tools | Reuse paths; writes require docs version precondition and stage navigation changes |

For deletion of a live document, first use a publication removal so links can be checked and retrieval removed atomically. A direct delete attempt returns `409 DOCUMENT_STILL_PUBLISHED`; retained historical revisions are not destroyed by deleting an authoring record. Git deletions are handled only through the Git candidate pipeline.

`validate` has a discriminated `mode`: `document` for unsaved content or `publication` for selected revisions and removals. Publication requests use an array of `{ documentId, expectedDraftVersion }` rather than "publish whatever is latest". Idempotency keys are scoped to team and operation and paired with an input hash; reusing a key with different input returns `409`. MCP accepts the key as an argument, REST in the request body, with identical behavior.

Single-document publish/unpublish operations are editor-mode operations. In Git mode they return `409 SOURCE_REQUIRES_GIT` with the submit-proposal operation; the UI labels that action "Submit for review" or "Commit changes" according to source configuration. No REST, MCP, or legacy handler may directly invoke the old live-column promotion for Git-owned docs. Register `/settings`, `/validate`, `/publications`, `/sections`, `/github`, and other literal routes before the document-ID matcher, including in middleware authorization tests.

Example save request body (valid JSON, no pseudocode):

```json
{
  "expectedDraftVersion": 3,
  "title": "Configure a custom domain",
  "slug": "setup/custom-domain",
  "markdown": "Open Settings and select Domains.\n",
  "meta": { "indexable": true }
}
```

Example successful save result when a route conflict exists:

```json
{
  "saved": true,
  "documentId": "doc_example",
  "draftVersion": 4,
  "publishable": false,
  "diagnostics": [{
    "code": "DUPLICATE_ROUTE",
    "severity": "error",
    "blocksSave": false,
    "blocksPublish": true,
    "route": "/docs/setup/custom-domain",
    "message": "Another published document uses this route."
  }]
}
```

Actual responses also include the normalized document and validation context; abbreviated examples must not be used as complete response schemas.

### 18.7 Authorization changes

Add `documentation:publish` and `documentation:manage` to the team permission catalog and MCP scope catalog. Existing `documentation:write` permits safe draft and Section edits, not publication or source administration. Read permission permits dry-run validation, previews, and ordinary publication history. It does not confer ticket-evidence access or Git setup completion. Publish permission permits editor publication and submission of Git changes for review. Manage permission permits source configuration, connection/disconnection, and indexing configuration. Manage does not otherwise grant publishing authority. Sensitive-data purge requires the team owner and a recently reverified interactive session, not an unattended API key. The team owner retains all capabilities.

REST session authorization, API-key authorization, OAuth scopes, and MCP authorization must resolve to the same operation policy. Extend presets, grant implication rules, consent displays, and policy coverage tests. Do not treat the MCP `destructiveHint` or a model's promise as authorization. Existing broad API keys may remain broad according to their established policy; OAuth agents granted only write access cannot publish.

GitHub installation needs interactive user authorization in addition to FrontLit permissions. An agent can request a setup URL through the manage-scoped API/tool, but cannot complete a GitHub user's consent. API keys cannot impersonate that GitHub identity. These controls concern workspace admins only; they do not introduce shared identities with public-site users.

## 19. Full editor-owned workflow: no Git dependency

### 19.1 Initial state and onboarding

Every team's docs settings default to `source: editor`, `activePublicationId: null`, with no Git integration requirement. The existing `/docs` feed shows an empty state. Creating a Section does not create a repository, branch, or hidden Git mirror. Missing GitHub App environment variables disable the connect option only; they must not prevent editor-owned docs from working.

1. The author creates a Section or leaves the document unsectioned.
2. Create a draft with a nonempty initial title, a proposed slug, empty valid TipTap content, and `draftVersion: 1`. A later blank title is recoverable draft work and generates a publish blocker.
3. Autosave sends the last acknowledged version. Keep local text until the server acknowledges; on `409`, pause automatic retries, retain local changes, and offer reload/compare. Do not repeatedly overwrite the newer server version.
4. Upload media through the existing Media API, then insert the registered public URL. Upload failure leaves an unsaved local placeholder, not a data URL stored in a docs draft.
5. Preview uses the private preview operation in §18.6, rendered inside the authenticated dashboard with the same docs primitives and published-shell metadata. Never forward admin credentials to a tenant/custom domain, execute tenant-injected scripts in the admin origin, or create public bearer preview URLs. Display an unpublished badge; send `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; never index previews. The response contains validated data, not executable HTML. Shared-shell code injection is omitted from administrative previews.
6. Publish presents selected document changes, Section changes, route changes, and diagnostics. The request captures exact versions and the current live publication ID.
7. The job prepares the candidate. UI shows queued/validating/preparing; the public site is unchanged until activation. On success, the selected revisions become live, while edits saved after the captured version remain unpublished.

No GitHub calls, Git SHA, PR, or GitHub token participates in these steps. Markdown is a derived export of the canonical JSON draft/revision in this mode.

### 19.2 Section behavior and navigation consistency

Keep flat Section IDs and existing names/order fields. Every docs authoring mutation increments a team `docsDraftVersion` in the same transaction, including document/Section create, update, discard, or delete. Section writes change draft navigation only. When `includeSectionChanges: true`, a publish request must include `expectedDocsDraftVersion`; compare it while capturing the Section snapshot and selected document revisions in the queue transaction. A mismatch returns `409 STALE_DOCS_DRAFT` without enqueueing. Later draft changes do not alter that captured snapshot. Publication captures a Section snapshot and publishes only if it remains consistent with selected documents. If `includeSectionChanges` is false, use active Sections; a selected draft referencing a new unpublished Section yields `SECTION_NOT_PUBLISHED`.

Creating or renaming a Section does not change article URLs. Deleting a Section stages moving its documents to the unsectioned group; show the affected count. Publication must include those membership changes or return `SECTION_IN_USE`; it never deletes the articles. Empty Sections may exist in the dashboard but are omitted from public listings. Show pending navigation changes independently from per-document dirty state.

### 19.3 Update, discard, unpublish, and delete

- **Update:** stage title, slug, content, metadata, Section membership, featured image, and indexing eligibility. All live values remain unchanged until activation.
- **Discard:** compare the expected draft version, then restore the last accepted canonical revision into a new version. For a never-published editor document, leave it unchanged and explain there is no published version; delete is a separate operation.
- **Unpublish:** build a candidate without that article, validate inbound links from surviving docs, and activate without its routes/chunks. Keep the draft available for later publication.
- **Delete:** only directly delete a never-published or already-unpublished authoring record. Retain revision evidence needed by publication history; cleanup follows retention policy.
- **Rename slug:** the old route is removed only on successful activation. Update internal links in the same candidate or fail link validation; no automatic redirect is invented.

Batch publication exists so two drafts that link to each other, or a rename plus its link updates, can become valid together. It is not necessary to publish every unrelated draft.

### 19.4 Indexing configuration without an AI provider

CMS publishing must work for a team that has not enabled AI. Docs search includes a deterministic lexical search over active published text. When semantic indexing is disabled, publication prepares text/headings and sets semantic state to `excluded`; no embedding provider is called. Chat is unavailable or hands off instead of claiming a semantic answer.

When semantic indexing is enabled, embeddings for the candidate are required before activation. Missing credentials or provider failure yields an actionable preparation failure and keeps the old publication live. Do not silently fall back to development/test vectors in a deployed environment. Enabling or changing the embedding configuration creates a new preparation generation; only activate its retrieval configuration once the eligible corpus is ready. Keep the old live retrieval configuration usable meanwhile.

## 20. GitHub App: platform developer/operator setup

### 20.1 Registration and deployment

Use a GitHub App, not a personal access token, for documentation sync. One deployed FrontLit environment uses one app registration serving many customer installations. Use separate development, staging, and production registrations/secrets; self-host operators create their own registration with their origins. Hosted workspace admins install the FrontLit-operated app and never receive its private key.

Operator procedure:

1. In the owning GitHub account/organization, open Settings, Developer settings, GitHub Apps, New GitHub App.
2. Use an environment-specific unique name and FrontLit's public homepage URL. Production accepts installation on any account; development can be limited to the developer's account.
3. Set the authorization callback to `API_ORIGIN/integrations/github/callback` and enable user authorization during installation. Keep expiring user authorization tokens enabled. With this option, use the callback rather than a separate Setup URL. [GitHub registration reference](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
4. Set the active webhook URL to `API_ORIGIN/integrations/github/webhook`, enable TLS verification, and configure a randomly generated webhook secret.
5. Set permissions/events from §20.2, create the app, and generate its private key and client secret. Store secrets only in the API/worker secret store; never expose them through `NEXT_PUBLIC_*`, Git, or MCP responses.
6. Configure the variables below, start API and jobs, and verify the GitHub connection configuration health check without exposing secret values.
7. Install the development app on a disposable test repository, connect through the normal workspace flow, import a valid file, push an invalid duplicate slug, correct it, and verify publication/report behavior.

Proposed operator configuration names:

| Variable | Purpose |
| --- | --- |
| `GITHUB_DOCS_APP_ID` | App identity for server authentication |
| `GITHUB_DOCS_APP_SLUG` | Installation URL construction |
| `GITHUB_DOCS_CLIENT_ID` | User authorization request |
| `GITHUB_DOCS_CLIENT_SECRET` | Server-side OAuth code exchange |
| `GITHUB_DOCS_PRIVATE_KEY` | PEM key or secret-store-injected value for app JWT signing |
| `GITHUB_DOCS_WEBHOOK_SECRET` | Signature verification |
| `GITHUB_DOCS_CALLBACK_URL` | Exact registered callback URL |
| `GITHUB_DOCS_WEB_ORIGIN` | Allowlisted dashboard origin for post-callback navigation |

Reuse existing environment validation and secret encryption utilities. The install URL is derived from the app slug; repository HTTP endpoints are restricted to GitHub.com in v1. GitHub Enterprise hosts are later scope. Local development needs a trusted HTTPS tunnel/forwarder for webhook delivery and matching development callback configuration. Never point a development app at production storage.

### 20.2 Permissions, subscriptions, and upgrades

| Capability | Repository permissions | Events |
| --- | --- | --- |
| Initial import and sync | Metadata read, Contents read | Push; installation and repository-access lifecycle events |
| PR authoring and validation, v1.1 | Contents write, Pull requests write, Checks write | Pull request, check-run rerequest, plus existing lifecycle events |
| Issue creation, v1.1 when shipped | Issues write | No issue subscription needed merely to create an issue |

Do not request Actions, Workflows, organization administration, or branch-rule bypass. GitHub App repository permissions apply at repository scope, not folder scope; enforce the configured source-directory boundary in FrontLit and explain this distinction on connection. A selected-repository installation should be recommended to the admin.

Permissions are defined by the app registration and granted to installations. A workspace toggle cannot dynamically obtain an ungranted permission. When shipping write/check/issue features, the operator updates the registration and existing installations must approve the added permissions. Record granted capabilities per installation and show "Additional GitHub permission required" for unavailable actions. Limit each installation token to the repository and permissions the operation needs. [GitHub permission-change behavior](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration)

### 20.3 Authentication and binding rules

There are three separate credentials:

- A short-lived app JWT signed with the private key authenticates app-level operations.
- An installation access token authenticates background reads/writes for the selected repository. Obtain it server-side and refresh before expiration; do not persist it as a permanent credential. GitHub currently gives these tokens a one-hour lifetime. [Installation token reference](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- A GitHub user access token establishes which installations/repositories the connecting person can access. It is used during setup verification, not as the long-lived background sync credential. [User token and accessible-installation reference](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

Starting setup creates a single-use random state token, stores only its hash, and binds it to the initiating FrontLit account, team, allowed return path, purpose, and a 10-minute expiry. Use authorization-code flow with PKCE S256: keep its verifier server-side, send the challenge during user authorization, and supply the verifier during code exchange. Installation and user authorization may be separate resumable stages to preserve this contract. Delete the verifier on completion/expiry. Persist pending setup separately from an active connection. Callback validates state and exchanges the authorization code server-side; it does not bind arbitrary `installation_id` query parameters to the team.

Use the user token to enumerate accessible installations and their repositories, and the app installation credentials to verify the same repository is granted. Require the connecting person to have GitHub repository admin rights as well as FrontLit manage permission for v1 setup. This is FrontLit's chosen connection policy, not a claim that GitHub always requires repo-admin rights for every app action. A GitHub installation ID is an identifier, not proof of authorization.

Return the browser to the allowlisted dashboard with a setup identifier, never an access token. Final configuration requires an authenticated FrontLit session for the original account and a fresh permission check. Cookie-authenticated mutations enforce the existing CSRF defense and an allowlisted Origin; CORS is not authorization. Revalidate selected repository access using the setup user token immediately before binding, not only when populating the picker. Temporarily store setup credentials encrypted until completion/expiry, then remove them. Changing the active team mid-flow, expired/replayed state, a forged installation ID, or losing manage permission fails without altering an active connection.

An app installed directly from GitHub outside FrontLit remains unbound until a workspace admin completes this flow. Installation webhooks alone cannot pick a team by matching names or email addresses. One installation may serve multiple authorized teams/repositories; disconnecting one team must not uninstall the app for every team.

### 20.4 Workspace-delegated bot authority (DM-AUTH)

FrontLit uses **workspace-delegated bot authority**. The GitHub repository administrator explicitly grants the selected FrontLit team access to the docs directory and allows its authorized publishers to submit changes as the FrontLit App. Publishers need not have personal GitHub accounts. This is installation automation delegated by the administrator, not impersonation of the author.

Connection consent names the FrontLit team, repository, branch, directory, automatic publication behavior, and publisher permissions. Record the approving FrontLit account, verified stable GitHub user ID, repository-admin verification, installation, delegated grant version, time, and capabilities. Enabling repository writes/direct commits requires separate approval after permission upgrades; installation permission approval alone does not enable a team's writes.

Background reads use repository-limited installation tokens. Proposal workers recheck current FrontLit membership, required publish permission/scope, credential grant status, connection generation, and delegated write capability before each external mutation. Removed users or revoked publish grants stop unexecuted actions. GitHub governs proposals already submitted. An HTTP request already accepted by GitHub cannot be canceled by a later local revocation; audit and reconcile its result.

The connecting person's departure does not silently revoke the team's installation grant. A current FrontLit owner/manage user can pause it; GitHub admins can revoke installation/repository access. Revoking temporary GitHub user authorization cancels related pending setups and destroys user tokens, not the independent installation grant. Never use a former user's token for background work.

Automatic recovery after access restoration is permitted only for an otherwise authorized binding that is not paused/disconnected. A repository transfer to a different owner requires fresh approval; a same-owner rename changes only its display name. Store stable repository and owner IDs.

Audit submissions with the FrontLit actor and delegated grant identity. Commit/PR descriptions may contain an approved display name and proposal ID, not private email or ticket excerpts. REST, MCP, and workers use the same policy. [GitHub token guidance](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app) distinguishes installation automation from user impersonation.

## 21. GitHub App: workspace admin setup and recovery

### 21.1 Initial connection

Settings live in Content → Documentation → Source. Default view says "Managed in FrontLit" and explains Git is optional.

1. Admin chooses Connect GitHub. FrontLit checks manage permission and that the app is configured, then starts the bound setup flow.
2. GitHub asks the user to authorize/install the app and select repositories. If an organization owner must approve, FrontLit reports waiting for GitHub approval and permits restarting setup after approval; it does not pretend the connection is usable.
3. On return, FrontLit lists only verified accessible repositories. Admin selects one repository, a publishing branch, and a repository-relative source directory. A repository with an existing branch can import existing docs; an empty repository or a destination needing initial docs uses the platform-created setup PR in §21.5. Default branch is a suggestion, not hard-coded `main`; source directory suggestion is `docs/`.
4. FrontLit reads the chosen immutable commit and shows a preflight report: file count, derived Sections/routes, excluded files, errors, public asset warnings, and the fact that `published` defaults to true. Nothing goes live during preflight.
5. Admin chooses Connect and publish. This step additionally requires publish permission, binds the source, and queues the exact reviewed SHA. Further pushes are now authorized to publish the configured branch automatically. Setup success and initial publication success are separate states.
6. The UI shows syncing/preparing or a failure report, then the live commit. A new push arriving during setup is reconciled after the reviewed candidate; it cannot change the preflight report in place.

An empty editor docs area can import an existing repository docs set through initial-connect. Creating the initial docs directory/metadata, or transferring existing editor docs/Sections, uses the FrontLit-created setup/adoption PR in §21.5. No setup path requires downloading files or committing docs manually. Return `409 SOURCE_MIGRATION_REQUIRED` with that operation instead of replacing existing data. The connect transaction locks team docs settings and rechecks source mode, docs draft version, pending jobs, and emptiness so content created after preflight cannot be overwritten. Unrelated blog/changelog/Pages do not block connection.

Connecting an empty valid source may finish with no published docs. A missing directory during initial setup is an error with a corrective instruction. Connecting a private repo can publish its selected docs publicly; the preflight must make that consequence visible.

### 21.2 Source settings and UI states

Keep connection state separate from publication state:

| Connection state | Meaning and available action |
| --- | --- |
| `unconfigured` | Editor mode; Connect GitHub available if app configured |
| `pending_setup` | Awaiting authorization/selection; cancel or restart |
| `connected` | Eligible for sync; show repository/branch/directory and granted capabilities |
| `paused` | Admin paused sync; Resume or Disconnect |
| `access_lost` | Installation suspended/deleted or repository access revoked; Reauthorize |
| `disconnected` | Prior Git ownership retained; Reconnect available; no silent editor fallback |

Publication state independently shows queued, validating, preparing, active, failed, or superseded. A connected integration can have a failed publication and still serve the last successful version. Show last observed commit, last validated commit, live commit, last successful sync time, and current failure summary.

**Admin UI surfaces.**

- **Settings → Integrations → GitHub** owns the connection: *Connect GitHub* opens a four-step wizard (Repository, Folder, Review, Connect) that resumes a half-finished setup; *Manage* opens the connected-source dialog. The badge reads Connected only after activation. Return paths after GitHub authorization are allow-listed to `/settings/integrations?tab=github` and `/content?type=documentation`.
- **Connected-source dialog** shows a computed health banner (In sync, Syncing, Sync paused, Latest sync didn't go live, Access lost, Disconnected) with last-checked time and Refresh; repository, branch and folder; the three SHAs (latest on GitHub, checked, live); whether FrontLit may send edits to GitHub (pull requests / direct commits) with a *Review access* action; and full SHAs, sync run and publication ID under Technical details. Footer actions: Disconnect, Pause/Resume sync, Sync now.
- **Settings → Content** holds documentation-wide settings: a Publication card (live status and link, pages waiting to publish with Publish and per-page Review changes; git-owned docs show the automatic-publication note instead), Search and answers (keyword or smart search; smart search is selectable only when an embedding-capable AI provider exists) and Documentation gaps.
- **Git-flow terminology** targets developers: keep pull request, branch, merge and commit wording in the proposal dialog, and fix clarity problems with accurate paths and links rather than euphemisms.
- **Proposal dialog (editor *Create pull request*)** lists drafts with A/M/D file badges. Each included draft chooses *Publish on merge* (`published: true` in frontmatter) or *Merge as draft* (`published: false`, imported as a non-public draft). It explains missing write access ("Pull request access isn't enabled yet", with a copyable admin request) instead of blaming GitHub App permissions, because workspace write capability (FrontLit's grant) and GitHub App installation permissions are separate. Drafts already in an open PR offer *Update PR #N* (§22.3.7a); drafts in a proposal still being written are locked. Selected drafts that belong to different open PRs are refused with a message to update one PR at a time.

Repo/branch/directory changes after Git ownership remain broader migrations outside initial scope; editor-to-Git adoption is the exception in §21.5. Reconnecting the same repository ID/branch/path is supported after reauthorization; repository renames update the display name using the stable GitHub repository ID. Deleting/renaming the configured branch reports an error and never silently follows a new default branch.

### 21.3 Pause, disconnect, and access loss

1. An admin action increments the connection generation, preventing queued old-generation work from activating or writing Git.
2. Keep published documents, immutable revisions, editor proposals, and media references intact.
3. Pause/disconnect affects FrontLit's docs binding only. Do not revoke a shared installation or close/delete existing branches and PRs automatically.
4. While paused/disconnected, drafts may still be saved where UI-to-Git authoring is available, but submission/publication returns `SOURCE_REQUIRES_GIT` with a reconnect/resume instruction.
5. Resume validates current access, increments generation, and reconciles the selected branch head. Content changed while paused is imported as a new candidate.

### 21.4 Proposed integration surfaces

| REST | MCP | Purpose |
| --- | --- | --- |
| `POST /content/documentation/github/setup` | `start_documentation_github_setup` | Return interactive setup URL; no connection yet |
| `POST /content/documentation/github/capabilities` | `grant_documentation_github_capabilities` | Separate PR/direct-commit delegation after fresh administrator review; original interactive browser account finalizes, MCP cannot |
| `GET /content/documentation/github/setup/:setupId/repositories` | `list_documentation_github_repositories` | List repositories from the verified setup context; never expose tokens |
| `POST /content/documentation/github/preflight` | `validate_documentation_github_source` | Repo ID, branch, directory, setup ID; return exact SHA/report |
| `POST /content/documentation/github/connect` | `connect_documentation_github` | Reviewed preflight ID/SHA, source selection, idempotency key; bind and queue initial publication |
| `GET /content/documentation/github` | `get_documentation_github` | Sanitized connection and live/sync status |
| `POST /content/documentation/github/sync` | `sync_documentation_github` | Reconcile current head; return run ID |
| `POST /content/documentation/github/pause` | `pause_documentation_github` | Pause and invalidate queued generation |
| `POST /content/documentation/github/resume` | `resume_documentation_github` | Verify access and reconcile |
| `DELETE /content/documentation/github` | `disconnect_documentation_github` | Disconnect binding without deleting published docs |
| `POST /content/documentation/github/proposals` | `submit_documentation_github_changes` | Selected draft versions/removals, title, idempotency key, optional `updatesProposalId` to append a commit to that proposal's open PR; v1.1 |
| `GET /content/documentation/github/proposals` | `list_documentation_github_proposals` | Private docs-read history with stable descending cursor pagination and current restriction/purge redaction; v1.1 |
| `GET /content/documentation/github/checks` | `list_documentation_github_checks` | Private docs-read check summaries with stable cursor pagination; no diagnostic prose; v1.1 |
| `GET /content/documentation/github/checks/:checkId` | `get_documentation_github_check` | Private validation truth and separate check-delivery outcome, with current-policy diagnostic redaction; v1.1 |
| `GET /content/documentation/github/proposals/:proposalId` | `get_documentation_github_proposal` | PR/commit, captured versions, review/sync outcome; v1.1 |

Callback and webhook routes under `/integrations/github` are infrastructure endpoints with OAuth-state/signature checks respectively, not normal team APIs or MCP tools. Setup browsing operations still require the initiating account or a bound authorized interactive completion; an MCP caller cannot claim somebody else's setup identifier.

### 21.5 Platform-created setup and editor-to-Git adoption PRs (DM-MIGRATE)

**Setup experience:** Present three user steps: connect GitHub/select a repository, review/merge FrontLit's setup PR, and finish setup. Lead with the current step and its next action. The Source screen automatically verifies an observed merged setup when current interactive setup authorization is available; retain an explicit retry under details after a failed check. Completed verification must not remain a required action. Plan IDs, repository IDs, commit hashes, manifests and recovery controls belong in collapsed setup details. Copy must describe the actual state, rather than promising a future PR after it has merged. If temporary authorization expires, retain the reviewed plan/PR and offer contextual reconnection to continue. Final **Finish setup** still requires the original administrator's explicit approval. The UI presents public-content publication and automatic future publication from the branch as one acknowledgement; the API still records and requires all three consent flags (public content, future publication, workspace delegation), which a single acknowledgement sets together. Workspace write capability for pull requests/direct commits is a separate later grant (§21.2). Separate Git-write capability approval remains required. Reconnection and final consent must not silently activate the source.

FrontLit must open the GitHub pull request itself when setting up a docs source or adopting existing editor docs. The user reviews the destination, captured files and unpublished-draft disclosure in FrontLit, chooses **Create setup PR**, then reviews/merges the PR in GitHub. Downloading/exporting files and committing them manually is not the product workflow. Agent-created PRs outside FrontLit do not satisfy this requirement. For subsequent Git-owned document edits, the reviewed submit action in §22 likewise creates the branch, commit and PR through FrontLit; saving a draft alone does not open a PR. Neither setup nor edit submission may require the user to download files, run Git commands or create the PR manually. Converting Git ownership back to editor ownership remains later scope.

This workflow requires repository-scoped installation `contents: write` and `pull_requests: write`; checks use their separately scoped permission. App permission configuration alone does not authorize a workspace operation. Require current manage + publish authority and account-bound repository-admin setup proof; validate installation/repository/owner identity and capabilities before admission and every remote mutation. Setup PR authority is limited to this captured plan and does not implicitly enable later workspace-publisher PR/direct-write delegation. Reuse the existing bounded Git write, lease and response-loss recovery patterns; avoid a competing general proposal system.

| REST | MCP | Contract |
| --- | --- | --- |
| `POST /content/documentation/github/migrations` | `plan_documentation_git_migration` | Manage + publish; expected docs version/publication; verified target; capture a 24-hour setup/adoption plan and authenticated file preview |
| `GET /content/documentation/github/migrations/:planId` | `get_documentation_git_migration` | Authorized status, paginated captured manifest, diagnostics and setup-PR progress/branch/commit/number/URL |
| `POST /content/documentation/github/migrations/:planId/pr` | `create_documentation_git_migration_pr` | Manage + publish; plan hash, expected docs version/publication, current setup proof, destination/unpublished-draft disclosure acknowledgment and idempotency key; enqueue captured PR work and return 202 |
| `POST /content/documentation/github/migrations/:planId/verify` | `verify_documentation_git_migration` | After merge, read the exact selected publishing-branch SHA and compare captured document/Section semantics; return reviewed hash/report |
| `POST /content/documentation/github/migrations/:planId/activate` | `activate_documentation_git_migration` | Original admin's interactive consent, reviewed SHA/hash, expected docs/publication versions and idempotency key; recheck current branch and source before changing ownership |
| `DELETE /content/documentation/github/migrations/:planId` | `cancel_documentation_git_migration` | Manage; cancel unfinished local plan/work, preserve local docs and report any already-created remote artifacts |

1. **Capture and review.** Under editor ownership capture all doc identities/versions, active publication, Section labels/order and source-independent semantic hashes. Reject pending publication jobs. Live docs with unpublished editor changes export their published revision; the newer edits stay as local drafts on top of the adopted Git base, and the review discloses them. Never-published drafts are supported, clearly disclosed before export and encoded with `published: false`. Unsupported content fails without changing local content or Git. Show repository visibility, branch, directory, files, draft count and required permissions. A private repository is not permission to expose raw support/ticket evidence.
2. **Generate the immutable file set.** Generate one Markdown file per doc using `<section-slug>/<documentId>.md` or `<documentId>.md` for unsectioned docs. Preserve public routes through explicit frontmatter slugs; include title, description/excerpt, navigation, indexing, featured image and supported body content. Keep media at verified URLs. The existing-ID/path mapping stays in the private plan. Root `_sections.json` is strict `{ "version": 1, "sections": [{ "folder": "developers", "name": "Developers", "order": 10 }] }`; folder is one normalized unique segment, name nonempty and order integer. Empty authored Sections are preserved. An empty editor docs set can create initial Section metadata without inventing or publishing article content.
3. **Create the PR through FrontLit.** On the reviewed action, admit one durable write attempt for the immutable plan. Store request idempotency, actor/grant proof, remote base/tree/commit/branch and PR identity, lease/retry state and sanitized diagnostics. The worker creates a deterministic branch, one captured commit and one PR targeting the selected publishing branch using installation bot authority. The docs patch is confined to the chosen directory; preserve unrelated bytes/files, never force-update or directly commit docs to the publishing branch. Reject an existing different managed docs set instead of silently overwriting it or merging two knowledge bases.
4. **Handle a truly empty repository.** Explain that a PR needs a base branch. With explicit setup disclosure, FrontLit initializes the selected/default publishing branch with only a harmless `<directory>/.gitkeep` placeholder commit, then opens the docs PR. No document body or Section content is placed in the bootstrap commit. Bootstrap only after proving the repository is actually empty; an existing repository with a missing selected branch gets an actionable branch-selection error. Never overwrite an existing branch, bypass branch rules, change repository settings/visibility or ask the user to manually commit the exported docs. Repository initialization is itself recorded/recovered so retries do not create duplicate bootstrap work.
5. **Track and recover.** Source UI shows queued/creating/open/closed/merged/failed state, retry/re-authorize guidance and **Open setup PR**. Persist plan/PR references across reloads. A repeated click, worker restart, lease expiry or lost GitHub response discovers/reuses the same matching tree/commit/branch/PR instead of duplicating it; an unrelated deterministic branch/PR is a conflict. Before each new mutation recheck local versions, policy/purge state, plan validity, live actor authority and GitHub access. Stale, expired, canceled or revoked work stops further writes. Already-accepted remote writes cannot be recalled; retain/report their references. Retry transient faults against the same capture; changed inputs require a fresh reviewed plan. A closed unmerged PR preserves editor ownership and drafts; explicitly reviewed resubmission may create a new attempt.
6. **Keep editor docs live until merge and approval.** An open PR does not change canonical ownership, active publication, retrieval or public routes. GitHub review/merge is required; FrontLit never auto-merges. Detect merge through signed events plus bounded reconciliation. The Source screen verifies the observed merge automatically when current setup authorization is available; offer **Check files again** under setup details for recovery. Verification reads the immutable publishing-branch tree through the normal importer and compares full document/Section semantics and published flags. Extra/missing files, changed docs, mismatched assets, unsupported content or branch drift fail with an actionable report. Do not treat a PR URL, successful GitHub write or green check as successful source adoption.
7. **Activate explicitly after verification.** The original admin reviews destination/auto-publication/delegation disclosures, reauthorizes if needed, and activates. Under the shared docs-settings lock recheck source mode, all docs versions, active publication, pending jobs, setup/owner authority and the verified branch head. A concurrent edit/Section change/source change makes the plan stale and leaves current editor content live. No caller-supplied alternate path/identity mapping is accepted.
8. **Preserve identities and publication.** Create/update Git source mappings in one transaction, retaining document IDs, URLs, metadata and Section labels/order; include equivalent Git provenance in accepted revisions. Equivalent retrieval can be reused. Keep the current public publication until a changed valid candidate is fully prepared. Never-published drafts remain unpublished after adoption. Subsequent branch changes use normal Git sync/conflict rules; a local draft is not silently made public by migration.

Use the same team lock/version contract for planning, writes, activation, save, Section edits and initial-connect. Cancellation/expiry/staleness never changes ownership or local docs; remote artifacts already created remain visible with their disposition. Parse bounded strict `_sections.json` on every import. Creating the source directory is the setup PR's responsibility, not a manual file-management prerequisite.

## 22. Git sync, webhooks, and editor-to-PR workflows

### 22.1 Webhook ingress

Mount the GitHub webhook handler before the global JSON parser in `apps/api/src/app.ts` so it can verify the exact raw bytes. Verify `X-Hub-Signature-256` using the configured secret and a constant-time comparison, then decode the payload. [GitHub webhook signature reference](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)

Persist the delivery ID, event/action, installation/repository IDs, receipt time, and minimum required payload in a durable receipt/job transaction before returning `202`. A duplicate `X-GitHub-Delivery` returns success without enqueueing duplicate work. Invalid signatures return `401`; malformed authenticated payloads return `400`; unavailable durable storage returns `503` so operators can redeliver. Do not fetch GitHub content, parse docs, or generate embeddings in the request handler.

Ingress target: acknowledge within two seconds after durable enqueue. Bound payload size and store no authorization headers. For valid irrelevant events return `204`. Retain receipt outcome so operators can distinguish received, ignored, queued, and failed.

| Event | Worker action |
| --- | --- |
| Push to configured publishing branch | Reconcile current branch head and queue immutable candidate |
| Push to another branch | No public publication; relevant proposal/check work only in v1.1 |
| Configured branch deletion | Mark source unavailable; keep live docs |
| Installation suspended/deleted or repository removed | Invalidate connection generation and tokens; mark affected bindings access-lost |
| Installation restored/permissions approved/repository added | Refresh capabilities; reconcile already-authorized bindings when usable |
| PR opened/synchronized/reopened targeting configured branch | Validate proposed result; no publication |
| PR closed, merged | Reconcile publishing branch rather than publishing PR head directly |
| PR closed, unmerged | Mark proposal closed without publishing; retain draft |
| Check rerequest | Validate the recorded candidate again; do not publish it |

### 22.2 Import worker

1. Claim a leased job and verify connection generation, repository ID, and granted read access.
2. Resolve the configured branch head from GitHub. Webhook delivery order is not commit order; the webhook SHA is evidence, not unconditional activation authority.
3. Read the Git tree and all managed blobs at that exact SHA. Handle pagination/truncated tree responses by completing the traversal; never interpret a truncated result as deleted files. Fetch through GitHub APIs without running a checkout's scripts, installing packages, or evaluating MDX.
4. Enforce the source-directory boundary. Normalize path separators, reject traversal/symlinks/submodules in managed content, and accept UTF-8 `.md` files plus the optional root `_sections.json` contract. Report `.mdx` files as unsupported rather than silently treating an all-MDX directory as empty. Ignore unrelated files; any local binary referenced by managed docs is a validation error.
5. Parse frontmatter and content, derive Sections/source identities, and build the complete manifest. `published: false` retains an imported draft but excludes it from live membership. Git imports do not overwrite a separately stored unsubmitted editor proposal.
6. Compare the candidate to the last source manifest to identify additions/updates/deletions. Source identity is normalized repository-relative path; recognized UI file moves can retain document ID, but external renames may be delete/add initially.
7. Validate the entire candidate and prepare revision projections/chunks. Persist the original Markdown/frontmatter alongside normalized rendering content; never write normalization changes back to Git just because a push was imported.
8. Before activation, reconcile the branch head again and check generation/latest-request marker. If it advanced, mark the old candidate superseded and queue the current head. A move immediately after this check may briefly leave the previously observed head live; the next webhook/reconciliation corrects it. Do not claim an atomic transaction spanning GitHub and Postgres.
9. Activate through §23; record both attempted and live SHAs. Publish failure does not create a corrective Git commit automatically.

First-level folder segments must satisfy the same normalized segment policy as Section slugs. Distinct source folders such as `Support/` and `support/` that normalize to the same Section slug yield a diagnostic rather than being silently combined. A file whose default path cannot form a supported article slug must provide a valid explicit slug; the first-level Section segment still needs to be valid.

A complete tree with no managed files after a previously populated directory is an intentional candidate removal of all docs, even if Git no longer contains an empty directory entry. A read failure, missing branch, or truncated tree is never an empty candidate. Report full removal prominently in preflight/PR checks; initial automatic branch-sync authority includes valid file deletions.

Manual sync always works through the same path. Add a low-frequency reconciliation job for connected sources (proposed default: every 15 minutes, adjusted for GitHub rate limits) to recover missed deliveries. Rate-limit exhaustion waits until the provider's reset/retry window; it does not mark the docs invalid.

### 22.3 UI proposal and PR creation — v1.1

1. Author saves drafts normally. Each Git draft records its source base SHA, original file path, and base content hash. New Git drafts require a normalized `.md` source path inside the configured directory; Section selection suggests its first folder.
2. Submit captures exact draft versions and validates the proposed repository result. Missing write permissions report the required upgrade; no database-only publish fallback exists.
3. Fetch current publishing-branch head. If a selected source file changed relative to its base, return `UPSTREAM_CHANGED` and preserve the draft. An unrelated-file update can be used as the new base when the selected file preconditions still hold. Never automatically merge overlapping JSON or prose changes.
4. Serialize only selected files and metadata; path moves include removal of the old path in the same commit. Preserve untouched bytes outside selected files. No binaries or `.github/workflows` modifications are allowed.
5. Default to PR mode: create a deterministic proposal branch such as `frontlit/docs/<proposalId>`, create one commit from the captured patch, and open a PR against the configured publishing branch. Include a concise summary and FrontLit proposal link, never raw private customer transcripts.
6. Persist branch, PR number/URL, commit SHA, captured draft versions, and state. If GitHub succeeded but the response/persistence failed, recover by looking up the deterministic branch/PR before creating another. Idempotent retries must not produce duplicate PRs.
7. Further local saves do not mutate the submitted snapshot. Show additional unsubmitted changes. A document belongs to at most one unfinished proposal; a second independent submission returns `PROPOSAL_ALREADY_OPEN`. Documents have one shared draft rather than one per member, so a later submitter sends the latest shared draft.
7a. **Updating an open PR.** While a proposal's PR is open (`status: open`, PR mode), a later submission may name it with `updatesProposalId` and append one more commit to that PR's branch instead of opening another PR. The submission may also add documents that are not yet in the PR; it cannot be a direct commit. Admission requires the target to be open and rebases each already-captured file's base to what the PR last wrote (its captured Markdown hash), so unrelated edits made to the branch in GitHub are retained byte-for-byte. The write worker re-reads the PR (a closed or merged PR returns `PROPOSAL_NOT_OPEN` and is never reopened), plans against the PR branch head, creates the commit with the same deterministic-recovery rules as §22.3.5–6, and advances the branch ref without force. If the branch changed in a way that touches the same files, it fails with `UPSTREAM_CHANGED`, retaining all drafts. On success the update proposal ends as `updated`, the target proposal's captured versions, paths and commit are replaced, the PR check is requeued for the new head, and document ownership stays with the target proposal. Documents in a proposal that is still being written (`queued`, `validating`, `prepared`, `writing`) are locked until it reaches `open` or a terminal state.
8. Merge triggers normal branch import. After successful publication, mark only the captured proposal versions applied; newer drafts remain dirty. If the merged file was edited during GitHub review, Git's merged content is the accepted canonical revision.

FrontLit does not merge the PR automatically. PR review and merge happen in GitHub in v1.1. A PR can remain open indefinitely without changing public docs. Closed/unmerged proposals retain recoverable content, and the author may resubmit as a new proposal.

### 22.4 Direct commit mode — v1.1

Direct commits are an explicit docs-source setting, default off, available only where GitHub permits them. Build a commit whose parent is the verified current branch head and update the ref without force. A non-fast-forward/rule rejection must not overwrite another commit. Reconcile the head, return a conflict, or offer a PR with the captured patch. No bypass privileges or force pushes are used. [GitHub reference update API](https://docs.github.com/en/rest/git/refs)

The new commit still passes the normal importer/publisher; a successful Git write is not a successful publication. Record the commit URL and report a later validation/preparation failure in FrontLit.

### 22.5 GitHub checks and feedback — v1.1

Use stable check names `FrontLit / docs validation` on PR candidates and `FrontLit / docs publication` on publishing-branch commits. Keep validation separate from publication: PR validation never waits for a public deployment. Record PR head and base SHAs; validate the proposed merged tree where available. If the proposed merge cannot be resolved, report a merge-conflict failure rather than a passing head-only check.

When the target branch changes, revalidate relevant open proposals against the new base. A check result stores both SHAs and cannot be reused as proof for a different proposed merge. Validation skips embedding preparation; the publishing-branch job performs the complete preparation after merge.

Reports contain summary counts, conflicting routes, source paths/line annotations when known, and a details link to the authenticated FrontLit report. Paginate/batch annotations within GitHub API limits. A required validation check must conclude success for a complete valid candidate with no docs changes, rather than remaining pending because a file filter skipped it. Fork candidates without readable content or writable check access are explicitly reported as unsupported/incomplete in FrontLit; do not fabricate a pass. [GitHub check-run API](https://docs.github.com/en/rest/checks/runs)

Report check-delivery failure separately from document validation/publication failure. A GitHub outage while posting a check does not roll back a valid live publication; retry the report. Repository admins choose whether the validation check is required in branch rules. FrontLit still validates after merge even when a required check previously passed.

## 23. Persistence, publication transactions, and recovery

### 23.1 Minimum persisted contracts

Reuse existing tables where compatible, but implement these semantics explicitly. Do not add an event-sourcing system or generic workflow engine for this feature.

| Record | Required fields/invariants |
| --- | --- |
| Team docs settings | Unique team ID; source mode; docs draft version; active publication ID; requested generation; indexing configuration/version |
| Docs Git binding | Unique team ID; app installation ID; stable repository and owner IDs/display names; delegated read/write grant and approving actors; branch; normalized source directory; granted capabilities; connection state/generation; observed/live SHA; connection actor |
| Draft | Stable document ID; draft version; proposed slug; JSON/Markdown/metadata; source base SHA/path/hash where applicable; updated actor/time |
| Immutable revision | Document ID, normalized JSON, original Git Markdown when applicable, normalized Markdown, metadata, slug, headings, extracted text, asset references, content hash and schema version |
| Publication | Team, source/input identity, base publication ID, connection/request generation, indexing configuration, status, diagnostics, timestamps, attempts and lease |
| Publication membership | Publication ID, document/revision ID, final route; unique `(publicationId, route)` and `(publicationId, documentId)` |
| Published navigation snapshot | Publication ID and complete ordered Sections/membership; never reads draft Section labels |
| Revision chunks | Team, revision ID, chunk/anchor, content hash, embedding model/configuration; retrieval joins active membership |
| Git proposal | Public ID, team, captured draft versions, base SHA, deterministic branch, PR/commit references, state, last error |
| Webhook/setup records | Unique delivery/state-hash identity, bounded payload, lease/expiry, authorization binding and outcome |
| Delivery outbox | Team, publication/policy epoch, unique event ID, required destinations, attempts/acknowledgments; inserted with state transition |
| Migration plan | Team, docs version, active publication, file/Section manifest/hashes, reviewed Git target/SHA, actor/expiry/state |
| Review evidence | Item/version, support-evidence references, approved export summary, draft/publication links, dedupe key and expiry |

Public IDs follow existing conventions; internal database IDs remain private. Store source mode at team docs settings, not a separately editable flag on each doc. Draft uniqueness is by document identity; published-route uniqueness is by publication membership. The existing shared `(team, kind, slug)` constraint must not prevent harmless draft duplicates or staged route swaps: migrate docs live/draft route handling to the publication contract while preserving other content kinds' behavior.

### 23.2 Activation procedure

1. Queue transaction captures selected immutable draft snapshots, the base publication ID, and the required navigation/index configuration. Compare `expectedDocsDraftVersion` for included Section changes under the same settings lock used by authoring writes. It does not wait for GitHub or embeddings while holding a database lock.
2. Prepare all candidate revisions, asset checks, text, navigation, route manifest, and required chunks outside the activation transaction. Reuse unchanged revisions; regenerate headings/links when their resolved targets change.
3. In a short activation transaction, lock the team's docs settings row. Compare active publication, request/connection generation, and source mode against the job's preconditions. A mismatch marks the job stale/superseded without swapping live data. An editor request based on an older publication is not silently rebased.
4. Verify preparation, navigation, route uniqueness, and managed-media availability. Set the active publication pointer and timestamp, and insert durable invalidation/report outbox events **in this transaction**. A worker that lost its lease cannot activate.
5. Commit. Outbox workers deliver/retry side effects independently; retain the prior publication under §23.6. Do not overwrite newer drafts while marking captured revisions published.

On a worker crash before activation, the previous publication stays live. On a crash after commit but before acknowledgment, retry reads the active pointer and returns the same success. Orphan candidate rows are harmless until cleanup; they are never queried by public readers.

### 23.3 Read consistency, caches, and nested routing (DM-DELIVERY)

Each new docs request/answer resolves the active publication and access-policy epoch through an uncached authoritative server read. Carry that pair through body, navigation, search, and citations. Internal immutable content caches use team/revision/publication keys; media-availability-filtered results also include policy epoch.

Public APIs return publication/epoch identifiers for race detection. A caller may supply expected values; stale values return `409 STALE_PUBLICATION`. Never serve prepared/archived content by public revision ID. In-flight requests may finish using captured published content, but recheck the active publication and managed-media eligibility before releasing a response or sending an answer. If the authoritative state cannot be checked, fail temporarily rather than serve stale content.

Fresh reads beginning after activation or managed-media access changes have **zero permitted application-cache staleness** for active identity and media eligibility. Docs HTML, public article/search responses, Markdown exports, and docs discovery responses use `Cache-Control: no-store`; bypass Next.js full-route/ISR and CDN caching on these routes. Cache immutable internal fragments only after checking live identity and media eligibility. Existing `teamCache` behavior must not remain on docs reads. Already downloaded content, third-party caches, and screenshots cannot be recalled.

Outbox delivery evicts obsolete fragments, refreshes derived listings/sitemaps, and reports to GitHub; live eligibility never depends on delivery speed. Signed API-to-sites invalidation accepts only defined event types/team IDs and validates authenticity/replay; it is not an arbitrary tag-purge endpoint. Persist per-destination acknowledgments. Failure before acknowledgment repeats an idempotent operation. Failure after activation but before delivery leaves a durable pending event.

Read live identity and managed-media eligibility from a primary/consistent store, not a lagging replica. Unpublish removes current routes. Confirmed loss of access to managed media hides dependent documents until provider reconciliation confirms public access again. Shell caching may remain independent but cannot retain embedded docs bodies/navigation across identity changes. Docs sitemap/discovery entries use the same filter; old chat messages may retain citation links that now return not found.

Use `GET /public/:teamId/content/documentation/by-slug?slug=a/b/intro` for nested lookups. Update API client, catch-all route, sitemap, links, and citations together. Static `/docs/collections/:sectionSlug` keeps precedence; reserve `collections` as an article first segment. `/docs/index` is an article, not the feed.

### 23.4 Retry and operational defaults

Use existing Postgres job/lease patterns. Proposed defaults: five transient attempts, exponential delays beginning at five seconds capped at five minutes, a two-minute lease with heartbeat renewal, and provider `Retry-After`/rate-reset handling taking precedence. Input validation errors are terminal for that candidate and are retried only after corrected input. Manual retry uses the same immutable input and rechecks eligibility; current branch drift queues a new run rather than publishing an obsolete SHA.

Proposed protective defaults for implementation tests: 1 MiB per Markdown file, 10 MiB total source text per docs candidate, 1,000 Markdown files, 2 MiB draft JSON, and 64 nested document-node levels. These are configurable operational defaults, not marketing guarantees. Return explicit limit diagnostics; never silently truncate. Git folder depth is governed by normalized path/request limits, not an arbitrary shallow Section depth.

Set matching route-specific request/parser limits so a supported draft is not rejected earlier by Express's unrelated default body limit. Do not increase all application payload limits merely to support docs. An oversized request returns `413` and a clear size limit; an excessive parsed-node/file count returns a diagnostic before persistence. Bound CPU-heavy parser work as well as byte sizes.

Emit structured logs and metrics keyed by team, job, publication, connection generation, and Git SHA. Capture queue time, preparation time, activation time, retry counts, validation codes, and last-good age. Exclude document bodies, private transcripts, and credentials from routine logs. Admin reports retain full necessary diagnostics under docs-read authorization.

#### Work admission and cost limits (DM-OPERATE)

Enforce existing public-chat abuse/budget controls and add per-team limits for docs work. v1 defaults: one preparing publication per team, one queued successor (coalesce Git pushes to the newest observed head), 20 explicit publish/sync requests per hour per team, 60 dry-run validations per minute per principal, and 10 outstanding setup/migration plans per team. Return `429` with retry guidance when appropriate; owner-authorized purge access must not be blocked by exhausted ordinary publishing quota. Idempotent replay does not consume another admission.

Read the branch head before scanning blobs; unchanged SHA and parser/indexing configuration is a no-op. Cache immutable Git blobs by repository ID/blob SHA and coalesce webhook bursts. Existing polling reconciles state, not an unconditional complete reimport/embedding every 15 minutes. Apply GitHub rate limits per installation as well as team fairness.

Before embeddings or suggestion generation, reserve estimated use against the existing team's AI budget; settle actual usage afterward. Budget exhaustion leaves a retryable, explicit `BUDGET_EXHAUSTED` state without spinning. No AI is needed for plain draft save, lexical publishing, or evidence dedupe. Bound worker concurrency globally and by tenant so one repository cannot monopolize parsing/provider calls.

### 23.5 Emergency withdrawal (removed)

> Implemented it but did not find real world use case and no other competitor has it

### 23.6 Retention, cleanup, and sensitive-data purge (DM-RETENTION)

These are v1 defaults, configurable by the operator without weakening active-reference guarantees. Retention does not make prior content publicly accessible.

| Data | Default lifetime / deletion condition |
| --- | --- |
| Active publication/revisions, current drafts, open proposals | Retain while active; no age-based deletion |
| Replaced successful publications and otherwise unreferenced revisions/chunks | 30 days after last active use |
| Failed/superseded candidates and raw webhook payloads | 7 days after terminal outcome; keep minimal receipt/report metadata for 30 days |
| Closed proposals and completed migration exports | 30 days; explicit active draft references still protect shared revisions |
| OAuth setup credentials, PKCE verifier, state | 10 minutes or immediate removal on completion/cancel/revocation |
| Feedback evidence and unapproved generated summaries | 30 days from receipt; pointers expire sooner when source conversation is deleted |
| Sanitized audit metadata (actor, IDs, code, timestamps, no bodies) | 90 days |
| Known temporary upload intents/abandoned uploads | 7-day grace; delete only when proven temporary and unreferenced |
| Registered permanent media library items | Never age-delete merely for being unused; normal authorized media deletion applies |
| Encrypted backups containing removed docs | Maximum 30-day expiry; document this to the owner |

A daily idempotent cleanup job processes bounded batches. Use live foreign-key/reference checks and leases, not a cached reference count. Hold rows needed by an active preparation/preview lease; release expired leases. In one transaction, remove expired publication memberships before collecting unreferenced revisions/chunks. Derive media references from surviving current drafts, retained revisions, Pages/blog/changelog/shared widgets, and other managed consumers. Separate these local row deletions from durable MediaLit-delete work with outbox retry.

Media deletion and publication must share a race-safe eligibility contract: mark the asset `deleting` under lock after a final reference check; new draft/publication references reject that state. Provider deletion runs afterward and is idempotent. If references win the race, return `409 MEDIA_IN_USE`. Purged content retains references until explicitly purged or expired.

Sensitive-data purge is an exceptional irreversible operation, separate from routine cleanup. Define `POST /content/documentation/purges/preflight`, `POST /content/documentation/purges`, and `GET /content/documentation/purges/:purgeId` with MCP equivalents `preflight_documentation_purge`, `purge_documentation`, and `get_documentation_purge`. Completion requires a recently reverified team-owner session; MCP can obtain a preflight/status and direct the owner to interactive completion, but does not bypass this gate.

Preflight names exact documents/revisions, derived chunks, diagnostics, feedback copies, cache objects, managed assets, and affected consumers. Commit requires that plan ID/hash, explicit irreversible-deletion acknowledgment, and idempotency key. Tombstone exact Git source identities before deletion to prevent automatic reimport; Git itself remains unchanged. Purge bodies from primary stores/caches/derived records through durable tasks, retain only sanitized audit IDs, and keep source tombstones until explicitly reviewed and cleared. An in-flight job cannot recreate a purged revision: it checks the purge generation before writing/activating.

If media is referenced by Pages or other content outside selected docs, report those dependencies and do not delete it under docs-only authority. Report external Git content, already sent customer messages, public CDN copies, and backup expiry honestly; primary-store completion is not universal recall. Restoring backups must replay the minimal tombstone/deletion ledger before allowing serving or imports. Keep that ledger until affected backups expire, and keep source tombstones until cleared.

## 24. Conversion, assets, and support integration contracts

The conversion, media, and feedback contracts below are independent. Media authorization does not follow from documentation permission, and support-evidence access does not follow from documentation read permission.

### 24.1 Conversion fixtures

Each supported construct needs fixtures for Markdown → JSON → Markdown and JSON → Markdown → JSON, comparing normalized semantic structure. Include nested lists, code fences containing JSX, language labels, escaped pipes in tables, Unicode prose, duplicate headings, links with anchors, images, trailing whitespace, and unknown frontmatter preservation.

Negative fixtures cover MDX imports, unsupported marks, merged/multiblock tables, invalid child ordering, duplicate YAML keys, unsafe protocols, data URLs, and local image binaries. Import must report unsupported constructs instead of deleting them. Raw HTML outside code fences is rejected initially; implementing a safe subset requires a separate explicit contract.

Use one heading-ID generator in the renderer, extractor, validator, chunker, and exported Markdown anchor handling. Define duplicate suffixes deterministically (first `setup`, then `setup-2`, `setup-3`). Editor/API-generated Markdown uses the same order and headings. Add parser, document-schema, heading-policy, and embedding-configuration versions to content/index hashes so upgrades can trigger deliberate rebuilds.

Document title lives in metadata and is rendered once by the page. Body headings remain authored content; importing a body H1 does not silently remove it. A title repeated as the first body H1 can generate a style warning without altering content.

### 24.2 Media (DM-MEDIA)

MediaLit is plain file storage for FrontLit, like S3. There is no ownership, provenance, or access verification layer around it. MediaLit files cannot switch between private and public, so there is nothing to reconcile after upload.

1. Request `POST /media/presigned` / `get_media_upload_signature`. The signature is grouped by team in MediaLit for organization only.
2. Upload bytes directly to MediaLit with that signature; FrontLit receives no file bytes.
3. Register using `POST /media` / `register_media` with the MediaLit ID. FrontLit seals the upload and stores the URL, thumbnail, file name, MIME type, and size MediaLit returns. Re-registering the same ID is idempotent; an ID already registered by another team is rejected.
4. Insert the public URL into Markdown or the image node. Images not in the team's library are allowed with an `EXTERNAL_MEDIA` warning.

Deleting a library item is refused with `409 MEDIA_IN_USE` while saved content (drafts, published revisions, pages, settings) references it; otherwise FrontLit deletes the file from MediaLit and removes the row.

### 24.3 Feedback operations, evidence permissions, and AI containment (DM-FEEDBACK)

Use eligible immutable revisions in retrieval. Return document/revision/publication evidence, heading/anchor, and a resolved public URL. Chat and help-desk adapters use one team/publication/policy-scoped service. A model may choose only among supplied evidence IDs; validate every returned citation server-side and construct its URL from stored metadata, never a model-supplied URL. Missing/invalid support produces clarification or handoff.

#### Evidence permissions and redaction

Raw question/answer excerpts, ticket IDs/links, and **unapproved generated summaries** are support evidence. Reading them requires both `documentation:read` and `helpdesk:read`, plus the existing conversation-level access policy. If a reviewer cannot read all evidence in an item, expose only authorized evidence/counts; derived unapproved text based on inaccessible evidence is withheld. Docs-only users do not receive item snippets/counts through list/search, exports, notifications, or errors.

A support-authorized reviewer with `documentation:write` can approve a standalone, redacted description and proposed correction for documentation use. Store the approved text separately with actor/time/version and the declaration that it contains no customer-specific details. Only that approved artifact is visible to docs-only contributors. Raw evidence never becomes public or enters customer retrieval because approval happened. Publication still uses the regular docs pipeline. Git issue/PR export uses only explicitly selected approved text and a final export preview; internal ticket URLs/transcripts are excluded.

Deleting or losing access to a source conversation removes its raw evidence pointers and invalidates unapproved summaries derived from it. A reviewed standalone draft remains normal documentation unless the purge workflow identifies sensitive material there. Apply the support-source retention policy if it is shorter than §23.6.

#### Deterministic v1 grouping

Create evidence on an explicit retrieval miss, negative-feedback event, or escalation. Deduplicate by team + conversation ID + message/feedback-event ID + trigger type. First v1 grouping uses team, reason category, suggested target document ID (nullable), and a hash of the normalized question (Unicode normalization, whitespace collapse, lowercase; do not remove numbers or product identifiers). Attach repeated matching evidence within 30 days to an open item. Do not require embeddings or an LLM for grouping. Similar-but-different questions remain separate until a reviewer merges them.

Store an item version and one of `open`, `dismissed`, `draft_created`, or `published`. A new independent occurrence after dismissal/publication creates a new open item linked to its predecessor; it does not silently reopen a decision. Version-checked reviewer operations permit dismiss, reopen, merge into another same-team open item, and approve redacted text. Merging moves evidence references idempotently and hides the superseded item behind a redirect, preserving audit history.

A draft-created item records target document/draft version and can still collect evidence without rewriting the draft. Publication links the exact accepted revision back to the item and marks it published; this does not assert the issue is solved. New evidence determines recurrence metrics. Reviewer changes after draft creation require an explicit revision action.

#### API/MCP contract

| REST | MCP | Input/result |
| --- | --- | --- |
| `GET /content/documentation/improvements` | `list_documentation_improvements` | Cursor, limit (20 default/100 maximum), state; authorized items or approved artifacts only |
| `GET /content/documentation/improvements/:itemId` | `get_documentation_improvement` | Version, permitted evidence, approved summary, draft/publication links |
| `PATCH /content/documentation/improvements/:itemId` | `review_documentation_improvement` | Expected item version; one action: dismiss/reopen/merge/approve-summary; structured validation |
| `POST /content/documentation/improvements/:itemId/draft` | `create_documentation_improvement_draft` | Approved-summary version, expected item version, optional target doc/base draft version, idempotency key |
| `POST /content/documentation/improvements/:itemId/github-export` | `export_documentation_improvement_to_github` | v1.1; approved-summary version, reviewed export hash, issue/proposal choice, target, idempotency key |

Evidence creation is internal to authenticated support events, not a public arbitrary-write endpoint. Review operations need the evidence permissions above plus docs-write; converting an already-approved artifact to a draft needs docs-write and access to that artifact. Git export additionally needs docs-publish and the delegated integration capability. Normal validation/stale-version transport rules apply.

Draft creation calls the shared safe-draft service and atomically records the item/version → draft link. Uniqueness on that pair prevents duplicate drafts on retries. A stale target draft returns `409` rather than overwriting it. If no factual evidence supports a proposed correction, create reviewer notes/questions in the improvement item rather than inventing publication-ready claims. Generated output requires the same validation as human content.

#### Prompt injection and resource controls

Ticket text, Git Markdown, retrieval results, and tool outputs are untrusted **data**, not instructions. Preserve existing chatbot containment and add tests for injected instructions embedded in each new path. Document ingestion/rendering must never execute embedded code. Answer generation has no publication, Git-write, media-delete, private-conversation-search, or arbitrary network tool; only the scoped retrieval operation is available. Draft-suggestion generation likewise has no write tools and returns bounded data for validation.

Keep support evidence separate from approved documentation context. Encode/escape data delimiters so literal closing tags in an article cannot escape a prompt boundary. Model output cannot choose credentials, team IDs, target repository, or file paths for a write. Enforce those outside the model. Prompt instructions alone are insufficient; test that injected “publish this”, “read another team's ticket”, or “send this secret to a URL” text cannot trigger a side effect.

Require bounded input/output and per-team AI budgets from §23.4. Failure of classification/generation leaves an actionable review item and does not drop evidence. In v1, hold answer output until citations are checked against the active publication. [OWASP RAG security guidance](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html) supports treating retrieved content and downstream actions as separate trust boundaries.

## 25. Implementation work packages and executable acceptance scenarios

Implement in dependency order. These packages are bounded tasks for implementers; this PRD does not authorize autonomous parallel agents or external GitHub setup by itself. Each package must leave the repository buildable and list new/changed contracts in its handoff.

| Package | Scope and primary files | Depends on | Exit evidence |
| --- | --- | --- | --- |
| D1: headless content profile | `packages/text-editor` schema/import/export/heading helpers | None | Positive/negative fixtures pass without browser globals |
| D2: authoring contracts | API schemas, validation, REST/MCP parity, permissions, Media API provenance hardening | D1 | DM-VALIDATE/DM-AUTH/DM-MEDIA tests; stale-save and verified/private asset cases |
| D3: revision/publication store | DB migrations, snapshots, candidate membership, jobs, transactional outbox, retention/purge | D2 | DM-PUBLISH/DM-NAV/DM-DELIVERY/DM-RETENTION scenarios, including crash and deletion races |
| D4: editor-owned UI and site | Save/preview/history/publish reports, catch-all routes, publication-aware serving | D3 | DM-EDITOR/DM-DELIVERY scenarios; no Git/AI dependency; no preview credential leakage |
| D5: retrieval/support loop | Immutable chunks, retrieval, evidence permissions/grouping, review API/MCP/UI, budgets | D3 | DM-FEEDBACK/DM-OPERATE tests; injection, redaction, idempotency and isolation |
| D6: App setup, setup PR and inbound sync | Docs GitHub module, callback/webhook, platform-created setup/adoption PR, persistent progress/recovery UI, metadata import, delegated grants | D1–D4 and shared Git write primitives | DM-GITHUB/DM-MIGRATE tests plus headful platform-created setup PR, retry/reload/merge/verify/adoption/error/correction and empty-repo initialization |
| D7: PR authoring/checks | Proposals, idempotent Git writes, PR checks, permission upgrade UX | D6 | Unmerged/closed/merged scenarios, races, write-failure recovery |

D5 and D6 can be scheduled independently after their dependencies are satisfied. D7 and machine-readable public routes remain v1.1. Blog/changelog retrieval changes are not prerequisites for docs dogfooding.

The observed coverage and remaining checks are in §29. Required scenarios below must have automated tests at the appropriate service/transport level; browser and real-GitHub smoke tests supplement them. Use a fake GitHub adapter for deterministic failures and a disposable sandbox installation for integration evidence.

| ID | Setup and action | Verifiable expected result |
| --- | --- | --- |
| V01 | GitHub variables unset; create/save/publish editor doc with AI disabled | Docs work under `/docs`; no GitHub/embedding call; lexical search finds it |
| V02 | Send malformed child tree via REST and MCP | Both reject before any draft write with equivalent diagnostic paths |
| V03 | Save safe draft with a duplicate proposed slug | Draft saves with blocker; publishing fails; old routes unchanged |
| V04 | REST and MCP update the same version concurrently | Exactly one succeeds; other receives stale-version error; no merged partial content |
| V05 | Save slug and `indexable` changes on a live doc | Live URL and retrieval unchanged until publication |
| V06 | Publish a captured draft while a newer save occurs | Captured version goes live; newer draft remains dirty |
| V07 | Two jobs prepared from the same live publication | Only eligible activation succeeds; loser reports stale/superseded and cannot roll back winner |
| V08 | Embedding fails with AI enabled | Old publication retained; job retry uses same immutable input |
| V09 | Worker crashes before versus after activation commit | Before: old live remains; after: retry recognizes committed success |
| V10 | Create unpublished Section and move a doc to it | Save succeeds; publish without Section change fails; combined publication succeeds |
| V11 | Publish rename with inbound link update in same batch | Both activate; old route removed; no transient broken candidate exposed |
| V12 | Deep file `a/b/c/d/e/f/g/h/intro.md` imported | Section `a`; full nested URL works through public API/site and appears in navigation |
| V13 | Callback state replay or forged installation ID | No binding or import; authorization error; existing source unchanged |
| V14 | Attempt initial-connect with editor docs/Sections | `SOURCE_MIGRATION_REQUIRED` points to reviewed adoption; no overwritten/deleted records (DM-SOURCE) |
| V15 | Webhook altered, duplicated, or received out of order | Altered rejected; duplicate no duplicate job; old delivery cannot restore old branch content |
| V16 | Tree API returns truncated data or temporary error | Import fails/retries; absent response entries are not treated as deletions |
| V17 | Complete valid Git tree removes all managed docs | Candidate removes docs through normal activation; no stale chunks remain |
| V18 | Invalid duplicate-route commit merged | FrontLit report identifies both files and live/attempted SHAs; GitHub publication check fails in v1.1 |
| V19 | Installation suspended while job preparing | Generation check blocks activation and Git writes; last good site stays live |
| V20 | PR created but never merged, then closed | Public content unchanged; proposal remains recoverable with accurate status |
| V21 | Git write succeeds but response is lost | Retry finds deterministic branch/PR; no duplicate PR or commit mutation |
| V22 | Upstream edits same file after editor draft base | Submit reports upstream conflict; neither remote content nor local proposal is discarded |
| V23 | Protected branch rejects direct update | No force push; report rule failure and offer PR path |
| V24 | Agent has docs-write but no docs-publish scope | Save permitted; publish/submit rejected by REST and MCP policy |
| V25 | Cross-team Section/media/publication identifier supplied | No private information disclosed; reference/read rejected |
| V26 | Data URL/private attachment pasted; managed asset deleted while referenced | Save rejects URL; media delete rejects referenced object |
| V27 | More than 500 docs with configured limits permitting it | Complete navigation/sync or explicit limit error; no silent truncation |
| V28 | Valid publication, GitHub check API temporarily fails | Docs remain active; reporting retries independently |
| V29 | Git import contains unsupported MDX or JSX outside a code fence | Diagnostic with file location; no silent content loss or code execution |
| V30 | Docs answer before/after activation and on failed update | Citations point to evidence from the captured active revision; drafts never retrieved |
| V31 | Crash after activation commit before invalidation; lose one destination acknowledgment | Durable outbox retries idempotently; fresh page/search/Markdown/nav resolve new identity despite pending delivery (DM-DELIVERY) |
| V34 | Change Sections between review and enqueue, then after enqueue | First returns STALE_DOCS_DRAFT; second preserves captured snapshot and leaves new navigation dirty (DM-NAV) |
| V35 | Non-GitHub support publisher submits through approved delegation, then loses FrontLit permission before worker write | First authorized path uses bot identity; revoked pending write is stopped; audit names actual actor/grant (DM-AUTH) |
| V36 | PKCE verifier wrong, Origin untrusted, repo grant revoked after picker, or repository ownership transferred | Setup/mutation fails or binding pauses without source change; no silent reauthorization (DM-AUTH) |
| V37 | Forge media URL/ID/group, reuse upload intent, or submit private ticket object; provider later reports access loss | Registration refuses before sealing; provider canonical URL wins; docs that depend on the asset are hidden after verified access loss (DM-MEDIA) |
| V38 | Advance retention clock; purge selected sensitive revision with pending preparation; restore old backup | Expired data collected, active refs retained; purge prevents recreation; restored serving replays tombstones first (DM-RETENTION) |
| V39 | Race managed media deletion with a new draft/publication reference | Either reference commits and deletion fails, or deleting state wins and reference fails; no published broken managed asset (DM-RETENTION) |
| V40 | Docs-only author previews/history-reads; request another team/prepared/public archived revision; tenant shell has injected script | Only authorized retained data returned; scripts omitted; no tenant-domain admin credentials or public preview token (DM-EDITOR) |
| V41 | Docs-only reviewer requests raw ticket evidence; repeat draft creation; inject write/exfiltration instructions through ticket/doc | Raw and unapproved derived evidence withheld; exactly one draft per approved item version; no model-triggered write/network action (DM-FEEDBACK) |
| V42 | Capture CMS docs, never-published draft and empty Section; FrontLit creates setup PR, merge unchanged semantic set and activate | Existing IDs/URLs/live content/Section labels retained; source becomes Git; draft remains unpublished (DM-MIGRATE) |
| V43 | Create/edit docs after migration or empty-connect preflight; concurrent activation/save | Shared lock/version makes one stale; no overwritten editor work or hybrid canonical source (DM-MIGRATE) |
| V44 | Setup PR target missing/extra/changed file, stale branch, expired consent, cancellation | No source/live mutation; actionable report/reverification; stop further writes and honestly retain already-created remote references (DM-MIGRATE) |
| V45 | Webhook burst/unchanged reconciliation/AI budget exhaustion and another team's job | Duplicate work coalesced; no unchanged blob scan/embed; bounded admission and fair work (DM-OPERATE) |
| V46 | Click Create setup PR with a reviewed CMS capture, then reload Source | FrontLit itself creates one branch/commit/PR with exact captured files and persistent Open setup PR/progress; no download/manual commit required; editor publication unchanged (DM-MIGRATE/DM-GITHUB) |
| V47 | Double-submit/retry setup PR; lose commit/branch/PR acknowledgment; restart worker | One matching remote result is recovered; same idempotency key returns same attempt; foreign branch/PR conflicts; no duplicate write or premature adoption (DM-MIGRATE) |
| V48 | Save/change Section, revoke authority, purge, expire or cancel plan before/during setup PR writes | Shared fences stop further writes, retain editor content and disclose any already-created remote artifacts; corrected inputs need fresh review (DM-MIGRATE/DM-AUTH) |
| V49 | Set up docs from empty editor state into truly empty Git repository; separately select a missing branch in a nonempty repo | Disclosed placeholder-only bootstrap creates a PR base and FrontLit opens the docs/metadata PR; no article is invented/published; retry is idempotent; nonempty missing-branch case never overwrites/bootstraps (DM-MIGRATE/DM-GITHUB) |

## 26. Release gates and handoff requirements

Provider observation (2026-10-02): an older open PR may expose an original base SHA and stale synthetic merge after the publishing branch advances. Validation uses immutable merge parents and the current branch head, rejects stale proofs and delays fresh validation at least 60 seconds. Current provider-recovery evidence remains open; the user-created PR #1 has not been changed or merged. Normal newly created PRs #3/#5 and closed PR #4 passed their recorded live scenarios.

Historical visible Chrome evidence superseded the earlier installation/401 gates: after the user made the App public and installed it, OAuth and repository discovery worked for `clbotdev/docs-site`. Installation returns without FrontLit OAuth state led to Settings → Integrations → GitHub for verified authorization rather than an erroneous expired-setup response. Installation labels showed account names/types, and authorized setup survived reload through a workspace-scoped setup ID with server expiry/access checks. That checkpoint captured a reviewed nine-file adoption export, but its manual-commit workflow is superseded by the platform-created setup PR requirement in §21.5. The remaining adoption gate is FrontLit creating the PR, followed by GitHub review/merge, verification and final source approval. No remote commit or adoption activation was performed by the agent at that checkpoint. Publishing-branch check delivery, positive proposal/check/merge smoke and final operator/acceptance audits remain incomplete. D7 remains open; MEDIA-01 remains the accepted nonblocking provider exception.

Do not mark a work package complete based only on typechecking. The implementation handoff must name changed contracts, migration behavior, tests run, operational configuration, and any unmet acceptance scenario. Tests should exercise observable behavior and failure boundaries rather than duplicate implementation expressions.

Foundation requires D1–D5 and V01–V11, V24–V27, V29–V31, V34, V37–V41, V45 for their editor/publication portions. Git dogfood adds D6, V12–V19, V36, V42–V44, V46–V49, and Git admission tests. Full Git authoring adds D7, V20–V23, V28, V35, permission-upgrade smoke tests, and remaining Git portions. Every requirement ID must have passing evidence, an explicit unmet release gate, or an expressly accepted non-blocking exception such as MEDIA-01. That exception covers only the known provider limitation and does not waive other DM-MEDIA scenarios. External callback/installation/MediaLit tests use disposable test resources; mocks alone cannot establish provider guarantees.

Operator runbook must include app registration URLs, secret rotation, callback/webhook URL verification, worker health, failed-delivery replay, permission-upgrade instructions, and recovery from repository removal. Workspace help must explain editor mode, auto-publication from the chosen Git branch, unpublished PR behavior, where errors appear, and why a successful save may still require fixes before publishing.

The initial release retains flat Sections, one docs source per team, platform-created reviewed setup/CMS-to-Git adoption PRs, no arbitrary application/MDX execution, no auto-merge, and no public branch previews. Broader migrations remain deferred. Do not silently delete data, bypass canonical authorship, discard unsupported content, or widen access to implement omitted features.

<a id="implementation-guide"></a>

## 27. Implementation guide

### 27.1 Delivered code and responsibilities

All seven packages are implemented. Use §25 for dependency boundaries and §29 for acceptance scope. The following paths identify existing implementation entry points; they supplement the contracts in §§18–24.

| Package | Existing implementation | Delivered behavior |
| --- | --- | --- |
| D1 | `packages/text-editor/src/docs.ts`, `src/docs/{extensions,validate,markdown,frontmatter,urls,routes,hash,headings}.ts`; package exports `@frontlit/text-editor/docs` and `/headings` | Shared headless schema, recursive validation, bounded YAML, safe URLs, import/export, versioned hashes, and duplicate-aware heading IDs. Client directives apply only to the UI bundle. Renderer, heading extraction, and docs chunking share the heading policy. |
| D2 | `packages/api-contract/src/schemas/{documents,documentation}.ts`; `apps/api/src/documentation/{authoring,content-validation}.ts`; `src/documents/queries.ts`; `src/media/{provenance,queries,service}.ts` | JSON/Markdown versioned saves, derived Markdown/hash, staged routes/indexability, Section CAS, structured REST/MCP diagnostics, distinct publish/manage authority, provider-backed media registration, and shared reference/deletion locks. |
| D3 | `apps/api/src/documentation/{publications,publication-worker,admission,projections,deletion-ledger,deletion-replay}.ts`; `src/public/routes.ts` | Immutable memberships/navigation, captured candidates, preparation before activation, leased jobs, transactional activation/outbox, retention/purge/restore fencing, and publication-consistent public reads. |
| D4 | `apps/api/src/documentation/experience.ts`; `apps/web/components/content/documentation-*.tsx`, `editors/documentation-editor.tsx`; `apps/sites/components/themed-docs.tsx`, `lib/{api,docs-tree,extract-doc-headings}.ts`, `app/sites/[teamId]/docs/[...slug]/page.tsx` | Private preview/history, exact-version batch review, retry/unpublish, nested routing, complete navigation, and public serving. Public UI uses page-builder primitives and the team theme. |
| D5 | `apps/api/src/documentation/{retrieval,improvements,chunking}.ts`; `src/{chatbot,inbox-ai}/completion.ts`; `src/inbox-ai/{generate,mail}.ts`; dashboard retrieval/improvements components | Immutable lexical/semantic retrieval, budgets, redacted approved evidence, versioned review/idempotent drafting, grounded citations, policy checks before persistence/mail, and bounded preparation. |
| D6 | `apps/api/src/documentation/github/{app,setup,source,importer,webhooks,migrations,migration-prs,migration-write-worker,migration-reconciliation,admission,retention}.ts`; dashboard `documentation-source.tsx` | Separate GitHub App/PKCE, stable repository identity, raw signed webhooks, immutable complete-tree import, platform-created setup/adoption PRs, empty-repository initialization, original-admin activation, persistent progress/recovery, and generation-fenced sync. |
| D7 | `apps/api/src/documentation/github/{drafts,grants,publisher,proposals,proposal-patch,proposal-authority,proposal-worker,proposal-write-worker,proposal-review-worker,proposal-application,pr-validation,check-worker,check-delivery,check-reconciliation,check-reports,publication-checks}.ts` | Provenance-aware local drafts, explicit PR/direct grants, exact captures, guarded/recoverable Git writes, immutable merged application, PR validation and independent publication reporting, private history/reports, and missed-event reconciliation. |

REST routes and administrative MCP adapters call the shared services. `packages/api-contract/src/{documentation-github-contract.ts,schemas/documentation-github.ts}` defines the Git wire contracts. `apps/api/src/mcp/tools/{documents,documentation,documentation-github}.ts` and the operation-policy catalog enforce scopes and projections. Do not expose private capture bodies, credential references, arbitrary database columns, or provider secrets through typed tool outputs.

### 27.2 Migration inventory

The feature's former migrations `0004`–`0024` are consolidated into `0004_docs_management.sql`. All 139 SQL statement blocks retain their original order, including data backfills. The final schema snapshot is `meta/0004_snapshot.json`, linked directly to the baseline snapshot; intermediate feature snapshots are removed. Migrations `0000`–`0003` remain the pre-feature history. Earlier migration names in the dated acceptance evidence and §31 refer to the original checkpoints.

| Artifact | Responsibility |
| --- | --- |
| `apps/api/drizzle/0004_docs_management.sql` | Draft authoring/media provenance; immutable publications/navigation/jobs/outbox/purge; support evidence/semantic configuration/review audit; Git setup, source, grants, proposals, move identity, reconciliation, diagnostics, setup PRs and empty-repository initialization; bigint check-run IDs |
| `apps/api/drizzle/0006_remove_documentation_restrictions.sql` | Drops the emergency-withdrawal restriction table from databases that applied the earlier feature migration |
| `apps/api/drizzle/meta/0006_snapshot.json` | Current schema snapshot used by Drizzle for subsequent migrations |
| `apps/api/drizzle/meta/_journal.json` | Migration order; the combined docs entry retains the former `0024` timestamp, `1790948907191` |

Fresh databases apply the combined migration after `0003`. Databases that already applied all former feature migrations skip it because the final timestamp is unchanged. A development database with only part of the former sequence applied must be rebuilt before using the squashed history. Consolidation does not migrate or reset the running workspace.

Fresh databases no longer create the former restriction table. Migration 0006 safely removes it from development databases that applied an earlier in-progress migration. Existing member grants were not automatically expanded; owners retain all catalog permissions, and other members need explicit publication authority. Legacy URL-only media rows remain unverified until provider-backed adoption.

D1 and D4 required no separate migration. Documentation routes are unique per publication, permitting atomic swaps; unrelated content keeps its existing slug rules. Legacy live columns are admin projections, and public content/search use active immutable membership.

### 27.3 Behavior to preserve when extending the feature

Saving captures draft JSON, Markdown, hash, metadata and a monotonically increasing version together under the team settings lock. Autosaves serialize; stale/offline saves retain edits and pause publication until comparison/reload/retry succeeds. Preview and proposal/publication review flush the editor's debounced rich-text change, then wait for acknowledged metadata saves. Clean preview does not create a new version. Relative links use text inputs with URL input mode; server URL validation remains authoritative.

Publication captures exact selected versions, base publication, Sections/settings, indexing configuration and navigation. Preparation validates the complete candidate; activation checks lease, generation, base and purge fences and commits the pointer and event atomically. Newer drafts survive. Retry uses the failed candidate's immutable capture rather than newer drafts. Unpublish removes public membership while retaining the draft. Confirmed loss of managed-media access hides dependent documents until access is verified again. Preview excludes tenant scripts/widgets/credentials and is private/no-store/noindex.

Git setup is a product workflow: reviewed capture → FrontLit-created PR → provider-confirmed merge and semantic verification → original-administrator Finish setup. A setup webhook or merged PR alone never activates a source. Truly empty repositories require provider empty proof and a disclosed placeholder-only default-branch commit, followed by a PR containing the real captured files. Failed rechecks clear stale verified proof and expose correction/retry; cancellation preserves and discloses accepted remote references. Setup recovery can discover only the initiating manager's current plan without leaking bodies.

Git saves remain local. Proposal admission captures exact versions and server-owned bases; whole-candidate preparation preserves unrelated upstream bytes and rejects changed selected files. Every mutation rechecks publisher credential, source/grant generation, restrictions, lease and restore state. PRs use deterministic branches/recovery and direct commits use `force:false`. Observation can continue read-only after actor revocation. A merge remains `merged` until normal import/preparation/activation proves its inclusion; only accepted activation marks it `published`. Moves retain document identity and path tombstones. Discard restores the latest accepted imported snapshot/provenance into a new local version, retains removed-file drafts when no current snapshot exists, and returns the authoritative source mode.

PR validation proves both immutable synthetic-merge parents against the current publishing head and PR head, then rereads provider stability. Historical PR base metadata is insufficient. Stable closed PRs receive a terminal neutral report. Stale synthetic-merge failures settle superseded without a self-enqueue loop; new events/discovery can retry. Check delivery recovers the existing run by external identity, sends at most 50 annotations per request, and never changes publication truth. Successful sync recovery clears resolved diagnostics; historical failed runs remain history.

Lexical delivery needs no AI. Semantic preparation uses a real provider, captured encrypted configuration, valid reusable vectors, bounded five-revision batches and settled team budget. A failure preserves accepted retrieval; retries cannot silently substitute a different captured credential configuration. Answers use supplied heading evidence and server-built URLs, renumber citations after source deduplication, and recheck publication/policy before storing or sending. Docs-only readers see approved standalone artifacts; raw tickets and unapproved snippets remain support-scoped. Repeated draft creation is atomic/idempotent per approved artifact version.

MCP SDK output validation is part of transport correctness: successful mutation results must match their declared schemas. Explicit projections prevent `authorAccountId`, docs-only fields on articles/product updates, or unrelated team-settings columns from leaking. Real SDK coverage lives in `apps/api/src/mcp/content-output.test.ts`.

<a id="testing-guide"></a>

## 28. Testing guide

### 28.1 Choose verification by scope

The expected results for V01–V49 live in §25; observed results and residual scope live in §29. Tests exercise observable failures and recovery boundaries. Local provider doubles, real PostgreSQL transactions, visible-browser interaction, live provider guarantees and deployed operator checks establish different things. Report each scope separately, and keep a failing accepted exception visible.

Run commands from the directory shown. These are reproduction instructions; this consolidation did not execute feature suites or contact providers.

| Directory | Command | Scope |
| --- | --- | --- |
| `packages/text-editor` | `bun run test` and `bun run check-types` | Headless conversion, syntax/structure/metadata/URL/path safety, original-source diagnostics, semantic round trips and matching rendered heading IDs |
| `apps/api` | `bun run test --maxWorkers=2` and `bun run check-types` | Complete API suite, including configured live MediaLit integration; the last recorded sole failure is MEDIA-01 |
| `apps/api` | `bun run test --maxWorkers=2 --exclude 'src/media/*.integration.test.ts'` | Local regression with provider integrations explicitly excluded; not provider acceptance |
| `apps/web` | `bun run test` and `bun run check-types` | Permission/workspace boundaries, editor helpers, complete pagination and private report UI |
| `apps/sites` | `bun run test` and `bun run check-types` | Host/proxy boundaries, complete docs tree, nested routes, themed rendering and signed delivery |

For focused API iteration, use the selection recorded in the D5 evidence or select the affected `src/documentation`, auth, media, public, MCP, support and mail suites. `content-output.test.ts` exercises typed content tools through the actual MCP SDK. `oauth-transports.test.ts` exercises actual signing/JWKS/auth/team/policy/SDK with test-issued tokens and a doubled GitHub provider; it does not establish interactive OAuth issuance or live machine Git writes. The general Git transport harness mocks auth middleware, so its permission claims need the separate auth/policy suites.

Build changed shared contracts/editor packages before dependent application checks when generated outputs are required. Run production sites smoke in a separate checkout with `bun run build` and the standard `.next` output. The historical D3/V31 smoke used an isolated build and production server on port 3005; its temporary output and configuration overrides were removed during cleanup on 2026-10-03. Verify authoritative active content before event arrival, signed event acknowledgment/replay, cold restart after downtime, and forged-signature rejection. Deployed multi-instance/CDN behavior remains a production exercise.

### 28.2 Real PostgreSQL and process boundaries

All commands below run from `apps/api`. They create disposable databases, apply real migrations and remove only their generated databases in cleanup. Use `FRONTLIT_TEST_POSTGRES_URL`, otherwise local `.env` `DB_CONNECTION_STRING`. The role must create databases and install pgvector. Provider reads are doubled unless stated; the normal workspace is not reset or adopted.

| Command | Assertions |
| --- | --- |
| `bun run test:docs-postgres` | Same-version saves produce one unmixed winner; a save during adoption makes it stale; successful adoption gives later saves Git provenance; concurrent workers claim one sync once |
| `bun run test:docs-editor-postgres` | A fresh child with every `GITHUB_DOCS_*` variable removed saves, publishes, serves and lexically searches with editor ownership/configured:false and no remote provider call |
| `bun run test:docs-adoption-race-postgres` | Production app/authenticated REST PATCH and actual MCP SDK race held adoption: one save wins, the other is stale, adoption reports MIGRATION_STALE/no binding; unsynchronized races retain one source |
| `bun run test:docs-outbox-postgres` | Actual SIGKILL before activation retains last good content and lease reclaim activates once; SIGKILL after commit retains original event; production signed loopback HTTP rejection/retry retains acknowledgments and publication identity |
| `bun run test:docs-media-postgres` | Both explicit reference/delete lock orders and concurrent races admit only one winner; MEDIA_IN_USE protects references and deleting state rejects a new reference; provider completion is separate |
| `bun run test:docs-restore-postgres` | Actual pre-purge dump/restore returns old bodies; independent CLI replay erases them, retains maintenance mode and blocks the deleted route |
| `bun run test:docs-tenant-burst-postgres` | 80 concurrent webhook enqueues across four adopted tenants coalesce to one current sync each; eight concurrent workers claim all tenants exactly once |

The adoption fixtures seed the merged setup PR required by the current contract. Host `pg_dump`/`pg_restore` must match the server version. Select matching tools with `FRONTLIT_TEST_PG_BIN_DIR`, or `FRONTLIT_TEST_POSTGRES_CONTAINER` (and optional `FRONTLIT_TEST_DOCKER_BIN`) for the container hosting the test database. The successful local restore used `frontlit-local-postgres-1` and matching container tools; host PostgreSQL 16 could not dump server 17. Advancing a lease deadline is confined to the disposable fixture. This proof does not configure deployed backups or ledger durability.

### 28.3 Live provider verification

Media provenance/provider-guarantee integration tests were removed with the media verification layer (§24.2). `bun run test src/media/service.integration.test.ts` still checks a live upload signature.

Use a disposable GitHub installation/repository and explicit authority for provider mutations. Real signatures, complete tree responses, branch protection, grants, response loss and remote recovery need provider evidence; mocked callbacks or injected browser responses cannot replace it. Fault-injection smoke used production adapters and ordinary queues with scoped actual App credentials, discarded a successful provider response at the selected boundary, and let normal scheduler/backoff recover without editing job rows or schedules. Those one-off scripts and their temporary permission rule were removed; the dated summaries in §31 retain the assertions. Recreate fault tooling only when needed and authorized.

AI smoke should use small approved fixtures and record actual budget counters separately from billed-token claims. V30 required three successful isolated Assistant calls: before accepted merge, after merge, and after rejected import. They added 3,741 tokens to the workspace budget counter with zero held reservations. An earlier expired-key attempt produced no answer and is not successful citation evidence; it conservatively counted 13,217 estimated tokens. Credential errors classify provider_auth for structured 401/403 and expired/revoked API keys, while 429 and unrelated certificate expiry remain transient.

### 28.4 Visible-browser procedure

Use visible headful Chrome with an authenticated admin dashboard and an isolated anonymous public context. The recorded local ports are API 4000, dashboard 3000 and sites 3002. Check current listeners/auth/source first. Visit `http://localhost:3000` before requesting sign-in; a displayed login route can coexist with a valid session. User password/2FA challenges are completed directly. A past session's service-start/GitHub authority is historical; use the current task's authorization.

1. **Authoring:** Create/edit JSON and Markdown; test immediate format-after-reload autosave, headings 1–6, duplicate anchors, relative links and tables. Race the acknowledged version, retain stale/offline edits, compare/reload/retry, and prove rejected unsafe content changes no saved fields. Stage slug/indexability and verify public content remains unchanged. Test discard, deletion protection and Section version conflicts.
2. **Publication/UI:** Type then immediately Preview; require current saved body, private/no-store/noindex and no tenant script/token request. Review exact linked-document versions and navigation, test exclude-new-Section rejection, queue, edit after capture, and prove accepted content/newer draft separation. Read retained history, unpublish/republish and exact-candidate retry. Check 390×844 viewport, dialog/footer bounds, console and theme/heading consistency.
3. **Git setup:** Review destination, visibility, private drafts and exact captured file list; create the product setup PR, reload, retry/double-submit, close/cancel and inspect disclosed remote references. Merge in GitHub, verify immutable content, test mismatch/correction/proof invalidation, reauthorize expired setup and Finish setup as the original administrator. Prove IDs/routes/Sections/drafts/live publication and retrieval survive adoption. Test genuinely empty repository and nonempty missing branch separately.
4. **Git authoring:** Submit captured draft/path changes, verify unmerged/closed PRs leave the site live, merge and preserve later saves. Rename with inbound links in one batch; reject rename-only BROKEN_LINK. Serve an eight-folder path with one flat first-folder Section. Test same-file upstream conflict, protected direct-write PR fallback, unsupported MDX checks/rerun and duplicate-route merge with exact last-good retention. Normal discard preserves Git source mode.
5. **Authority/recovery:** Verify consumed callback replay, repository grant removal, duplicates/out-of-order signed deliveries, access suspension and publisher revocation between writes, response-lost PR/check/source recovery and independent reporting. Verify docs-only preview/history/evidence boundaries and anonymous private-endpoint 401s. Raw tickets/injected instructions must never enter docs-only artifacts or model write capabilities.
6. **Retrieval/cleanup:** Flag a support gap, approve standalone redacted text, create one idempotent draft and publish through normal review. Confirm revision/heading/URL citations and unpublished exclusion, missing-provider last-good behavior, and the before/after/rejection triplet. Remove temporary Git files/PRs through normal workflows, discard fixture edits, compare configured subtree bytes and canonical document snapshots, and retain named review fixtures only intentionally.

### 28.5 Evidence and fixture discipline

Capture the actual UI/API/provider result, version/publication/policy/source identities, test scope and failures. Record a concise dated summary in this document, including the command, outcome and limitations. Keep raw output in a temporary location when needed for debugging; never save cookies, authorization headers, signing secrets or raw tokens. Historical `/tmp` screenshots and snapshots are listed in §31, with the runtime-reset loss explicitly recorded. Counts from different checkpoints overlap.

For adoption/cleanup comparison, record the baseline manifest and Git subtree before mutations. Compare document IDs, routes and canonical revision snapshots while explicitly documenting excluded draft-version counters. A changed publication pointer can preserve identical content; missing baseline data is missing evidence. The §30 restore procedure and §31 setup-correction SQL demonstrate the comparison. Fixture IDs and final states in older reports belong to their recorded dates; read current state before resuming or deleting anything.

<a id="acceptance-audit"></a>

## 29. Acceptance audit

Checkpoint: 2026-10-03. D1–D7 are implemented and signed off for local/staging; the remaining §26 release gates are listed under Requirement and release disposition. This matrix evaluates the numbered requirements, including revised setup-PR scenarios V46–V49, in [PRD §25](#25-implementation-work-packages-and-executable-acceptance-scenarios). Local tests and provider doubles establish application behavior; they do not establish live GitHub or MediaLit guarantees. An unchecked component of a scenario remains a gate even when its other components pass.

### 29.1 Verification evidence by checkpoint

These scopes overlap and must not be added together. Temporary logs from the initial checkpoint were lost when the runtime restarted; those counts are recorded historical observations, not newly reverified results. The restore/PostgreSQL checkpoint below has freshly recreated evidence:

| Evidence | Observed result and scope |
| --- | --- |
| MCP SDK output contract (fresh, 2026-10-03) | Real-PostgreSQL V43 transport race exposed that successful `update_documentation_page` calls failed SDK output validation (leaked `authorAccountId`; get/list used the article schema; articles/product updates leaked docs-only columns; `get_team_settings` leaked shared-widget columns). Fixed in the MCP/REST projections; new `src/mcp/content-output.test.ts` calls every typed content tool and every read-only no-input tool through the actual SDK. MCP/settings scope: 25 tests/six suites and API typecheck pass |
| Reset and consolidated migrations (2026-10-03) | After the local Compose stack was recreated, all five journal entries and all 68 final-schema tables matched; pgvector was enabled and the reset workspace had zero teams/documents. `bun run db:migrate` reran successfully. The existing PostgreSQL harness passed 12 checks across the normal, editor-without-GitHub, authenticated adoption-race, media-race, crash/outbox, backup/restore and tenant-burst modes. Reproduce from `apps/api` with `FRONTLIT_TEST_POSTGRES_CONTAINER=frontlit-local-postgres-1 bun run test:docs-postgres --editor-no-github --adoption-transport-race --media-race --outbox-crash --backup-restore --tenant-burst`. All disposable databases were removed. GitHub was doubled; no live GitHub or AI calls and no browser smoke were performed |
| Real PostgreSQL transport/adoption race (fresh, 2026-10-03) | `bun run test:docs-adoption-race-postgres`: production app, API-key auth, REST PATCH and MCP SDK race held adoption (one winner, one stale, adoption `MIGRATION_STALE`, no binding) and six unsynchronized races stay single-source. The shared PostgreSQL fixture was stale after the setup-PR requirement (`GITHUB_SETUP_PR_REQUIRED`); it now seeds the merged setup PR, and editor/media/outbox/restore modes pass again. Restore uses `FRONTLIT_TEST_POSTGRES_CONTAINER=frontlit-local-postgres-1` for version-matched pg_dump. |
| Live gates with App token (fresh, 2026-10-03) | With the user's scoped permission rule, one-off live scripts (since removed; results summarized below) used the real App adapter/JWT in-process: V35 revocation between Git writes, V44/V48 cancellation between setup branch and PR, V15 out-of-order duplicate redelivery; headful V13 consumed-state replay and V36 repository-grant revocation. Fixes: fallback PR preselection, stopped-setup artifact disclosure and restart, access-lost misreported as admin-required, dashboard raw-code errors. Full API 713/714 (MEDIA-01 only; one intermittent load-only V31 fixture failure seen once, now asserts activation first), dashboard 97/97, typechecks pass |
| Citation triplet (fresh) | Three isolated headful Assistant answers prove pending-draft exclusion, accepted PR #12 revision switch, and exact accepted-citation retention after failed import. Exact original Git tree and ten canonical public snapshots restored, no active restrictions. Three successful calls add 3,741 tokens to the budget counter |
| Recovered-sync reporting (fresh) | Successful unchanged reconciliation and changed-manifest capture clear resolved job errors. 36 source tests and API typecheck pass |
| Git proposal lifecycle and discard (fresh) | Visible Chrome PR #4 close retains newer draft and live site; PR #5 merge publishes captured version 16 while retaining newer version 17; discard restores accepted Git snapshot as version 18. `d7-pr4-proposal-closed-ui.txt`, `d7-pr5-publication-preservation.json`, `d7-editor-cleaned-after-smoke.txt`. Large check IDs and historical-base/closed-state guards tested; 38 check tests, 42 authoring/source tests and final three-test discard scope overlap, API typecheck passes. Later stale-merge handling settles superseded without self-enqueue; see §27.3 and §31 |
| Platform setup PR and merge (fresh) | Visible Chrome created bot PR #2 through FrontLit; all ten blobs matched the capture; reload retained the link; user merged and Source verified `d99918d37fe1dd71e249fd2a0642ddd6769e0b33`. `/tmp/frontlit-docs-smoke/setup-pr-merged-verified.txt`; activation and identity/publication/retrieval preservation now verified; see current live checkpoint |
| Empty-repository setup (fresh) | 54 tests/three suites, contract build, applied migration 0023 and API/dashboard typechecks pass; `/tmp/frontlit-docs-empty-repo-final-tests.log`. Later V49 live bootstrap/setup/merge/activation passed; see the scenario row below |
| Setup write boundaries (fresh) | 18 tests, including canceled initialization and nested-directory parent-file conflict; `/tmp/frontlit-docs-setup-final-boundaries-tests.log` |
| Setup reconciliation authority and transport (fresh) | 21 setup/reconciliation tests and ten transport tests pass; `/tmp/frontlit-docs-setup-reconciliation-boundaries-tests.log`, `/tmp/frontlit-docs-setup-transport-final-tests.log`. Revocation/policy changes during reads and rate-limit recovery covered; transport authentication middleware is mocked, so live bearer verification remains open. API typecheck passes |
| Signed OAuth transport and setup resumption (fresh) | 56 source/setup/signed-OAuth tests and separate 13-test OAuth/parity scope pass; `/tmp/frontlit-docs-setup-resume-final-api-tests.log`, `/tmp/frontlit-docs-oauth-real-transports-final-tests.log`. Actual signer/JWKS/auth/team/policy/MCP SDK; provider doubles and test-issued tokens. Fresh Chrome restored the original verified plan without old tab storage: `/tmp/frontlit-docs-smoke/setup-server-restored.txt`. Interactive token issuance and live OAuth Git writes remain open |
| Restore/import/migration/proposal fences (fresh) | 73 tests, four suites; `/tmp/frontlit-docs-restore-fences-final.log`; API typecheck also passes |
| Final documentation/permissions regression (fresh) | 306 tests across 33 suites; `/tmp/frontlit-docs-ledger-regression-final.log`; two workers after an initial resource-contention timeout. Separate six-test ledger run adds rollback/missing-path coverage |
| Independent ledger (fresh) | Six focused tests; `/tmp/frontlit-docs-ledger-backup-final.log`; existing purge/migration/proposal regression: 38 tests across three suites |
| Full API suite (fresh, 2026-10-03) | 711 passed, one failed across 99 suites; sole failure remains accepted MEDIA-01 `provenance.integration.test.ts`. Earlier run: 654 passed, one failed across 95 suites; `/tmp/frontlit-docs-full-api-final.log`; sole failure is the accepted MEDIA-01 live signed-group limitation, not a green suite |
| Editor without GitHub (fresh) | Four race checks plus fresh child with all GITHUB_DOCS_* settings removed passed; `/tmp/frontlit-docs-postgres-editor-only.log`; no remote provider calls |
| Media/reference regression (fresh) | 45 tests across four suites and API typecheck pass; `/tmp/frontlit-docs-media-race-regression.log`, `/tmp/frontlit-docs-media-race-types.log` |
| Real PostgreSQL media races (fresh) | Four race checks plus both media lock orders and four concurrent save/delete races passed; `/tmp/frontlit-docs-postgres-media-race.log`; generated database removed |
| Real PostgreSQL crash/outbox (fresh) | Four race checks plus both SIGKILL boundaries and signed HTTP retry passed; `/tmp/frontlit-docs-postgres-outbox-boundaries.log`; generated database removed |
| Real PostgreSQL restore (fresh) | Four race checks plus pre-purge dump/restore and independent CLI replay passed; `/tmp/frontlit-docs-ledger-postgres-backup.log`; both disposable databases removed |
| Real PostgreSQL races (fresh) | Four checks passed; `/tmp/frontlit-docs-postgres-races-final.log`; disposable database migrated and removed |
| GitHub/publication/permission/policy/catalog regression | 211 tests, 23 suites; `/tmp/frontlit-d7-sync-diagnostics-regression-final.log` |
| Foundation, media guards, retrieval/support and public API selection | 122 tests, 16 suites; `/tmp/frontlit-docs-foundation-audit.log`; excludes live MediaLit integration |
| Concurrent REST/MCP saves and Git importer/capacity | 29 tests, two suites; `/tmp/frontlit-docs-concurrency-capacity-audit.log` |
| Git write recovery and actual App request adapter | 45 tests, two suites; `/tmp/frontlit-d7-protected-branch-recovery.log`; includes protected-branch rejection, retained draft and replacement PR admission |
| Large inbound sync/publication | One selected test passed; 28 skipped; `/tmp/frontlit-docs-large-sync-audit.log`; actual PGlite import, revision capture, publication and serving of all 501 docs; indexing disabled in the fixture |
| Source/publication focused regression | 49 tests, two suites; `/tmp/frontlit-d7-sync-diagnostics-final-tests.log`; precedes the separate large-sync test |
| Shared content profile (fresh) | 89 tests, five suites; `/tmp/frontlit-docs-final-editor-tests.log` |
| Dashboard (fresh) | 97 tests, 22 suites; `/tmp/frontlit-docs-final-web-tests.log`; typecheck and headful expired-verification recovery pass |
| Public site (fresh) | 45 tests, 14 suites; `/tmp/frontlit-docs-final-sites-tests.log`; typecheck passes |

Migration `0021_docs_sync_diagnostics` is applied locally. API/dashboard typechecks and diff checks are recorded in [D7 notes](#historical-d7-evidence). The API transport tests use mocked operation authorization; actual authorization claims rely on the separate permission/policy suites.

### 29.2 Scenario matrix

“Local coverage” identifies inspected tests, not an assertion that the entire scenario is release-complete. Browser evidence from earlier milestones is recorded in the dated D2–D5 evidence in §31; the remaining verification column names gaps that those handoffs and current tests do not close.

| ID | Local coverage | Remaining verification |
| --- | --- | --- |
| V01 | Foundation fixtures and D2/D4 browser; fresh real PostgreSQL child with every GITHUB_DOCS_* variable removed saves, publishes, serves and lexically searches with configured:false/no binding | Covered at domain/process scope; prior headful editor evidence supplements it |
| V02 | `content-validation.test.ts`, shared content fixtures; malformed serialization rejects before writes through both transports | Covered locally; prior D2 browser evidence supplements it |
| V03 | `authoring.test.ts`, `publications.test.ts`; duplicate drafts and rejected publication retain live routes | Covered locally |
| V04 | New simultaneous real REST request/MCP-handler test: one success, one `STALE_DOCS_DRAFT`, version 2 and unmixed title/slug | Covered locally; operation authorization is tested separately |
| V05 | Authoring/transport/indexing tests retain live metadata while draft changes; D4 browser | Covered locally |
| V06 | Publication immutable-capture tests and source/proposal merge tests preserve newer draft versions | Covered locally plus live PR #5 captured-version/newer-save preservation |
| V07 | Publication generation/lease/last-good tests plus actual child SIGKILL before/after activation and fresh-connection recovery; local production-mode site build serves only the active publication across updates and restart (see V31) | Deployed operator verification remains open |
| V08 | Retrieval/provider-outage/preparation tests; D5 browser real missing-provider failure and limited real-provider success | Covered locally and prior browser; no extra paid provider work in this audit |
| V09 | Actual child SIGKILL at prepared-before-activation and committed-before-delivery boundaries; expired lease reclaim preserves last-good content, activates once and emits one event | Covered at real database/process scope; lease expiry is advanced only in the disposable fixture |
| V10 | Experience/publication Section admission; D4 combined-navigation browser workflow | Covered locally and prior browser |
| V11 | Candidate route swaps/link validation, site catch-all routing; D4 linked batch browser | Headful PR #8 rename plus inbound-link update verified; rename-only BROKEN_LINK rejection retains live routes, corrected pair removes old route and serves new route with same identities; `d6-rename-integrity.log` PASS |
| V12 | Importer deep-route/flat-Section fixtures; public site catch-all tests | Verified live with product PR #6: eight-folder path, anonymous API/deep page, original ID, one flat first-folder Section and collection navigation; `d6-depth-public-integrity.log` PASS |
| V13 | Setup/webhook replay and forged-installation fixtures; running local API rejects forged state/code, empty state and stateless forged installation IDs. Live replay of a genuinely consumed OAuth state captured from a headful Connect GitHub flow (with forged code, without code, with a forged installation ID) returns 400 `GITHUB_SETUP_EXPIRED` each time; the authorized setup, bindings and editor source are unchanged | Covered live |
| V14 | Source initial-connect rejects existing editor state and preserves ownership | Covered locally; actual reviewed adoption is activated with identity/publication/retrieval preservation verified |
| V15 | Signed raw-byte verification, duplicate receipts, generation fences and immutable current-head sync; running local API returns 401 for altered and missing signatures. Live (one-off live script, since removed; App JWT): GitHub redelivered the real signed `main` pushes for the older commit `1e75700` and newer `d4fe04d` twice each, older first; all four reached FrontLit (202) yet created no receipt, job or publication, and live SHA/active publication stayed at the newer commit | Covered live |
| V16 | App/importer reject truncated/incomplete responses; transient sync retry fixtures; actual GitHub branch-read response loss produces a queued sync error and normal retry recovery | Live controlled source-read outage/recovery verified: same job activates on attempt 2, clears diagnostics, reuses the original publication; all ten canonical snapshots/IDs/routes/revisions and publication count unchanged. Headful Source error/recovery and public page retained. |
| V17 | Source complete-directory deletion activates an empty candidate; retrieval exclusion tests; live disposable repo: a doc committed to `main` was published by webhook sync and served/searchable; after the user deleted it on GitHub, the webhook sync activated empty publication `pub_442eaqqasydesyuymnifa0ic` (0 members), by-slug 404, no search hit, empty list | Covered live |
| V18 | Actual duplicate-route import fails before publication creation; diagnostics retain both files/attempted SHA; headful PR #11 merge produces delivered failed publication check 110962290127 and retains the exact ten-doc anonymous snapshot/live publication | Live failure and cleanup verified; fixture removed, configured docs tree and ten canonical snapshots/IDs/routes restored. |
| V19 | Lost-access webhook generation fences and source prepared-candidate pause/disconnect tests; headful pause/resume. Live (one-off live script, since removed; user-approved): the App installation was suspended while a `nice` proposal was held after GitHub accepted its tree; the signed webhook moved the binding to `access_lost` and advanced the generation, the worker made no further Git writes and settled `GITHUB_SUPERSEDED`, live SHA/publication stayed unchanged and the public site kept serving; unsuspension restored the connection and sync reused the same publication | Covered live for Git writes; activation fencing during a changed-head preparation is covered by local generation tests |
| V20 | Write/review/source tests for open, closed, merged and exact-version application | Live FrontLit-created PR #3, pre-merge unchanged public title, authorized merge and exact captured-version publication verified; PR #4 close-without-merge preserves newer draft version 15 and live publication in headful Chrome; PR #5 captures version 16, merges/publishes while retaining newer local version 17; normal lifecycle browser scope verified |
| V21 | Response-lost tree/commit/branch/PR recovery tests; actual GitHub PR creation succeeds, controlled transport discards the 201 response, normal scheduler discovers the original deterministic PR/commit | Live PR-response-loss recovery verified: exactly one matching PR #13, same captured commit, no publishing-branch or active-publication change; temporary error clears. PR closed unmerged and draft discarded. Other mutation boundaries have local fixtures. |
| V22 | Preparation/write preconditions reject selected upstream edits; real headful same-file conflict preserves local version 7/base and upstream Git title/head, returns UPSTREAM_CHANGED and creates no commit/PR | Live workflow verified; normal discard cleans fixture to version 8, source/public page restored, exact configured Git subtree matches pre-test. |
| V23 | Adapter asserts `force:false` and sanitizes HTTP 422; worker rejection leaves branch/draft/publication unchanged and admits replacement PR; report offers PR review dialog. Live headful against a real branch protection rule (disposable public repo): direct commit rejected as `GITHUB_WRITE_REJECTED` with live SHA and draft unchanged, private report explains the rule failure and offers Create a pull request, the fallback opened PR #2 whose FrontLit validation check passed; merge correctly blocked by the rule's required review, not bypassed. Fallback now preselects the rejected files and title | Covered live |
| V24 | Separate permission/policy/catalog checks; API-key proposal authority/revocation fixtures; signed test JWT verified through real JWKS, REST middleware and MCP SDK setup submission, with actual scope/audience rejection | Local signed-machine transport is verified; interactive authorization-code issuance and live OAuth Git-write smoke remain unverified |
| V25 | Cross-team content/Section/media/publication/preview/report fixture isolation | Covered locally; prior headful unavailable-route checks supplement it |
| V26 | Shared content URL guards and retained-reference media deletion tests | Live provider-dependent operations remain guarded under MEDIA-01 |
| V27 | Dashboard 501-item pagination, importer 501 files and explicit 1001-file rejection, actual 501-doc sync/publication/serving; headful public-site navigation for a disposable 501-doc workspace lists all 501 unique docs with no truncation, first/middle/last routes 200 and out-of-range 404 | Public browser navigation verified; a live 501-file GitHub sync remains unverified |
| V28 | Publication-check delivery failure, response loss and provider backoff do not change active publication; actual GitHub rerequest emits signed webhook, controlled live check-lookup response loss leaves recorded publication intact | Live delivery failure/retry verified: normal scheduler respects backoff, clears delivery error and reuses check-run 110976122304; fresh provider query finds exactly one matching completed check. Active publication/live SHA unchanged. Headful private report shows reporting/error then delivered. |
| V29 | Shared conversion/parser fixtures and importer MDX/path/UTF-8/binary rejection; headful PR #10, actual signed PR webhook, normal immutable-merge validation and delivered GitHub failure report name `docs/d7-unsupported-smoke.mdx`; real GitHub check rerun also succeeds | Live unsupported-MDX report and rerun verified; PR closed unmerged, main/live publication unchanged. Other malformed variants have local fixtures. |
| V30 | Immutable retrieval and citation containment; isolated headful Assistant before edit merge, after accepted merge, and after duplicate-route rejection | Live triplet verified: pending local draft excluded; accepted PR #12 switches revision/publication while retaining canonical URL; rejected update retains exactly the accepted source object. Three successful calls use 3,741 tokens in the budget counter. Exact original Git tree and ten canonical public snapshots restored; no active restrictions. |
| V31 | Transactional activation/outbox plus real PostgreSQL child SIGKILL after activation; fresh connection recovers original event, signed HTTP retry retains acknowledgments; live Next sites endpoint accepts exact replay and rejects conflicting/forged/expired events; latest publications have both destination acknowledgments. Historical isolated production build (`next start` :3005) with a disposable workspace: a new publication is served before its event arrives (docs read an authoritative `no-store` snapshot per render), the signed event is acknowledged, a publication made while the server is down is served after cold restart, post-restart replay is accepted idempotently and a forged signature is rejected with 401; workspace and build removed | Local production-mode cache/restart verified; a deployed multi-instance CDN/site cache remains unverified. The in-memory conflicting-replay receipt map does not survive restart (acceptable: side effects are idempotent tag revalidation) |
| V34 | Navigation version/captured snapshot tests; D4 pending-navigation browser | Covered locally and prior browser |
| V35 | Delegation/capability and publisher credential tests; revocation between individual Git mutations. Live (one-off live script, since removed; real App adapter): a non-GitHub docs member with publish permission had an authorized PR #3 opened by `local-frontlit[bot]`; on a second submission the owner revoked `documentation:publish` immediately after GitHub accepted the tree, and the worker stopped before commit/branch/PR with `GITHUB_PUBLISHER_REVOKED`, naming the member's actual session/membership credential; branch 404, draft retained | Covered live; verified OAuth publisher path remains covered by signed-token transport tests |
| V36 | Setup identity/admin/access checks, PKCE generation/exchange adapter tests, ownership/access-loss guards; live repository-grant revocation after the picker: the picker drops the repository and preflight/plan with the earlier selection return 403 `GITHUB_ACCESS_LOST` with no plan or binding, while the connected workspace on that repository moved to `access_lost` keeping its live commit. Fixed: a missing grant was misreported as admin-required, and the dashboard showed raw codes instead of API messages | Wrong-verifier/untrusted-Origin are covered by adapter and middleware tests; live repository ownership transfer was not performed |
| V37 | Provider metadata/group/intent/private-object fixtures; confirmed access loss hides dependent docs; live MediaLit (`provider-guarantees.integration.test.ts`): a forged provider ID returns 404 and registration refuses forged/URL references with no stored row; provider-confirmed deletion of a published doc's asset hides the doc after reconciliation while an unchanged provider state keeps it served | MEDIA-01 accepted exception still covers signed-group binding; upload-intent reuse under a binding-capable provider remains unverified live |
| V38 | Retention/purge/tombstone tests, restore fences, immutable independent ledger, bounded backfill/replay and real pre-purge PostgreSQL dump/restore/CLI replay | Deployment durable-volume configuration/recovery, ledger retention and backup-expiry operator proof remain unverified |
| V39 | Reference/deleting-state guards plus actual PostgreSQL concurrent save/delete races and both explicit lock orders; referenced assets return 409 MEDIA_IN_USE; live MediaLit provider deletion completes (object returns 404 after delete) in the same test | Covered: real PostgreSQL races plus live provider deletion completion |
| V40 | Experience and transport own-team retained/private previews omit injected scripts; prior D4 headful preview/history; live headful docs-only author (read/write only) in an isolated browser context: publish disabled, preview omits an injected tenant script and is private/no-store without tokens, other-team preview/revision reads 404 and history is indistinguishable from a nonexistent ID | Prepared/archived same-team revision reads by a docs-only author are covered locally, not live |
| V41 | Approved evidence permission/redaction/idempotent draft tests and read-only model capability/citation containment; live docs-only member with an injected anonymous ticket: no unapproved/raw evidence before or after approval, three concurrent/repeat draft requests yield exactly one draft, no injected text, publication, model call or network action | Injection through a retrieved doc into a paid model answer is covered by local model-capability tests, not live |
| V42 | Captured-adoption tests preserve IDs, URLs, never-published drafts and empty Sections; headful FrontLit-created PR #2, user merge and exact merged setup verification | Covered live, including empty-repository adoption (see V49) |
| V43 | Source/migration stale versions plus real PostgreSQL concurrent save/adoption barrier, stale rejection, post-adoption provenance; authenticated production REST/MCP SDK saves racing held and unsynchronized adoption on real PostgreSQL | Transport-level race verified; activation itself is invoked in-process with a provider double (its REST route has no injectable GitHub adapter), and a browser-driven race was not run |
| V44 | Migration mismatch/branch/expiry/cancellation tests; headful metadata-only cancellation; live bot PR #9 mismatch/correction/recheck; live cancellation during remote writes (one-off live script, since removed): owner canceled after GitHub created the setup branch; no PR was opened then or after the next scheduler cycle; no binding/source change; Source names the created commit and branch | Covered live |
| V45 | Shared quotas, unchanged-sync coalescing, bounded workers, budget settlement and other-tenant claimability tests; real PostgreSQL `test:docs-tenant-burst-postgres`: 80 concurrent webhook enqueues across four adopted tenants coalesce to one current sync each and eight concurrent workers claim every tenant exactly once | Database-scope burst/fairness verified; a deployed production operator exercise remains unverified |
| V46 | Durable REST/MCP/worker/Source setup workflow; real bot PR #2 with ten exact captured files, headful click/reload and unchanged editor publication; merged/verified status observed | Source activation and retained publication/retrieval verified; Post-edit PR creation, successful validation, authorized GitHub merge, automatic publication and isolated public page update verified |
| V47 | Setup response-loss recovery, leased retries, fresh reauthorization and foreign-reference/initial-commit rejection tested in the database/adapter; live headful double-click Create setup PR produced one request, one branch and only PR #14; closing it unmerged in GitHub was reconciled to `closed` within a minute, not reopened, and a visible Cancel (added after this run exposed it was hidden in collapsed details) returned the workspace to editor-owned setup with no binding | Covered live (one-off live script, since removed): GitHub created setup PR #4, the success response was discarded, the request stayed queued with a transient diagnostic, and the normal scheduler recovered the same PR on attempt 2 with no duplicate; double-submit and closed-unmerged were covered live in V47 earlier |
| V48 | Fresh actor/capture/policy/purge/setup/provider guards before each mutation; in-flight cancellation preserves accepted tree/bootstrap/PR references and stops subsequent writes. Live: cancellation between branch creation and PR creation stopped further writes (writes: tree, commit, ref only), editor ownership retained, already-created commit/branch disclosed by name in Source (fix added); live revocation between writes proven for proposals in V35 | Save/purge/expiry interleavings during setup writes are covered by local fences, not live |
| V49 | Explicit empty proof, default-branch-only placeholder, null pre-bootstrap Git provenance, disclosure, recovery and metadata-only empty-editor capture implemented/tested; headful nonempty repository/missing branch setup rejects with 409 and creates no plan or binding. Live headful empty-editor setup into the truly empty private repository: disclosed placeholder-only bootstrap commit with only `docs/.gitkeep`, bot PR #1 adding only `docs/_sections.json`, user-authorized merge, automatic merged verification and activation at `eb7ecc79`; 0 docs invented or published | Live bootstrap response-loss retry not exercised; idempotent recovery is covered by local adapter/worker tests |

<a id="requirement-and-release-disposition"></a>

### 29.3 Requirement and release disposition

The PRD requirement index maps every current requirement to the scenario rows above: DM-SOURCE, DM-ROUTE, DM-VALIDATE, DM-AUTH, DM-EDITOR, DM-NAV, DM-GITHUB, DM-PUBLISH, DM-DELIVERY, DM-RETENTION, DM-CONVERT, DM-MEDIA, DM-FEEDBACK, DM-MIGRATE and DM-OPERATE.

**Disposition (2026-10-03).** Under the §26 rule (every requirement has passing evidence, an explicit unmet release gate, or an accepted non-blocking exception), D1–D7 are implemented and every scenario still listed in §29.2 has passing local, real-PostgreSQL or live evidence. The foundation, Git dogfood and full-authoring releases are signed off for local and staging use, subject to these explicit gates:

| Gate | Requirement | Scenarios | What closes it |
| --- | --- | --- | --- |
| Production operations | DM-RETENTION, DM-OPERATE | V38 | Deployment with a durable database volume, configured backups with expiry, and the deletion-ledger replay run after any restore (procedure in the operator runbook) |
| Production scale and cache | DM-DELIVERY, DM-OPERATE | V07/V31 deployed portions, V45 production | One operator exercise on the deployed multi-instance site and API; docs pages read the authoritative snapshot uncached, so this confirms rather than changes behavior |
| MEDIA-01 (accepted exception) | DM-MEDIA | V26/V37 provider-dependent parts | MediaLit binding signed upload groups (`medialit-group-binding.patch`); until then FrontLit fails closed and new public library image registration is unavailable |

Non-blocking residual checks: interactive OAuth sign-in followed by a Git write (V24), a live 501-file GitHub sync (V27), repository ownership transfer (V36), a browser-driven adoption race (V43), empty-repository bootstrap response loss (V49) and paid-model runs for V32/V40/V41. Each is covered at service or real-database level.

<a id="operations-runbook"></a>

## 30. Operations runbook

Implemented operations follow. §29 records verified scope and production gates; follow §28 for new verification.

### App registration and local connectivity

Current live behavior: FrontLit creates setup and edited-document PRs. After merge, signed GitHub push/pull-request deliveries schedule the current-head importer; independent reconciliation also recovers missed events. A Source **Pause sync** retains the last successful public publication, and **Resume sync** reconciles the publishing branch. The live `nice` smoke proved normal webhook-driven publication, pause/resume, eight-folder public routing, closed-unmerged draft preservation and merged-capture/newer-draft preservation. These do not substitute for the separate outage/adversarial/operator gates in the acceptance audit.

Apply normal database migrations before testing check delivery: `0004_docs_management` includes bigint storage for GitHub check-run IDs. GitHub IDs can exceed 32-bit integers. If GitHub shows a completed check but FrontLit still reports a delivery error, inspect the local delivery job and migration state; normal retry discovers the existing remote check by external ID. Do not erase remote references or reset leases to create a replacement check.

A PR's metadata base SHA can identify an older base than the current publishing head. Validation proves both parents of the immutable synthetic merge against current branch/head, then rechecks provider stability. `GITHUB_PR_CHANGED` can mean GitHub still serves a stale merge; fresh validation waits at least 60 seconds. Never treat the PR head alone as validation proof or force the publishing branch to match a stale test merge. Closed PRs receive a terminal neutral report even when their historical base differs from the current publishing branch. Discarding a local Git draft restores the latest accepted imported snapshot/path/base and makes no GitHub or publication write.

Register a GitHub App that can be installed by the intended repository owner. A private App can restrict who can install it; making the development App public resolved the recorded installation gate. Installing a public App on a private repository does not make that repository public. Authorization and installation are separate steps: verify both in GitHub.

Set these API environment variables using the same App registration:

| Variable | Value |
| --- | --- |
| `GITHUB_DOCS_APP_ID` | Numeric App ID |
| `GITHUB_DOCS_APP_SLUG` | App URL slug |
| `GITHUB_DOCS_CLIENT_ID` | App OAuth client ID |
| `GITHUB_DOCS_CLIENT_SECRET` | App OAuth client secret |
| `GITHUB_DOCS_PRIVATE_KEY` | App signing PEM; literal `\n` escapes are supported |
| `GITHUB_DOCS_WEBHOOK_SECRET` | Secret configured on the App webhook |
| `GITHUB_DOCS_CALLBACK_URL` | Exact registered HTTPS callback ending `/integrations/github/callback` |
| `GITHUB_DOCS_WEB_ORIGIN` | Dashboard origin, locally `http://localhost:3000` |

The webhook URL ends `/integrations/github/webhook` on the API's reachable HTTPS origin. Subscribe to push, pull request and check run events; installation/access changes are handled by the same signed endpoint. Enable JSON webhook payloads. Keep the webhook secret identical on the App and API. The `/integrations/github/docs/…` callback/webhook aliases also exist, but choose one consistent registration.

Observed local configuration gap, 2026-10-02: authenticated read-only `GET /app` returned `events: ["push"]`, despite write permissions for Checks, Contents and Pull requests. Those permissions do not subscribe the App to PR or check events. Enable **Pull request** and **Check run** under the developer-owned App registration's **Permissions & events**, save, then verify fresh `GET /app` and an actual PR delivery. Installation settings alone cannot repair this. Until corrected, open PR discovery relies on the independent fifteen-minute reconciliation.

The user corrected that registration in this session: fresh `GET /app` confirms `check_run`, `pull_request` and `push`, and a real signed PR edited delivery schedules validation. The published self-hosted instructions are in [the GitHub App setup article](../apps/docs/content/docs/self-hosting/github-app.mdx), including the required subscriptions, visibility, permission-upgrade approvals, exact callback/webhook paths, local port/tunnel checks and normal PR/publication verification.

For the current local setup, API listens on port 4000. `tailscale funnel status` must show that the HTTPS hostname forwards to `127.0.0.1:4000`; pointing Funnel at an unused 5000 produced HTTP 502. Restart the API through its normal supervisor after changing environment configuration. Verify registration/callback connectivity before starting a fresh Source authorization; an invalid callback without proof should fail with a FrontLit response rather than a proxy 502.

An installation-triggered callback can contain `installation_id` and a code without FrontLit state. FrontLit returns to Settings → Integrations → GitHub and requests verified authorization. It does not connect a workspace from that installation ID. [GitHub distinguishes setup and user authorization callbacks](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url).

### Permissions and workspace approval

| Operation | App repository permissions |
| --- | --- |
| Import and capture review | Metadata read, Contents read |
| Observe PR candidates/review | Pull requests read, plus import permissions |
| Create setup/adoption PRs, including empty-repository initialization | Contents write, Pull requests write |
| Create FrontLit proposal PRs | Contents write, Pull requests write |
| Explicit direct commits | Contents write |
| Validation/publication checks | Checks write, plus read access |

The API requests repository-scoped installation tokens narrowed to each operation. After an App permission upgrade, approve the new permissions for its installation, then use **Review Git write permissions** in the connected Source screen. Workspace delegation for PRs/direct commits is a separate approval; App installation permission alone does not enable it. Direct mode remains off unless explicitly delegated. Repository admins configure required validation checks in GitHub branch rules. See [GitHub's permissions reference](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).

Authorization alone may return no installations. Check the logged-in GitHub account, App visibility, installation target/repository selection, organization approval and suspension status. The dropdown shows the installation account name/type. Setup proof expires after ten minutes; the browser retains its ID per workspace and checks expiry/access again on reload. If a sign-in screen appears during development, first revisit `http://localhost:3000` and check fresh authenticated requests: a displayed login page alone does not prove the session expired.

### Connection and reviewed adoption

Select the intended installation, repository, publishing branch and documentation directory. Existing-source import requires an existing branch. For setup of a genuinely empty repository, FrontLit requires GitHub's explicit empty-repository proof and targets its default branch; a missing branch in a nonempty repository is rejected.

An empty docs workspace can review/connect an existing repository import or review a setup PR. Existing CMS content requires reviewed adoption. In Source, review the captured file list, repository visibility and never-published draft disclosure, acknowledge the transfer, then choose **Create setup PR**. FrontLit writes a deterministic branch and PR and retains its progress/link across reloads. There is no download/manual-commit step. For an empty repository, the review additionally discloses the initial placeholder-only commit; actual documents and Section metadata go into the PR. The bootstrap SHA is retained even if subsequent work is canceled. V49 live empty-repository initialization, setup PR, merge and activation are verified in §29; bootstrap response-loss remains a locally covered residual check.

Review and merge the setup PR in GitHub. Signed matching PR events or pushes to the publishing branch wake reconciliation; approximately one-minute polling detects outcomes if delivery is missed. FrontLit confirms status through the provider API and does not activate a source from webhook metadata alone. With current setup authorization, the Source screen automatically checks the matching PR's immutable merge proof and exact captured semantic content. **Check files again** retries failed verification visibly; technical proof details remain collapsed. Then the original administrator reviews the three public-content, future-publication and workspace-delegation checkboxes and chooses **Finish setup**. Reauthorize if the temporary setup proof has expired; already-created PR outcome tracking survives that expiry. Existing public docs stay live through creation and verification, and adoption retains their IDs, URLs and active publication.

After connection, saves retain local drafts. PR submission does not publish; a merged PR or explicitly authorized direct commit enters normal branch import/validation/preparation/activation. A successful Git write can still fail publication. Closed/unmerged proposals retain recoverable drafts. FrontLit does not merge PRs or force-update branches.

### Worker health and reporting recovery

The API's documentation worker processes bounded sync/proposal/check work and normal publication/delivery work. Connected sources reconcile the branch and discover open PRs on independent fifteen-minute schedules. Publication-check enqueue recovers from terminal sync records, including a crash after activation but before reporting. Unchanged live reconciliation does not create duplicate publication checks.

Inspect the Source screen's observed, validated and live SHAs and latest sync diagnostics. Inspect Git checks for immutable PR merge proof or publishing-commit outcome, separately from reporting status/errors. Reports are workspace-private and current policy/purge can redact retained diagnostics. GitHub receives bounded codes/counts and known source-line annotations, not private diagnostic prose.

For stuck work, inspect `documentation_git_jobs`, `documentation_publications`, `documentation_git_checks` and the API's `Documentation publication worker failed` logs. Compare status, attempts, due times and lease expiry; an unexpired lease is active work. Rate-limit errors honor the provider retry/reset window. Restore worker/configuration/connectivity rather than deleting leases or changing publication truth manually. Check-delivery retries do not rerun publication preparation or roll back a valid live publication. Pending publication checks keep their sync proof through retention; expired terminal reports are collected after thirty days.

GitHub failed webhook deliveries can be redelivered from the App's Recent Deliveries screen. Signature verification runs on the raw body. Receipts deduplicate accepted deliveries, so redelivering an already accepted event does not force a second job. Use Source manual sync or the scoped check rerequest workflow to recover when a processed event needs fresh reconciliation. PR reruns validate current immutable merge proof; publication report reruns deliver recorded sync truth and do not publish again.

### Removal, rotation and incident recovery

Repository removal or installation suspension/deletion invalidates source authority and in-flight generations. Last good public content remains served. Restore access and reauthorize the same stable repository ID, branch and directory; renames are resolved through that repository ID. Reconnecting a different repository or silently following a renamed/deleted branch is not supported. Pausing or disconnecting preserves Git ownership; unpublish a page through its document publication controls when it should leave the public site.

Rotate an App signing key by generating a replacement, updating `GITHUB_DOCS_PRIVATE_KEY`, restarting the API, verifying App/repository reads and then revoking the old key. GitHub permits overlapping keys for rotation; [its key management guide](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps) describes revocation. Rotate the OAuth client secret similarly and verify fresh setup. Coordinate webhook secret changes with the API restart, then replay failed deliveries. The server currently accepts one webhook secret, so plan for that short transition rather than claiming dual-secret support.

Do not independently replace `INTEGRATIONS_ENCRYPTION_KEY` (or its `BETTER_AUTH_SECRET` fallback): stored setup/credential ciphertext depends on it. Encryption-key rotation requires deliberate re-encryption or fresh authorization for affected credentials; no automatic re-encryption command is implemented.

Before release, execute the PRD's real installation/import/adoption, permission-upgrade, PR close/merge, protected-branch, response-loss, check-delivery, removal/recovery and rotation scenarios. Local provider doubles and this runbook do not replace that evidence. MEDIA-01 remains the explicitly accepted nonblocking provider exception.

<a id="backup-restoration-and-transaction-smoke"></a>

### Backup restoration and transaction smoke

Set `DOCS_RESTORE_PENDING=true` before starting any API/worker against a restored backup. Public serving/publication is unavailable; inbound Git sync and proposal dispatch leave queued jobs untouched. An import paused during provider work is requeued without copied content or an additional attempt. Proposal mutations recheck the flag before each remote write; export verification/adoption is rejected until restoration is cleared. These fences do not perform deletion-ledger replay.

Configure `DOCS_DELETION_LEDGER_DIR` on every API/worker instance as the same private, durable POSIX directory outside database backups. The filesystem must support atomic hard links and file/directory fsync. New directories/files use modes 0700/0600; audit existing directory permissions and mount durability. An unset or unusable directory rejects irreversible purge with `PURGE_LEDGER_UNAVAILABLE` before database deletion. Ordinary authoring is unaffected. The local operator environment has not been configured with a durable ledger volume; temporary test directories are not deployment configuration.

Purge writes an immutable authorized deletion intent before deleting database copies. It contains IDs, reviewed plan hash and route/source-path tombstones, without document bodies, titles, credentials or assets. The record may outlive a failed database transaction or lost acknowledgment; replay conservatively honors that authorized intent. Primary-store deletion is not recall of Git, messages, CDN copies or backups. Keep independent ledger records until all affected backups expire (the PRD maximum is thirty days); no automatic ledger expiry is implemented. Retain tombstones until the operator explicitly clears them after the backup retention window.

Before adopting this feature with pre-existing completed purges, run `bun run docs:deletion-ledger export --limit=100` from `apps/api` against the current database. Repeat with the returned `--after=CURSOR` until `nextCursor` is null. Backfill cannot recover a purge missing from both the current database and independently retained records. Verify record counts/integrity and independent storage recovery before retiring the current database or restoring an older backup.

For restoration, stop API/worker processes, restore the database and independently recover/mount the ledger, then run `DOCS_RESTORE_PENDING=true bun run docs:deletion-ledger replay --limit=100` from `apps/api`. Repeat using each returned `--after=CURSOR` until `nextCursor` is null. The CLI validates every record in a batch before applying any of that batch, rejects conflicting receipts, and reports applied/already-applied/missing-team counts. Earlier successful batches remain applied if a later batch fails; resume only after resolving the failure. Inspect missing-team counts and restored purge tombstones, verify no deleted bodies remain, and record the operator audit. Only then explicitly clear the flag in every instance and restart services. Replay never clears it automatically; database tombstones alone are insufficient deletion truth for an older backup.

`bun run test:docs-restore-postgres` adds an actual custom-format dump before purge, restores it into a second disposable database, proves old private content returned, invokes the independent replay CLI, and proves body/revision deletion, maintenance-mode retention and blocked publication at the deleted route. Host `pg_dump`/`pg_restore` must match the server version; `FRONTLIT_TEST_PG_BIN_DIR` can select them. For a local test container with socket authentication, set `FRONTLIT_TEST_POSTGRES_CONTAINER` and optionally `FRONTLIT_TEST_DOCKER_BIN`; this runs the matching tools in that container. The container must host the configured test database. Both generated databases and the temporary fixture ledger are removed. These test fixtures do not establish the deployment's independent-volume persistence, ledger recovery or thirty-day backup-expiry policy.

`bun run test:docs-postgres` in `apps/api` exercises real PostgreSQL transactions using a generated disposable database, applies the real migrations, and drops that database in cleanup. It uses `FRONTLIT_TEST_POSTGRES_URL` when configured, otherwise the local `.env` `DB_CONNECTION_STRING`; the database role needs permission to create databases and install pgvector. It never resets the active workspace or contacts GitHub/AI. The smoke covers same-version save races, a save during adoption, Git provenance after successful adoption and concurrent sync claiming. GitHub is a deterministic read-only provider double in this smoke; passing it does not establish live adoption or owner consent.

`bun run test:docs-outbox-postgres` exercises actual abrupt process termination immediately after publication commits and before delivery. A fresh PostgreSQL connection proves the active publication and unacknowledged outbox event survived; the normal production sender then delivers signed HTTP to a disposable loopback receiver that rejects the first attempt and accepts the second. The test requires retained local acknowledgment, the same immutable event payload, completed delivery after retry and unchanged live publication. The test database is removed. It never contacts the live site, GitHub or AI; local production-mode cache/restart is verified; deployed multi-instance cache still needs operator evidence.

`bun run test:docs-media-postgres` adds real PostgreSQL media-reference/deletion admission races: reference-first rejects deletion with `409 MEDIA_IN_USE`, deletion-first rejects a new documentation reference, and four concurrent attempts each permit only one winner. Verified media metadata is seeded directly in the disposable database; provider I/O and outbox delivery are intentionally not executed. This establishes the real database race contract and leaves MediaLit registration/deletion completion to the separate live-provider evidence in §29. Cleanup removes the generated database.

The outbox smoke now also kills a child after preparation but before activation. The last good publication remains live. The test advances only the disposable job's lease deadline to represent downtime expiry, then reclaims and activates the captured publication once with one activation event. This covers both actual process-termination boundaries without waiting for wall-clock lease expiry.

`bun run test:docs-editor-postgres` creates a fresh child with every `GITHUB_DOCS_*` environment variable removed. It proves editor ownership and `configured: false`, then saves, publishes, serves and lexically searches documentation with no Git binding. The real database is disposable, provider calls are not made, and the main environment is unchanged.

### Resuming after interruption

Recheck current service listeners, database availability, dashboard authentication and source/plan states. A recorded reset cleared `/tmp` artifacts and Chrome, and Docker Desktop recovery restored PostgreSQL; it did not require an API code fix. Startup authority belongs to the current task. The user restored services during the recorded smoke; the final ten-document canonical-publication comparison and anonymous deep-route/link/old-404 checks passed. Do not repeat the historical pending-installation diagnosis: the empty repository was subsequently granted, initialized, connected and exercised in V49/V17/V23.

Stable recorded resources: `nice` team `team_hek5byq4ipm2xrixbr91nadi`, installation `166984494`, repository `clbotdev/docs-site` (`1400616205`), branch `main`, directory `docs`; direct commits were disabled for this binding. The separate `Docs Empty Smoke` team `team_qtbey05dmpaiwu2jxll5a1ft` and repository `clbotdev/frontlit-docs-empty-smoke` were used for empty-source/deletion/protection scenarios and later connected. Read their current state before resuming. Setup-correction plan `gmig_e2det5uneh2wee6ptu0gpeyy` was canceled after merged PR #9; its retained `frontlit-smoke-empty-review/_sections.json` fixture is outside the configured `nice` docs directory. Detailed proof, comparison SQL and reset chronology are retained in §31.

<a id="historical-evidence"></a>

## 31. Historical implementation and smoke evidence

> Emergency documentation suppression was implemented and tested during the earlier D3/D4 checkpoints below, then removed on 2026-10-08 after product review found no real-world use case or incumbent competitor precedent. It is not part of the current requirements, UI, API or schema. The dated entries below document past behavior only; see §23.5 for the disposition.

The following dated records preserve unique contracts, intermediate results, defects, logs, screenshots, fixture identities and cleanup observations from the consolidated reports. Exact repeated paragraphs have one retained copy. These records are historical: pending-work lists, release conclusions, transient environment blockers, authorization requests, counts and fixture states apply only to the named checkpoint. §29 is the current acceptance authority. In particular, early manual exports and mutable publication/retrieval behavior were replaced by the current product workflows.

<a id="historical-implementation-handoff"></a>

### 31.1 Initial implementation handoff and incremental checkpoints

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

Live rename/inbound-link verification (V11), 2026-10-02: companion PR #7 publishes a real relative link to the deep guide. Rename-only proposal `gproposal_sokxd23bmh3la07s6yzlesbj` fails BROKEN_LINK at `docs/d6-link-companion.md`, with no remote commit/PR and unchanged public routes (old 200, proposed new 404). The editor then updates the companion link and submits both captured version-6 documents; FrontLit opens PR #8, GitHub checks pass, and authorized headful Chrome merges at `d7071daa4061ba467bed1f10cabc982aebcbbbd9`. FrontLit publishes exact merge as `pub_ua2jl9ukinqq8dg42tfnse8d`. Anonymous public API reports old route 404/new route 200, retaining document ID `doc_evctmznb7jyw2jrult66y8yn` and Section `sec_5o0lsziq925hpbiqfev2qtmt`; the public companion renders the new link. Evidence under `/tmp/frontlit-docs-smoke`: `d6-rename-pr8-diff.txt`, `d6-rename-pr8-merged.txt`, `d6-rename-publication-proof.json`, `d6-rename-public-after-merge.json`, `d6-companion-after-rename-public.txt`, `d6-rename-integrity.log` (PASS). No redirect or manual commit was used; named fixtures remain for further recovery/removal smoke.

Relative-link editor correction: the link popover used native `type=url`, which falsely marked supported `/docs/...` links invalid. Both popover variants now use text input with URL input mode; browser proof confirms valid=true/typeMismatch=false for the relative link. Shared-editor build and dashboard typecheck pass (`/tmp/frontlit-docs-relative-link-build.log`, `relative-link-web-types.log`); `d6-relative-link-input-validity.json` and `d6-relative-link-field.txt` record actual headful behavior. Server URL safety validation is unchanged.

Eight-folder live Git routing checkpoint (V12), 2026-10-02: visible Chrome created the normal Git draft `doc_evctmznb7jyw2jrult66y8yn`, path `docs/depth-one/two/three/four/five/six/seven/eight/guide.md`, slug `depth-one/two/three/four/five/six/seven/eight/guide`, and indexing disabled. FrontLit created PR #6 for captured version 4; GitHub validation passed, and authorized visible Chrome merged at `5a83dac7e551c3964ff3c535220b33246c49142b`. The unmerged route returned 404 in both isolated public Chrome and anonymous public API. FrontLit activated publication `pub_noyt34xexxv33vt5attyja4g`; anonymous snapshot/by-slug and headful public page show the same original document ID and full deep route. Exactly one new flat Section `depth-one` (`sec_5o0lsziq925hpbiqfev2qtmt`) was generated; no intermediate-folder Sections exist. Collection navigation links the deep page. Evidence in `/tmp/frontlit-docs-smoke`: `d6-depth-pr6-diff.txt`, `d6-depth-pr6-merged.txt`, `d6-depth-unmerged-public-api.json`, `d6-depth-public-api.json`, `d6-depth-public-page.txt`, `d6-depth-collection-navigation.txt`, `d6-depth-public-integrity.log` (PASS). This uses actual GitHub/import/publication/browser reads, with no manual export/commit or paid AI. The new page is a named smoke fixture retained for further rename/link tests.

Live source pause/resume and webhook checkpoint, 2026-10-02: headful Source Pause sync changes the binding to paused while isolated public Chrome retains the D2 page. Resume sync restores connected status and reconciles the unchanged publishing head without replacing the active publication. `/tmp/frontlit-docs-smoke/d7-source-paused.txt`, `d7-paused-public-retained.txt`, `d7-source-resumed.txt`, `d7-resumed-source-response.json` record the UI/HTTP state. A read-only database integrity check links signature-verified provider push receipt `453aa2e4-be6a-11f1-995a-a0e88952009f` to webhook-triggered sync `gsync_qpplniy4ibddm3jewy0x4teh`, which activated PR #5 merge `9f0dc4ffee624dd5fef5a16cf14e660ae3a3baeb` as publication `pub_s9n9tvgy4kdqgikcxlc5z5js`. Resume's reconciliation reused that same publication (`d7-pause-resume-webhook-integrity.json`, PASS). This proves normal live delivery/sync, not adversarial duplicate ordering, outage recovery or installation suspension during a write.

Git draft discard correction, 2026-10-02: the browser cleanup exposed `SOURCE_REQUIRES_GIT` from the normal discard endpoint. Discard now restores the latest active imported file snapshot, Markdown/hash, metadata and Git provenance into a new local draft version; it does not publish, mutate GitHub or restore a removed file. A missing current source revision returns an explanatory unchanged-draft warning. Published/unpublished imports, changed upstream content, path moves, expected-version conflicts and removed-file retention are covered. The authoring/source regression passed 42 tests/two suites; final focused discard coverage passed three tests and API typecheck passes (`/tmp/frontlit-docs-git-discard-tests.log`, `git-discard-focused.log`, `git-discard-types.log`). Headful editor cleanup now succeeds: draft version 18/title “D2 Browser Smoke,” provenance points at `9f0dc4ffee624dd5fef5a16cf14e660ae3a3baeb`, status Published; the prior retained version 17 remains history evidence. The smoke leaves the disposable fixture clean.

Captured-version/live-draft browser checkpoint, 2026-10-02: after closing product PR #4 without merge, FrontLit allowed a fresh product PR #5 for the same doc. PR #5 captured version 16, changing only the D2 fixture title back to “D2 Browser Smoke.” The editor then saved version 17 with title “D2 Browser Smoke — newer than PR capture.” GitHub checks passed; authorized visible Chrome merged PR #5 at `9f0dc4ffee624dd5fef5a16cf14e660ae3a3baeb`. FrontLit published that exact commit automatically while retaining local version 17/title. Isolated public Chrome shows the captured title; reloaded editor shows the newer draft. Evidence: `d7-pr5-captured-diff.txt`, `d7-pr5-capture-and-later-save.json`, `d7-pr5-publication-preservation.json`, `d7-pr5-public-captured-title.txt`, `d7-pr5-after-merge-draft.txt` under `/tmp/frontlit-docs-smoke`. PR #4 remains closed; PR #5 merged. No extra paid AI or manual export/commit was used. This closes the normal open/closed/merged and newer-save preservation live gaps, without waiving provider failure/operator scenarios.

Live adoption/editor-PR checkpoint, 2026-10-02: the original administrator completed source activation in visible Chrome. `nice` is now connected to `clbotdev/docs-site` (`main`, `docs`). The nine captured documents, eight published documents, one private draft, Section IDs, document versions, URLs, canonical prose and original active publication were verified after adoption (`/tmp/frontlit-docs-smoke/setup-adoption-integrity.log`, `setup-adopted-public-site.txt`, `setup-adopted-retrieval.json`). PR permission was reviewed interactively; direct commits remain disabled. The editor now provides **Create pull request**, flushes pending saves and preselects the current document/version for review. FrontLit created [PR #3](https://github.com/clbotdev/docs-site/pull/3) for the disposable D2 smoke document, changing only its title. The public page retained its old title before merge. GitHub validation passed, then the authorized visible browser merged it at `f46c5fa5bb46dce4a33f1f2e37bc57682509fe88`. FrontLit then published the merged commit automatically: proposal status is `published`, observed/validated/live SHAs all match the merge, and publication `pub_4wta1qeg762fvslv79q37h9q` contains eight public docs. Headful authenticated Chrome shows Published; the isolated public Chrome page at `http://nice.localhost:3002/docs/d2-smoke` shows the new title. The publication check was delivered with large ID `110867091910`. Evidence: `d7-post-merge-database.json`, `d7-post-merge-proposal-ui.txt`, `d7-post-merge-public-page.txt` under `/tmp/frontlit-docs-smoke`.

Live provider reporting revealed that check-run ID `110863307525` exceeded the database's 32-bit integer. Migration `0024_docs_check_ids` widens it to bigint with safe JavaScript number mapping. Validation and publication tests now persist a realistic large ID; 21 focused tests/four suites and API typecheck pass (`/tmp/frontlit-docs-large-check-tests.log`, `/tmp/frontlit-docs-large-check-types.log`). The migration is applied locally. Production retry acknowledged the existing validation check with that same ID and cleared its error, without creating a duplicate. This supersedes earlier activation-pending checkpoints; D6/D7 remain incomplete at remaining live/provider/operator gates. No additional paid AI calls were made.

Current checkpoint (2026-10-02): FrontLit itself creates setup/adoption PRs through the Source UI, REST/MCP admission and guarded durable worker. Migration 0022 stores progress/recovery references; migration 0023 supports disclosed placeholder initialization of genuinely empty repositories. Headful Chrome created bot PR #2 in `clbotdev/docs-site`; all ten files matched the reviewed capture. The user merged it, background reconciliation detected it, and Source verified `d99918d37fe1dd71e249fd2a0642ddd6769e0b33`. Original-administrator activation remains pending, with `nice` still editor-owned and no binding. Live empty-repository setup and connected-source D6/D7 scenarios remain unverified. Current focused suites pass 21 setup/reconciliation tests and ten transport tests; API typecheck passes. The transport harness mocks authentication middleware, so it does not prove live OAuth bearer verification. [D6 notes](#historical-d6-evidence) retain logs and headful snapshots. Manual export/commit and agent-created PR workarounds are superseded; historical no-platform-PR and separate export-consent statements below are obsolete.

This is an incremental implementation of [the requirements](#product-requirements),
not a completed docs-management release. D1 is implemented. The current D2
application work and headful browser evidence are recorded in
[the D2 handoff](#historical-d2-evidence); D2 is complete with the explicitly
accepted, non-blocking [MEDIA-01 provider issue](#media-01-medialit-signed-upload-group-can-be-overridden).
D3 is implemented; see [the D3 handoff](#historical-d3-evidence) for immutable
publication, policy, retention and verification. D4 is implemented; see [the D4 handoff](#historical-d4-evidence) for private preview/history, reviewed publication and withdrawal UI, and headful browser evidence. D5 is implemented; see [the D5 handoff](#historical-d5-evidence) for retrieval, approved improvements and visible smoke evidence. D6 is in progress; see [the D6 checkpoint](#historical-d6-evidence). D6–D7 remain open. The notes
below describe the earlier D1 delivery and are superseded by the D2/D3/D4 handoffs. The foundation and Git dogfood release gates in §26 are unmet.

#### Changed contracts

Latest publication crash checkpoint (2026-10-02): real PostgreSQL and child SIGKILL prove activation/outbox survival, followed by signed loopback HTTP failure/retry through the production sender with retained acknowledgments and unchanged publication. `bun run test:docs-outbox-postgres` passes four race checks and the new V31 recovery check; cleanup removes the generated database. Actual deployed site-cache proof remains open.

Latest real-database/restore checkpoint (2026-10-02): an isolated PostgreSQL smoke now proves actual save/adoption/sync-claim transaction interleavings and removes its disposable database. Four checks pass. Restore-pending now pauses inbound imports, export/adoption and proposal dispatch/remote mutations; 73 tests across four suites plus API typecheck pass. Independent deletion-ledger persistence/replay is now implemented: six focused tests, 38 existing purge/migration/proposal tests and real PostgreSQL pre-purge dump/restore with CLI replay pass. Durable deployment storage/recovery/retention configuration remains a §23.6 operator gate. The active workspace was not reset or adopted; recovered visible Chrome still reports editor ownership, and the installation remains read-only. [D7 notes](#historical-d7-evidence) and the [acceptance audit](#acceptance-audit) distinguish fresh evidence from historical logs lost during runtime restart.

Latest acceptance-audit checkpoint (2026-10-02): migration `0021_docs_sync_diagnostics` preserves full failed-import reports with policy/purge fences and purge erasure. Source UI includes attempted SHA, source locations and related files. Protected direct-write rejection now offers the existing PR review flow and has an explicit draft-preservation/replacement-admission test. New tests cover simultaneous REST/MCP versioned saves and actual 501-document sync/publication/serving. The [acceptance audit](#acceptance-audit) maps all 45 scenarios and remaining components. Recorded scopes pass 211 GitHub/publication/policy/catalog, 122 foundation/support/media guards, 29 transport/importer, 45 writer/App, one selected 501-sync, 89 shared-profile, 45 site and 97 dashboard tests; these overlap and are not a combined full API count. Typechecks and migration application pass. Positive live adoption/PR/check/merge/permission/OAuth and operator recovery remain unverified; D6/D7 are open. Full artifacts and exact checkpoint order are in [D7 notes](#historical-d7-evidence).

Latest D7 publication-report checkpoint (2026-10-02): migration `0020_docs_publication_checks` is applied. The existing check contract now distinguishes validation/publication records, allows a nullable PR number, and projects a private publication outcome/sync reference. Durable terminal-sync recovery, independent delivery/retry, source/policy guards, code-only annotation batches, exact report rerequests, purge erasure and retention protection are scheduled. REST/MCP report parity and dashboard rendering cover both kinds. Final combined regression passes 209 tests across 23 suites; dashboard passes 97, final transport/purge passes 26 and annotation/delivery passes 12 in their recorded scopes. Typechecks/build/migration/diff checks pass. Visible Chrome proves authenticated empty history/Refresh and negative report handling; positive live publication cards and provider writes remain unverified. The [operator runbook](#operations-runbook) and App `.env.example` entries are now available. Manual reviewed adoption, live permission/PR/check/merge/direct/protected-branch/OAuth scenarios and the final acceptance audit still gate completion. Full evidence is in [D7 notes](#historical-d7-evidence).

Current D7 checkpoint (2026-10-02): [D7 verification notes](#historical-d7-evidence) supersede the older pending-work inventory below. PR authoring/recovery, exact merged application, PR validation/delivery jobs, private reports, webhooks, independent missed-event reconciliation and terminal check retention are implemented. Migration `0019_docs_pr_reconciliation` adds independent due tracking and discovery errors; prior Git migrations through `0018` are also applied locally. Installation discovery now returns account login/type; the dashboard shows readable labels, restores valid workspace-scoped setup IDs after reload, and handles installation callbacks without OAuth state by returning to verified setup. Git sync retains the exact attempted SHA even when validation fails before publication creation.

Latest local verification: 172 GitHub/policy/catalog tests, 97 dashboard tests, 27 publication/permission tests, and 26 source tests after the attempted-SHA correction; contract build and API/dashboard typechecks pass. Visible Chrome establishes OAuth/repository selection and a planned nine-file editor-to-Git export. Manual commit/verification/activation, live proposal/check/merge smoke, publication-check delivery, permission upgrade, and final operator/release audits remain open. No agent repository writes or additional paid AI calls occurred. D6/D7 are not complete; MEDIA-01 remains accepted as nonblocking.

- D1: `@frontlit/text-editor/docs` supplies the shared headless schema, recursive
  validation, Markdown import/export, bounded YAML metadata, safe URL syntax,
  source-path resolution, and versioned hashes. `./headings` is a separate
  server-callable entry. Client directives apply only to the UI bundle.
- DM-CONVERT: documentation rendering, public heading extraction, and retrieval
  chunking share duplicate-aware heading IDs. Nested headings and formatted inline
  spans retain their order and text. General-purpose rendering and blog/changelog
  chunking retain their existing profile.
- DM-VALIDATE (partial D2): documentation update schemas preserve unknown JSON
  fields until structural validation, reject unknown mutation fields, and reuse
  their shapes in MCP. Shared queries validate the resulting content and its
  Markdown representation before a write. REST reports semantic failures as
  `422`; MCP returns the same structured diagnostics with `isError: true` and an
  output schema that permits them. Publication repeats content safety validation.
- DM-AUTH (partial D2): `documentation:publish` and `documentation:manage` are
  distinct human permissions/OAuth scopes. Neither implies write or each other;
  both imply read. Publishing through REST/MCP requires publish authority. The
  content-manager preset includes publication but excludes source management.
- DM-EDITOR (partial): the docs editor uses supported controls, refuses data-URL
  fallback uploads, and guards existing unsupported content against silent loss.
  Saving `indexable` changes stages metadata instead of changing live retrieval.
  Direct deletion of a published doc returns `409 DOCUMENT_STILL_PUBLISHED`
  through REST/MCP. The dashboard disables that deletion action.

**Earlier D1 delivery:** No database migration was included. D2 now adds and
applies `0004_docs_authoring`; see the current handoff. Existing member grants are not automatically
expanded; grant publication explicitly where needed. Owners retain all catalog
permissions. At D1, existing publications used the mutable live-column engine; D3 replaces public
reads with immutable publication membership.
In that earlier delivery, slug changes still applied immediately: staged slugs, versioned saves,
immutable publication snapshots, and activation jobs are remaining work, not
capabilities established by this patch. Normal unpublish is not yet implemented,
so a published doc cannot currently be deleted through the protected operations.

#### Verification evidence

Requirement IDs are cited in the tests themselves. The targeted checks are:

- Text editor: 89 tests in `src/docs/*.test.ts` for headless operation, positive and
  negative conversions, original Markdown locations, schema/cardinality checks,
  table constraints, unknown metadata, YAML restrictions, prototype-sensitive
  fields, URL safety, source boundaries/deep paths, hash versions, and matching
  rendered heading IDs (D1, DM-CONVERT, DM-SOURCE, DM-ROUTE; V29 fixtures).
- API: 58 targeted tests across content-validation, chunking, documentation queries,
  document queries, permission, and policy-coverage suites. Includes equivalent
  REST/MCP rejection with no draft write (V02), write-without-publish denial (V24),
  cross-team document isolation (part of V25), unsafe URLs (part of V26), staged
  indexing eligibility (indexing portion of V05), and published-delete rejection.
- Dashboard: 8 permission/workspace-access regression tests. Public sites: existing
  docs-tree regression test. Package builds and API/dashboard/site type checks
  supplement these observable tests; they do not establish release readiness.
- Headless module lint and `git diff --check` pass. A Node import of built server
  entries checks the published package boundary separately from source tests.

These tests do not constitute complete passing evidence for V01–V45.
A [headful Chrome smoke test](#historical-d1-browser-smoke) exercised the
implemented editor, publication, public rendering, local search and a real
MediaLit upload, and fixed five browser-discovered defects. Real GitHub installation
and authoritative MediaLit provenance/race tests have not been run.

#### Historical D1 release gates

This table records the D1 delivery boundary. Use the D2 and D3 handoffs above
for the current implementation status; it is not the current backlog.

| Requirement | Evidence/status |
| --- | --- |
| DM-SOURCE | Metadata/path helpers tested; canonical settings and ownership/migration locks pending. |
| DM-ROUTE | Slug/path mapping tested; staged routes, candidate collisions, link projection, reserved Pages namespace, and catch-all site/API routing pending. |
| DM-VALIDATE | Structural safety and transport reports tested; Markdown wire mutations, draft CAS, Section/media references, complete advisory/candidate reports and dry runs pending. |
| DM-AUTH | Publication scope separation tested; source operations, suppressed/evidence access, purge authority, and delegated Git workers pending. |
| DM-EDITOR | Editing profile and indexing staging tested; preview, history, versioned autosave, publication reports, discard CAS and unpublish pending. |
| DM-NAV | Draft Section versions and captured navigation snapshots pending. |
| DM-GITHUB | App setup, PKCE, verified binding, webhook handling, reconciliation and proposal/check workflows pending. |
| DM-PUBLISH | Immutable revisions, candidate membership, preparation-before-activation, queue leases, idempotency and recovery pending. |
| DM-DELIVERY | Active publication reads, lexical search and durable delivery outbox pending. |
| DM-RETENTION | Reference-aware retention, purge tombstones, restore fencing and media-deletion races pending. |
| DM-CONVERT | Headless conversion/heading fixtures pass; persisted publication/index identities and projection rebuilds pending. |
| DM-MEDIA | Unsafe URL syntax rejection tested; upload intents, authoritative ownership/group verification, provider access checks and reference locks pending. Existing URL-only media registration is not verified provenance. |
| DM-FEEDBACK | Scoped evidence, deterministic grouping, redacted approvals, review/draft APIs and AI containment pending. |
| DM-MIGRATE | Reviewed CMS-to-Git export/adoption and stale-consent/source locking pending. |
| DM-OPERATE | Module input bounds exist; fair/bounded job admission, retries, AI budgets, reconciliation and operator runbook pending. |

Next work is D6. D3 now supplies atomic documentation publication through the
revision pipeline. The deferred MediaLit issue remains non-blocking. Git ownership
and the complete feedback/retrieval workflows remain later packages.

No GitHub/MediaLit operator configuration was added. Before deploying the heading
policy, deliberately rebuild existing docs chunks so stored citation anchors use
the same version as rendering; the revision/publication pipeline must make future
policy upgrades explicit. The provider registration, secret rotation, callback,
webhook, job/delivery recovery and repository-removal runbook remains a D6 release
gate.

<a id="historical-d1-browser-smoke"></a>

### 31.2 D1 browser smoke — 2026-09-30

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

This report covers the earlier D1 smoke. See [the subsequent D2 smoke and
deferred provider finding](#historical-d2-evidence) for the current implementation.

Date: 2026-09-30. Tested through Chrome MCP in a visible, headful Chrome session.
The user signed in and selected the `nice` workspace as its owner. API and
dashboard were already running on ports 4000 and 3000; the test started the
public site on port 3002. Desktop and a 390 × 844 mobile viewport were exercised.

The implemented docs workflow passes the checks below after five fixes.
This is **not** passing acceptance evidence for the full docs-management PRD:
D2–D7 and their release gates remain incomplete.

#### Browser checks

| Check | Result and evidence |
| --- | --- |
| Anonymous dashboard/API access | Dashboard redirected to sign-in; docs API returned `401 unauthorized` before sign-in. |
| Empty docs library | Empty state, zero counts, New doc and Add section rendered. |
| Section creation and rename | Created Browser Smoke through the dialog, renamed through the UI, verified updated group, then restored the name. |
| Required doc title | Empty submission showed `Enter a doc title.` and marked the input invalid. |
| Create doc in Section | Created a draft from the Section's New button; editor loaded with correct Section and slug. |
| Title and description autosave | Changed both through inputs; API reads and reload preserved the values. |
| Supported editor content | Typed headings, bold, italic, bullet list, blockquote and code; inserted and edited a table through the toolbar. Saved JSON and reloaded editor preserved them. |
| Documentation controls | Underline absent. Heading menu now offers levels 1–6; level 6 saved and reloaded as `h6`. |
| Toolbar edits immediately after reload | A heading change now autosaves without first typing or moving the selection. |
| Relative links | Applied `/docs/browser-smoke-september-30#setup-2` through the link control; saved link mark preserved after heading changes and reload. |
| Slug edit | Saved an unpublished fixture's new slug through the slug form; reload preserved it. This does not establish staged live slugs. |
| Mutation validation from browser | Unknown mutation field returned 400. Underline, unknown node, data-URL image, HTTP featured image and merged table returned 422 diagnostics. Before/after document JSON was identical across all rejected writes. |
| Publish | Owner published through the UI; API returned published state and the public article rendered. Legacy publication is synchronous 200, not the PRD's activation job. |
| Draft/live separation | Changed title and indexability after publishing; API showed different draft/live title and metadata, with `published_with_changes`. |
| Discard | Confirmed the UI discard dialog; title and indexability returned to the published values. |
| Published-delete protection | Library Delete button disabled with unpublish explanation; browser DELETE returned `409 DOCUMENT_STILL_PUBLISHED`. |
| Unpublished privacy and deletion | Public read of a draft returned 404. Deleted it through the UI, observed success toast and counts, and confirmed authenticated GET returned 404. |
| Library filters | Drafts tab excluded the live fixture; slug filter found it; unmatched filter showed `No docs match`. |
| Public docs pages | Help Center, collection and article rendered through `/sites/<teamId>/docs/...`, with correct title, count, description and Section. Tenant-domain navigation remains untested; see limitations. |
| Public rich content | Bold/italic, quote, list, code and table rendered with team typography. |
| Duplicate heading anchors | Article DOM and table of contents agreed on `setup` and `setup-2`; clicking the second TOC entry reached its actual heading. No hydration error after the fix. |
| Mobile and theme | Article and editor fit 390px without document-level horizontal overflow; Browse articles disclosure and editor settings opened; dark-mode toggle worked and preserved heading IDs. |
| Real MediaLit upload | Uploaded a disposable article screenshot through the featured-image dialog: signature 200, provider create 201, upload PATCH 204, registration 201, doc save 200. Stable HTTPS CDN image loaded. |
| Library image insertion | Selected uploaded image from Your media in the body-image picker; saved and published it. Public article loaded the image with its alt text after cache refresh. |
| Indexing | Enabled search in draft and published; index progressed from pending to indexed without a last error. |
| Search and citation anchors | Dashboard Ask docs and public search returned the exact first passage with `setup`. Browser API search for the full second passage returned `setup-2` and similarity 1. |
| Search exclusion | Published indexable=false during cleanup; the previously matching search returned no results while the article stayed published. |
| Offline save and recovery | Offline title/description edits now show an accessible failure alert, `Save failed`, disabled publish and Retry save. Restoring connectivity and retrying saved both fields together without changing live content. |
| Default article profile | A temporary article editor loaded with Underline still available. Deleted its draft afterward. |
| Final console | Fresh dashboard library and public Help Center loads had no warning/error console messages. Intentional offline requests produced expected network errors. |

#### Fixes made during testing

1. DocumentationEditor used the workspace context, but the standalone editor
   layout supplies EditorAccessGate. It now uses that gate's access context.
2. Static heading rendering consumed a mutable counter inside mapped React
   components. StrictMode replay changed IDs during hydration. IDs are now bound
   to ProseMirror nodes before rendering. A regression test replays the same
   element tree and checks identical output.
3. Failed draft saves were unhandled and had no visible error. Failed patches are
   retained in memory for Retry save; successful saves clear the error. Publication
   and discard errors now show a toast. This is not durable offline storage or CAS.
4. The docs heading menu only offered levels 1–3. It now exposes 1–6; the default
   profile retains its existing menu.
5. The editor only considered selection changes to be interaction. Formatting
   without moving the initial selection could be ignored. Pointer and keyboard
   interactions now enable autosave while passive initialization stays silent.

#### Limitations and remaining findings

- Publication changes can remain stale on the public site until its 60-second
  cache revalidation. The smoke observed the old article immediately after an
  image publication and the new article on a later reload. Immediate publication
  delivery is still a release gate.
- This workspace has no public subdomain configured. Public pages were opened
  through their internal tenant route; their normal `/docs/...` links require a
  resolved tenant host. Domain resolution and complete cross-page click navigation
  were not established by this test.
- Local embeddings hash whole passage text; they do not provide semantic matching.
  A short query for text inside a larger passage returned no results. Exact
  passage queries exercised the index and anchors. Real OpenAI/Azure semantic
  quality and AI-off lexical search were not tested.
- One mobile image-dialog transition produced Chrome's `aria-hidden` retained-focus
  warning. It did not recur on final page loads. Dialog focus/accessibility needs
  further review; this was not a full accessibility audit.
- A package rebuild briefly removed generated CSS/server entry files while dev
  servers watched them, causing transient dev build/proxy errors. Reloads after
  the builds completed recovered. These were not counted as successful requests.
- Restricted-member publication UI, cross-team browser sessions, OAuth/MCP browser
  clients, legacy unsupported stored-content guard, media provenance/race handling,
  and more than 500 documents were not exercised here. Existing automated policy
  and content tests cover some of these separately.
- GitHub ownership/sync, immutable revisions, publication jobs, preview/history,
  unpublish, source migration, suppression, retention and feedback workflows remain
  unimplemented. They cannot be passed by smoke testing the current UI.

#### Validation and cleanup

After the fixes: 89 text-editor tests and 10 dashboard helper/access tests passed;
text-editor build and dashboard, text-editor and public-site type checks passed.
`git diff --check` passed. The earlier API test evidence remains in the
[implementation handoff](#historical-implementation-handoff); those suites were
not rerun for these browser-only UI/renderer fixes.

The disposable media item was removed from draft and published content first,
then deleted from MediaLit/library: DELETE 204 and subsequent GET 404. Temporary
documentation drafts and the article draft were deleted. No preexisting content
was edited. One review fixture remains because normal unpublish is not available:

- Section: `Browser Smoke` (`sec_aut87hyphfx2o6gaz55u1xlq`).
- Published document: `Browser Smoke Verified`
  (`doc_6xjs6a4ii71ejavgnu9cznun`), slug `browser-smoke-september-30`.
- Final state: published without draft changes, no uploaded image, indexable=false.

Screenshots are local artifacts in `/tmp/frontlit-docs-smoke/`:
[desktop article](/tmp/frontlit-docs-smoke/article-desktop.png),
[390px article](/tmp/frontlit-docs-smoke/article-mobile.png),
[dark article](/tmp/frontlit-docs-smoke/article-dark.png),
[mobile editor settings](/tmp/frontlit-docs-smoke/editor-mobile.png),
[public search](/tmp/frontlit-docs-smoke/search-mobile.png), and
[offline-save alert](/tmp/frontlit-docs-smoke/offline-save.png).

<a id="historical-d2-evidence"></a>

### 31.3 D2 authoring and media — 2026-09-30

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

2026-09-30. Chrome MCP drove the existing visible Chrome session signed into the
`nice` workspace. API 4000, dashboard 3000, and public site 3002 were used.

**D2 is complete with an accepted, non-blocking MediaLit limitation, recorded as
[MEDIA-01 in the PRD](#media-01-medialit-signed-upload-group-can-be-overridden).
The live signed-group test still fails; affected public library operations remain
guarded. D3 can proceed. The foundation release still requires D3–D5.**

#### Contracts delivered

- Documentation creates accept initial JSON or Markdown and an optional proposed
  slug. Updates require `expectedDraftVersion`; exactly one content representation
  may be supplied. Frontmatter conflicts fail; unknown inert frontmatter survives
  in draft metadata. Invalid requests, unsafe content, and serialization failures
  leave the draft unchanged.
- Draft JSON, derived Markdown, proposed slug, canonical hash, and monotonically
  increasing version are stored together. Saves increment the team's documentation
  draft version under a shared settings-row lock. Slugs and indexing eligibility
  remain staged until publication. Blank titles, duplicate routes, missing internal
  targets/anchors, empty articles, and missing alt text produce sorted reports.
- Safe saves return `saved`, `publishable`, diagnostics, and validation context.
  Stale writes return `409 STALE_DOCS_DRAFT` and `currentDraftVersion`. REST and MCP
  use the same services and equivalent structured reports.
- `POST /content/documentation/validate` and MCP `validate_documentation` accept
  unsaved-document or selected-version publication modes without saving. Literal
  routes precede document-ID matching. Settings reads expose editor/Git ownership;
  settings updates require manage authority and a team draft version, and cannot
  switch ownership. Direct writes/publication/discard/delete reject Git ownership.
- Publish, discard, and delete require the acknowledged document version.
  Discard creates a new version from live content; never-published discard explains
  the absence of a published revision. Section mutations require the acknowledged
  `expectedDocsDraftVersion`. Publication and management remain distinct permissions.
- Autosaves are serialized. A stale save pauses automatic retries, retains local
  edits, and offers comparison and reload controls. Publish flushes title and
  description changes. The route setting explains that changes are staged.
- Public library uploads use expiring server-owned intents and exact expected
  provider groups. Registration fetches provider metadata before sealing, binds an
  unused intent to one object, verifies public access after sealing, and stores
  canonical metadata. Client URLs/MIME/size cannot manufacture ownership. Private
  legacy objects and foreign/reused intents are rejected. Referenced library items
  cannot be deleted; docs saves and media deletion share the team lock.
- Managed delivery URLs require verified team library records; external images
  carry an availability/tracking warning. Publication rechecks managed objects
  through authenticated provider lookup. The picker explains that uploaded library
  files become public before publication.

Migration `0004_docs_authoring` was applied to the development database without a
reset. Existing URL-only media records remain unverified until provider-backed
adoption; their presence alone does not authorize use by documentation.

| Check | Observed result |
| --- | --- |
| Markdown creation | `201`, normalized JSON, derived Markdown/hash, draft version 1. |
| Competing saves | Actual Postgres race: one `200`, one `409`; stored version incremented once. |
| Stale editor | Local title retained; `Save failed`; autosave/retry and publication paused. |
| Compare and reload | Comparison showed the other saved title; reload restored it and resumed editing. |
| Blank title | Version 3 saved with `MISSING_TITLE`; visible blocker; Publish disabled. |
| Broken internal link | Saved with `BROKEN_LINK`; publication dry run returned `200`, `saved:false`, `publishable:false`. |
| Duplicate proposed route | Created safely with `saved:true`, `publishable:false`, `DUPLICATE_ROUTE`; temporary draft deleted `204`. |
| Unsafe URL / forged media / invalid Section | Each returned `422`; prior draft version/hash remained unchanged. |
| Settings CAS and ownership | Valid settings patch `200`; stale version `409`; attempted source change `400`; source stayed editor. |
| Publication | UI published the selected draft, preserving search exclusion. |
| Staged route | Saved `d2-smoke-staged`; live slug stayed `d2-smoke`; public article still rendered at its old route. |
| Duplicate heading anchors | Public TOC used `setup` and `setup-2`. |
| Public upload notice | Visible before selecting/uploading the file. |
| Provider preflight | `/media/presigned` returned `503 MEDIA_GROUP_BINDING_UNAVAILABLE`. |
| Upload failure UI | Visible ownership-verification error; no asset was inserted into the draft/library. |

The follow-up UI checks also passed: discard restored the live route in a new
version; Section create/rename/delete succeeded and the temporary Section was
removed; mobile editor and public article measured 390px viewport and scroll
width, with no horizontal overflow. Offline title and description changes showed
the failure alert and disabled publication; reconnecting and retrying saved both
in version 10 while live title/description remained unchanged. The final fresh editor load had no warning/error console messages. Controlled
negative requests produced expected browser network errors during the smoke. Public pages also emit pre-existing unused-font-preload warnings; these
checks are not a full accessibility audit.

#### Automated evidence

- API authoring/content/indexing/media/policy suites: **100 passing tests**.
- Dashboard docs-screen/permission/access/editor helpers: **17 passing tests**.
- Shared docs profile: **89 passing tests**.
- API, dashboard, and public-site TypeScript checks passed.
- The contract and media-uploader packages built successfully.
- Live provider acceptance: **one passing private-upload test and one failing
  signed-group test**. Each test cleans up its newly created provider object.

Reproduce the provider gate from `apps/api`:

```sh
bun run test src/media/provenance.integration.test.ts
```

#### Deferred provider finding (MEDIA-01)

A real TUS upload signed for `frontlit-library:test:<nonce>` was submitted with
client metadata `group=client-forged-group`. Authenticated provider lookup returned
`client-forged-group`. The signed group was overridden, so this metadata cannot be
used as authoritative ownership proof. The private-upload test independently
confirmed private access classification when no group override was supplied.

The local MediaLit source confirms the cause in
`apps/api/src/tus/tus-server.ts`: `group: metadata.group || group`.
[The prepared patch](./medialit-group-binding.patch) gives the signed group
precedence and passes `git apply --check` against the local MediaLit checkout.
The provider checkout and deployment were not modified. That patch is a reviewable
starting fix, not passing deployment evidence or a complete provider security audit.

FrontLit actively probes this behavior before granting library upload intents or
registering assets. A failed/unavailable probe blocks both operations with `503`;
results expire after five minutes. The probe creates a tiny synthetic file and
cleans it up. There is no client-provided assertion or environment bypass that
marks the provider verified. Provider changes must pass the actual acceptance test
before affected uploads are enabled. On 2026-09-30, the user explicitly accepted
this issue as non-blocking for D2 completion and subsequent docs milestones.

#### Historical D2 boundary

The following boundary describes D2 at delivery. D3 is now implemented and its
current evidence is in [the D3 handoff](#historical-d3-evidence).

Publication still uses the existing live columns and index queue. Immutable
revisions, navigation snapshots, publication jobs/idempotency, captured publication
IDs, suppression/access-loss reconciliation, retention/purge, and delivery outbox
belong to D3 and remain open. Section mutations are version checked but their
public navigation is not yet captured in an immutable publication. Preview/history,
catch-all delivery, and complete Git setup remain later packages.

#### Review artifacts and final state

Screenshots are in `/tmp/frontlit-docs-smoke/`: `d2-upload-blocked.png`,
`d2-public-mobile.png`, and `d2-offline-mobile.png`.

The named review fixture is restored to its clean published state at draft version
11: **D2 Browser Smoke**, document
`doc_d9bjpit0o48ts7i1q3a9xfd4`, live route `/docs/d2-smoke`. It is image-free and
excluded from retrieval. The previous Browser Smoke Verified fixture remains.
Temporary duplicate drafts and the Section were deleted; provider-test objects
were cleaned up. The visible Chrome session remains open and online.

<a id="historical-d3-evidence"></a>

### 31.4 D3 publication and recovery — 2026-09-30

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

Recorded 2026-09-30. D3 is implemented and the targeted automated and visible
Chrome checks below pass. D4 was subsequently completed; see [its handoff](#historical-d4-evidence). This does not establish the complete
foundation release in §26: D5 remains open. [MEDIA-01](#media-01-medialit-signed-upload-group-can-be-overridden)
is still the accepted, non-blocking provider limitation; public library uploads
remain guarded.

#### Implementation

`0005_docs_publications.sql` was generated and applied to the local development
database, without resetting it. It adds immutable revisions, candidate membership,
publication jobs, delivery outbox, independent restrictions and purge plans.
Documentation routes are unique within a publication, permitting atomic swaps;
blog/changelog slug uniqueness stays intact. Existing published docs are captured
once into a bootstrap publication, without resetting their drafts.

Admission captures acknowledged document versions, the current publication,
Section/settings version, navigation and indexing configuration. Preparation reads
that captured candidate, validates its links and media, and runs before activation.
Activation checks its lease, base publication, request generation and purge
fence under the team lock, then commits the active pointer and delivery event
in one transaction. Newer draft edits survive. Legacy live columns are maintained
as an admin projection; public serving and lexical documentation search read
revision membership. Single-page publishing uses the same pipeline.

REST and MCP expose queue/status, manifest, suppression/release and purge
preflight/status contracts with shared validation and scoped authorization.
Single-page publish now requires `expectedDraftVersion`,
`expectedDocsDraftVersion` and nullable `expectedPublicationId`. Publication
requires publish authority; policy management requires manage authority; release
requires both. Ordinary document reads and writes cannot disclose restricted
bodies. Purge commit requires a recent interactive owner session, the exact
reviewed plan hash and explicit irreversible acknowledgement; MCP directs the
owner to the interactive operation instead of executing a purge.

Suppression advances a policy epoch independently of publication or provider
work. Stable document IDs and retained route aliases preserve restrictions across
renames. Release validates the current manifest, epoch and media again. Confirmed
managed-media access loss creates a restriction; a provider network failure alone
does not. Pending support answers check current documentation evidence before
persistence, and queued email replies check again before sending. Withheld queued
answers are cleared and their sequence consumed without sending.

Public article, navigation, discovery and lexical retrieval share the active
publication and policy. A snapshot endpoint returns articles and navigation from
one capture, and stale explicitly requested identities return 409. Sites use
request-local memoization with `fetch` no-store and dynamic docs routes, including
nested slugs. A signed, bounded, replay-safe delivery webhook supports optional
site revalidation. Authoritative serving does not depend on successful delivery.
Transient host lookup failures return 503 without caching a false unknown tenant.

- API: **123 tests pass across 14 targeted suites**: publications, authoring,
  documentation/document queries, media references/provenance/provider transport,
  operation policy coverage, public critical paths, REST/MCP content validation,
  index status, support generation/mail and citation mapping.
- Sites: **15 tests pass** for tenant host decisions, proxy guards, docs tree and
  signed delivery webhook.
- API, dashboard and sites TypeScript checks pass.
- API contracts were built. An isolated production sites build succeeded; its
  docs routes are dynamic. The temporary build and output override were removed
  during cleanup on 2026-10-03.
- `git diff --check` passes.

The 20 publication service tests use PGlite and exercise atomic old/new visibility,
post-admission draft edits, captured navigation, expired/wrong leases, stale
request generations, idempotency, route swaps and duplicate rollback,
full-candidate link validation, suppression across rename, stale/reviewed release,
identity and tenant isolation, partial delivery acknowledgements, reference-aware
retention, recent-owner purge, pending-job purge fencing, retryable provider
outage, retained-media deletion races, confirmed access loss, evidence withdrawal,
restore fencing and queue fairness. Transport tests cover equivalent REST/MCP
reports, foreign publication IDs, non-disclosing restrictions and MCP purge denial.
The mail regression verifies a withdrawn queued answer is neither sent nor retained
in its outbox payload.

These are targeted checks, not a claim that every PRD scenario or every repository
test passes. Live GitHub OAuth/installation was not exercised for D3. The live
MediaLit signed-group integration remains failing as recorded in MEDIA-01.

#### Visible Chrome smoke

Chrome MCP used the visible, headful browser session with the owner signed into
workspace `nice`. Automated API/unit checks ran separately in the terminal.

| Action | Observed result |
| --- | --- |
| Queue a captured draft, then edit its title | 202 admission; job activates the captured title while the newer draft remains dirty. |
| Replay the admission key | Same publication receipt; no second activation. |
| Rename a Section after admission | Published navigation retains the captured Section name. |
| Request an old publication identity | 409 `STALE_PUBLICATION`. |
| Suppress the published document | 201; snapshot omits it, public API and actual tenant article return 404; epoch advances. |
| Release against a stale policy review | 409 `STALE_POLICY`. |
| Release against the current manifest | 200; the actual tenant article returns 200 again. |
| Discard the newer unpublished title in the editor | Clean published draft restored at version 3. |
| Restore the Section label, edit the excerpt and click Publish changes | New immutable publication becomes active; editor is clean at draft version 5. |
| Open the nested route on desktop and at 390 px | Article renders with duplicate heading IDs `setup` and `setup-2`; no horizontal overflow. |
| Read public snapshot | 200, `Cache-Control: no-store`, current publication/epoch and revision identity, no draft content. |
| Open the nested article in an isolated production server | 200 with `Cache-Control: no-store`; production docs discovery also returns no-store. |
| Owner purge preflight | 201; exact target/hash, external-copy limits and separate media-deletion authority are displayed in the API response. No browser purge was committed. |

Next dev may override HTML headers with `no-cache, must-revalidate`; no-store was
verified on the production server separately. The production smoke server on
3003 was stopped after verification. The existing dev servers remain running.

Review fixture: **D3 Browser Smoke**, `doc_o6mh43cjracz33gfrdwrsooo`,
[public article](http://nice.localhost:3002/docs/d3-smoke/nested).
Its Section is **D3 Captured Navigation**, `sec_p4in4kvjtv0b2ev4c1dy2yop`.
Final publication is `pub_ybxciug7fszoyute7mf71ngn`, policy epoch 2, and the
fixture is image-free and excluded from retrieval. The earlier D1 and D2 review
fixtures remain. The reviewed purge plan expires after ten minutes without any
content deletion. The smoke restriction was released.
Screenshot: `/tmp/frontlit-docs-smoke/d3-public-mobile.png`. Chrome remains open
on the editor and public article for inspection.

#### Recovery and retention

The API starts the publication worker automatically. Each tick handles at most
five publication jobs and ten delivery events; preparation uses expiring leases,
heartbeats and at most five attempts, with exponential retries for transient
provider failures. Admission permits two pending jobs per tenant and twenty per
hour. A busy tenant's preparation does not prevent another tenant from being
claimed. Semantic candidate failures are terminal and preserve the last good
publication; submit a corrected candidate with a new idempotency key.

Delivery records each destination acknowledgement independently and retries only
unfinished work. To enable site callbacks, configure the same
`REVALIDATE_WEBHOOK_SECRET` in API and sites and set `SITES_BASE_URL` on API.
Without that configuration local delivery still runs and docs serving reads live
identity without application-cache staleness. Managed-media deletion reserves
`access=deleting` and commits an outbox event under the reference lock; provider
I/O happens afterward. A provider 404 during deletion is an idempotent success.

Confirmed media metadata changes are polled once per minute in bounded batches.
This does not guarantee instant discovery of an upstream change. Provider recovery
does not automatically release an existing restriction: review and release it.

Cleanup retains replaced publications and their referenced bodies for thirty days.
Failed/superseded candidate bodies become eligible after seven days, while minimal
job receipts remain for thirty days. Unreferenced old revisions are collected;
active and pending references protect them. Completed outbox audit events expire
after ninety days. Expired preflight plans are removed. Purge tombstones persist
and prevent recreating purged document IDs/routes or activating pending captured
bodies. Media used by other retained consumers require separate authorized deletion.

**Restore procedure:** set `DOCS_RESTORE_PENDING=true` before serving a restored
backup. This fences docs serving and publication admission/activation. Restore
and reconcile the trusted suppression and completed-purge ledger against the
backup before clearing the flag. Automated backup storage and reconciliation
infrastructure are not supplied by this milestone. Git files, already delivered
customer messages, downloaded content and third-party caches cannot be recalled;
the purge preflight discloses those limits. The stated thirty-day backup maximum
is an operator retention requirement, not a configured backup service.

#### Next work

D4 is now complete; see [the D4 handoff](#historical-d4-evidence). D5: the complete retrieval/support feedback loop and AI budgets.
D6: live GitHub binding and Git-owned publication workflows. D3's lexical serving
and policy checks do not establish those later milestone acceptance gates.

<a id="historical-d4-evidence"></a>

### 31.5 D4 editor/site — 2026-09-30

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

D4 is implemented and its targeted automated and visible Chrome smoke checks passed on 2026-09-30. This is an incremental milestone, not the complete foundation release in PRD §26. D5 retrieval/support workflows and D6/D7 Git workflows remain open. [MEDIA-01](#media-01-medialit-signed-upload-group-can-be-overridden) remains explicitly accepted as nonblocking; public library uploads stay guarded.

#### Changed contracts and behavior

- Private dashboard preview requires read authority and an acknowledged draft version. It returns only article data, captured public navigation, and selected theme metadata. It omits tenant scripts/widgets/HTML/credentials. The REST prefix and dashboard proxy preserve `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. No tenant iframe or bearer preview URL is created.
- Read-scoped publication history provides bounded, cursor-paginated receipts; equal timestamps use publication IDs as a tie-breaker. Accepted retained revisions are authenticated reads. Never-activated candidates and foreign-team revision IDs are unavailable. Independent restrictions apply to ordinary preview/history readers, including managed assets referenced only by canonical URL; managers retain incident-review access.
- Publication review selects exact saved document versions, additions/updates, route changes, removals, and optional Section changes. Validation precedes queuing. New Sections cannot be excluded when selected articles reference them. Pending navigation is displayed independently of document dirty state. History reports jobs/attempts/diagnostics; the editor polls queued work until activation.
- Unpublish queues a validated removal and retains its authoring draft. Live direct deletion remains blocked. Retry clones the failed candidate's immutable memberships/navigation rather than capturing newer drafts, and uses idempotency and admission limits.
- Withdrawal hides an article or the entire docs area immediately. Release requires review of the current manifest and exact policy epoch. Whole-area withdrawal renders a generic page-builder unavailable state without documentation titles/navigation/search.
- Six new REST/shared MCP operations cover preview, publication history, retained revision list/read, unpublish, and retry. Existing publication receipt reads now use read authority. `includeSectionChanges` is added to publication/validation inputs; settings expose `navigationPending` and captured `publishedNavigation`. The MCP batch entry is named `publish_documentation_changes`, matching the PRD (replacing the earlier `queue_documentation_publication` name).

No D4 migration or database reset was required. D3 migration `0005_docs_publications.sql` remains the publication schema. No GitHub configuration, identity sharing, or new provider credential was introduced.

#### Browser-discovered fixes

The rich-text editor debounces its change callback. Immediate Preview initially showed the previous saved body. An explicit flush callback now drains the current rich-text change before preview or publication review; the dashboard then waits for acknowledgement. The same immediate-type/click scenario passed after the fix. Clean Preview does not manufacture a draft update.

The mobile publication footer initially clipped the validation button. Its actions now stack at narrow widths. Final checks at 390×844 found document width 390, dialog bounds 24–366, and both footer buttons within 49–341. Preview/History/Withdrawal editor actions also fit within the viewport. Draft routes now display/filter using `draftSlug`, and review shows indexing intent and changed titles.

#### Automated verification

| Check | Final result |
| --- | --- |
| API documentation/auth/media/public/support regression selection | 151 tests, 17 suites passed |
| All site tests | 45 tests, 14 suites passed |
| Shared text-editor tests | 89 tests, 5 suites passed |
| Dashboard docs-screen and permission tests | 11 tests, 2 suites passed |
| API, dashboard, site, text-editor type checks | Passed |
| Targeted dashboard lint; `git diff --check` | Passed; lint emitted the existing Pages-directory configuration notice |

API command (from `apps/api`):

```sh
bun run test src/auth/operation-policy.coverage.test.ts src/auth/permissions.test.ts src/documentation src/documents/queries.test.ts src/media/provenance.test.ts src/media/service.test.ts src/media/queries.test.ts src/public/critical-path.test.ts src/inbox-ai/generate.test.ts src/inbox-ai/mail.test.ts
```

The broad initial selection also ran the live MediaLit integration test: one of its two scenarios failed because a client-supplied group still overrides the signed group. This reconfirmed MEDIA-01; it was excluded from the final local regression selection, not fixed or counted as passing. Four older indexing tests initially expected documentation to enqueue the legacy mutable index jobs. They now assert observable immutable publication preparation, activation, revision reuse, and staged indexing exclusion; all nine indexing tests pass.

The D4 lifecycle suite covers stale/foreign preview, omission of injected tenant data, private retained-history eligibility, suppression and manager review, canonical-URL media restrictions, same-timestamp pagination, unpublish retention, exact failed-candidate retry with newer drafts preserved, and excluded-new-Section rejection. REST/MCP tests exercise preview/history parity and private headers.

#### Headful Chrome evidence

Chrome MCP used a visible browser, signed into the `nice` workspace. Desktop and mobile viewport emulation were performed in that headful session. Chrome approvals were enabled in Codex configuration; after restart its clicks worked. Dev API/dashboard/site servers were already running.

| Scenario | Observed result |
| --- | --- |
| Create/edit private D4 draft, turn indexing off | Saved draft; tenant article returned 404 before publication |
| Type then immediately Preview | Current body rendered after flush fix, acknowledged version 6, unpublished badge and captured Section names |
| Inspect private preview through dashboard proxy | HTTP 200, `private, no-store`, `noindex`; explicit article/report/shell fields; no tenant-origin resource requests from preview |
| Validate and queue selected version | Review passed; Queue enabled only after validation; publication became active and editor became clean/published |
| Public article | `nice.localhost:3002/docs/d4-browser-smoke` rendered the accepted body |
| History and retained revision | Active/archived receipts and attempt counts displayed; accepted body rendered under “not a public URL” |
| Unpublish | Review showed 0 selected/1 removal/navigation unchanged; public route became 404; version-6 authoring draft remained |
| Republish retained draft | Active again without reauthoring its content |
| Document withdrawal/reviewed release | Article became 404, then returned after current manifest review/confirmation |
| Area withdrawal/reviewed release | `/docs` showed only generic unavailable content within the site shell, with no docs titles/navigation/search; restored after reviewed release |
| Batch of two linked drafts | Review selected D4 guide version 7 and companion version 1; both activated in one publication; nested companion rendered and linked to the guide |
| Pending navigation/new Section | Separate pending-navigation label displayed; excluding Section changes gave `SECTION_NOT_PUBLISHED` and disabled Queue; including them validated and activated |
| Mobile controls | Editor toolbar and publication dialog/footer fit at 390px after footer fix |
| Final console inspection | No dashboard errors/warnings; public page had only a CSS preload warning |

Batch companion and new Section fixtures were prepared using same-origin authenticated browser fetches, then validated/queued through the visible UI. No credential was copied into tenant requests. Failed-job retry, suppression reads for non-managers, and equal-timestamp pagination were verified by automated tests, not forced into the live workspace browser session.

Local artifacts:

- `/tmp/frontlit-docs-smoke/d4-preview-final.txt`: final private preview accessibility snapshot.
- `/tmp/frontlit-docs-smoke/d4-mobile-review-final.txt`: final mobile review snapshot.
- `/tmp/frontlit-docs-smoke/d4-mobile-batch-review.png`: earlier mobile batch screenshot that exposed the footer clipping; it predates the footer correction.

#### Review fixtures and recovery

Workspace: `nice`; public team `team_hek5byq4ipm2xrixbr91nadi`.

| Fixture | Final state |
| --- | --- |
| D4 Browser Smoke, `doc_8lo6eob9uix4zdsrv9cf965l` | Clean published draft version 7; `/docs/d4-browser-smoke`; excluded from retrieval |
| D4 Batch Companion, `doc_fq0itrnea76qws7u25p5ieqg` | Clean published draft version 2; `/docs/d4-batch/companion`; excluded from retrieval |
| D4 Navigation, `sec_5r8eck9jd88uff2bnloydusg` | Captured published Section containing the companion |

Final active publication: `pub_nwidw2cxbr7e3176rzbax7g0`; policy epoch 6; `navigationPending=false`. All three retained suppression receipts (including the earlier D3 receipt) are released. The original D1/D2/D3 fixture content remains intact. The D3 receipt is archived because later D4 publications are active.

For a failed job, inspect History and retry its captured candidate while its base/source/purge generation remains eligible; if those guards have changed, refresh and review a new publication. For stale drafts, reload/compare before resaving. Keep the last accepted publication live during preparation failures. Withdrawal/release is independent of publishing; do not clear policy restrictions by editing drafts or republishing.

D5 is next: complete retrieval/support evidence and feedback loops, AI budgets and their acceptance scenarios. GitHub App installation/OAuth/import was not tested in D4 and remains a D6 gate. The final D4 checks used dev servers; this handoff does not claim a new production build smoke or complete V01–V45 coverage.

<a id="historical-d5-evidence"></a>

### 31.6 D5 retrieval/support — 2026-10-01 through 2026-10-03

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

Initial citation-triplet attempt, 2026-10-02 (credential gate subsequently resolved): the isolated headful public Assistant submitted one brief API-key rotation question against active `pub_htzc9o7lb3w3kb893u4cs2og` / guide revision `rev_arqiu8fjvwaada7zv8xvq0jt`. Conversation `tkt_rtbqlhrf4v46wji2u4refaz4` records one failed generation: provider says its API key has expired, with no bot answer/citations. No repeated live call was made; credential replacement was requested. The initial classifier reported provider_transient; it now recognizes structured 401/403 and expired/revoked API-key messages as provider_auth while retaining 429 and unrelated expired-certificate errors as transient. All 15 focused completion/generation tests and API typecheck pass. This failed attempt alone is not successful V30 evidence. The daily budget counter records a conservative 13,217-token estimate for the failed attempt, with zero held reservations; it is not a provider-reported billed-token count.

V30 live verification after credential replacement, 2026-10-03: three isolated headful Assistant sessions ask the same brief API-key rotation question. Before merge, conversation `tkt_aggbwblzb9va82fh50s8cfz1` cites accepted guide revision `rev_arqiu8fjvwaada7zv8xvq0jt` / publication `pub_vdhv857xgc49abso3821lazm`, excluding the pending local title edit. FrontLit creates PR #12 for the captured guide-only edit; normal checks pass and headful GitHub merge `30fcaf1f2611be6183c569b7fe4b1465bebf9e36` activates `pub_7i2227f8ow3kqqjrea4wsry7`. Conversation `tkt_olzix3gqbqjkjm71r70iakw0` cites new revision `rev_7osy1hjlsw97whgp579ldc9u` with the reviewed title and the same canonical URL/heading anchor. An authorized temporary duplicate-route Git fixture at `a03f23a5bbf643cc0133a229bbe19f89825850d6` fails normal import with no publication. Conversation `tkt_davksndyk6dl28i4pxv58vfd` still cites exactly the accepted source object, including revision, publication, policy epoch, evidence ID and URL. All three answers are grounded and contain a valid [1] citation without escalation. No further AI call is needed; the three successful calls add 3,741 tokens to the workspace budget counter with zero held reservations.

Cleanup restores the exact 24-entry configured Git tree, original guide blob `c263f09b92e78a460cc9b27f7edc0b567352951b`, and ten canonical public snapshots/IDs/routes (excluding draftVersion). Temporary duplicate file is absent; no active restrictions remain. Normal sync activates clean main `a67a574d4944564bfb81ede9b147cc78f9f2ba76` / `pub_1vpjc555cstq9sfm6iu83dvp`; fresh headful reload shows the original title. This closes V30, not the other D6/D7 release gates.

Implemented on 2026-10-01. D6 is next. This handoff records the implemented D5 paths and their evidence; it does not declare the complete foundation or Git release gates satisfied.

#### Result

Documentation retrieval uses immutable accepted revisions, the active publication, current policy epoch, heading anchors, and server-built canonical public URLs. Lexical publication/search requires no AI provider. Semantic preparation calls a real provider through the AI SDK, validates vectors, reserves team budget, settles reported usage, and keeps captured provider configuration encrypted so the previous live corpus remains usable during configuration changes. It never uses the legacy development-vector fallback.

Settings/provider changes prepare a new generation without selecting unpublished drafts. Preparation works in batches of at most five previously unprepared revisions, persists reusable vectors, renews its lease, and yields without consuming failure attempts. Due-time ordering lets other admitted work run between passes. Budget exhaustion is terminal until an explicit retry after renewal; no automatic provider retry loop spends tokens after exhaustion.

The support loop records validated same-team source references for explicit retrieval misses, negative feedback, and escalation. Grouping is deterministic, preserves numbers/product identifiers, deduplicates events, and creates recurrence items after closed decisions. Source deletion cascades through raw references; raw text is not copied into improvement records. Expired pointers are removed in bounded worker batches, and expired evidence is withheld immediately.

Reviewers with support access can approve a standalone redacted artifact with an explicit declaration, actor, timestamp, and version. Docs-only readers/API keys see only approved artifacts, with no raw questions, conversation URLs, unapproved snippets, or evidence counts. Review decisions have an append-only audit table. Versioned merge/dismiss/reopen and draft creation share REST/MCP services. Draft creation is atomic and idempotent per approved artifact version, uses the normal safe authoring service, and never copies a raw transcript. Publication links the accepted revision to the item; it does not claim the support issue is resolved. Sensitive purge clears linked approval/audit/draft receipts and retrieved source pointers; embedding rows cascade with purged revisions.

Answer generation offers only scoped retrieval, bounds input/context/output, escapes delimiters, rejects missing/fabricated citations and URLs, and emits sources only for supplied citations. It buffers output and rechecks publication/revision/policy identity before storing a reply or delivering queued ticket mail. Prior assistant text and retrieval/tool output are untrusted data. No model publication, Git write, private-ticket search, media deletion, or arbitrary network capability is exposed.

- 187 API regression tests across 24 suites passed, covering documentation, auth, media, public serving, support, notification URLs, and MCP registration. The final publication/policy fence change also passed all 28 publication/generation/mail tests.
- New D5 coverage includes seven semantic retrieval tests, six improvement lifecycle tests, five generation containment tests, and REST/MCP parity coverage for approval, restricted projections, exact draft replay and stale review.
- Dashboard docs-screen/permission tests: 11 passed. All site tests: 45 passed across 14 suites.
- API and dashboard typechecks passed. Targeted dashboard lint passed with existing Next configuration/navigation warnings.
- MCP advertises 116 explicitly authorized tools, including the four improvement operations.
- Local migrations `0006_docs_feedback`, `0007_docs_semantic_config`, and `0008_docs_review_audit` were generated and applied without resetting the development database.

Reproduce the API regression selection from `apps/api`:

```sh
bun run test src/auth/operation-policy.coverage.test.ts src/auth/permissions.test.ts src/documentation src/documents/queries.test.ts src/media/provenance.test.ts src/media/service.test.ts src/media/queries.test.ts src/public/critical-path.test.ts src/inbox-ai/generate.test.ts src/inbox-ai/mail.test.ts src/inbox-ai/completion.test.ts src/chatbot/completion.test.ts src/tickets/notify.test.ts src/mcp/auth-context.test.ts src/mcp/server.test.ts
bun run check-types
```

#### Visible Chrome evidence

Chrome MCP used the existing visible desktop session, signed into `nice`; no headless substitute was used.

1. Created an isolated local support fixture without requester email or AI scheduling. Clicked **Flag documentation gap** in Inbox; the button changed to **Documentation feedback recorded**.
2. Opened **Improvements** and selected its evidence. Approved standalone text after explicitly checking the no-customer-details declaration. Approval advanced item version 1 to 2.
3. Clicked **Create private draft**. The item advanced to `draft_created`, version 3, and linked one new private document. The editor contained only approved description/correction; the synthetic customer marker remained confined to authorized support evidence.
4. Used normal **Publish changes**, validated the exact saved version, and queued publication. The worker activated the publication; the item advanced to `published`, version 4, with accepted revision/publication links.
5. Opened `http://nice.localhost:3002/docs/d5-api-key-rotation-guide`. The approved guide rendered, and the synthetic customer marker was absent. Authenticated lexical search returned the accepted revision, two heading-scoped evidence IDs, policy epoch 6, and canonical public URLs; no raw question appeared.
6. Repeated the exact approved-artifact draft request in the visible browser: `201`, same document/version. A conflicting idempotency key returned `409 IMPROVEMENT_DRAFT_EXISTS`.
7. Confirmed the workspace has no configured AI provider. In **Retrieval**, selected Semantic and saved. History displayed a failed candidate with `EMBEDDING_CONFIGURATION_REQUIRED`, attempt 1. The accepted publication and lexical results remained available. Restored Lexical through the visible settings dialog.

Fixtures retained for inspection:

| Object | ID |
| --- | --- |
| Support ticket | `tkt_0odw1kw778cw4q05qwpu64nx` |
| Improvement | `imp_svtz37wrl2ebhn54zr5jfij6` |
| Approved artifact version | `1` |
| Guide document | `doc_ziu67keqg3s4evt10t4trccc` |
| Accepted revision | `rev_g1v1fwltkv3s926mdtze1kyy` |
| Accepted publication | `pub_3lxxqu9vtf83deufnyowctc8` |
| Failed semantic candidate | `pub_h7c9014c53v7zxqqfsotpd5i` |

Snapshots: `/tmp/frontlit-docs-smoke/d5-public-guide.txt`, `d5-dashboard.txt`, and `d5-semantic-failure-history.txt`. Local API hot reload briefly caused BFF auth checks to fail and redirected the dashboard to an unavailable login origin; navigating back after restart recovered the existing signed-in session.

#### Limited live-provider follow-up (2026-10-01)

After the workspace owner configured OpenAI, the visible Chrome smoke verified real semantic preparation and one real chatbot answer. The prior lexical publication was preserved during preparation. Semantic publication `pub_8v6sq9lpvxnjozzbgncp8lza` activated on its first attempt with no diagnostics. Three real 1536-dimensional vectors were stored across the two small indexable documents (20 and 163 Markdown characters). One semantic search returned the rotation guide with the correct immutable revision, policy epoch 6, heading evidence IDs and canonical URLs.

Restored the original lexical setting through the visible Retrieval dialog; publication `pub_xv80d5tgslxwszwkzyl3ltmj` is active. Then sent one short question in the public site's visible Assistant widget. The configured OpenAI model (`gpt-6-luna`) returned a correct concise answer and a source link to `#rotate-an-api-key`. Total workspace usage after these checks was **1,238 tokens**, including **40** for embedding preparation/search, with **zero reserved tokens**. No additional paid calls were made to repeat the test.

This smoke found that model chunk citation `[2]` rendered alongside source-list label `[1]` after source deduplication. Server output now renumbers answer citations to the deduplicated source list for both chatbot completion paths. Local regression covers out-of-order chunks, repeated documents and preserved heading targets; the live response that exposed the issue remains recorded rather than edited. Snapshot: `/tmp/frontlit-docs-smoke/d5-live-provider-answer.txt`.

#### Remaining release gates and recovery

Real OpenAI preparation/search and one grounded model answer now have live-provider evidence above. Automated provider failure, rotation and budget tests use controlled responses; live rotation/provider-failure and other remaining operator scenarios are not implied by this small positive smoke. Multi-role privacy was checked through service/REST/MCP tests, not by switching the visible browser to a second account. Large multi-tenant load and the remaining operator/admission scenarios still need their §25 release evidence.

Configuring a provider creates a fresh preparation generation. A failed candidate that captured missing credentials stays immutable; retrying it does not substitute a later credential configuration. The current accepted publication is never replaced by a failure. Keep lexical mode enabled until the live semantic preparation gate passes.

Raw support pointers expire after 30 days; approved standalone text is ordinary documentation and must be included in sensitive purge when appropriate. Retained publication/configuration cleanup follows the D3 retention workflow; active references stay protected. MEDIA-01 remains the user-accepted nonblocking provider issue in PRD §24.2. GitHub interactive setup/import/proposals are D6/D7 work and were not claimed as tested here.

<a id="historical-d6-evidence"></a>

### 31.7 D6 setup/import/adoption — 2026-10-01 through 2026-10-02

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

Rename/inbound-link live checkpoint (in progress), 2026-10-02: headful editor created companion doc `doc_ilc2e3cfkz2n292w1yebevvs`, file `docs/d6-link-companion.md`, disabled indexing and applied a real relative link to the deep page. FrontLit opened PR #7; GitHub checks passed and authorized visible Chrome merged at `2a4334e183f9628f32a541e059e49e7ae277d526`. The public companion renders its link. Submitting only the deep page's renamed slug creates failed local proposal `gproposal_sokxd23bmh3la07s6yzlesbj`, diagnostic BROKEN_LINK at the companion path, no Git commit/PR, old public route 200/new route 404. The corrected pair (both captured versions 6) is submitted through the normal review dialog; merge/publication verification is pending. Evidence under `/tmp/frontlit-docs-smoke`: `d6-companion-draft-link.json`, `d6-companion-before-rename-public.txt`, `d6-rename-only-proposal.json`, `d6-rename-only-proposal-ui.txt`, `d6-rename-rejected-public-api.json`, `d6-rename-pair-reviewed.txt`. No manual export/commit or additional AI use occurred.

Server resumption checkpoint, 2026-10-02: the initiating administrator's latest active setup can now be discovered through Source after losing tab/session storage. Discovery requires account-bound manage authority, excludes expired/canceled plans and returns only the plan ID. Fresh headful Chrome restored the original merged/verified ten-file plan (`/tmp/frontlit-docs-smoke/setup-server-restored.txt`). Source/setup/signed-OAuth regression passes 56 tests across three suites; dashboard passes 97 across 22 suites, with contract build and API/dashboard typechecks passing. Final scoped OAuth/parity regression passes 13 across two suites. Tokens are test-issued, but actual signing/JWKS/auth/team/policy/MCP SDK are exercised; GitHub is doubled. The live authorization-code and Git-write gates are not waived. Reconnection/Finish setup still requires the original administrator; no activation occurred during this checkpoint.

Setup UX checkpoint, 2026-10-02: Source now leads with the current step, hides plan/repository IDs, hashes, manifests and recovery actions under collapsed **Setup details**, and exposes **Finish setup** after merged-file verification. The three required source approvals remain explicit, with shorter wording. Expired authorization offers contextual reconnection while preserving the merged PR/verified plan. An observed merged plan is checked automatically in the mounted Source screen when a current setup authorization exists; it is not background source activation. Headful Chrome verifies the actual merged/verified state, collapsed/expanded details and contextual reconnect/disabled Finish setup (`/tmp/frontlit-docs-smoke/setup-simplified-ready.txt`). The current authorization is expired, so automatic verification with renewed authorization and final activation still require live proof. Dashboard regression passes 97 tests across 22 suites and typecheck passes (`/tmp/frontlit-docs-source-simplified-web-tests.log`, `/tmp/frontlit-docs-source-simplified-types.log`). No Git write, source activation or paid AI call occurred during this UX smoke.

Latest verification, 2026-10-02: 21 setup/reconciliation tests pass, including session revocation and policy changes during provider reads, rate-limit backoff/recovery without duplicate PR creation, cancellation after accepted placeholder initialization, and a file blocking a nested directory. Ten transport tests pass for session REST/scoped OAuth credential-reference MCP parity, strict request bodies, API-key denial and credential/body omission. Authentication middleware is mocked in this transport harness; live OAuth bearer verification is not established. API typecheck passes. Logs: `/tmp/frontlit-docs-setup-reconciliation-boundaries-tests.log`, `/tmp/frontlit-docs-setup-transport-final-tests.log`, `/tmp/frontlit-docs-setup-reconciliation-boundaries-types.log`.

Fresh headful snapshot `/tmp/frontlit-docs-smoke/setup-source-current.txt` shows PR #2 merged and the plan verified at `d99918d37fe1dd71e249fd2a0642ddd6769e0b33`. An authenticated source read returns editor ownership with no binding. Original-administrator activation consent remains pending. The platform setup-PR checkpoints below supersede the historical manual-export workflow descriptions; live empty-repository and remaining D6/D7 gates remain open.

Status on 2026-10-01: **in progress**. D6 is not complete and Git dogfood release gates remain unmet.

Implemented so far:

- Separate documentation GitHub App adapter with RS256 App JWTs, S256 PKCE, fixed-origin requests, repository-limited read installation tokens, exact raw-body webhook signature verification, sanitized provider errors and rate-limit retry timing.
- Complete immutable-commit Markdown importer. It retains original Markdown/frontmatter, derives flat Sections and deep routes, supports strict root `_sections.json` and empty authored Sections, rejects duplicate JSON keys, unsafe paths, symlinks/submodules, MDX, binary text and colliding routes/folders. Complete deletion of a previously populated directory can produce an intentional empty manifest; a missing initial directory fails.
- Account/team-bound, ten-minute setup proof. Only a state hash and encrypted verifier are stored. Callback state is claimed once before exchange, stores an encrypted temporary user token and stable GitHub user ID, and cannot bind a team. Failure/expiry clears credentials. Repository selection requires current user repository administration and independently verified App installation access.
- Migrations `0009_docs_github_sources`, `0010_docs_github_fences` and `0011_docs_github_admission` add setup, binding, preflight, source-file, sync-job, webhook-receipt, adoption-plan, publication provenance, admission metadata and idempotent consent-receipt storage. Applied locally without resetting existing docs. Historical Git/bootstrap/retrieval publications are classified as automatic.
- Fourteen REST operations and fourteen canonical MCP tools share setup, preflight, connection, inspection, sync, pause/resume/disconnect and reviewed CMS adoption services. Manage operations deny API keys; final delegation requires the original interactive account and manage/publish permission. The MCP catalog contains 130 tools.
- Reviewed preflight stores an exact commit and full private manifest. Empty-source connection requires three explicit consents, rechecks current repository administration/App access, serializes against CMS saves, and records an idempotent receipt. Existing CMS docs require adoption; a preflight cannot replace them.
- Generation-fenced, leased inbound sync verifies stable owner/repository IDs, imports one immutable commit, captures publication membership and preserves newer local drafts. Activation requires a fresh branch-head check. Invalid candidates, unavailable branches and lost access retain the last live publication. Pause/disconnect invalidate pending work while retaining Git ownership.
- Raw callback/webhook infrastructure precedes JSON parsing. Signature checks use exact bytes; receipt and work admission commit together; duplicates enqueue once. Shared installations preserve independent workspace bindings, paused/disconnected intent, repository scoping and setup-token revocation.
- Durable receipts distinguish ignored, processed, and queued deliveries and link queued run IDs. Minimal payload retains only relevant ref/deletion/sender-ID/repository-ID/permission fields; commit prose, logins, signatures and raw bodies are excluded. Duplicate ignored deliveries remain ignored. Successfully signed unsupported events persist ignored receipts.
- Explicit publications and manual syncs share a serialized 20/hour workspace quota. Bootstrap, retrieval configuration, webhook, reconciliation and connection/adoption jobs are automatic. Validation, Git preflight and migration verification share 60/minute per workspace/account or API key, using hashed principal keys in existing rate-limit storage and retry timing in REST/MCP errors. Old validation counters are collected in bounded passes. Quota rejection cannot supersede admitted sync work; pause remains available.
- Unchanged live commits finish reconciliation without importing files, creating publications or embedding again. Retrieval changes reconcile canonical Git input rather than publishing unsubmitted local drafts.
- Reviewed CMS adoption captures a private 24-hour export with stable document IDs, exact public slugs, published flags, empty Sections and inert unknown metadata. Paginated text files are manually committed; verification compares canonical Markdown semantics and Sections at an immutable SHA. Original-account interactive activation rechecks branch head/local versions, preserves all drafts and the active immutable publication, and queues reconciliation without re-embedding equivalent content. Fresh setup can replace an expired temporary token; cancellation, stale edits, wrong files, expiry and noninteractive activation leave CMS content unchanged.
- Source dialog covers App authorization, accessible installation/repository selection, existing branch/directory, bounded export downloads, manual-commit verification, three explicit consents, and separate connection/observed/validated/live sync state. It supports reauthorization, pause/resume/disconnect and manual status refresh.
- Sensitive purge erases retained Git export/preflight bodies and imported copied prose while retaining source identity/path tombstones. Bounded cleanup expires setup credentials/plans, collects old snapshots/reports/receipts and completed export bodies, and retains active source files and adoption-equivalence metadata. Setup/adoption admission serializes at ten outstanding contexts under the shared settings lock. Git navigation honors `nav_title` and root document ordering.

Verification:

- The adapter/importer/setup/source/webhook/adoption/transport/retention suites have passing real PGlite and mocked-provider checks. Transport parity covers sanitized source/repository responses, private export pagination/cancellation, strict request fields, API-key rejection and interactive-only MCP finalization. Operation-policy coverage and the 130-tool catalog pass.
- Latest focused run: 40 tests pass across source (8), raw webhook (5), publication (20) and retrieval (7). No paid AI provider calls were used for these tests.
- The broad API run initially passed 489 of 493 tests. Three older validation/media expectations were updated for versioned writes and fail-closed media registration; their 33-test focused run passes. The remaining live-provider failure reconfirms accepted MEDIA-01 and is not counted as passing.
- Final local regression: **490 tests pass across 77 suites**, using `bun run test --maxWorkers=4 --exclude 'src/media/*.integration.test.ts'`. This excludes the three live MediaLit scenarios, not the local provenance checks. The sandboxed server-based run was interrupted; the authorized run with temporary loopback servers passes. Log: `/tmp/frontlit-d6-regression-bounded.log`.
- Latest post-adoption regression: **500 API tests across 80 suites, 95 dashboard tests across 21 suites, and 45 site tests across 14 suites pass**. The additional focused adoption expiry/reauthorization scenario also passes (six adoption tests total); it was added after the 500-test broad run. API, dashboard and site typechecks and `git diff --check` pass. API log: `/tmp/frontlit-d6-regression-bounded.log`.
- API typecheck and `git diff --check` pass.
- Post-admission broad regression: **504 tests across 81 API suites pass**, excluding the same three live MediaLit integration scenarios. The 61-way validation admission test accepts 60, isolates principals/workspaces and recovers after expiry. Two simultaneous manual syncs with one remaining slot admit one, retain that job after subsequent rejection, and allow pause. Five new D7 patch-planning tests were added after this broad run and pass separately. No additional paid AI calls were made.
- A subsequent publication test verifies replay of an admitted idempotency key when the shared quota is full, then rejects a new request without adding another admission. All 21 publication tests pass; this extra scenario is not included in the 504-test broad count. Final API typecheck and whitespace checks pass after the D7 planner addition.
- Visible Chrome follow-up confirms the original eight `nice` docs (seven live, one draft), the Source dialog and HTTP 200/private-no-store configured source response. The original GitHub sign-in tab is preserved for the administrator. No new setup or grant was created during this follow-up.
- Visible Chrome, through the logged-in workspace BFF, returns HTTP 200 with `{configured:true, source:"editor", status:"unconfigured"}` after the owner configured App credentials. The Source dialog renders “Managed in FrontLit,” the administrator/ten-minute disclosure, and “Authorize GitHub”; clicking it creates a setup proof and navigates to the new App's GitHub sign-in page. Credentials were not exposed. **External authorization/install/import/adoption browser smoke remains pending the owner's GitHub sign-in and direct App approval.** The user was asked to complete that step in the visible window; setup can be restarted if its ten-minute proof expires. Existing `nice` docs remain unchanged and editor-owned.

Remaining D6 work: remaining concurrency/permission/browser cases and external installation/callback/import/adoption smoke. External checks require disposable GitHub resources and the administrator's direct authorization and explicit delegated publication consent. No live GitHub binding or repository mutation has been performed by this checkpoint. Mocks do not establish provider behavior. D7 has begun with read-only captured patch planning; durable proposal/write/check/grant/UI workflows remain outstanding. This milestone is not declared complete.

The adapter follows GitHub's official [JWT requirements](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app), [installation token scoping](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), and [complete-tree recovery guidance](https://docs.github.com/en/rest/git/trees).

#### Platform-created setup PR, 2026-10-02

Visible Chrome MCP submitted the reviewed capture `gmig_e6xc02vn3tjqkg5pg0siugxa` in the `nice` workspace through Source → Create setup PR after destination/file/unpublished-draft disclosure. The GitHub App bot opened https://github.com/clbotdev/docs-site/pull/2 targeting main from `frontlit/docs-setup/gmig_e6xc02vn3tjqkg5pg0siugxa`, commit `620c4757333f9feda26033f379fbc6ba4e00247f`. GitHub's Files changed view shows ten captured files. Source reload retains the open PR link. A fresh browser read confirms editor ownership, draft version 54 and publication `pub_bvnwtge4rvbnlx3kzb1rvo3j` unchanged. No manual commit or outside-product PR creation was used.

Evidence: `/tmp/frontlit-docs-smoke/setup-pr-submitted.txt`, `setup-pr-github-diff.txt`, `setup-pr-reload.txt`. Local verification: 51 API tests/five suites (`/tmp/frontlit-docs-setup-wiring-tests.log`), 97 dashboard tests/22 suites (`/tmp/frontlit-docs-setup-web-tests.log`), API/dashboard typechecks and shared contract build pass. Transient failure backoff and revoked-session terminal status have real database tests; provider response-loss behavior still relies on adapter doubles.

The user was asked to review/merge PR #2. No merge or source activation was performed. Empty-repository support, merged-PR reconciliation and post-merge verification/adoption remain incomplete; D6/D7 are not complete.

A separate read-only live GitHub verification retrieved all ten blobs at the PR commit and compared both bytes and SHA-256 hashes with the stored immutable capture; every file matched, with no extra docs blobs. Main remains `bdb8583184d0e2daac4b1b36cd0730b2eb30367e`, equal to the worker's base SHA. Evidence: `/tmp/frontlit-docs-smoke/setup-pr-exact-capture.log`. This proves exact setup content and unchanged base at this checkpoint, not merge/activation.

#### User merge and platform reconciliation, 2026-10-02

The user merged setup PR #2. The background poll recorded merged commit `d99918d37fe1dd71e249fd2a0642ddd6769e0b33`, and headful Source → Verify merged setup successfully marked the reviewed capture verified. Snapshot: `/tmp/frontlit-docs-smoke/setup-pr-merged-verified.txt`; automatic merged-status snapshot: `setup-pr-merged-poll.txt`. The UI presents the three original-administrator activation disclosures; activation has been requested from the user and has not been performed by the agent.

Signed matching pull_request deliveries and publishing-branch push deliveries now wake bounded leased reconciliation; one-minute polling is the fallback. Database receipts showed a real main push but no recent pull_request event. Polling provided the observed merge status. No setup webhook event itself activates or publishes content.

Live testing exposed two adapter issues, both corrected: PR tracking needs the repository-scoped review token (Pull requests read); GitHub API 2026-03-10 removed merge_commit_sha from both PR list and detail. PR reads are pinned to supported 2022-11-28, with normal requests retaining 2026-03-10. Official reference: https://docs.github.com/en/rest/about-the-rest-api/breaking-changes. A fresh real adapter read confirms the exact merged SHA. Regression covers the read-version header, missing merge proof, mismatched PR identity, branch ancestry, expired setup tracking, signed wakeup, closed-unmerged and canceled-in-flight outcomes. 59 tests/four suites pass (`/tmp/frontlit-docs-setup-merge-final-tests.log`); API/dashboard typechecks pass. The initial unsuccessful unmerged-verification snapshot contains adapter errors and is not proof of successful rejection; domain tests cover that rejection. Empty-repository support and source activation/remaining D7 live gates remain open.

#### Empty-repository implementation, 2026-10-02

Migration 0023 is applied locally: genuinely empty setup preflights can store null Git SHA/manifest instead of fabricated commit provenance. Normal connection and activation reject an unvalidated null manifest. Plan/PR contracts disclose required initialization and expose the bootstrap SHA. Source supports reviewing a setup PR with an empty editor, acknowledges placeholder initialization where required, and displays retained bootstrap references after cancellation.

The adapter requires GitHub's explicit `Git Repository is empty.` verdict; missing access and generic 409 conflicts are not proof. It writes only the harmless `.gitkeep` on the default publishing branch. The worker's response-loss recovery requires matching plan marker/root commit/one exact placeholder path and bytes; foreign commits are rejected. All document/Section content remains in the subsequent PR. An empty editor plan contains only `_sections.json`.

Evidence: 54 adapter/admission/migration tests across three suites (`/tmp/frontlit-docs-empty-repo-final-tests.log`), including lost initialization acknowledgment, foreign commit, explicit consent, metadata-only capture, nonempty missing branch and revoked guard. Source regression passed in the preceding 83-test/four-suite run (`/tmp/frontlit-docs-empty-repo-tests.log`). Shared contract build, local migration application, API/dashboard typechecks and diff check pass. Live/headful empty-repository initialization has not been performed; it requires an accessible disposable empty repository. These tests do not satisfy that provider/browser gate. The last authenticated browser read still shows `nice` editor-owned, with no binding; source activation consent remains pending.

#### Live empty-repository preflight checkpoint, 2026-10-02

Visible Chrome created the private, genuinely empty `clbotdev/frontlit-docs-empty-smoke` repository without README/template/license and a separate empty FrontLit workspace, `Docs Empty Smoke` (`team_qtbey05dmpaiwu2jxll5a1ft`). Both documentation-list and source reads return 200; there are zero documents and no binding. The existing `nice` source was not switched. Repository evidence: `/tmp/frontlit-docs-smoke/d6-empty-repository-confirmed.txt`; workspace baseline: `d6-empty-workspace-baseline.json`.

The existing App installation only exposes `clbotdev/docs-site`. Adding the disposable repository is waiting on GitHub's visible **Confirm access** password challenge. The user authorized GitHub actions; GitHub's password confirmation must still be completed directly by the user. No empty-repository bootstrap, setup PR or merge has occurred. This remains an external configuration gate, not evidence that V49 is complete.

Independent headful smoke selected the nonempty `clbotdev/docs-site` with nonexistent publishing branch `frontlit-missing-branch-smoke` and clicked **Review setup PR**. The normal BFF returned 409 `GITHUB_REFERENCE_UNAVAILABLE`. Fresh source/list reads retain editor ownership, zero docs, no binding and no pending migration; a read-only database check confirms zero migration plans and bindings for the smoke workspace. No bootstrap or remote write was admitted. Evidence: `d6-nonempty-missing-branch-rejection.txt`, `d6-nonempty-missing-branch-response.network-response`, `d6-empty-workspace-after-missing-branch.json`.

This exposed obsolete dashboard guidance asking users to create an initial commit manually. The error now directs users to check access/select an existing branch, or use **Review setup PR** with the empty repository's default branch so FrontLit initializes it. Headful replay displays the corrected guidance (`d6-nonempty-missing-branch-corrected-guidance.txt`). Dashboard typecheck passes (`/tmp/frontlit-docs-missing-branch-web-types.log`). No services were started/restarted and no paid AI calls were made.

#### Metadata-only setup cancellation in visible Chrome, 2026-10-02

In the disposable empty workspace, **Review setup PR** for the existing accessible `clbotdev/docs-site`, branch `main`, separate directory `frontlit-smoke-empty-review` created plan `gmig_sd08leeut8hdpe3hbsvnogub`. The headful review discloses a private repository, zero unpublished drafts and exactly one `_sections.json` file. **Create setup PR** remains disabled before approval. The agent expanded Setup details and clicked **Cancel setup**, without approving or enqueueing writes.

Actual database assertions confirm canceled status, exactly one metadata-only captured file with no document ID, null verified SHA, no setup-PR row and no binding. Fresh list/source responses retain zero docs, editor ownership and no pending plan. Evidence: `/tmp/frontlit-docs-smoke/d6-metadata-only-plan-reviewed.txt`, `d6-metadata-only-plan-canceled.txt`, `d6-metadata-only-plan-cancel-integrity.json` (PASS), `d6-empty-workspace-after-plan-cancel.json`. This proves cancellation before remote work; cancellation during a provider request and real file-mismatch/correction remain separate gates. Existing `nice` documentation and its source are unchanged.

#### Setup mismatch, correction and proof invalidation, 2026-10-02

Before a runtime reset, visible Chrome completed the following live scenario in the disposable `Docs Empty Smoke` workspace. FrontLit created setup plan `gmig_e2det5uneh2wee6ptu0gpeyy` with one metadata-only file, `frontlit-smoke-empty-review/_sections.json`, outside `nice`'s configured `docs` directory. Capture hash: `2d57891ad67d6893224ebf6eba114b9af947f2bc7443eea08fd44fe60ae79b39`. Expected file: version 1, empty Sections. The reviewed FrontLit action created bot [setup PR #9](https://github.com/clbotdev/docs-site/pull/9), commit `fbfefad2800d1a056736d78af46f84e8f2b9471e`. The authorized visible GitHub session reviewed its one-file diff and merged it. GitHub showed no conflicts and zero checks at merge; this is not evidence of a successful PR validation check.

The authorized GitHub browser then changed only this smoke metadata on main, adding an unexpected empty Section. At commit `01d412d2e22e64a83dfe795ec9de6995ebc1718f`, automatic FrontLit verification returned 200 with `verified:false`, blocking diagnostic `MIGRATION_SECTIONS_MISMATCH`, and the unchanged capture hash. Plan/source reads retained planned status and editor ownership with no binding. Restoring exact content at `a727867b25499f640fecb411793d56c698f374e5`, then clicking **Check files again**, returned verified status without activation. This is an upstream-change test, not a manual export/commit setup flow; FrontLit created the actual setup PR. No workspace direct-commit capability was enabled.

Two issues were corrected. A failed check previously continued to say “Checking your merged setup,” with retry inside technical details. Source now shows “Your setup needs a correction,” explains the repair and exposes **Check files again** before the collapsed details. A fresh verification now clears previous verified status/SHA under the workspace lock before reading provider proof; failure cannot restore stale readiness on reload. Activation still independently requires a matching verified proof and current branch head. A new database regression verifies valid proof → changed metadata → failed recheck → planned/null proof, rejection of old-proof activation, and exact correction under the same capture hash.

The live browser repeated the mismatch after a successful verification. Actual GET returned `status:planned`, `verifiedSha:null` and the unchanged hash. Reload rendered the correction heading and visible retry, with no Finish setup action. Restoring exact content again at `d40781e4509e8d06b68356812205ce68a16558a2` and clicking retry returned verified status. **Cancel setup** then persisted canceled plan/PR status; the smoke workspace remained editor-owned, publication null and no binding. The fixture file is retained in the repository outside the managed docs directory; the merged PR/history remain in GitHub.

A read-only final check showed `nice` had advanced its active publication pointer to `pub_244ao3s11giyaf76lpe8toog` from `pub_ua2jl9ukinqq8dg42tfnse8d` while syncing the newer repository commits. Do not claim its publication pointer was unchanged. The final comparison of canonical docs/routes across those publications was interrupted: the runtime reset, `/tmp` artifacts disappeared, Chrome became a blank session and database/API/web/sites listeners vanished. Services were not restarted, per the user instruction. The detailed live results above are recorded observations, not fresh provider verification after reset. Final live integrity recheck remains open.

Fresh post-reset verification passes **32 tests across two setup suites**, both API/dashboard typechecks and `git diff --check`. Earlier temporary browser artifacts named `d6-mismatch-*`, `d6-failed-recheck-*` and `d6-correction-retry-*` were lost; no claim is made that they are still available. No paid AI calls were made.

#### Fresh GitHub-only integrity check after reset

The configured App permits a read-only provider check even while local services are unavailable. Real GitHub responses prove that the full `docs` subtree at current main `d40781e4509e8d06b68356812205ce68a16558a2` is identical to the pre-smoke main `d7071daa4061ba467bed1f10cabc982aebcbbbd9`: all **24 entries** retain path, mode, type and Git SHA. The adapter rejects incomplete tree responses, and the comparison asserts a nonempty subtree. Canonical source bytes within the configured directory are therefore unchanged by the external smoke-directory commits. GitHub independently confirms setup PR #9 is closed/merged, exact reviewed head `fbfefad2800d1a056736d78af46f84e8f2b9471e`, merge `4b23a1bf8b71238cd4b83aa1e64a70c0a23b5f97`. Assertions pass. No repository mutation or AI call was made during this check.

This resolves repository-tree preservation and freshly confirms the merged PR; it does not resolve the outstanding database publication-content comparison or visible public serving checks. The database returns ECONNREFUSED, ports 3000/3002/4000 are not listening and Chrome contains only about:blank. The user has been asked to restore the user-owned services; they were not started by the agent. The same environment blocker has been revalidated across consecutive goal turns. Remaining live milestones require that environment, interactive authentication and, for the empty repository, installation access confirmation.

#### Services restored and final integrity verified, 2026-10-02

The user started the local services. API startup initially failed with ECONNREFUSED at 127.0.0.1:5433: Docker Desktop's Linux engine was not running, so PostgreSQL was unavailable. No API code change or agent service start was needed. After the user restored Docker/local infrastructure, the actual `frontlit-local-postgres-1` container is healthy and ports 5433/4000/3000/3002 listen.

Fresh database assertions resolve the interrupted setup-smoke comparison: pre-test publication `pub_ua2jl9ukinqq8dg42tfnse8d` and current `pub_244ao3s11giyaf76lpe8toog` each contain ten documents, with identical document IDs, routes and canonical snapshots after excluding draft-version counters. No title, slug, body, excerpt, featured image or metadata differences were found. Canceled plan `gmig_e2det5uneh2wee6ptu0gpeyy` remains canceled; the disposable workspace is editor-owned, with no publication or binding. Together with the fresh unchanged Git subtree proof, this verifies preservation across the smoke-directory commits without claiming that the publication pointer stayed unchanged.

Fresh visible Chrome retains the dashboard session after visiting localhost:3000. An isolated public context renders the companion page; clicking **Read the deep guide.** opens the renamed eight-folder page with its expected heading. The old deep route still renders 404. Anonymous API reads with credentials omitted return the ten-doc active snapshot and 404 for the old route; the isolated context has no cookies.

The prior local-environment blocker is resolved. The empty repository's installation page still requires GitHub's interactive Confirm access password check; the user was asked to complete it directly while other smoke continues. Remaining D6/D7 acceptance/provider/operator gates remain open. No paid AI calls or agent service starts occurred.

<a id="historical-d7-evidence"></a>

### 31.8 D7 proposals/checks/recovery — 2026-10-01 through 2026-10-03

> Historical checkpoint record. Use §27 for current implementation and §29 for current status.

V16 live source-read outage checkpoint, 2026-10-03: headful Source Sync now admits normal manual job `gsync_0pe9tosbyj8xcq95ots28ta7`. A one-off production adapter/worker uses actual App access and discards GitHub's successful branch-read HTTP 200 response, injecting a transient network failure without changing repository contents, schedules or job rows. Source shows queued/GITHUB_UNAVAILABLE with the last-good live SHA retained; fresh isolated public reload renders the original API-key guide. Normal API scheduler retries at the existing due time and activates the same job on attempt 2, clearing job/binding diagnostics and reusing `pub_1vpjc555cstq9sfm6iu83dvp`. Exact SHA-256 of all ten canonical memberships/revision IDs/routes/snapshots is unchanged, publication count remains 33 and live SHA remains `a67a574d4944564bfb81ede9b147cc78f9f2ba76`. Initial attempt was claimed by the normal worker before fault injection and is not outage proof; only the second, fault-confirmed attempt satisfies this scenario. No Git writes, service starts or AI calls.

V28 live check-delivery checkpoint, 2026-10-03: an actual GitHub App API rerequest of publication check `110976122304` emits signed `check_run/rerequested` receipt `2f2ff0f2-be93-11f1-860d-dcab850b8015`, reopening normal report job `gcheck_0dvbsizyi1le8ufxou1trpr5`. A one-off production check worker uses real App access and discards the successful HTTP 200 check-lookup response, simulating network response loss without forging a webhook or changing schedules. Headful report shows reporting/GITHUB_UNAVAILABLE while retaining published outcome, ten docs, commit and publication. Normal scheduler retries after its original backoff and delivers on attempt 4 with no error; fresh provider query finds exactly one matching completed/success check with the original ID. Active publication `pub_1vpjc555cstq9sfm6iu83dvp` and live `a67a574d4944564bfb81ede9b147cc78f9f2ba76` remain unchanged. Headful report shows delivered after recovery.

Stale synthetic-merge retry correction: the live old PR #1 repeatedly failed current-parent validation and spawned a successor check every minute. Validation failures now settle superseded without self-enqueue; a newer webhook or periodic discovery can admit a fresh check. A captured result that changes during delivery still schedules fresh validation. The live queued stale job settled normally with no successor. All 22 check-worker/reconciliation/publication-check tests and API typecheck pass.

Discard source-mode correction, 2026-10-03: live cleanup exposed that a successful Git discard response omitted `source`, briefly changing the editor action to Publish changes despite an unchanged Git binding. Discard responses now carry the authoritative source for restored and non-restorable drafts. Regression assertions cover published/private Git imports, removed imports and editor-mode restoration; 44 authoring/source tests and API typecheck pass. A fresh headful title edit/discard without reloading retains Create pull request and Git guidance; the test draft is restored, with no new PR or publication.

V21 live response-loss checkpoint, 2026-10-03: visible Chrome saves/submits guide version 6, proposal `gproposal_a8qwtbe9q9evydl6h8dcgb8y`. A one-off fault-injection worker uses the production adapter/queue, live App credentials, normal authority checks and actual GitHub writes; its fetch wrapper discards only the successful PR-creation HTTP 201 response after GitHub accepts PR #13. It records no credentials. FrontLit retains commit `985eeef916c3bf9e9a426d446dfa506f49c4a6a9` and Writing/GITHUB_UNAVAILABLE with no PR number. Without altering due times or database rows, the user-owned API scheduler retries and discovers that same PR/commit on attempt 3; visible report shows Open/#13 and clears the error. Fresh GitHub query finds exactly one matching PR. Headful cleanup closes it unmerged and normal editor discard restores the guide to version 7. Main/live remains `a67a574d4944564bfb81ede9b147cc78f9f2ba76`, active publication remains `pub_1vpjc555cstq9sfm6iu83dvp`. This is actual remote response-loss recovery, not a provider double; local tests cover the other mutation boundaries. No services started, schedules advanced, or AI calls made.

Recovered-sync reporting correction, 2026-10-03: an actual transient GitHub failure recovered into an active publication but retained its old job diagnostic. Successful unchanged reconciliation and successful manifest capture now clear that diagnostic and its report, so the Source screen stops displaying a resolved failure. Two recovery regressions cover unchanged and changed commits through the public source projection and accepted publication. All 36 source tests and API typecheck pass. Historical failed runs remain recorded; no live job rows were edited to conceal their errors.

V30 live checkpoint, 2026-10-03: the updated AI credential passes the headful before/after/rejected-update citation triplet with three successful calls (3,741-token budget increment). FrontLit-created PR #12 publishes the captured guide edit; a subsequent duplicate-route candidate fails without changing accepted citations. Both temporary changes are cleaned up: exact configured Git tree and ten canonical snapshots/IDs/routes restored, no active restrictions, clean main/live `a67a574d4944564bfb81ede9b147cc78f9f2ba76` / `pub_1vpjc555cstq9sfm6iu83dvp`. See [D5 evidence](#historical-d5-evidence). D6/D7 remain open at other gates.

V33 live checkpoint, 2026-10-02: headful withdrawal of non-indexed companion `doc_ilc2e3cfkz2n292w1yebevvs` creates `sup_uo751mfqi78tjkhekfqpniku`, policy epoch 7. An authorized headful GitHub fixture edit renames its frontmatter route; normal signed push/import activates `eb6328141b1489b98992182da9fc0994793010ca` / `pub_vwq40djcj2w3h6mbb1fm695q`. Imported file retains the same document ID; both original/renamed URLs return 404 and the anonymous snapshot has nine docs, excluding that identity. GitHub cleanup restores exact original blob `164e105465b7c49d918f58439f3301a086e005ae` (222 bytes), main/live `ccc28ec22a9859b6e1bff4e18098cacff1f4bfc8` / `pub_vdhv857xgc49abso3821lazm`; ten canonical snapshots/IDs/routes match before, excluding draftVersion. Browser release review captured at epoch 7 is invalidated by a second same-doc restriction `sup_2rehpfn4iuix6zdabaam657m` at epoch 8; release returns 409 with both active. Fresh reviewed release clears only the first at epoch 9 and public route stays 404. Fresh review releases the second at epoch 10; original page returns 200, renamed test route remains 404, ten docs return. No paid AI calls for this scenario; direct GitHub user fixture edits do not change FrontLit's directCommit:false grant. D6/D7 remain open at other gates.

V18 live failure checkpoint, 2026-10-02: visible Chrome created/merged disposable PR #11 with only a temporary Markdown file duplicating the companion route. Actual merged commit `0b5212565fe67e0b0c1324142e5e7136bc49e324` failed import before publication creation. Source names both conflicting paths with `DUPLICATE_ROUTE`; observed SHA advances while validated/live SHA and publication remain at `0c4ad4a659d7869e82cc5d95351832df176a4dd2` / `pub_8r3w653z2t55mq664xwvsygo`. Anonymous before/after snapshot projections exactly match all ten identities/routes/revision IDs/hashes and Sections. The normal worker delivers failed GitHub publication check `110962290127`, inspected in both headful GitHub and the private FrontLit report. Headful cleanup deletes only the fixture; clean main `cebe1e72c32d802a7836ce8ba0aa55c05b47550d` has an exact 24-entry configured docs tree match to pre-test. Normal sync reaches that clean SHA and `pub_htzc9o7lb3w3kb893u4cs2og`; database comparison confirms ten identical canonical snapshots/IDs/routes excluding draftVersion. No paid AI calls or service restarts. D6/D7 remain open at other gates.

V29 live checkpoint, 2026-10-02: headful GitHub created disposable unsupported-MDX PR #10. After the user corrected missing Pull request/Check run subscriptions, actual signed PR events scheduled normal validation. Initial stale synthetic merges were rejected after main advanced through V18 cleanup; a headful fixture-only branch update produced head `e853c001b42a636f77ad50ab16c3a6d409a006fc` and immutable merge `74845d9df505fb005cdaa2841b0421197d6fa6e8` against current base `cebe1e72c32d802a7836ce8ba0aa55c05b47550d`. Normal check `gcheck_ffyzi99gtjbap7i8rmj3eeyx` delivered GitHub failure `110965900660`; both headful reports show `UNSUPPORTED_NODE` for `docs/d7-unsupported-smoke.mdx`. Headful GitHub Re-run caused real signed delivery `91618670-be8c-11f1-881e-1e7f10641e84`, queued `gcheck_2381837ix02aco3ltw8k1zr5`, and delivered check `110966430428` with the same expected failure and no delivery error. Browser closed PR #10 unmerged; fresh provider/database reads confirm main/live SHA and `pub_htzc9o7lb3w3kb893u4cs2og` unchanged. No paid AI calls. Self-hosted setup instructions now include these operational requirements; docs generation/types and production export pass after fixing extensionless parent/child LLM export collisions with `.md` filenames. D6/D7 remain incomplete at other acceptance gates.

Post-smoke cleanup/report evidence: version 17 was discarded through the normal editor confirmation after preservation was proved; the D2 fixture returns to its published original title, with no new Git write. `d7-editor-cleaned-after-smoke.txt` records the visible result. PR #5 publication check is delivered (`110871984590`) for publication `pub_s9n9tvgy4kdqgikcxlc5z5js`. Closed PR #4's terminal check is delivered (`110871917061`); closed PR #3's terminal check also delivered. The older unrelated user-created PR #1 still exposes a stale provider synthetic merge after the base advanced; current-head validation deliberately rejects it and retries at least 60 seconds later. It is not merged or modified by this smoke. Provider stale-merge recovery remains an open evidence gate, rather than a claimed passing check.

Historical PR-base correction and closed-PR browser smoke, 2026-10-02: GitHub PR #1 reports an original base SHA while its synthetic merge's first parent has advanced. Validation now captures the publishing head, proves both synthetic merge parents against that head/current PR head and rechecks provider candidate/head stability. Delivery and periodic reconciliation use this proven base rather than historical PR base metadata. Any changed/stale merge queues fresh validation with the existing retry deadline instead of an immediate hot loop. Closed PRs still require stable closure and exact candidate hashes; the closed diagnostic takes precedence over unsupported-fork diagnostics. Regression: 38 tests/five suites, API typecheck, diff check pass (`/tmp/frontlit-docs-pr-base-tests.log`, `pr-base-types.log`). Read-only provider evidence: `d7-pr1-current-provider.json`, `d7-pr1-merge-parents.json` in `/tmp/frontlit-docs-smoke`.

Headful Chrome created product PR #4 with captured draft version 14, saved newer version 15, then closed the PR in GitHub without merging. FrontLit observes Closed, retains the newer title/draft, and the isolated public page and active publication remain unchanged. Evidence: `d7-pr4-closed.txt`, `d7-pr4-proposal-closed-ui.txt`, `d7-pr4-newer-draft-preserved.txt`, `d7-pr4-closed-public-unchanged.txt`. The document is an existing disposable D2 smoke fixture. The complementary captured-merge/newer-save smoke also passes in the checkpoint above.

Closed-PR retry correction, 2026-10-02: the live smoke exposed repeated `GITHUB_PR_CHANGED` jobs for stable closed PRs whose historical base SHA differs from the current branch. Validation now requires the current branch base only for open/unmerged candidates, while retaining exact provider candidate stability checks. Delivery requires closure state to match the captured terminal diagnostic; stale open results are still discarded. Regression passes 36 tests/five suites and API typecheck (`/tmp/frontlit-docs-closed-pr-check-tests.log`, `/tmp/frontlit-docs-closed-pr-types.log`), covering merged/unmerged closure, base advance and closure before delivery. Production workers delivered the terminal closed reports for PRs #3 and #4 with large remote IDs and no errors; `d7-check-recovery-final.json` records fresh evidence. No leases/backoff were edited and no services were started.

Signed OAuth transport checkpoint, 2026-10-02: `oauth-transports.test.ts` uses actual Better Auth signing, local JWKS HTTP retrieval, real auth/team/operation middleware and the actual MCP SDK routes. Three integration scenarios cover positive idempotent REST/MCP setup admission, forged/expired/wrong-issuer/wrong-audience tokens, MCP discovery challenge, insufficient publish scope, revoked consent and read-only source discovery restrictions. GitHub remains doubled and tokens are minted through the test signer; interactive authorization-code issuance and live OAuth Git writes are still open. Final OAuth/transport regression: 13 tests across two suites (`/tmp/frontlit-docs-oauth-real-transports-final-tests.log`). Source/setup/OAuth regression: 56 across three suites (`/tmp/frontlit-docs-setup-resume-final-api-tests.log`). Dashboard: 97 across 22 suites; API/dashboard typechecks and shared contract build pass. These overlapping scopes must not be summed. Fresh Chrome restores the merged/verified setup from server state, still awaiting original-administrator reconnection/activation; no user-workspace write or additional paid AI occurred.

Current checkpoint, 2026-10-02: platform-created setup/adoption PRs are operational. Headful Chrome created bot PR #2 in `clbotdev/docs-site`; the user merged it, background reconciliation recorded the merge, and Source verified the exact captured ten-file content at `d99918d37fe1dd71e249fd2a0642ddd6769e0b33`. Fresh Chrome still shows editor ownership/no binding pending original-administrator source approval. The historical manual-export, later-scope setup PR and separate agent-export consent statements below are superseded. Current [D6 evidence](#historical-d6-evidence) records 21 passing setup/reconciliation tests, ten transport tests and API typecheck; authentication is mocked in the transport harness, so live OAuth bearer verification remains open. Actual connected-source edit/check/publication and disposable empty-repository browser scenarios remain required. D6/D7 are incomplete.

Status on 2026-10-01: **in progress**. Full Git authoring is not release-ready.

Implemented:

- Read-only captured patch planning checks selected source hashes against current publishing head. Unrelated upstream changes are preserved; overlapping changes and occupied destinations return `UPSTREAM_CHANGED`. Only selected Markdown becomes edits; moves capture deletion and addition together. Unsafe paths, binaries and workflows are rejected. The complete candidate passes through the normal importer. Blob reads/tree sizes are bounded. No Git writes occur.
- Migration `0012_docs_git_draft_sources` adds server-owned draft provenance and is applied locally. Private contracts expose original commit/path/hash and proposed path; requests accept only `gitSourcePath`, never client-supplied bases. Editor-owned docs retain null provenance.
- Git drafts save through normal versioned REST/MCP authoring. First local edits capture imported bases; subsequent saves retain them. New drafts require safe Markdown paths within the configured source root. Missing/unverifiable legacy bases fail without overwriting content. Saves do not change live membership or allow database-only Git publication.
- Import initializes clean draft provenance and preserves dirty content/bases through upstream changes. Path-only moves are preserved and reported as unpublished changes despite unchanged content hashes. CMS adoption adds verified provenance while preserving prose, versions, IDs and the active publication.
- Client API wrappers accept source paths. Creation/path-edit UI is implemented at the scheduler checkpoint below; proposal UI and positive connected-source browser verification remain outstanding.
- Migration `0013_docs_github_grants` adds durable minimal capability-consent receipts and is applied locally. `POST /content/documentation/github/capabilities` and canonical `grant_documentation_github_capabilities` share the grant service; finalization requires the original setup account's browser session, current manage/publish authority and fresh repository-admin/App-access verification. PR and direct-commit consents are separate, initially unchecked. App permission approval alone leaves workspace writes disabled. Grants increment connection/grant generations and invalidate pending work while preserving paused intent and live content. Temporary credentials are erased after acceptance. Replaying an old approval after revocation returns its receipt without restoring rights.
- Source UI supports fresh permission authorization, target disclosure, independent PR/direct consent, removing writes with both options unchecked, cancellation/restart and status refresh. Expected generations and a stable idempotency key survive the callback in workspace-scoped session storage. Installation tokens remain repository-limited and request only read, review, proposal, direct-commit or check permissions for their purpose. This extends the catalog to 131 tools. Real upgrade browser/provider smoke is pending.
- Migration `0014_docs_github_proposals` is applied locally. Domain admission captures immutable private Markdown and server-owned source bases, exact document versions, connection/grant generations and credential references. Idempotency, transactional one-open-proposal-per-document enforcement and the shared 20/hour work quota are implemented. The admission checkpoint originally had no transport or writing entry point; later additions are described below.
- Credential helpers resolve verified session/API-key/OAuth actors into references without retaining raw credentials. Revalidation checks current membership, publishing authority, session/key revocation, OAuth consent/client state and expiry. The writing worker invokes this revalidation before each external mutation. Sensitive purge clears proposal bodies/diagnostics and closes local work without changing GitHub. Bounded retention removes terminal proposals after 30 days and preserves open proposals.
- Git adapter now supports selected Markdown patch trees based on an existing tree, single-parent proposal commits, deterministic proposal branches, PR creation with summary/report links and non-force publishing-branch updates. Each mutation requires a fresh guard callback. The local proposal-write guard checks writing status, current lease, connection/grant generations, current credential, selected capability and document serving restrictions, and renews the lease. Direct updates verify the commit's single parent and reread the expected head before `force: false`. Provider conflict/rule errors remain sanitized. PR recovery includes closed PRs and validates exact branch/base/repository identity before returning minimal references. The later callable writing worker invokes these methods; Preparation and writing are now scheduled as described below; live provider verification remains outstanding.
- The proposal preparation worker now atomically claims queued work or an expired validating lease, reads the complete tree at one immutable current publishing head, plans the captured patch and runs normal whole-candidate validation. It renews only live matching leases and rechecks credential/grant/source/restriction authority under the documentation lock before recording the prepared base and deterministic branch. Concurrent later saves do not change captured input. Conflicts and terminal failures release one-open-document ownership; transport/rate-limit retries retain the same capture and bounded backoff. Preparation performs no Git writes; the dispatcher described below now schedules it.
- Migration `0015_docs_git_write_recovery` adds persisted tree references and minimal source/target paths on captured document links, backfills existing captures and is applied locally. Those path references survive proposal-body purge; Merged move identity and tombstone handling are implemented at the application checkpoint below; external verification remains pending. The callable write worker revalidates the complete candidate, selects a newer initial base only if captured file hashes still match, persists tree/commit references, uses fixed explicit automation commit metadata for response-lost retries, recovers deterministic branches/PRs and includes closed PRs without reopening them. Every mutation invokes the current local authority guard; App access and purpose-scoped write permissions are also checked. Direct commits verify their parent and use non-force updates; response-lost commits already included in a newer head are detected by immutable ancestry checks. Successful direct writes queue normal branch sync and remain `merged` pending publication. The dispatcher described below now schedules these write entry points; REST/MCP admission is described below. No live repository writes occurred.
- `POST /content/documentation/github/proposals` and `GET /content/documentation/github/proposals/:proposalId` now share the domain service with canonical `submit_documentation_github_proposal` and `get_documentation_github_proposal` MCP tools. Submission resolves verified session/API-key/OAuth contexts to current credential references; read and publish policies are distinct, and publication scope alone cannot replace human permission. MCP API-key contexts carry the verified key ID. The catalog is now 133 tools. Private responses include captured version/path metadata and remote references, never captured Markdown or credentials; serving restrictions redact titles/diagnostics, and purged captures retain minimal version/path receipts. Another team's proposal is indistinguishable from a missing one. Typed dashboard wrappers are available; proposal UI and worker scheduling are still outstanding.

- Five patch-planner tests pass for upstream conflicts, whole-candidate validation, atomic moves, untouched bytes, duplicate selections, safe paths and removals.
- Seventeen inbound-source tests pass, including three genuine Git draft/path cases and five capability review cases covering explicit authority, missing App permissions, stale reviews, independent direct mode, concurrent pause and permission loss during external verification. Six adoption tests preserve document fields apart from added provenance. Seven adapter tests include purpose-specific token scopes; four transport tests include strict consent and REST/MCP browser-only grant denial. Policy coverage and the 131-tool catalog pass.
- Six proposal-admission tests cover immutable captures, idempotency, concurrent open-proposal admission, stale versions, removals, quota and sensitive purge. Four credential tests cover sessions, membership replacement, API keys and OAuth claims at the already-verified transport boundary. These are local domain tests, not positive real OAuth transport/write evidence. Retention also proves an old open proposal survives while an old closed proposal is deleted.
- Write-guard checkpoint: the GitHub regression suite passed **78 tests across 11 suites**, including localhost REST/webhook tests run outside the sandbox after its listener policy rejected the first run. After adding PR recovery, the final focused adapter/admission run passed **22 tests** (14 adapter, 8 admission/authority), and API typecheck and `git diff --check` passed. Cases include changed branches, different commit parents, provider race rejection without force, credential revocation, stale leases/grants, paused sources, later local edits, purge of in-flight work and recovery of closed/ambiguous/wrong-repository PRs. Log for the 78-test checkpoint: `/tmp/frontlit-d7-write-guards.log`. Later preparation/writing/full API runs below supersede this checkpoint's scope.
- Latest preparation checkpoint: **85 GitHub tests across 12 suites pass**, including six new worker tests for concurrent claims/expired-lease fencing, preserved immutable captures and later drafts, selected upstream conflicts, invalid unselected routes, concurrent pauses and rate-limit retry of the same proposal. API typecheck passes. Log: `/tmp/frontlit-d7-preparation-regression.log`. The source/grant/adoption REST and webhook suites also pass in this run; this is local provider-double evidence, not a live GitHub write test.
- Writing checkpoint: **96 GitHub tests across 13 suites pass**, including nine writing-worker tests covering deterministic selected writes, response-lost commit/branch/PR progression with reused tree references, closed-PR recovery, later drafts, direct-write ancestry recovery, changed/foreign branches, fresh initial-head preconditions and credential revocation between mutations. Two adapter cases verify stable explicit commit metadata and trustworthy immutable comparison bases. API typecheck and diff checks pass. Log: `/tmp/frontlit-d7-writing-regression.log`. The provider doubles exercise domain recovery; live branch-rule, network-response-loss and GitHub commit guarantees still need external evidence.
- Latest full API regression: **556 tests across 86 suites pass**, excluding `src/media/*.integration.test.ts` as in D6. The three live MediaLit scenarios remain external/accepted-provider gates, not passing evidence. Dashboard's last unchanged-code checkpoint passes 95 tests across 21 suites. API log: `/tmp/frontlit-d7-regression-bounded.log`.
- Proposal-transport checkpoint: **100 GitHub tests across 13 suites pass**, including REST/MCP API-key submission/status parity, idempotent replay, stale versions, strict input, revoked credentials, cross-team status denial and pre-purge/purged status redaction. The policy/catalog focused run passes 15 tests with the 133-tool catalog. API and dashboard typechecks pass. Log: `/tmp/frontlit-d7-proposal-transports.log`. The 556-test full API run above predates these transport additions.
- Visible Chrome smoke uses the real signed-in `nice` session: missing proposal GET returns private/no-store/noindex `404`; empty submission returns `400 INVALID_REQUEST`; a valid version-8 selection of `Manual Test 1` resolves the current browser credential and returns `409 SOURCE_REQUIRES_GIT` because this workspace remains editor-owned. Seven live/one draft and zero unpublished-change docs remain visible. The stored connection-refused page recovered through normal navigation with all dev listeners healthy; no server restart, publication or proposal admission occurred. Real Git submission/write/upgrade/installation smoke remains pending.
- API/dashboard typechecks, contract build and `git diff --check` pass.
- Visible Chrome's `nice` workspace returns HTTP 200 for `Manual Test 1`: source `editor`, null Git provenance, draft version 8. No Git binding was configured. A transient connection-refused page recovered after normal navigation with the server still running. Real Git draft/PR UI smoke is unverified.
- No additional paid AI usage or GitHub repository writes occurred.
- Visible Chrome follow-up confirms seven live/one draft documents, configured App detection, an unbound editor source (HTTP 200), and the unchanged Source authorization dialog. Snapshot: `/tmp/frontlit-docs-smoke/d7-grant-editor-compat.txt`. The earlier GitHub sign-in tab was subsequently closed; these checks do not prove the new connected-source grant UI or provider grant behavior.

Remaining: end-to-end recovery audit; external direct/merged publication reconciliation audit; validation/publication checks and report retries; complete PR validation/check/base-change reconciliation; external merged-move/tombstone and captured-version verification; complete proposal UI and positive Git source-path headful/external smoke; positive machine OAuth submission/revocation transport evidence. Cancellation after a remote side effect also needs read-only remote-reference reconciliation; no retry may restore revoked write authority.

The token adapter follows GitHub's official [repository and permission scoping guidance](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

Real provider follow-up (2026-10-01): the user's Funnel forwarded HTTPS to port 5000 while the API listened on 4000, causing HTTP 502 before the callback reached FrontLit. Restarted only that foreground Funnel as `tailscale funnel --bg --yes 4000`. Reload then reached the API with an expired-setup response. Fresh Source authorization completed OAuth in visible Chrome and returned to FrontLit's repository picker. No accessible installation is available yet; GitHub's CodeLit installation page required organization approval and displays read-only code/metadata permissions. Repository/branch selection and installation approval remain user prerequisites; no repository writes, adoption or write delegation were performed. Mocks do not establish real App/branch-rule behavior.

Scheduler/source-path checkpoint (2026-10-01): the publication dispatcher now runs one bounded proposal preparation and write pass. Preparation releases its successful lease so writing can claim immediately; an integration test proves an admitted capture reaches an open PR without a lease-expiry delay or duplicate second-pass writes. The GitHub regression passes 101 tests across 13 suites (`/tmp/frontlit-d7-dispatcher-regression.log`); API/dashboard typechecks and all 95 dashboard tests pass. Git-owned new drafts now accept a Markdown source path, and provenance-backed editor settings stage path moves. Visible Chrome confirms the editor-owned new-doc dialog still shows only title/section and can be canceled without creating content. Positive Git path UI smoke still requires a connected source. A fresh public callback probe returns FrontLit HTTP 400 `GITHUB_SETUP_EXPIRED`, confirming Funnel forwards to the live API on 4000 rather than returning 502. No repository writes or AI requests occurred.

PR review checkpoint (2026-10-01): the bounded dispatcher now also claims one due open PR with a lease and polls it using a single-repository token with Contents/PR read permissions. Current provider state updates closure/merge status; closure releases ownership without discarding the local draft, while merging queues normal publishing-branch reconciliation and remains `merged` rather than claiming successful publication. Actor credential revocation does not prevent read-only observation. Missing/retargeted PRs retain pointers and ownership; review faults retry with rate-limit timing, retain candidate warnings and clear after recovery. Concurrent cancellation cannot be undone. Signed PR webhook deliveries transactionally make corresponding open review work due, do not trust stale closure state, and queue current branch sync for merges into the configured branch; they retain no PR titles/bodies.

The latest GitHub regression passes **110 tests across 13 suites**, including seven review cases and two PR webhook cases. API typecheck and diff checks pass. Log: `/tmp/frontlit-d7-review-regression.log`. Browser verification after these changes is limited: visible Chrome's cached `nice` list still renders seven live/one draft, but fresh source/status API requests return 401. The headful window is now on sign-in with a return path to documentation; reauthentication was requested. This is not passing authenticated or live GitHub review evidence. No live Git writes or paid AI calls occurred. The later application checkpoint implements stable source identity across connection-generation changes, successful-publication mapping and move/tombstone identity locally. Canceled-write remote-reference discovery, Checks API reporting and external verification remain explicit D7 gates.

Merged application checkpoint (2026-10-01): migrations `0016_docs_proposal_application` and `0017_docs_git_move_identity` are applied locally. Proposals retain stable installation/repository/owner/branch/directory identity and the actual merged commit SHA (direct writes use their own commit; PRs require the provider merged SHA). Import proves inclusion in its exact publishing head using immutable ancestry, including squash/rebase results. Sync also discovers a merged open PR before importing, closing the webhook/review ordering race. A pending proven merge prevents the unchanged-head shortcut from skipping application. Stable source identity permits read-only review after capability-generation changes while rejecting a changed target; legacy missing identity is limited to its original generation.

Recognized moves and newly created Git files retain the captured document ID. One current path per document is enforced while historical paths remain identity tombstones. Accepted Git review edits replace only the unchanged captured draft; newer drafts remain intact and dirty. Captured link versions persist unchanged. Candidate context names proven merged proposals; successful activation atomically marks only those proposals `published` and releases ownership. A failed candidate or merge absent from the publishing head does neither. Removed files leave a recoverable local draft. Purged proposals retain minimal source/target paths and merge proof, so a moved target cannot acquire a new identity after copied bodies are erased. Local regression passes **119 GitHub tests across 13 suites** (`/tmp/frontlit-d7-application-regression.log`), including seven application cases and two additional read-only source-identity cases. The final full API regression passes **581 tests across 86 suites**, excluding the three recorded external `src/media/*.integration.test.ts` provider cases. API typecheck and diff checks pass. Final API log: `/tmp/frontlit-d7-application-full-api-final.log`. The final focused source run passes all 26 tests (`/tmp/frontlit-d7-application-final-focused.log`), including legacy merged-SHA recovery and rejection of a historical path reintroduced alongside its current mapping. Final code uses an exact captured-version fence and renews the sync lease during proposal inclusion reads. The earlier 119-test GitHub checkpoint predates those last two cases. Real provider/browser application evidence remains pending; visible Chrome is still on sign-in. No live Git writes, source adoption or paid AI requests occurred.

The merged SHA interpretation follows [GitHub's pull-request API semantics](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request). Remaining work includes canceled/response-lost remote-reference discovery, complete PR validation/base-change checks and independent check retries, proposal/report/history UI, positive OAuth transport evidence and external/operator acceptance audits. D7 remains incomplete.

Visible public-site follow-up: `http://nice.localhost:3002/docs/manual-test-1` renders one “Manual Test 1” H1, returns HTML/API 200 and resolves the unchanged active publication `pub_xv80d5tgslxwszwkzyl3ltmj`. Public API sends `Cache-Control: no-store`. The development HTML response sends Next's `no-cache, must-revalidate`; production no-store evidence remains the separate D3 production smoke, not a claim from this dev check. The unpublished `/docs/chandi-man` route and public lookup both return 404 with no-store on the API. Snapshot: `/tmp/frontlit-docs-smoke/d7-application-public-doc.txt`. Admin reauthentication remains pending in visible tab 1. This public compatibility smoke does not establish live Git merge/application behavior.

Proposal UI/history checkpoint (2026-10-01): private `GET /content/documentation/github/proposals` and canonical `list_documentation_github_proposals` share docs-read authorization, stable descending keyset pagination and current restriction/purge redaction. The contract exposes the actual merged SHA; the catalog is 134 tools. The dashboard has exact-version selection, path/removal review, PR-default submission, separate explicit direct-commit confirmation, retained idempotency keys for retries, paginated history and a private proposal report. Selection loads all documentation pages rather than silently stopping at 500. Git sources use proposals instead of editor-only publication review while retaining emergency withdrawal controls. Reports clear stale data on errors and fence data by workspace, proposal ID and current read permission; workspace switches remount the proposal dialog.

Verification for that checkpoint: the history/transport/policy regression passed 136 tests across 16 suites (`/tmp/frontlit-d7-proposal-ui-regression.log`); dashboard tests passed 95 across 21 suites, and API/dashboard typechecks passed. Those results precede canceled-write recovery below. The visible Chrome callback connectivity probe reaches FrontLit HTTP 400 rather than Funnel 502. GitHub's `[Local] FrontLit` installation page shows a pending CodeLit request. Fresh source/history calls from the visible dashboard still return 401 despite the cached workspace shell, so positive authenticated proposal selection/history/report smoke remains pending. No mocked browser responses, live repository writes, adoption or paid AI calls were used.

Canceled-write recovery checkpoint (2026-10-01): bounded read-only review also inspects canceled proposals with persisted commit references. It recovers deterministic PR numbers/URLs after response loss, checks existing proposal branches without recreating them and proves direct-write inclusion by immutable ancestry. Recovery retains canceled status, terminal timestamps, erased bodies and released document ownership. Revoked publisher credentials/write capabilities do not prevent recovery against the unchanged repository under current read consent; changed source identity or concurrent cancellation/lease loss cannot restore authority. A discovered merge queues normal branch reconciliation without claiming publication success. Unresolved canceled references poll at five-minute intervals and remain subject to terminal retention. Real provider response-loss behavior remains unverified.

The first recovery regression passed all 22 write/review tests and 138 of 139 combined GitHub/policy/catalog tests; one existing source fixture's initial sync returned no claim (`/tmp/frontlit-d7-recovery-regression.log`). API typecheck passed. The isolated source suite subsequently passed all 26 tests (`/tmp/frontlit-d7-recovery-source.log`), and the final combined run passed all 139 tests across 16 suites (`/tmp/frontlit-d7-recovery-final.log`). API/dashboard typechecks and diff checks pass. The first intermittent initial-sync claim observation is retained here; the later passing run does not establish its root cause. Checks API delivery/retry, PR head/base/merged-tree validation, positive OAuth and provider/browser audits remain incomplete. D7 remains open.

PR validation/check foundation checkpoint (2026-10-02): the GitHub adapter reads minimal PR head/base/test-merge metadata, marks fork candidates unsupported and rejects changed repository/branch identity. The read-only validator imports the complete immutable test merge, verifies exact base/head parents, validates normal content policy without embeddings or publication and rereads current PR/base before accepting its result. Merge conflicts fail; unresolved mergeability and unreadable/unwritable fork support cannot fabricate a pass. Valid empty candidates complete validation. Draft/policy/purge versions and source generation fence stale results.

The check adapter uses the stable validation/publication names, repository/App/head/name/external-ID recovery, bounded pagination, exact provider identity checks and a fresh guard before each external mutation. Delivery batches at most 50 annotations per request. A lost creation/append/completion response recovers the existing run and remote annotation count without duplicate appends. Reports send counts/codes and source annotations; private diagnostics remain in FrontLit. Implementation follows GitHub's [PR test-merge semantics](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request) and [check-run annotation limits](https://docs.github.com/en/rest/checks/runs).

Migration `0018_docs_pr_checks` is generated and applied locally. Callable durable PR validation/report jobs enforce one active job per workspace/PR, leased claims and event supersession. Delivery faults retain validation truth and retry reporting independently; rate-limit windows are respected. A changed head/base/policy supersedes the result and queues fresh validation. Sensitive purge stops report leases and erases private diagnostic text/paths while retaining minimal immutable proof/counts. The foundation regression before durable jobs passed 157 tests across 18 suites (`/tmp/frontlit-d7-check-foundation-regression.log`), and the initial durable focused run passed 30 tests across four suites (`/tmp/frontlit-d7-check-jobs-final.log`). API typecheck passed for that checkpoint; final regression is recorded separately below.

These services are not yet scheduled or exposed as complete report workflows. Remaining D7 work includes webhook/rerequest/base-change enqueue integration, bounded production dispatch, private check reports, publishing-branch publication checks, retention, positive machine OAuth and headful/provider/operator acceptance. Existing visible Chrome remains open; cached dashboard identity is not evidence of authenticated API access. No live check writes, repository writes or additional paid AI occurred. D7 remains incomplete.

Latest visible Chrome follow-up (2026-10-02): fresh Source API requests now return authenticated HTTP 200 with `private, no-store`. Proposal history returns 200 `{items: [], nextCursor: null}`; limit 51 returns private validation 400; a missing proposal returns private 404. This establishes authenticated read/negative-history transport behavior, not positive connected-source selection/submission or real GitHub writes. The headful GitHub installation tab still shows the pending organization request.

The first post-job combined regression passed 161/163 tests across 19 suites (`/tmp/frontlit-d7-check-durable-regression.log`): two existing migration/source fixtures failed after an immediate publication claim returned no work. Publication claims were comparing database-created due timestamps to millisecond JavaScript time. Claim due/lease comparisons now use the database clock consistently, including the running-lease check. The new job and purge tests passed in that run; final expanded verification includes publication tests and is recorded after completion. This first run is retained rather than represented as passing.

Final expanded local verification passes **184 tests across 20 suites**, including all GitHub suites, publication/policy regressions, the sensitive-purge check cleanup assertion and policy/catalog coverage (`/tmp/frontlit-d7-check-durable-final.log`). API typecheck and diff checks pass. This is local provider-double/domain evidence, not successful live check delivery or completed D7. The final publication-only run after the last running-lease clock adjustment passes all 21 tests (`/tmp/frontlit-d7-publication-clock-final.log`).

Scheduled checks/private reports checkpoint (2026-10-02): the publication dispatcher invokes one bounded PR validation/report job per tick. New FrontLit PRs transactionally enqueue their first validation check even if the creation webhook is missed. Signed PR events enqueue complete current-state validation, publishing-branch pushes invalidate and revalidate bounded known PRs, and `check_run.rerequested` schedules only exact App/repository/head/external-ID matches. Each new event supersedes the prior active lease/result. Duplicate deliveries do not enqueue twice. Fork/closed/unresolved candidates are still observed through the current provider rather than trusting delivery order or fabricating a passing head-only check.

Private `GET /content/documentation/github/checks` and `GET /content/documentation/github/checks/:checkId` share domain services with canonical `list_documentation_github_checks` and `get_documentation_github_check`; the catalog is 136 tools. Summaries omit diagnostic prose. Individual reports preserve immutable head/base/test-merge proof and validation truth independently of delivery errors, while current policy/purge mismatches or active serving restrictions hide retained text. Worker leases/credential references are never exposed. The dashboard adds check history, stable pagination and report routes, with workspace/permission/request fences and a clear missing-report error. These are admin components; public-site primitives are unaffected.

The first integration regression passed 166/169: two existing proposal fixture claims returned no immediate work and the new missing-check HTTP error was incorrectly mapped to 409. Proposal preparation/write due claims now consistently use the database clock, and the private missing-check response is 404. The final combined regression passes **169 tests across 20 suites** (`/tmp/frontlit-d7-check-report-final.log`); all **95 dashboard tests across 21 suites** pass (`/tmp/frontlit-d7-check-report-web.log`), and API/dashboard typechecks and diff checks pass. This combined run precedes the final initial-PR enqueue assertion; its focused verification is recorded below.

Visible Chrome smoke uses the real authenticated `nice` session: check history renders its empty state and Refresh works. Fresh API history returns 200, limit 51 returns 400 and a missing check returns 404, all `private, no-store` and `noindex`. The missing-report route shows “This documentation check is unavailable.” Snapshot: `/tmp/frontlit-docs-smoke/d7-check-report-missing.txt`. Brief connection-refused navigation attempts succeeded when retried against the still-running dev server; no server reset or headless fallback was used. The GitHub installation tab still shows the pending organization request. No reports were fabricated in the workspace, no user docs were changed, and no live check/repository writes or extra paid AI requests occurred. This does not establish a positive connected-source report, live check update, branch-rule or merge/publication guarantee.

Remaining D7 work: publishing-branch publication checks, complete missed-event PR/base reconciliation and terminal retention, positive Git source/proposal/check/provider/OAuth smoke and operator/release acceptance. D7 remains incomplete.

Final scheduled-focused verification passes **50 tests across six suites** (`/tmp/frontlit-d7-check-scheduled-final.log`), including the initial PR enqueue assertion, all write/review cases, webhook PR/base/rerequest admission, private REST/MCP report parity/redaction and policy/catalog coverage. Final API typecheck and diff checks pass. The dashboard typecheck also passes after the missing-report message change. No running verification process remains at this checkpoint.

Pagination correction (2026-10-02): the complete documentation loader used a zero-based row count as `offset`, but this endpoint uses one-based page numbers. It now requests pages 1, 2, and so on. Two fetch-level regression tests cover an empty area and 501 documents across two pages; both pass, and the dashboard typecheck passes. In the existing visible Chrome `nice` session, the real list requests use `offset=1&itemsPerPage=500` and return HTTP 200 with all eight documents. Snapshot: `/tmp/frontlit-docs-smoke/d7-pagination-fix.txt`. No documentation data changed. This fixes the list validation error; it does not establish successful GitHub OAuth.

Fresh GitHub authorization diagnosis (2026-10-02): in the same visible Chrome session, setup is authorized as `clbotdev`. Refresh repositories and a fresh authenticated repository request return HTTP 200 with empty installations/repositories. A read-only provider probe using that setup's token confirms GitHub `/user/installations` returns `total_count: 0` and an empty array before FrontLit filtering. Opening the App installation link displays CodeLit's “Authorize & Request” screen, with read access to code and metadata. Snapshot: `/tmp/frontlit-docs-smoke/d7-github-installation-request.txt`. User authorization works; an accessible installation still needs to be granted. No installation request was submitted, no repository scope was chosen, and no remote write occurred. An organization owner must install/approve the App for the intended repository before positive repository selection can be tested.

Installation callback correction (2026-10-02): after the user made the App public and installed it, GitHub returned `installation_id`/`setup_action` and a code without FrontLit OAuth state. The callback incorrectly classified this as expired setup. Recognized state-less installation returns now redirect to Settings → Integrations → GitHub with a prompt to authorize through FrontLit's state/PKCE flow. No installation ID or unbound code is trusted to select or connect a workspace. Invalid supplied state still fails. Ten webhook/callback regression tests and API/dashboard typechecks pass. Visible Chrome displays the installation-return notice and Authorize GitHub button; snapshot `/tmp/frontlit-docs-smoke/d7-installation-callback-fixed.txt`. Positive repository selection after fresh authorization remains to be verified.

Fresh repository/export diagnosis (2026-10-02): visible Chrome now lists installation `166984494` and private repository `clbotdev/docs-site`, establishing positive repository selection after fresh authorization. Creating the reviewed CMS export returns `GITHUB_REFERENCE_UNAVAILABLE` for selected branch `main`. Read-only GitHub probes confirm repository metadata HTTP 200, an empty branches array, and HTTP 409 “Git Repository is empty” for `git/ref/heads/main`. The default branch name is `main`, but no commit/branch exists yet. The dashboard now explains that an empty repository needs an initial commit and an existing publishing branch. No initial commit, repository write, migration activation or documentation mutation was performed; export verification remains pending initialization.

Setup usability correction (2026-10-02): repository discovery now projects installation account login/type and displays `clbotdev (Personal account)` instead of the installation ID. The dashboard retains only the setup ID in workspace-scoped session storage and rechecks its validity/repository access on reload. Credentials remain on the server; setup expiry still requires fresh authorization with an explanatory message. Successful source activation or completion/cancellation of permission review clears the retained setup. In visible Chrome, a fresh authorization returned successfully, the readable installation label appeared, and the repository picker remained available after reload. Fifteen setup/transport tests, the contract build, and API/dashboard typechecks pass. No repository or documentation writes occurred.

Reconciliation verification checkpoint (2026-10-02): migration `0019_docs_pr_reconciliation` is applied locally. Independent fifteen-minute due tracking discovers open PRs, retains active leases/retry timing, and refreshes changed merge/policy proof. Discovery errors are exposed independently from source import errors. Terminal check cleanup removes only expired delivered/superseded records and keeps active reporting jobs. Current combined GitHub/policy/catalog regression passes **172 tests across 20 suites** (`/tmp/frontlit-d7-reconciliation-final.log`); dashboard regression passes **97 across 22 suites** (`/tmp/frontlit-d7-current-web.log`); publication/permission regression passes **27 across two suites** (`/tmp/frontlit-d7-current-publication-policy.log`). These scopes are complementary and are not described as a full API regression.

Publication-feedback preparation also fixes a missing proof: the sync worker records the exact attempted branch SHA under its current lease immediately after resolution, before tree/content validation. An invalid candidate that never creates a publication now retains that SHA while the prior publication and newer local drafts remain intact. All **26 source tests** pass after this change (`/tmp/frontlit-d7-attempted-commit.log`); API typecheck passes. No check delivery is implemented for publication outcomes yet. The visible browser has a planned nine-file reviewed adoption export; commit/verification/activation remains pending the manual §21.5 workflow. No remote writes or extra paid AI calls occurred.

Publishing-branch checks checkpoint (2026-10-02): migration `0020_docs_publication_checks` is applied locally. Checks can represent a PR or a terminal sync result. The latter persists immutable attempted commit/publication/outcome/count/diagnostic proof and independent delivery retry state. Bounded recovery discovers missing report enqueues after terminal sync settlement; unchanged live reconciliation does not post duplicates. Stable `FrontLit / docs publication` reports use deterministic external IDs, recover response-lost delivery, honor rate-limit backoff and renew source/generation/policy authority before every mutation. Reporting does not prepare, activate, roll back or otherwise change publication truth. Known source-line diagnostics become bounded code-only annotations; private prose remains in FrontLit. Superseded attempts report neutral rather than success.

Existing private REST/MCP check endpoints and dashboard history/detail routes now include publication outcomes. Summaries omit prose; stale policy/purge or current restrictions redact retained details. Sensitive purge erases publication-check diagnostic bodies and supersedes leases. Pending reports retain their terminal sync proof through cleanup. Exact signed App/repository/commit/external-ID/run matches can rerequest publication reporting without enqueueing another import. Public-site UI is unchanged.

Final combined GitHub/publication/permission/policy/catalog regression passes **209 tests across 23 suites** (`/tmp/frontlit-d7-publication-check-final-regression.log`); dashboard regression passes **97 across 22 suites** (`/tmp/frontlit-d7-publication-check-web.log`). Final focused transport/purge run passes **26 across three suites** (`/tmp/frontlit-d7-publication-check-purge-final.log`), and annotation/delivery verification after its final assertion passes **12 across two suites** (`/tmp/frontlit-d7-publication-check-annotation-final.log`). API/dashboard typechecks, contract build, migration application and diff checks pass. These logs cover different checkpoints/scopes; their counts are not combined into a full API claim.

Visible Chrome confirms authenticated `nice` check history/Refresh, real API history 200 with private/no-store/noindex, limit 51 → 400 and missing report → private 404 with “This documentation check is unavailable.” Snapshots: `/tmp/frontlit-docs-smoke/d7-publication-check-history.txt` and `/tmp/frontlit-docs-smoke/d7-publication-check-missing.txt`. The workspace still reports editor ownership/unconfigured Git source and no check reports, so a positive live publication card or GitHub delivery is not established. Brief navigation failures and a displayed sign-in screen did not prove session expiry: the fresh session still returned authenticated 200 after returning to the dashboard. Follow the user's instruction to revisit `http://localhost:3000` and check fresh session/API state before requesting login again. No live repository/check writes, source adoption or extra paid AI calls occurred.

The [GitHub operator runbook](#operations-runbook) now covers registration/environment/URLs, installation/authorization, permission upgrades, manual adoption, worker health, failed-delivery replay, key/secret rotation and repository removal/recovery. `.env.example` lists the actual App settings. The runbook is an operational artifact, not proof that its live recovery/rotation scenarios have been exercised. D6/D7 remain open for adoption completion, positive live PR/check/merge/direct/protected-branch and OAuth/provider evidence, and the requirement-by-requirement release audit.

Acceptance-audit corrections (2026-10-02): migration `0021_docs_sync_diagnostics` is applied locally. A failed Git import that never creates a publication now retains its complete diagnostics with captured policy/purge proof, not only the first code. Source and publication-check reports retain both duplicate-route file references and the attempted SHA; the last good publication stays live. A policy change during provider work prevents copied diagnostic prose from being retained, current restrictions redact Source diagnostics, sensitive purge erases all sync diagnostic reports, and an expired/replaced lease cannot settle failure or overwrite a newer binding diagnostic. Source UI shows the attempted commit, locations and related files.

The first expanded regression exposed an intermittent delivery acknowledgment failure: the dispatcher compared database-created due timestamps with the application clock. Due/expired delivery selection now uses the database clock, matching the other durable workers. The focused source/publication rerun passed 49 tests and the final expanded GitHub/publication/permission/policy/catalog scope passed **211 tests across 23 suites** (`/tmp/frontlit-d7-sync-diagnostics-regression-final.log`). This final expanded run precedes the later audit-specific tests below; it is not a full API claim.

The requirement audit additionally exercised simultaneous actual REST request/MCP handler saves of version 1: exactly one succeeds, the other receives `STALE_DOCS_DRAFT`/version 2, and stored title/slug come entirely from the winner. The importer reads 501 files and rejects its explicit 1001-file limit; a separate real PGlite sync/publication serves all 501 docs, including the last file, with indexing disabled to avoid provider work. The transport/importer scope passes **29 tests across two suites** (`/tmp/frontlit-docs-concurrency-capacity-audit.log`); the large-sync selected test passes with 28 unrelated tests skipped (`/tmp/frontlit-docs-large-sync-audit.log`). These are local automated tests, not 501 live workspace mutations.

V23 now has an explicit worker test: a protected-branch-style HTTP 422 rejection leaves the publishing branch and retained draft unchanged, creates no sync/publication, closes local ownership and permits a replacement PR capture. The real App request adapter separately asserts `force:false` and redacted provider errors. The private direct-conflict report offers a **Create a pull request** action opening the existing review dialog in PR mode; the user selects/reviews current versions, with no automatic submission. Writer/App suites pass **45 tests across two suites** (`/tmp/frontlit-d7-protected-branch-recovery.log`). Positive live protected-branch and recovery-dialog smoke remains unverified.

Current complementary audit scopes pass **122 foundation/media-guard/support/public API tests across 16 suites**, **89 shared-profile tests across five suites**, **45 public-site tests across 14 suites** and **97 dashboard tests across 22 suites**; logs are enumerated in the [acceptance audit](#acceptance-audit). Live MediaLit integration remains excluded and MEDIA-01 is not called passing. Final API/dashboard typechecks pass (`/tmp/frontlit-docs-audit-final-types.log`, `/tmp/frontlit-docs-audit-final-web-types.log`), and diff checks pass.

Headful Chrome: a fresh Source request briefly returned 401 in an existing tab; opening `http://localhost:3000` recovered authenticated `nice` API access (200) without signing in again. The workspace remains editor-owned with no Git binding. Source and missing-proposal snapshots are `/tmp/frontlit-docs-smoke/d7-sync-diagnostics-source-after-home.txt` and `/tmp/frontlit-docs-smoke/d7-pr-recovery-missing-report.txt`. The missing proposal returns private/no-store/noindex 404 and the dashboard now says “This documentation proposal is unavailable.” No positive live diagnostic/recovery records were fabricated. No agent repository writes, source activation or additional paid AI occurred.

The [scenario-by-scenario acceptance audit](#acceptance-audit) maps all V01–V45 to inspected local evidence and explicit remaining components. Actual adoption, live PR/check/merge/permissions/OAuth and recovery/restore/operator scenarios remain gates; D6/D7 and the overall goal remain incomplete. Initial CMS-export PR automation remains later scope under §21.5, distinct from the implemented Git-edit proposal workflow.

Real transaction/restore checkpoint (2026-10-02): `apps/api/scripts/test-docs-postgres.ts` and `bun run test:docs-postgres` now create a disposable PostgreSQL database, apply actual migrations, exercise production transactions/locks, and remove it. Four checks pass: exactly one unmixed same-version save; a local save while adoption awaits external proof makes activation stale without changing ownership; adoption followed by save records Git provenance while retaining live content; two concurrent workers claim one sync exactly once. `/tmp/frontlit-docs-postgres-races-final.log` contains fresh evidence. This is real database/domain proof with provider doubles, not live GitHub or authenticated transport proof.

`DOCS_RESTORE_PENDING` now also fences queued inbound sync, capture after provider work, adoption/export verification and Git proposal dispatch/claims/mutations. Paused imports and writes retain retryable work without consuming an attempt. New tests prove no provider calls for queued work, no copied import after restoration begins, no next Git mutation after restoration begins during a tree write, and retained/reusable reviewed adoption plans. The final focused source/migration/writer/proposal scope passes **73 tests across four suites** (`/tmp/frontlit-docs-restore-fences-final.log`); API typecheck and diff checks pass. The migration fixture now explicitly makes its publication due and requires active status before testing adoption; it no longer silently proceeds with a pending publication. The attempt assertion compares the prior accumulated count rather than assuming preparation consumed no attempts. Git write testing counts actual mutations after the fresh guard rather than mistaking an adapter method invocation for a successful provider write.

**Historical implementation gate (superseded by the independent-ledger checkpoint below):** independent deletion-ledger persistence/replay was absent. Restore-pending fences and database tombstones alone do not satisfy old-backup restoration under §23.6. The [runbook](#backup-restoration-and-transaction-smoke), `.env.example`, [acceptance matrix](#acceptance-audit) and PRD explicitly retain that gate; it is not a nonblocking exception.

Runtime recovery: earlier exec handles, temporary logs, dev services and Chrome tabs disappeared after a runtime restart. Their absence was revalidated before restarting checks/services. Docker Desktop and the existing database/SendLit/Mailpit containers were recovered; migrations were applied without resetting data. API/dashboard/sites run on 4000/3000/3002. A duplicate API supervisor started during recovery was stopped; one API process remains. Fresh visible Chrome revisited localhost and returned authenticated `nice` Source 200 without a new sign-in. Source remains editor-owned/unconfigured. Fresh read-only GitHub proof: installation has only `contents: read` and `metadata: read`; `main` is `bdb8583184d0e2daac4b1b36cd0730b2eb30367e` with no managed Markdown or Section metadata. Export commit/adoption and App permissions remain external live gates. No remote repository/check writes, source activation or additional paid AI occurred.

Final recovery observations: no generated `frontlit_docs_test_*` databases remain after cleanup. The public configured callback without authorization proof returns HTTP 400/`GITHUB_SETUP_EXPIRED`, proving the callback reaches the API rather than returning the earlier 502; it does not prove a fresh OAuth completion. The authenticated visible Source snapshot is `/tmp/frontlit-docs-smoke/d7-restored-runtime-source.txt`.

Independent ledger/restore checkpoint (2026-10-02): this supersedes the earlier absent-ledger implementation gate. `deletion-ledger.ts` retains minimal immutable authorized purge intent on independent storage before primary deletion, with private modes, atomic hard-link installation and fsync. Purge rejects missing/unusable storage before deleting. An intent surviving rollback or a lost acknowledgment is conservatively honored. `deletion-replay.ts` and `docs:deletion-ledger export|replay` provide bounded backfill/replay, strict batch validation, conflict rejection, idempotency and restored Git-path/route suppression. Replay requires maintenance mode and never clears it. Primary `.env` and live workspace data were not changed; deployment durable storage remains an operator configuration gate.

Six focused tests pass (`/tmp/frontlit-docs-ledger-backup-final.log`), including PGlite physical snapshot restoration, corrupt-batch rejection and failure before deletion. Existing publication/migration/proposal regression passes 38 tests across three suites (`/tmp/frontlit-docs-ledger-purge-regression.log`). The real PostgreSQL smoke passes four concurrency checks plus a custom-format pre-purge `pg_dump`/`pg_restore` into a second disposable database, followed by independent CLI replay and verification of erased bodies/revisions, retained maintenance mode and blocked publication at the purged route (`/tmp/frontlit-docs-ledger-postgres-backup.log`). The host PostgreSQL 16 client cannot dump the PostgreSQL 17 server; the successful smoke uses matching container tools over its local socket, avoiding Windows Docker's lack of inherited WSL environment variables. Cleanup removes only generated databases and the fixture ledger. No GitHub/AI calls or user-workspace purge occurred. Deployment independent-volume recovery/retention and backup-expiry proof remain open; D6/D7 are not release-complete.

Final ledger regression: all 306 documentation/permission/policy tests pass across 33 suites (`/tmp/frontlit-docs-ledger-regression-final.log`) with two workers. The initial unrestricted run passed 305 tests but timed out during one PGlite admission fixture; the bounded rerun includes that test and passes. The subsequent six-test ledger suite adds authorized-intent persistence across database rollback and restoration of a Git tombstone absent from an older backup. API typecheck passes (`/tmp/frontlit-docs-ledger-types-final.log`); no generated test databases remain.

Fresh headful Source/API smoke returns 200 with editor ownership and no binding. The current reviewed adoption plan now contains ten files (the earlier nine-file plan is historical). User-approved installation permissions now include Checks and Pull requests write; a fresh App API read confirms Contents remains read-only. Branch/commit creation still requires Contents write and installation approval, requested from the user. No remote repository mutation, adoption activation or paid AI call was performed.

Installation upgrade confirmed (2026-10-02): after the user enabled Contents write, a fresh App installation read confirms `contents: write`, `pull_requests: write`, `checks: write` and `metadata: read`. Main remains `bdb8583184d0e2daac4b1b36cd0730b2eb30367e`. The current adoption plan is `gmig_aa96ybw3ipxhr2f6w7i8kqby`, with ten files and reviewed hash `1bdd712286448f9e519dd9ae9006495662689bfcbf48e4e859eac815ff71b2f8`. The GitHub configuration gate is resolved; export commit/verification/final interactive source consent remains. Approval has been requested for a separate manual adoption PR containing the reviewed export, including never-published drafts; no repository mutation has occurred and user PR #1 remains untouched. Automatic initial-export PR UI remains later scope under §21.5.

Real publication crash/recovery checkpoint (2026-10-02): `bun run test:docs-outbox-postgres` passes the four existing PostgreSQL races and a new V31 smoke (`/tmp/frontlit-docs-postgres-outbox-crash.log`). A separate child activates a fixture publication through production transactions and receives SIGKILL before invalidation. A fresh parent connection sees the live publication and unacknowledged original event. The production sender signs a real HTTP request to a disposable loopback receiver, retains the local acknowledgment after HTTP 503, then retries the unchanged event successfully without changing publication identity/content. Completed delivery is not repeated. The generated database is removed; no live fixture records/site/GitHub/AI calls occurred. This closes the actual process-crash/backend-delivery portion of V31; the deployed Next site-cache proof remains unverified.

Real media race checkpoint (2026-10-02): `bun run test:docs-media-postgres` passes four existing PostgreSQL checks plus explicit reference-first/deletion-first orders and four simultaneous documentation-save/media-delete attempts (`/tmp/frontlit-docs-postgres-media-race.log`). Exactly one operation succeeds per concurrent attempt. A saved reference keeps the asset public and rejects deletion; a deleting asset has no saved reference and rejects the attempted image reference. The deletion error now matches PRD §23.6: `409 MEDIA_IN_USE`, replacing `MEDIA_REFERENCED`. Metadata fixtures are seeded only in the disposable database and no provider deletion is dispatched. No generated databases remain. This closes V39's actual transaction-race portion, while provider completion remains unverified under MEDIA-01.

Final media regression passes 45 tests across four suites (`/tmp/frontlit-docs-media-race-regression.log`); API typecheck passes (`/tmp/frontlit-docs-media-race-types.log`) and diff checks pass. The reviewed ten-file adoption export is prepared locally from the authenticated headful session in `/tmp/frontlit-docs-smoke/adoption-export-reviewed.zip` with a private SHA-256 manifest. Files retain exact plan paths and text, and the returned complete manifest has no next page. The directory/files/archive use private permissions. This preparation performs no remote writes and does not imply repository-export or final source activation consent. Approval remains pending.

Full API verification checkpoint (2026-10-02): `bun run test --maxWorkers=2` completes 95 suites with **654 passing tests and one failure**, `/tmp/frontlit-docs-full-api-final.log`. The sole failure is the live provider signed-group test: MediaLit returns client-forged group metadata instead of the signed group, the accepted MEDIA-01 limitation. The private ticket metadata test passes. The provider fixture tests run their cleanup; the suite is not represented as wholly green and the accepted failure was neither skipped nor changed. API typecheck passes (`/tmp/frontlit-docs-final-api-types.log`).

`test:docs-editor-postgres` adds fresh-process proof with all GitHub App environment keys removed: configured:false/editor ownership, save, publication, serving and lexical retrieval work without a Git binding (`/tmp/frontlit-docs-postgres-editor-only.log`). `test:docs-outbox-postgres` now proves both real SIGKILL boundaries (`/tmp/frontlit-docs-postgres-outbox-boundaries.log`): before activation last-good content stays live, expiry reclaim activates the captured candidate exactly once with one event; after commit the original event survives and production signed HTTP retry settles its retained acknowledgments. Both optional smokes also pass the four existing transaction checks. All generated databases are removed. The lease deadline is advanced only in the disposable job to emulate downtime. Actual deployed Next cache proof, live Git adoption/proposals/checks/merge and operator consent remain open.

Fresh frontend/headful checkpoint (2026-10-02): dashboard passes 97 tests across 22 suites (`/tmp/frontlit-docs-final-web-tests.log`), sites passes 45 across 14 (`/tmp/frontlit-docs-final-sites-tests.log`), and shared editor passes 89 across five (`/tmp/frontlit-docs-final-editor-tests.log`). Dashboard/sites typechecks pass. Headful Chrome reloads the authenticated `nice` Source page without a new sign-in. GitHub setup has correctly expired after ten minutes while the 24-hour migration plan persists. Clicking Verify originally replaced actionable guidance with a raw GITHUB SETUP EXPIRED label. The action catch now clears the expired setup/picker/grant state and directs the user to authorize again while preserving the plan. A second real click confirms the recovery message; fresh source and migration GETs return 200 with editor ownership, no binding, planned status, identical reviewed hash and ten files. Snapshot: `/tmp/frontlit-docs-smoke/d7-expired-verify-recovery.txt`. Final dashboard typecheck passes (`/tmp/frontlit-docs-source-expiry-types.log`). No export, source activation, repository mutation or AI call occurred. This verifies V44's expired-authorization browser portion; live file mismatch/correction/cancellation remains unverified.

Consent checkpoint (2026-10-02): independent local implementation/regression/process work is complete for this checkpoint. The same pending reviewed-export approval has persisted across the subsequent ledger, media, full-API and frontend verification turns. Fresh headful source/migration reads still show editor ownership, no binding and the unchanged planned ten-file export. There is no active test process left to wait on and no consent reply authorizing repository export. Continuing positive live adoption/proposal/check/merge smoke requires repository export followed by review/merge and original-admin interactive source approval. The goal is blocked on that external consent; D6/D7 remain incomplete. MEDIA-01 stays an accepted nonblocking exception. Deployment cache/storage/retention and other explicit provider/operator gates remain tracked in the acceptance matrix and must not be claimed passing.

Setup-PR scope revision (2026-10-02): after the user clarified that manual export/commit is unwanted, PRD §21.5 and D6 were revised to require platform-created setup/adoption PRs, durable progress/retry/recovery, merge verification and empty-repository initialization. V46–V49 are new explicit gates, currently unimplemented. Earlier manual/agent-export consent checkpoints are superseded. Fresh provider/main inspection showed no managed files; the previous plan `gmig_aa96ybw3ipxhr2f6w7i8kqby` had been canceled. Visible Chrome used the existing verified picker to create fresh plan `gmig_e6xc02vn3tjqkg5pg0siugxa`, ten files, docs version 54. No remote branch, commit, PR or merge was created. Next work must make the platform create the setup PR rather than an agent exporting files outside the product.

Setup-PR admission checkpoint (2026-10-02): migration `0022_docs_migration_prs` adds one durable request per reviewed migration with a unique team/idempotency key, credential reference, policy/purge proof, deterministic branch, remote object/PR references and lease/retry fields. Body text remains only in the existing private migration capture. Request/status schemas and private progress projection are implemented; migration cancellation fences the queued request while retaining known remote references. Admission enforces original manager/publisher authority, account-bound current setup, reviewed capture/version/publication, installation write permissions, unchanged repository owner, suppression and restore state, plus transactional duplicate/conflict checks. Publisher credential validation now optionally requires manage as well as publish, including OAuth consent/token scopes.

Five new admission cases and existing migration/publisher cases pass: **16 tests across three suites**, `/tmp/frontlit-docs-migration-pr-admission-tests.log`. Shared contract build, API typecheck, local application of migration 0022 and diff checks pass. No runtime setup-PR endpoint/worker/UI is wired yet and the legacy manual label remains until replacement. Reauthorization/retry refresh, remote write/recovery/reconciliation, bootstrap, REST/MCP policy wiring, Source UI and real headful creation remain required; this is not claimed as a working automatic setup PR. No remote repository mutations or paid AI calls occurred.

#### Live sites delivery and isolated browser boundary, 2026-10-02

Read-only inspection confirms that API/sites signing secrets are configured and equal (values were not printed). The latest five real `nice` activation events have `local` and `sites` destinations, both acknowledgments, one attempt and completed timestamps. The latest event `evt_zxo25roo3uewnnydhl2n8xer` references active publication `pub_ua2jl9ukinqq8dg42tfnse8d`, policy epoch 6.

Using the production signing utility and the existing event's exact payload, the running Next.js sites receiver at `/api/webhooks/documentation` returned 200 plus the exact event acknowledgment twice, 409 for a validly signed conflicting replay, and 401 for forged and expired signatures. Assertions pass in `/tmp/frontlit-docs-smoke/d7-live-sites-delivery-proof.json`. This replays an existing activation event; no publication/policy transition or new outbox row was created. The isolated visible public page still renders after replay (`d7-public-after-sites-replay.txt`). Unlike the earlier loopback receiver, this exercises the actual Next route and its invalidation call. It runs in the user's development server; production cache/restart behavior remains an explicit V31 gate, and no service was started/restarted.

The same isolated public Chrome context has no cookies and no admin identity. Its published documentation request returns 200 with credentials omitted; private documentation-list, Git source and teams endpoints each return 401. Assertions pass against `/tmp/frontlit-docs-smoke/d7-isolated-public-authority-boundary.json`. This proves the anonymous/admin boundary only; it does not replace V40's docs-only-author retained revision/tenant script browser scenario. No paid AI calls were made.

#### Fresh stale-merge provider observation after reset

Read-only App verification of the user's original open PR #1 still finds synthetic merge `7c9657b98a46c931319b9a7199d75ac874831378`, with parents `d99918d37fe1dd71e249fd2a0642ddd6769e0b33` and PR head `b243b97de2056f30d344590dad693a4b0ae47c23`. Current publishing head is `d40781e4509e8d06b68356812205ce68a16558a2`; the immutable current-base proof remains false. The PR was not changed or merged. This remains a provider-proof gate; no stale candidate was accepted and no test success is claimed. Local API/database/browser recovery is independently required for the remaining worker/UI scenarios.

#### Live upstream conflict and cleanup (V22), 2026-10-02

Visible Chrome saved a local title change on disposable companion doc `doc_ilc2e3cfkz2n292w1yebevvs`: **D6 Link Companion Smoke — local conflict draft**, draft version 7, immutable base `d40781e4509e8d06b68356812205ce68a16558a2`. The authorized GitHub browser then changed the same file `docs/d6-link-companion.md` to **D6 Link Companion Smoke — upstream change**, committing `ddb505f266eb4e2c2deb78be5415fa5185b67e9c` to main. This is an external upstream-change fixture; FrontLit direct commits remain disabled. The fixture has indexing disabled.

Through the actual editor **Create pull request** → **Review selected files** → **Submit captured versions**, FrontLit admitted proposal `gproposal_bkwpcwt9rc52jxopdv7fdvu3` capturing version 7. Normal worker processing reports status `conflict`, diagnostic `UPSTREAM_CHANGED`, and the exact selected source path. The visible report explains that the local draft is retained. Database/provider assertions confirm no proposal commit or PR was created, local draft title/version/base remain intact, and GitHub retains the upstream title/head. Neither side was merged or discarded as conflict resolution.

After capturing that proof, the authorized GitHub browser restored the fixture, and the editor's normal **Discard draft** action cleaned the disposable local test change. The first restore introduced one blank line because the accessibility snapshot differs from raw Markdown spacing. A subsequent exact-byte cleanup used the original Git blob's text; provider tree comparison confirms the entire configured `docs` directory matches its pre-test entries/SHAs. Final restored head is `0c4ad4a659d7869e82cc5d95351832df176a4dd2`; observed/live SHAs match it. The editor now shows clean Published, original title, version 8, disabled discard. The isolated public page again shows the original title and deep link. The conflict proposal's immutable capture/diagnostics remain available as history.

No implementation change was needed for V22 and no extra test suite was rerun. All interactions used visible Chrome and the production worker/API/provider; database/provider reads supplemented browser proof. No AI feature was invoked or app service started. Remaining provider/release gates remain open.

### 31.9 Additional PRD checkpoint evidence

Live checkpoint (2026-10-03): V16 now passes controlled live source-read outage/recovery: queued failure retains the site, normal retry clears errors on attempt 2 and reuses the original publication with all ten canonical snapshots/revisions/routes intact. V28 now passes live check-delivery failure/retry with an actual signed GitHub rerequest, controlled response loss, normal backoff and recovery to the original single check run; publication and site remain unchanged. A stale synthetic-merge validation loop is corrected and verified by 22 focused tests/typecheck. See D7 notes. V21 now passes actual GitHub PR-response-loss recovery: a controlled adapter discards GitHub’s successful creation response and the normal API scheduler finds exactly the same PR #13/commit without duplicates. The PR is closed unmerged and its temporary draft discarded; live publication is unchanged. V30 now passes the headful before/after/rejected-update citation triplet after credential replacement, using three successful calls and a 3,741-token budget increment. V33 also passes live suppression across Git rename/reimport plus stale and selected release checks. All temporary changes/restrictions are cleaned up: exact configured Git tree and ten canonical public snapshots/IDs/routes restored; current main/live SHA is `a67a574d4944564bfb81ede9b147cc78f9f2ba76`, publication `pub_1vpjc555cstq9sfm6iu83dvp`. See the acceptance audit.

Earlier live checkpoint (2026-10-02): V18's actual duplicate-route merge/failure and GitHub failure-check delivery are verified headfully, with exact last-good snapshot preservation and clean fixture removal. V29's unsupported-MDX PR #10 produces a delivered failure report through actual signed PR events; headful GitHub Re-run produces a signed check rerequest and another delivered validation. PR #10 is closed unmerged. Main/live SHA is `cebe1e72c32d802a7836ce8ba0aa55c05b47550d`; all ten public docs remain intact. The self-hosted setup article is `apps/docs/content/docs/self-hosting/github-app.mdx`, with navigation, environment examples and passing production export. Its LLM text export uses `.md` filenames to avoid parent/child path collisions. The user corrected the App's missing PR/check event subscriptions; fresh `GET /app` and real deliveries confirm all three required events. D6/D7 remain incomplete at the other acceptance gates.

**Independent deletion-ledger checkpoint (2026-10-02):** Authorized purge now requires `DOCS_DELETION_LEDGER_DIR`, private durable storage independent of database backups. It atomically retains and fsyncs an immutable minimal deletion intent before erasing database content; missing/unusable storage rejects purge before deletion. Records contain identifiers, route/source-path tombstones and the reviewed plan hash, never document bodies or credentials. An authorized intent survives transaction rollback or a lost acknowledgment and is conservatively honored during restoration. Bounded export backfills completed legacy purges; bounded replay requires `DOCS_RESTORE_PENDING=true`, restores suppression and erases restored copies without clearing maintenance mode. Real PostgreSQL `pg_dump`/`pg_restore` and CLI replay prove deletion after restoration from a pre-purge backup; focused tests cover corrupt-batch rejection, idempotency and failure before deletion. See the [runbook](#backup-restoration-and-transaction-smoke). Durable operator storage configuration, independent ledger recovery/retention and deployment backup expiry remain release gates; MEDIA-01 does not waive them.

**Status: deferred, non-blocking.** Recorded 2026-09-30 during D2 integration and headful browser testing. The product decision is to accept D2 with this known provider limitation and proceed to D3; resolving it is not a prerequisite for subsequent work packages.

**Scope revision (2026-10-02):** The user requires FrontLit-created setup PRs; the prior manual-export/commit workflow is superseded by §21.5 and V46–V49. Setup PR creation/empty-repository initialization, durable progress/recovery and corresponding REST/MCP/UI/headful proof are required implementation work, not existing capabilities. Historical checkpoints below describe what was verified before this revision; manual or agent-created export PRs do not satisfy the revised D6 gate. Existing Git-edit PR authoring remains required in D7. No remote PR was created during this requirements revision.

**D2 acceptance exception (2026-09-30):** MEDIA-01 (§24.2) is an accepted, non-blocking provider limitation. D2 authoring contracts and browser smoke are complete with the live signed-group test explicitly failing; D3 can proceed without a MediaLit fix. Keep affected media operations guarded and retain the issue in later handoffs until live verification passes.

**D3 implementation status (2026-09-30):** Immutable publication membership, preparation/activation jobs, delivery outbox, independent suppression/release, retention and controlled purge are implemented. [D3 verification and recovery notes](#historical-d3-evidence) record targeted tests and headful Chrome evidence. D4 is now implemented; the complete foundation release remains gated on D5 and the unchecked scenarios below. MEDIA-01 remains deferred and guarded.

**D4 implementation status (2026-09-30):** Private dashboard preview, read-scoped retained history, exact-version batch publication review/status/retry, unpublish, independent withdrawal/reviewed release UI, and policy-aware unavailable serving are implemented. [D4 verification and recovery notes](#historical-d4-evidence) record 151 passing API regression tests, 45 site tests, shared editor/dashboard checks, and visible Chrome desktop/mobile evidence. Browser-discovered immediate-preview and mobile-footer defects were fixed and rechecked. D5 verification follows below. MEDIA-01 remains accepted as nonblocking; complete foundation/Git release gates remain unmet.

**D5 implementation status (2026-10-01):** Immutable lexical/semantic retrieval, scoped evidence, redacted approval, versioned review/draft REST/MCP/UI, publication links, citation containment, team budgets, and bounded resumable preparation are implemented. [D5 verification and recovery notes](#historical-d5-evidence) record 187 passing API regression tests, transport/permission checks, and visible Chrome evidence from feedback through accepted publication and missing-provider failure. D6 is next. A limited follow-up after the owner configured OpenAI verified real semantic preparation/search and one grounded model answer in visible Chrome, using 1,238 tokens total and restoring lexical retrieval. The remaining foundation/operator release scenarios remain explicitly unmet. MEDIA-01 remains accepted as nonblocking.

**D6 progress (2026-10-01):** App/parser/setup, fourteen REST/MCP source/adoption operations, generation-fenced sync/publication, reviewed CMS export/verify/activate, Source UI, retention/purge, ten-context setup admission, minimal webhook outcome reporting and shared publication/sync/validation quotas are implemented. Migrations `0009_docs_github_sources`, `0010_docs_github_fences` and `0011_docs_github_admission` are applied locally. Adoption preserves existing identities/drafts/live publication and reuses equivalent retrieval. Latest broad regression passes 504 API tests; the prior 95 dashboard and 45 site tests, six focused adoption scenarios and app typechecks pass. Live MediaLit tests remain excluded from local regression; MEDIA-01 is not represented as passing. Visible Chrome confirms configured App detection, unchanged docs and the Source authorization transition. **External GitHub sign-in/direct App approval is pending the owner in the visible window; callback/install/import/adoption smoke is unverified.** Existing `nice` docs remain editor-owned; no Git binding or repository mutation has been performed. [D6 notes](#historical-d6-evidence) track remaining external/concurrency/browser cases. D6 remains incomplete.

**D7 draft checkpoint (2026-10-01):** Captured patch planning validates selected source hashes against current head, rejects overlapping changes/occupied destinations, captures atomic moves and validates the complete candidate while preserving untouched bytes. Provenance-aware local Git drafts save through normal versioned authoring; imported/adopted bases are server-owned, dirty content and path-only moves survive imports, and new Git drafts require safe source paths. Migration `0012_docs_git_draft_sources` is applied locally. The draft checkpoint passed 513 API tests across 82 suites; the later permission checkpoint below supersedes that regression count. [D7 notes](#historical-d7-evidence) record evidence and remaining work. Durable proposals, idempotent writes, checks, review reconciliation, retention and complete UI/browser verification remain outstanding. D7 is incomplete. No additional paid AI or repository writes occurred.

**D7 permission-upgrade checkpoint (2026-10-01):** Separate interactive workspace PR/direct delegation, durable idempotent consent receipts, fresh local authority rechecks, generation fencing, Source permission-review UI and repository/purpose-scoped token requests are implemented. Migration `0013_docs_github_grants` is applied locally. App permission upgrades alone do not enable writes; stale reviews, concurrent pauses, permission loss, noninteractive approval and old approval replays after revocation cannot restore rights. Latest regression passes 520 API tests, 95 dashboard tests, typechecks and the 131-tool policy/catalog checks. Real GitHub authorization/upgrade smoke remains pending in visible Chrome; existing `nice` content remains editor-owned and unchanged. Proposal submission/write/check workflows and full D7 verification remain outstanding.

**D7 private admission checkpoint (2026-10-01):** Migration `0014_docs_github_proposals` is applied locally. Domain admission captures immutable private Markdown, exact versions, source bases, credential references and grant generations with transactional idempotency, one-open-proposal-per-document enforcement and shared quota. Credential revalidation helpers, proposal-body purge and bounded terminal retention have local tests; worker/transport integration and all external writes/checks remain outstanding. Regression now passes 530 API tests across 84 suites, with the same MediaLit exclusions, plus API/dashboard typechecks. Real OAuth completed in visible Chrome after correcting Funnel's target from 5000 to API port 4000; installation/organization approval and a selected disposable repository/branch remain pending. No Git binding, repository write or extra paid AI usage occurred. D7 remains incomplete. [D7 notes](#historical-d7-evidence) distinguish implemented domain behavior from remaining external gates.

**D7 write-adapter checkpoint (2026-10-01):** Guarded tree/commit/deterministic-branch/PR methods and non-force ref updates are implemented, with fresh local lease/credential/grant/restriction checks and minimal closed-PR recovery. The GitHub suite passed 78 tests; final recovery/authority changes passed 22 focused tests and API typecheck. These are local adapter/domain results: no proposal worker invokes them yet, and they do not prove external write recovery, branch-rule behavior or completed D7 authoring. Real installation approval remains pending in visible Chrome. No GitHub repository changes or paid AI calls were made.

**D7 preparation-worker checkpoint (2026-10-01):** Leased proposal preparation now validates the complete candidate at one immutable current branch head and rechecks current authority before recording a prepared base/branch. Captures and newer local drafts survive unchanged; terminal conflicts release document ownership, while rate-limit/transport retries retain the admitted input. Latest GitHub regression passes 85 tests across 12 suites, including six preparation-worker cases, plus API typecheck. The preparation entry point is not scheduled yet and performs no Git writes. Durable writing/review recovery, checks, publication reconciliation, proposal REST/MCP/UI and live provider smoke remain outstanding. Installation approval is still pending in the visible Chrome session; D7 remains incomplete.

**D7 writing-worker checkpoint (2026-10-01):** Migration `0015_docs_git_write_recovery` is applied locally. Callable guarded writing/retry processing persists tree/commit references, retains minimal path identity through body purge, uses stable commit metadata and recovers deterministic branches/PRs including closed PRs. Fresh initial-head checks preserve unrelated updates and reject selected-file conflicts. Non-force direct writes recover by proven immutable ancestry and queue normal sync without claiming publication success. Latest GitHub regression passes 96 tests across 13 suites and API typecheck. These local entry points are not scheduled or exposed yet; review/check/webhook reconciliation, captured-version and merged-move application, REST/MCP/UI and real GitHub smoke remain incomplete. The open installation page still requires approval and currently advertises read-only code/metadata access; live D7 also needs the documented App write permissions and separate workspace delegation. No live repository writes or extra AI usage occurred.

Full API verification after the writing-worker checkpoint passes **556 tests across 86 suites**, with `src/media/*.integration.test.ts` excluded as before. This verifies the locally applied migrations and API domain/transport regression scope; it does not waive the remaining real provider, browser and release gates. Details and log paths are in the [D7 verification notes](#historical-d7-evidence).

**D7 proposal-transport checkpoint (2026-10-01):** Canonical submission/status REST and MCP operations now share private domain admission/projection, with distinct publication/read policies, verified credential resolution, strict exact-version inputs, cross-team denial and restricted title/diagnostic redaction. The catalog is 133 tools. Latest GitHub regression passes 100 tests; the 15-test policy/catalog/transport run and API/dashboard typechecks pass. Visible Chrome's real `nice` browser session verifies private missing-status responses, strict invalid input and a valid selection's editor-source denial after credential resolution; existing content is unchanged. Proposal UI, scheduler/review/check/publication integration, positive machine OAuth transport proof and real GitHub writing smoke remain outstanding. D7 is incomplete; no paid AI or remote repository writes occurred.

**D7 dispatcher/source-path checkpoint (2026-10-01):** The publication scheduler now invokes bounded proposal preparation and writing, with immediate lease handoff. Local provider-double regression passes 101 GitHub tests across 13 suites, plus API/dashboard typechecks and 95 dashboard tests. New Git drafts accept Markdown paths and existing provenance-backed drafts can stage moves; visible Chrome verifies unchanged editor-owned creation/cancel behavior. Real Git path UI, review/check/publication reconciliation and external GitHub writing remain unverified. The public callback now reaches the API through Funnel on 4000 and returns the expected expired-setup response for a request without fresh OAuth state. D7 remains incomplete.

**D7 PR review checkpoint (2026-10-01):** Open proposals now receive bounded leased read-only polling, with exact deterministic PR identity, closure/merge status, retry timing and candidate-warning preservation. Closure retains drafts and releases local ownership; a merge queues current publishing-branch reconciliation without claiming publication success. Signed PR webhooks transactionally schedule review and merged-branch sync without copying private PR bodies. Latest regression passes 110 GitHub tests across 13 suites and API typecheck. Visible Chrome now needs reauthentication (fresh APIs return 401); real GitHub review remains unverified. Review across connection-generation changes, canceled-write reference recovery, merged publication/identity application and validation/publication checks remain incomplete. D7 stays open.

**D7 merged application checkpoint (2026-10-01):** Stable source identity and provider merged-commit proof now drive captured-version application through normal import/publication. Migrations `0016_docs_proposal_application` and `0017_docs_git_move_identity` are applied locally. Recognized moves and new Git files retain captured IDs; historical paths survive as tombstones. Import accepts GitHub review edits while preserving newer local drafts; only successful activation marks captured proposals published and releases ownership. Sync discovers merged open PRs before importing, preventing webhook/review ordering from creating duplicate identities. Minimal purged move references prevent reimport under a new ID. The GitHub checkpoint passed 119 tests across 13 suites; final verification passes 581 API tests across 86 suites (recorded live MediaLit cases excluded), all 26 focused source tests, API typecheck and diff checks. Visible public-site smoke confirms the existing article returns 200 and the unpublished draft remains 404. Admin reauthentication and real GitHub application verification remain pending. Canceled-write reference discovery, PR/base validation and check reporting, proposal/report UI, real OAuth/provider/browser evidence and release audits remain incomplete. D7 stays open.

**D7 proposal UI/history and recovery checkpoint (2026-10-01):** Private stable-cursor proposal history adds canonical `list_documentation_github_proposals` (134 tools), current redaction and merged SHA projection. Dashboard exact-version/path/removal review, PR/direct confirmation, idempotent retries, paginated history and private reports are implemented, with workspace/permission data fences. The preceding history regression passed 136 tests across 16 suites, dashboard tests passed 95 and typechecks passed. Read-only canceled-write recovery now discovers response-lost PR references and direct-write ancestry while preserving cancellation, purged bodies and revoked write authority. All 22 write/review tests pass. Final combined verification passes 139 tests across 16 suites, all 26 isolated source tests and API/dashboard typechecks. The notes retain an intermittent initial-sync fixture claim failure from the earlier 138/139 run; its root cause remains unproven. Current visible Chrome source/history requests return 401; installation approval, a disposable repository/branch and positive provider/browser evidence remain external gates. No additional paid AI or live repository writes occurred. Checks delivery/retry, PR head/base validation and final acceptance remain incomplete; D7 stays open. [D7 notes](#historical-d7-evidence) retain exact verification scopes and logs.

**D7 PR validation/check foundation checkpoint (2026-10-02):** Complete immutable proposed-merge validation now records head/base/merge proof, checks exact parents, rereads current provider state and fences source/draft/policy/purge versions. Conflicts fail, forks/unresolved mergeability remain explicitly incomplete, and valid empty candidates pass. Guarded check delivery recovers deterministic runs and lost annotation appends in batches of 50. Migration `0018_docs_pr_checks` is applied locally; callable leased jobs retain validation truth and retry delivery independently, supersede stale results and clear diagnostics during sensitive purge. Final local verification passes 184 tests across 20 suites, including GitHub, publication/purge and policy/catalog coverage, plus API typecheck and diff checks. Earlier partial/failed runs remain in the notes. Publication claim due/lease comparisons now consistently use the database clock. Visible Chrome now proves authenticated private source/history reads and strict invalid/missing-history responses; positive connected-source submission and live check delivery remain unverified. Scheduler/webhook/rerequest integration, private reports, publishing-branch checks, retention and external verification are still incomplete. [D7 notes](#historical-d7-evidence) distinguish service tests from release evidence. No live provider writes or additional paid AI occurred; D7 stays open.

**D7 scheduled checks/private reports checkpoint (2026-10-02):** The bounded production dispatcher processes durable PR validation/check-delivery jobs. Signed PR events, publishing-base pushes and exact App/repository/check rerequests enqueue fresh validation; new FrontLit PRs queue their first check directly, so a missing creation webhook cannot skip it. New deliveries supersede prior leases/results. Private stable-cursor REST/MCP report summaries and individual reports share docs-read policy and current restriction/purge redaction (136 tools). Dashboard check history and report routes separate validation truth from reporting status and fence workspace/request races. Local regression before the final PR-creation enqueue passes 169 API tests across 20 suites, 95 dashboard tests and API/dashboard typechecks. The final initial-PR enqueue and report integration run passes 50 tests across six suites plus API typecheck; [D7 notes](#historical-d7-evidence) retain exact scopes and logs. Visible Chrome verifies history/refresh, private empty history 200, oversized query 400 and missing-report UI/API 404. Positive connected-source/report/provider evidence, publishing-branch check delivery, complete missed-event reconciliation/retention and acceptance audits remain open; D7 is incomplete. No live GitHub writes or additional paid AI occurred.

**Acceptance-audit checkpoint (2026-10-02):** Migration `0021_docs_sync_diagnostics` now preserves complete failed-import diagnostic reports with policy/purge fences, Source/check projection and sensitive-purge erasure. Duplicate-route failures before publication creation retain both files and attempted SHA without replacing the live publication. Protected direct-write rejection offers PR recovery. New local tests cover concurrent REST/MCP saves, explicit importer capacity and actual 501-document sync/publication/serving. Complementary GitHub/foundation/transport/writer/profile/site/dashboard scopes pass in the exact artifacts listed in the [acceptance audit](#acceptance-audit), which maps all V01–V45 to evidence and remaining components. Headful Chrome recovered authenticated API access by revisiting localhost without a new login and verified private missing-proposal handling. The live workspace still has no Git binding; adoption/PR/check/merge/permissions/OAuth and recovery/restore/operator evidence remain unmet. No live fixture records, repository writes or extra paid AI were used. D6/D7 and the release gates remain incomplete.

**Final independent-ledger verification (2026-10-02):** The documentation/permissions/policy regression passes 306 tests across 33 suites with bounded concurrency, followed by six focused ledger tests including database rollback and a missing historical Git mapping. Real pre-purge PostgreSQL dump/restore/CLI replay passes and removes both generated databases. API typecheck passes. Fresh visible Source remains editor-owned with a ten-file adoption plan awaiting commit/verification/approval. GitHub installation now grants Checks and Pull requests write, but Contents remains read-only; Contents write approval still gates live branch/commit/PR testing. No remote repository writes, source activation, workspace purge or additional paid AI occurred. D6/D7 and deployment operator gates remain open.

**GitHub permission upgrade confirmed (2026-10-02):** A fresh installation API read confirms Contents, Pull requests and Checks write access after the user's update. The permission configuration gate is resolved. The current ten-file reviewed adoption still awaits commit, verification and original-admin interactive activation; separate export-PR consent has been requested because the export contains never-published drafts. The user's existing PR is untouched. Live proposal/check/merge and remaining operator evidence remain open.

**Publication crash/recovery checkpoint (2026-10-02):** Real PostgreSQL smoke now terminates a child worker with SIGKILL after activation commits and before invalidation. Recovery through a fresh connection preserves the live publication and original durable event; production signed HTTP delivery handles rejection/retry with retained destination acknowledgments and identical event payload. The disposable database is removed. This establishes the process-crash/backend-delivery component of V31, while deployed site-cache invalidation proof remains open. See `bun run test:docs-outbox-postgres` and the [acceptance audit](#acceptance-audit).

**Media transaction-race checkpoint (2026-10-02):** Actual PostgreSQL tests prove both lock orders and four simultaneous documentation-reference/media-deletion attempts, each permitting only one winner. Reference-first returns the specified `409 MEDIA_IN_USE`; deletion-first rejects the new reference. The former `MEDIA_REFERENCED` error was corrected to the specified code. `bun run test:docs-media-postgres` uses disposable metadata fixtures and dispatches no MediaLit calls. The V39 transaction-race component is verified; actual provider deletion completion remains unverified under the recorded provider limitation.

**Full API/process verification checkpoint (2026-10-02):** The complete API suite runs 655 tests across 95 suites: 654 pass and the sole failure reproduces accepted MEDIA-01 signed-group behavior. It is recorded as failing, not skipped or claimed green. Fresh real PostgreSQL process smoke with all GitHub App configuration removed proves editor save/publication/serving/lexical retrieval. Actual SIGKILL before activation preserves last-good content and expired-lease recovery activates once with one event; SIGKILL after commit preserves the event and signed HTTP retry. Disposable databases are removed and API typecheck passes. Deployment cache and live Git/consent/operator gates remain open; details are in the [acceptance audit](#acceptance-audit).

**Frontend/expired-setup browser checkpoint (2026-10-02):** Fresh dashboard/site/shared-editor scopes pass 97/45/89 tests and app typechecks pass. Visible Chrome verifies that expired setup rejects export verification while preserving editor ownership, the planned ten-file manifest and reviewed hash. The action now shows Authorize-again guidance instead of a raw error code. Snapshot and exact logs are in [D7 notes](#historical-d7-evidence). Export approval and final interactive adoption remain pending; no GitHub writes or source activation occurred.

**Setup-PR admission implementation checkpoint (2026-10-02):** Migration 0022 provides durable request/recovery storage; request/status schemas, admission guards, private status projection and cancellation fencing are implemented. Five new admission tests plus existing migration/publisher cases pass (16 across three suites), shared contract build/API typecheck/migration application pass. Automatic setup PRs are not operational: the guarded Git write/recovery/reconciliation worker, retry reauthorization, empty-repository bootstrap, REST/MCP policy wiring, Source UI and headful provider proof remain implementation work. No agent-created export PR substitutes for this feature.

**Setup-PR write checkpoint (2026-10-02):** The GitHub adapter now writes captured Markdown/Section metadata, deterministic setup commits/branches and disclosed setup PRs. The worker implements leased writes for an existing base branch, fresh local/provider authority before mutations, conflicting-directory rejection, preservation of acknowledged artifacts after in-flight cancellation and discovery of response-lost PRs. Explicit retry can renew setup/credential proof without losing remote references; canceled/closed/merged work is not silently reopened. Focused adapter/admission/worker verification passes 35 tests across two suites, including response loss and cancellation boundaries. The visible Chrome session remains signed in to `nice` after visiting localhost; no feature-level setup PR browser smoke or live remote write has been performed. Scheduler/error handling, empty-repository support, merge reconciliation, REST/MCP wiring and the Source action still require implementation before automatic setup PRs are operational.

**Live platform-created setup PR checkpoint (2026-10-02):** The scheduler, bounded transient retry/terminal diagnostics, REST `createMigrationPr`, MCP `create_documentation_git_migration_pr` and Source review/submit/progress UI are wired. Manual download/commit controls are removed. Headful Chrome submitted the existing reviewed ten-file capture for private `clbotdev/docs-site` through FrontLit, and the installation bot opened [setup PR #2](https://github.com/clbotdev/docs-site/pull/2), commit `620c4757333f9feda26033f379fbc6ba4e00247f`. GitHub shows ten changed files and FrontLit retains the open PR link across reload. The workspace remains editor-owned at docs draft version 54 and active publication `pub_bvnwtge4rvbnlx3kzb1rvo3j`. API verification passes 51 tests across five adapter/admission/worker/migration/policy/catalog suites; dashboard regression passes 97 tests across 22 suites; API/dashboard typechecks and shared contract build pass. The user has been asked to review/merge the concrete PR; FrontLit/agent has not merged or activated it. Empty-repository initialization, merge reconciliation, post-merge verification/adoption and the remaining D7/provider/operator gates are still open. This checkpoint supersedes earlier claims that no platform-created setup PR exists; it does not complete D6 or D7.

**Merged setup checkpoint (2026-10-02):** The user merged PR #2. Bounded leased reconciliation now records merged/closed outcomes without changing editor ownership; signed matching PR events or publishing-branch pushes wake it, with approximately one-minute polling as fallback. Tracking a created PR does not require the ten-minute setup proof to remain unexpired, but live workspace credential/policy and repository access are checked. Verification requires the matching platform-created PR, immutable merge SHA/branch ancestry and exact captured semantic content. Headful Source reports merged and verified at `d99918d37fe1dd71e249fd2a0642ddd6769e0b33`; original-administrator source consent/activation remains pending. Live GitHub push receipts exist for main; no recent pull_request receipt was observed, so polling supplied this merge proof. PR read tokens now include scoped Pull requests read permission. GitHub API 2026-03-10 removes merge_commit_sha from all PR responses ([breaking changes](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes)); PR reads use supported 2022-11-28 to retain validation proof. Focused adapter/migration/reconciliation/webhook verification passes 59 tests across four suites; details and remaining empty-repository/D7 gates are retained in the smoke notes. D6/D7 remain incomplete.

**Empty-repository implementation checkpoint (2026-10-02):** Migration 0023 permits a genuinely empty setup preflight to have no Git SHA/manifest; ordinary source connection/activation still requires a validated nonnull manifest. Planning requires GitHub's explicit empty-repository verdict and the repository's default branch; a missing branch in a nonempty repository remains an error. The reviewed Source action discloses/acknowledges placeholder-only initialization. The worker writes only `<directory>/.gitkeep` to the initial base, persists/reports the bootstrap SHA and recovers a response-lost initialization only when its marker, root commit, single placeholder path and bytes match. Foreign initial commits fail before docs writes. Empty editor captures contain only Section metadata, without inventing an article. The subsequent captured docs still use the normal setup PR. Focused adapter/admission/migration tests pass 54 across three suites; the preceding source regression passes within an 83-test/four-suite run; contract build, migration application and API/dashboard typechecks pass. This is local/provider-double evidence. No disposable empty repository has been initialized live, and its headful end-to-end smoke remains required. `nice` remains editor-owned pending the original administrator's activation consent; D6/D7 are not complete.

**Setup boundary and transport checkpoint (2026-10-02):** The setup/reconciliation suite now passes 21 tests, including revocation of the submitting session and workspace policy changes during provider reads, rate-limit backoff/recovery without duplicate PR creation, accepted bootstrap recording after cancellation, and rejection of a file occupying a parent of a nested docs directory. Ten REST/MCP transport tests pass, including session submission and scoped OAuth credential-reference parity, strict bodies, API-key denial and omission of captured bodies/session/bearer credentials. The transport harness mocks authentication middleware; it does not establish live OAuth bearer verification. API typecheck passes. Logs: `/tmp/frontlit-docs-setup-reconciliation-boundaries-tests.log`, `/tmp/frontlit-docs-setup-transport-final-tests.log`, `/tmp/frontlit-docs-setup-reconciliation-boundaries-types.log`. A fresh headful Source snapshot (`/tmp/frontlit-docs-smoke/setup-source-current.txt`) and HTTP 200 source read confirm merged/verified setup but editor ownership and no binding. Original-administrator activation and disposable empty-repository browser evidence remain outstanding; these local checks do not complete D6/D7.

**Current live adoption/editor-PR checkpoint (2026-10-02):** the original administrator completed source activation in visible Chrome. `nice` is now connected to `clbotdev/docs-site` (`main`, `docs`). The nine captured documents, eight published documents, one private draft, Section IDs, document versions, URLs, canonical prose and original active publication were verified after adoption (`/tmp/frontlit-docs-smoke/setup-adoption-integrity.log`, `setup-adopted-public-site.txt`, `setup-adopted-retrieval.json`). PR permission was reviewed interactively; direct commits remain disabled. The editor now provides **Create pull request**, flushes pending saves and preselects the current document/version for review. FrontLit created [PR #3](https://github.com/clbotdev/docs-site/pull/3) for the disposable D2 smoke document, changing only its title. The public page retained its old title before merge. GitHub validation passed, then the authorized visible browser merged it at `f46c5fa5bb46dce4a33f1f2e37bc57682509fe88`. FrontLit then published the merged commit automatically: proposal status is `published`, observed/validated/live SHAs all match the merge, and publication `pub_4wta1qeg762fvslv79q37h9q` contains eight public docs. Headful authenticated Chrome shows Published; the isolated public Chrome page at `http://nice.localhost:3002/docs/d2-smoke` shows the new title. The publication check was delivered with large ID `110867091910`. Evidence: `d7-post-merge-database.json`, `d7-post-merge-proposal-ui.txt`, `d7-post-merge-public-page.txt` under `/tmp/frontlit-docs-smoke`.

**Signed OAuth and setup resumption checkpoint (2026-10-02):** Three new isolated integration tests use the real Better Auth signer, local JWKS HTTP verification, production authentication/team/operation middleware and actual MCP SDK routing. Valid scoped REST and MCP tokens admit the same idempotent setup request; forged signatures, wrong issuer/audience, expiry, insufficient publish scope and revoked consent are rejected before remote work admission. Tokens are test-issued through the server-only signer; interactive authorization-code issuance and live OAuth Git writes remain unverified. GitHub provider verification is doubled. Source now returns only the initiating manager's latest unexpired planned/verified setup ID; read-only OAuth, other accounts/workspaces and expired plans cannot discover it, and no captured bodies are projected. A fresh visible Chrome session restored the existing merged/verified plan without its old session storage (`/tmp/frontlit-docs-smoke/setup-server-restored.txt`). The source/setup/OAuth regression passes 56 tests across three suites, separate OAuth/transport parity passes 13 across two suites, and dashboard regression passes 97 across 22 suites. Shared contract build and API/dashboard typechecks pass. Logs: `/tmp/frontlit-docs-setup-resume-final-api-tests.log`, `/tmp/frontlit-docs-oauth-real-transports-final-tests.log`, `/tmp/frontlit-docs-setup-resume-web-tests.log`. Original-administrator reconnection/activation and remaining live provider/operator gates remain open; D6/D7 are incomplete.

**D7 publication reporting checkpoint (2026-10-02):** Migration `0020_docs_publication_checks` is applied locally. Publishing-branch outcome checks now have durable independent delivery/retry, crash recovery from terminal sync truth, exact commit/publication proof, guarded source/policy authority, bounded code-only source annotations, current private REST/MCP/UI reports, scoped rerequests and purge/retention handling. Successful reporting never activates or rolls back docs, and unchanged reconciliation does not post duplicate checks. Final local regression passes 209 GitHub/publication/permission/policy/catalog tests across 23 suites, 97 dashboard tests across 22 suites, the 26-test transport/purge scope and the 12-test final annotation/delivery scope; typechecks/build/migration/diff checks pass. Visible Chrome verifies authenticated history/Refresh and negative report handling; `nice` remains editor-owned with no real check records. Live adoption, permission upgrades, provider PR/check/merge/direct/protected-branch/OAuth verification and final acceptance audits remain incomplete. The [operator runbook](#operations-runbook) exists, but recovery/rotation procedures still require live evidence. [D7 notes](#historical-d7-evidence) retain exact scopes. D7 is not complete.

**D7 reconciliation and live setup checkpoint (2026-10-02):** Migration `0019_docs_pr_reconciliation` is applied locally. Connected sources independently discover open PRs every fifteen minutes, preserve active report leases/provider backoff, and enqueue fresh validation when immutable merge or policy proof changes. Discovery failures are separate from import/publication failures. Terminal check reports receive bounded thirty-day cleanup while pending reports are retained. Current GitHub/policy/catalog regression passes 172 tests across 20 suites; dashboard regression passes 97 across 22 suites, and publication/permission regression passes 27 across two suites. These are local service/provider-double tests, not live Git writes. [D7 notes](#historical-d7-evidence) record exact scopes and logs.

**Empty-repository live checkpoint (2026-10-02):** Visible Chrome created a private empty disposable repository and separate empty smoke workspace. Nonempty-repository setup with a nonexistent branch returns 409 without creating an adoption plan or binding; editor ownership and zero docs are retained. Obsolete manual-initial-commit error guidance is corrected and browser-verified. The empty repository still needs access through the existing App installation; GitHub presents its password Confirm access challenge, which the user must complete directly despite authorizing GitHub actions. Bootstrap/setup PR/merge remains unverified. Details and evidence are in [D6 notes](#historical-d6-evidence); V49 remains open. No services were started or paid AI calls made.

**Live delivery and cancellation checkpoint (2026-10-02):** Real activation outbox events show both destination acknowledgments. The running Next sites endpoint accepts signed exact replay and rejects conflicting, forged and expired requests; the isolated public page still renders and has no admin cookies, while private APIs return 401. A metadata-only setup plan in the empty disposable workspace was reviewed and canceled in visible Chrome, retaining editor ownership with no PR/binding. [D6](#historical-d6-evidence) and [D7 notes](#historical-d7-evidence) record exact evidence and limits. Production cache/restart, docs-only-author browser, live setup file-mismatch and cancellation-during-write gates remain open.

**Setup correction checkpoint (2026-10-02):** FrontLit created metadata-only smoke setup PR #9. Visible GitHub merge followed by an upstream Section change produced blocking `MIGRATION_SECTIONS_MISMATCH`; exact correction verified without source activation. Failed rechecks now clear the old stored proof, and Source exposes a correction heading and visible retry. Browser reload/retry/cancellation passed before a runtime reset. [D6 notes](#historical-d6-evidence) record exact plan/hash/commit identities, fresh local regression and the evidence limitation: temporary browser artifacts were lost, services are unavailable and were not restarted. `nice` advanced to a new Git publication pointer; final canonical-docs/routes comparison and fresh provider recheck remain open. D6/D7 remain incomplete.

**Post-reset provider checkpoint (2026-10-02):** Fresh read-only App verification proves all 24 entries of the configured `docs` subtree unchanged across the smoke commits and confirms setup PR #9 merged at `4b23a1bf8b71238cd4b83aa1e64a70c0a23b5f97`. PR #1 still has a stale synthetic merge parent and is not accepted. Database/API/web/sites remain unavailable and Chrome is blank across repeated checks; the user controls service startup. Remaining database/browser/provider/operator release gates stay open. [D6](#historical-d6-evidence) and [D7](#historical-d7-evidence) notes distinguish fresh remote proof from the interrupted local/public comparison.

**Local recovery and preservation checkpoint (2026-10-02):** The user restored Docker/PostgreSQL and local services; API startup refusal was database availability, not an API code defect. Fresh database comparison proves the new `nice` publication retains all ten document identities/routes/canonical snapshots from the pre-smoke publication. Canceled smoke setup remains editor-owned with no binding. Fresh isolated headful Chrome follows the companion link to the renamed deep page, retains old-route 404 and reads the ten-doc anonymous API snapshot with no cookies. [D6 notes](#historical-d6-evidence) supersede the earlier runtime blocker. Empty-repository installation still needs the user’s GitHub Confirm access check; other D6/D7 gates remain open. No services were started by the agent.

**Live upstream conflict checkpoint (2026-10-02):** Headful editor submission of companion draft version 7 after an external same-file Git change returns `UPSTREAM_CHANGED` and creates no commit/PR. Actual local title/version/base and upstream title/head are retained. After proof, fixture cleanup restores the exact configured Git subtree, normal discard yields clean version 8, and the isolated public page retains its original title/link. V22 is now verified live; [D7 notes](#historical-d7-evidence) record exact identities and assertions. Remaining gates still prevent D6/D7 completion.

**Acceptance checkpoint (2026-10-03):** Fixes: MCP typed-content and team-settings tools leaked undeclared columns, so the SDK reported successful writes as output-validation errors (new SDK-level `src/mcp/content-output.test.ts`); the real-PostgreSQL smoke fixture predated the setup-PR requirement; a closed setup PR hid its Cancel action inside collapsed details. New evidence: V32 in-flight withdrawal (service), V43 authenticated REST/MCP adoption race and V45 tenant burst on real PostgreSQL, V13/V15 adversarial callback/signature rejection against the running API, V31/V07 isolated production-mode site cache/restart, V27 501-doc public navigation, and live headful V47 (double-submit → one setup PR #14, closed-unmerged reconciliation, cancel), V40 docs-only author isolation and V41 injected-ticket/docs-only reviewer redaction and idempotent drafting. Full API suite 711/712 (MEDIA-01 only); dashboard 97/97; API/dashboard typechecks pass. Open gates: V49 and V23 (approved by the user, pending clarification), V17/V19 (destructive live changes), App-token-dependent redelivery/revocation timing (V13/V15 replay, V35/V36/V44/V48), deployed operator checks (V38, production V45) and live MediaLit (V37/V39). Details in the [acceptance audit](#acceptance-audit). D6/D7 remain open.

**Overnight acceptance checkpoint (2026-10-03):** With user approval, live V49 passed end to end: the App was granted the empty private repository, FrontLit bootstrapped `main` with only `docs/.gitkeep`, opened setup PR #1 adding only `docs/_sections.json`, and after merge verified and activated the source with no invented or published article. New live MediaLit tests (`provider-guarantees.integration.test.ts`) prove forged-ID refusal, provider deletion completion and doc suppression only after confirmed access loss (V37 partial, V39 closed). V17 passed live in the disposable repository: a directly committed doc was published by webhook sync, and after the user deleted it the webhook sync activated an empty publication with the route, search hit and listing removed. V23 passed live after the user made the disposable repository public, protected `main` and enabled direct commits: the direct write was rejected without force or state change, the report offered the pull-request path and the fallback PR passed validation; the fallback dialog now preselects the rejected files. Final regression: API 713/714 (MEDIA-01 only), dashboard 97/97, sites 45/45, API/dashboard typechecks pass. D6/D7 remain open at the gates listed in the [acceptance audit](#acceptance-audit).

**Live-gate checkpoint (2026-10-03, morning):** With the user's approvals (disposable repository made public and protected, direct commits enabled, a temporary scoped permission rule for one-off live scripts, since removed), V13, V15, V17, V23, V35, V36, V44 and V48 now have live evidence in addition to the overnight V49/V37/V39 results. Fixes found by these runs: the protected-branch PR fallback preselects the rejected files; a stopped setup names its already-created commit/branch and offers Start a new setup; a removed repository grant reports `GITHUB_ACCESS_LOST` instead of admin-required; the dashboard shows API messages instead of raw codes. V19 then passed live with the user's go-ahead (suspension mid-write: no further Git writes, binding fenced, site live, clean recovery). Remaining gates: deployed-operator V38 and production V45, and V37's upload-intent reuse under the accepted MEDIA-01 exception. D6/D7 are otherwise verified; see the [acceptance audit](#acceptance-audit).

**Sign-off (2026-10-03):** D1–D7 are implemented, and every acceptance scenario V01–V49 has passing local, real-PostgreSQL or live evidence. Per the rule below, the foundation, Git dogfood and full-authoring releases are signed off for local and staging use. Production launch has three explicit gates, all recorded in the [acceptance audit](#requirement-and-release-disposition): deployment backups/retention (V38), one deployed scale and cache exercise (V07/V31/V45), and the accepted MEDIA-01 provider exception.

### 31.10 Earlier audit and runtime recovery observations

Historical pre-adoption checkpoint (superseded by current live evidence): Headful Chrome smoke confirmed that returning to `http://localhost:3000` recovered authenticated API access after an isolated 401; do that before requesting a new sign-in. The missing private proposal endpoint returns 404 with `private, no-store` and `noindex`. Positive new report/recovery screens remain unverified because no real Git binding or proposal records exist. No fixture records were injected into the live workspace to claim browser success.

Historical restore/race follow-up (2026-10-02; superseded by current live adoption): the runtime restarted, so dev services and Docker Desktop were recovered and local migrations applied without resetting the existing workspace. Fresh headful Chrome navigation to `http://localhost:3000` returned authenticated `nice` Source HTTP 200; it remains editor-owned/unconfigured. A read-only provider probe found installation permissions only `contents: read`/`metadata: read`, publishing head `bdb8583184d0e2daac4b1b36cd0730b2eb30367e`, and no managed Markdown or `_sections.json` on `main`. Thus manual export commit/adoption and an owner-approved App permission upgrade remain concrete live gates. The user-created PR has not established published source content or FrontLit checks.

Scope revision (2026-10-02): the user explicitly removed manual export/commit from the desired setup workflow. Current §21.5 and V46–V49 require platform-created setup/adoption PRs; the prior pending separate agent-export consent is obsolete. The fresh ten-file plan `gmig_e6xc02vn3tjqkg5pg0siugxa` produced PR #2 through the product endpoint/worker/UI, then passed merged verification. This supersedes historical manual-commit and no-PR checkpoints above. D6/D7 remain open at their unverified live/provider/operator scopes.

#### Resume the browser smoke after a runtime reset

A runtime reset cleared Chrome and temporary `/tmp` evidence while the final setup-correction integrity comparison was running. The user owns service startup: do not start/restart database, API, web or sites without a new instruction. Once the user has them running, verify listeners and HTTP responses, then use a **visible Chrome MCP** session. Visit `http://localhost:3000` before asking for sign-in; route/login screens can appear while the session remains intact. If authentication is genuinely gone, the user signs in directly. Existing authorization to perform GitHub smoke actions persists, but GitHub password/2FA challenges are completed by the user in the visible window.

Resume from the following retained identities rather than creating replacement resources:

- `nice`: `team_hek5byq4ipm2xrixbr91nadi`, installation 166984494, private `clbotdev/docs-site` repository 1400616205, `main`, directory `docs`. Direct commits remain disabled.
- Empty smoke workspace: `team_qtbey05dmpaiwu2jxll5a1ft`. Recheck that it is editor-owned with no source binding; do not accidentally activate it against the existing docs repository.
- Empty private repository: `clbotdev/frontlit-docs-empty-smoke`. Its App access still requires completion of GitHub installation **Confirm access**, then adding this repository while retaining `docs-site`. No bootstrap was observed.
- Setup correction plan: `gmig_e2det5uneh2wee6ptu0gpeyy`, [merged bot PR #9](https://github.com/clbotdev/docs-site/pull/9). Cancellation was observed after correction; first read the actual current plan/PR status. Its retained fixture is `frontlit-smoke-empty-review/_sections.json`, outside the configured `nice` docs directory. Corrected commit: `d40781e4509e8d06b68356812205ce68a16558a2`.

Before the reset, `nice` advanced from `pub_ua2jl9ukinqq8dg42tfnse8d` to `pub_244ao3s11giyaf76lpe8toog` while reconciling newer repository commits. A new immutable publication pointer alone is not a content regression. The final document/route comparison was **not completed**. Execute this read-only query against the restored running development database and inspect both counts and differences; it is prepared here, not claimed as executed. It compares the current publication to the pre-test one, ignoring only draft-version counters and retaining canonical title, slug, body, excerpt, featured image and metadata in the comparison.

```sql
WITH before_docs AS (
  SELECT m.document_id, m.route, r.snapshot - 'draftVersion' AS snapshot
  FROM documentation_memberships m
  JOIN documentation_revisions r ON r.revision_id = m.revision_id
  WHERE m.publication_id = 'pub_ua2jl9ukinqq8dg42tfnse8d'
), after_docs AS (
  SELECT m.document_id, m.route, r.snapshot - 'draftVersion' AS snapshot
  FROM documentation_memberships m
  JOIN documentation_revisions r ON r.revision_id = m.revision_id
  JOIN documentation_settings s ON s.active_publication_id = m.publication_id
  JOIN teams t ON t.id = s.team_id
  WHERE t.team_id = 'team_hek5byq4ipm2xrixbr91nadi'
), differences AS (
  (SELECT * FROM before_docs EXCEPT ALL SELECT * FROM after_docs)
  UNION ALL
  (SELECT * FROM after_docs EXCEPT ALL SELECT * FROM before_docs)
)
SELECT (SELECT count(*) FROM before_docs) AS before_count,
       (SELECT count(*) FROM after_docs) AS after_count,
       (SELECT count(*) FROM differences) AS difference_count;
```

Require both counts to be ten and difference_count zero for this fixture. A missing historical publication is missing evidence, not success. Then reload the isolated public deep route and companion link, and confirm the old renamed route remains 404. Record the new verification command, date, results and limitations in this document; keep raw output in a temporary location when needed for debugging. Never save cookies, authorization headers, signing secrets or raw provider tokens.

Post-reset local setup verification passed 32 tests across two suites and API/dashboard typechecks. Historical provider/browser observations are detailed in the D6/D7 notes; their lost temporary files are not fresh evidence. Continue remaining live gates from the acceptance audit after integrity and installation access are restored.

Recovery checkpoint: the user subsequently restored Docker/local services. The API refusal was missing PostgreSQL at 127.0.0.1:5433; no API code change was required. The final publication comparison now passes (ten versus ten, identical canonical snapshots/routes), and fresh isolated public link/new-route/old-404 checks pass. The reset instructions above remain useful for future interruptions; they no longer describe the current availability blocker. GitHub installation Confirm access remains pending for the empty repository.
