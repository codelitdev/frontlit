# AI-assisted page editing — architecture

Humans edit pages in the WYSIWYG builder today. This document describes how
the same pages become editable through natural language ("Make the hero area
background green") with an AI emitting changes that are guaranteed to be
compatible with the editor — including for third-party blocks registered at
load time.

## Goals

1. A user types an instruction into a prompt box inside `PageBuilder`; the AI
   modifies the page and the result shows up in the preview like any manual
   edit — undoable, diffable, persisted through the same `onChange`.
2. The AI can never produce a layout the renderer or the settings panels
   can't handle. Invalid output is caught **before** it touches builder
   state, never after.
3. Custom blocks are first-class: a block registered by the host app is as
   editable by AI as a built-in one, with no changes to this package.
4. The package stays backend-free. It ships everything _around_ the model
   call (schemas, prompts, validation, state application); the host app owns
   the model call itself (API keys, provider choice, streaming).

Non-goals (for now): AI-driven theme _creation_, image generation, multi-page
edits, and free-form generation of entire sites from scratch. The design
leaves room for all of these but they are not covered here.

## The two problems to solve

Everything below falls out of two observations about the current code:

**1. Settings shapes are invisible at runtime.** A block's settings are a
TypeScript interface (`HeroSettings`, `GridSettings`, …) that is erased at
compile time. The AI needs a machine-readable description of every block's
settings — both to know _what it can write_ and so we can _validate what it
wrote_. So blocks must start carrying a runtime schema.

**2. Whole-layout generation is the wrong output format.** Asking the model
to re-emit the full `WidgetInstance[]` for every instruction is slow,
expensive, and risky — one hallucinated field in an _untouched_ block
corrupts the page. Instead the AI emits a small list of **operations**
(the same operations the builder UI already performs: update settings, add,
move, remove) that are validated and applied atomically.

## Architecture overview

```
┌────────────────────────── browser ──────────────────────────┐
│  PageBuilder                                                 │
│  ┌───────────┐   prompt +        ┌────────────────────────┐  │
│  │ AI prompt │─── AiEditContext ─▶ host-provided transport │  │
│  │ box       │                   └───────────┬────────────┘  │
│  └───────────┘                               │ HTTP          │
│        ▲                                     ▼               │
│        │ apply / undo        ┌── host app server route ────┐ │
│  ┌─────┴──────────┐          │  LLM loop (any provider)    │ │
│  │ validate ops   │◀── ops ──│  tools & prompts built from │ │
│  │ + diff preview │          │  @frontlit/page-builder/ai  │ │
│  └────────────────┘          └─────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

Four layers, from the inside out:

| Layer                         | Lives in                        | Responsibility                                           |
| ----------------------------- | ------------------------------- | -------------------------------------------------------- |
| **Block AI contract**         | each block (built-in or custom) | Runtime schema + prompt guidance for its settings        |
| **Operation model**           | `@frontlit/page-builder/ai`     | The edit vocabulary: typed ops, validation, atomic apply |
| **Context & prompt assembly** | `@frontlit/page-builder/ai`     | Turns builder state + registry into what the model sees  |
| **Transport & UI**            | `PageBuilder` + host app        | Prompt box, host-owned LLM call, diff preview, undo      |

The `/ai` subpath export is **isomorphic and React-free** so a server route
can import it without dragging in the component tree.

---

## Layer 1: the block AI contract

`Widget<T>` (in `src/models/widget.ts`) grows one optional field:

```ts
export interface WidgetAiDefinition<T extends WidgetDefaultSettings> {
    /**
     * Runtime schema for the block's settings. Source of truth for both
     * the JSON Schema shown to the model and the validation of its output.
     */
    schema: ZodType<T>;
    /**
     * Guidance injected into the prompt when this block is in play:
     * what the block is for, non-obvious field semantics, constraints
     * the schema can't express ("buttonAction is a URL or anchor").
     */
    guidance?: string;
    /** Few-shot examples: instruction → settings patch. */
    examples?: Array<{ prompt: string; patch: Partial<T> }>;
    /**
     * One-line digest of an instance ("Hero: 'Run your whole business…'")
     * used in the layout outline so the model can resolve references like
     * "the hero area" or "the section about pricing".
     */
    describeInstance?: (settings: T) => string;
}

export interface Widget<
    T extends WidgetDefaultSettings = WidgetDefaultSettings,
> {
    metadata: WidgetMetadata;
    widget: ComponentType<WidgetProps<T>>;
    editor?: ComponentType<WidgetEditorProps<T>>;
    getDefaultSettings?: () => Partial<T>;
    layouts?: BlockLayout[];
    ai?: WidgetAiDefinition<T>; // ← new
}
```

Why Zod rather than raw JSON Schema: authors get type-checking against their
existing settings interface (`z.ZodType<HeroSettings>` fails to compile if
the schema drifts from the type), and we get `safeParse` for validation for
free. JSON Schema for the model is _derived_ (via `z.toJSONSchema` /
`zod-to-json-schema`), never hand-written. Block authors who prefer plain
JSON Schema can still supply it — the AI layer only needs
`{ toJsonSchema(), validate(value) }` — but Zod is the documented path.

Shared pieces are defined once in the package and reused by every block:

```ts
// @frontlit/page-builder/ai
export const sectionBackgroundSchema: ZodType<SectionBackground>;
export const mediaSchema: ZodType<Media>;
export const richTextSchema: ZodType<TextEditorContent>; // see "Rich text" below
export const widgetDefaultSettingsSchema: ZodType<WidgetDefaultSettings>;

// blocks/hero/ai.ts
export const heroAi: WidgetAiDefinition<HeroSettings> = {
    schema: widgetDefaultSettingsSchema.extend({
        title: z.string().optional(),
        description: richTextSchema.optional(),
        buttonCaption: z.string().optional(),
        buttonAction: z.string().optional(),
        // ...
        layout: z
            .enum(["normal", "card", "centered", "media-below"])
            .optional(),
    }),
    guidance:
        "The page's primary above-the-fold section. `buttonAction` and " +
        "`secondaryButtonAction` are URLs or #anchors. Prefer editing the " +
        "existing hero over adding a second one.",
    describeInstance: (s) => `Hero: “${s.title ?? "untitled"}”`,
};
```

Note the `layout` enum is derivable from `Widget.layouts`; the schema builder
helper does that automatically so the two can't disagree.

### Registration and extensibility

The static `blockRegistry` becomes a **registry value** constructed by the
host and passed in as a prop, rather than a module-global that blocks
mutate on import (this mirrors `@sendlit/email-editor`'s `blocks` prop,
already proven in production):

```ts
// src/registry.ts
export function createBlockRegistry(
    blocks?: Widget<any>[],        // defaults to the built-in set
): BlockRegistry;                  // keyed by metadata.name

// host, at load time
const registry = createBlockRegistry([...defaultBlocks, myCustomBlock]);

<PageBuilder blocks={registry} ... />
<PageRenderer blocks={registry} ... />   // published pages use the same set
```

A value beats a global: no shared mutable state, no import-order footguns,
multiple builders with different block sets can coexist, and each
environment (client, server route) constructs its own registry explicitly.
Omitting `blocks` gives the built-ins, so the zero-config experience is
unchanged. **The AI layer discovers blocks through the same registry
value** — context assembly, tool schemas, and validation all take it as an
argument — so a registered block with an `ai` definition is automatically
promptable, with zero extra wiring.

Because the host's server route also needs the schemas but not the React
components, the `/ai` subpath builds its registry from a
components-optional shape:

```ts
// host server route — no React needed
import { createAiBlockRegistry } from "@frontlit/page-builder/ai";
const aiRegistry = createAiBlockRegistry([
    ...defaultBlockAiDefinitions,
    { metadata: testimonialMetadata, ai: testimonialAi },
]);
```

Convention for block authors: keep `metadata`, `settings`, and `ai` in files
that don't import React (the built-in blocks already split
`metadata.ts` / `settings.ts` / `widget.tsx` this way), so the same modules
work in both environments.

**Graceful degradation:** a block _without_ an `ai` definition is still
visible to the model — it appears in the layout outline (via
`metadata.displayName` + `description`) and can be **moved, removed, or
added with default settings**, but its settings are read-only to AI. The
model is told this explicitly so it can answer "I can't restyle the
Testimonial block, but I can move it" instead of hallucinating fields.

---

## Layer 2: the operation model

The AI's only way to change a page is this vocabulary — deliberately the
mirror image of what `PageBuilder`'s UI can do, so anything the AI does is
by construction something the human could have done by hand:

```ts
// @frontlit/page-builder/ai
export type AiOperation =
    | {
          op: "update-settings";
          widgetId: string;
          /** RFC 7396 JSON Merge Patch against the instance's settings. */
          patch: Record<string, unknown>;
      }
    | {
          op: "add-block";
          name: string; // registry key
          /** "start" | "end" | widgetId to insert after. Default "end". */
          position?: string;
          settings?: Record<string, unknown>; // merged over getDefaultSettings()
          /** Model-chosen handle so later ops in the same plan can target it. */
          ref?: string;
      }
    | { op: "remove-block"; widgetId: string }
    | { op: "move-block"; widgetId: string; position: string }
    | { op: "update-theme"; patch: Record<string, unknown> }
    | { op: "update-seo"; patch: Record<string, unknown> };

export interface AiEditPlan {
    /** Model's one-line summary, shown to the user above the diff. */
    summary: string;
    operations: AiOperation[];
}
```

Design decisions:

- **Merge patch, not full replacement.** For "make the background green"
  the model emits `{ background: { type: "color", backgroundColor: "#22c55e" } }`
  and every field it didn't mention survives untouched. `null` deletes a
  key (per RFC 7396). Arrays (grid items, FAQ items, pricing tiers) are
  replaced wholesale — the merge-patch standard behavior. That's acceptable:
  item lists are small, and the model receives the current array in context
  so it re-emits it with the change applied. If this proves error-prone for
  very long lists, a targeted `update-item` op can be added later without
  breaking the vocabulary.
- **The model never invents `widgetId`s.** It only echoes ids it was shown
  in context, or uses `ref` handles for blocks it just added; the client
  generates real ids via the existing `generateUniqueId()` on apply. This
  removes an entire class of collision/forgery bugs.
- **Ops are data, not code.** The same `AiEditPlan` JSON works as a tool-use
  result, an SSE payload, an audit-log entry, and an undo-stack frame.

### Validation and atomic apply

```ts
export function validatePlan(
    plan: unknown,
    state: PageBuilderState,
    registry: BlockRegistry,
): { ok: true; plan: AiEditPlan } | { ok: false; errors: PlanError[] };

export function applyPlan(
    state: PageBuilderState,
    plan: AiEditPlan,
    registry: BlockRegistry, // for getDefaultSettings on add-block
): PageBuilderState; // pure — never mutates, never throws on a validated plan
```

`validatePlan` checks, in order:

1. **Structural:** the payload parses as `AiEditPlan` (its own Zod schema).
2. **Referential:** every `widgetId` exists in `state.layout` (or is a `ref`
   introduced earlier in the plan); every `add-block.name` is registered;
   singleton layout blocks (`header`, `footer`) are not added twice, not
   removed, and not moved into the body (reusing `LAYOUT_BLOCK_NAMES`);
   `deleteable: false` instances are not removed.
3. **Semantic:** for each `update-settings`/`add-block`, the merge patch is
   applied to a _copy_ of the current settings and the **result** is run
   through the block's `ai.schema.safeParse`. Validating the merged result
   rather than the patch is what makes partial patches safe. Blocks without
   an `ai` schema reject settings patches here.
4. Theme/SEO patches validate against `themeSchema` / `seoSchema` the same
   way.

Validation is **all-or-nothing**: one bad op rejects the whole plan. Partial
application would leave the page in a state neither the user nor the model
asked for, and the errors are precisely what the repair loop (below) needs
to fix the plan wholesale.

`applyPlan` is a pure reducer over `PageBuilderState` reusing the same
insertion semantics as the builder UI (e.g. "end" inserts above the footer,
matching `addWidget` in `page-builder.tsx`). Pure means: trivially
unit-testable, trivially undoable (keep the previous state), and usable
server-side for batch/agentic edits later.

---

## Layer 3: context and prompt assembly

What the model sees is assembled from builder state + registry by pure
functions in `/ai`:

```ts
export function buildAiEditContext(
    state: PageBuilderState,
    registry: BlockRegistry,
    opts?: { selectedWidgetId?: string },
): AiEditContext;

export function buildSystemPrompt(context: AiEditContext): string;
export function buildToolDefinitions(context: AiEditContext): ToolDefinition[];
```

`AiEditContext` contains three tiers, ordered by cost:

1. **Layout outline** (always included, tiny): one line per instance —
   `widgetId`, block `name`/`displayName`, `settings.cssId` if set, and the
   block's `describeInstance` digest. This is how "the hero area", "the
   section about pricing", or "the second FAQ" resolve to a `widgetId`.
   Plus the current theme's name/colors summary and the page's SEO basics.
2. **Block catalog** (always included, small): for every _registered_ block,
   `name`, `displayName`, `metadata.description`, and whether it is
   AI-editable — enough for the model to decide "this needs a new
   `email-form` block" without seeing any schemas.
3. **Full block schemas + current settings** (included on demand, large):
   JSON Schema (derived from Zod), `guidance`, `examples`, and — for
   instances being edited — their current settings JSON.

Tier 3 is where token budgets go to die if included wholesale (15 built-in
blocks × full `SectionBackground`/theme schemas, plus custom blocks), so it
is delivered through a **tool call** rather than stuffed into the prompt:

```
Tools exposed to the model:
  get_block_details(names: string[])   → tier-3 payload for those blocks
  propose_edit_plan(plan: AiEditPlan)  → terminal; validated client/host-side
```

The typical exchange is two model turns: the model reads the outline,
calls `get_block_details(["hero"])`, then calls `propose_edit_plan`. Simple
hosts can skip the tool loop by pre-including tier 3 for the blocks present
in the layout (`buildAiEditContext` supports both via an `inline: boolean`
option) at the cost of a bigger prompt — a fine trade below ~10 block types.

The system prompt (versioned inside the package, so prompt fixes ship with
schema fixes) instructs the model to: prefer the smallest edit that
satisfies the instruction; never touch blocks it wasn't asked about; use
theme edits for site-wide requests and settings edits for section-scoped
ones; resolve colors to the theme palette when the user names one ("green" →
a palette-compatible green, exact hex only if the user gave one); and ask
for clarification via a plain-text reply instead of guessing when the target
is ambiguous.

### The repair loop

When `validatePlan` fails, the errors (path, message, offending value —
Zod's output, human-readable) are returned to the model as the tool result
of `propose_edit_plan`, and it gets **one** retry. Schema-guided repair
fixes the overwhelming majority of failures (wrong enum casing, string where
number expected); a second failure surfaces to the user as "I couldn't apply
this change" with the model's summary — never a broken page.

---

## Layer 4: transport and UI

The package renders the prompt box and owns the approve/undo flow; the host
owns the model. The seam is one function:

```ts
export interface AiEditRequest {
    prompt: string;
    context: AiEditContext; // serializable
    history?: AiTurn[]; // prior prompts+plans this session
}

export type AiEditResponse =
    | { type: "plan"; plan: AiEditPlan }
    | { type: "message"; text: string } // clarification / refusal
    | { type: "error"; message: string };

export interface PageBuilderProps {
    // ...existing props
    ai?: {
        transport: (req: AiEditRequest) => Promise<AiEditResponse>;
        /** Auto-apply valid plans instead of showing the review step. */
        autoApply?: boolean;
    };
}
```

The prompt box renders only when `ai` is provided, keeping the package fully
functional without it. The host's transport is typically a `fetch` to its
own API route, where it runs the LLM loop with whatever provider it likes,
using the `/ai` helpers to build prompts/tools and to run `validatePlan` for
the repair turn (context is serializable, so server-side validation works —
provided the server's AI registry was built from the same blocks).

Client-side flow in `PageBuilder`:

1. User submits prompt → `buildAiEditContext(currentState)` → `transport`.
2. On `plan`: **re-validate locally** (the client's registry is the source
   of truth; the server may be stale) and apply to a scratch copy via
   `applyPlan`. Show the result live in the existing `PreviewFrame` with the
   plan's `summary` and a per-op change list, plus **Apply / Discard**.
3. Apply commits the new state through the normal `setLayout`/`setTheme`
   paths — so `onChange` fires, persistence works, nothing downstream knows
   AI was involved. The pre-edit state is pushed onto an undo stack
   (`applyPlan`'s purity makes undo = "restore previous state object").
4. On `message`: render it in the prompt box thread; the user can answer
   ("the _first_ hero") and `history` carries the exchange.

Human edits and AI edits interleave freely because they converge on the same
state and the context is rebuilt from live state on every request — the AI
always sees the human's latest manual tweaks.

---

## Host-injected capabilities

Two injection points let blocks and the editor reach host-owned data and
infrastructure without this package growing a backend. Both feed the AI
layer as much as the human one.

### Configured blocks (block-specific dependencies)

Data-backed blocks — a product grid, a testimonial wall fed by a CMS — ship
a **factory** instead of a singleton and are configured at registration:

```ts
// A block that renders the host's real products
export function createProductsBlock(deps: {
    getProducts: (opts?: { ids?: string[]; query?: string }) => Promise<ProductSummary[]>;
}): Widget<ProductsSettings> { ... }

// host, at load time (a Widget.configure(deps) helper can sugar this)
const registry = createBlockRegistry([
    ...defaultBlocks,
    createProductsBlock({ getProducts: fetchProducts }),
]);
```

This is the same `Block.configure(config)` convention
`@sendlit/email-editor` uses for its image block (docs:
`email-blocks/email-editor.mdx`), extended beyond wrapping the settings UI:
here `configure` can also bind data fetchers and AI tool executors. The
registry is the single indirection point for renderer, builder, and AI
context assembly, so a configured block is indistinguishable from a static
one everywhere downstream. One hard rule makes this safe:

> **Handlers live in the block definition; persisted settings stay pure
> JSON.** `WidgetInstance.settings` stores _references_ (`productIds`,
> `{ query: "featured" }`); the widget resolves them through the injected
> handler at render time. This preserves the invariant that everything AI
> validation, persistence, and undo operate on is serializable data.

Injected handlers can also back **model-callable tools**, declared on the
block's AI definition:

```ts
ai: {
    schema: productsSettingsSchema,   // productIds: string[], columns, ...
    tools: [{
        name: "list_products",
        description: "Search the site's products; returns ids, names, prices.",
        parameters: z.object({ query: z.string().optional() }),
        execute: (args) => deps.getProducts(args),
    }],
}
```

Context assembly merges block tools into the tool list next to
`get_block_details`; the host's LLM loop dispatches them. "Add a section
showing our products" then resolves end-to-end: the model calls
`list_products`, gets real ids, and emits an `add-block` whose `productIds`
validate against the schema — no placeholder content, no invented data.
Executors are live queries, not values baked into the context at assembly
time, so the model always sees current data.

Environment note: the LLM loop runs in the host's server route, where
`execute` should be the direct server function; the client registers the
same block with a client-side fetcher (or an isomorphic one). Same block
name, environment-appropriate deps — the same client/server registration
split as Layer 1. The published-site `PageRenderer` needs the configured
block registered too; registration is host bootstrap shared by builder and
renderer.

### Host services (cross-cutting: media upload, link pickers, …)

Media upload is cross-cutting — every block with an image needs it, plus
the TipTap editor — and it has a UI half (the picker a human clicks) and a
programmatic half. It is injected once, on `PageBuilder`, and delivered via
context:

```ts
export interface HostServices {
    media?: {
        /**
         * Minimal contract, borrowed from @sendlit/email-editor's image
         * uploader: the package renders its own upload button; the host's
         * wrapper receives it as `children`, intercepts the click, runs
         * its upload flow, and returns data via `onChange`. Host controls
         * behavior, package controls the look.
         */
        Uploader?: ComponentType<{
            value?: Media;
            onChange: (media?: Media) => void;
            children: ReactNode;
        }>;
        /** Full replacement UI for hosts with a browsable media library. */
        MediaSelector?: ComponentType<{
            value?: Media;
            onChange: (media?: Media) => void;
            accept?: "image" | "video";
        }>;
        /** Programmatic half — also backs the AI's list_media tool. */
        list?: (query?: string) => Promise<Media[]>;
        upload?: (file: File) => Promise<Media>;
    };
    // later: links (page/anchor picker), analytics, …
}

<PageBuilder services={{ media: myMediaService }} />
```

One rule uploads must obey here that sendlit's demo (data-URL uploader)
doesn't need: **uploads resolve to hosted URLs / `Media` objects before
entering settings.** The layout JSON is serialized into AI context, undo
frames, and persistence on every edit — a base64 image inlined into
settings would ride along in every prompt. The programmatic `list`/`upload`
functions exist separately from the components because the LLM loop can
call functions but not render React: a host that provides only the
`Uploader` UI gets human uploads, while AI media stays in phase-1 mode
(reuse what's already on the page).

Block editors consume it through a `useHostServices()` hook rather than new
props, for two compatibility reasons: `WidgetEditorProps` stays
`{ settings, theme, onChange }` so existing custom editors keep working,
and absence degrades gracefully — without a `media` service, editors fall
back to today's plain URL text input. Whatever the selector returns is a
plain `Media` object stored in settings: serializable, covered by
`mediaSchema`.

The principle tying this section to the rest of the document: **one host
capability, two front-ends.** The human gets `MediaSelector` in the
settings panel; the model gets a `list_media` tool backed by the same
`media.list`. Both operate on the same host-owned data, the model still
never invents URLs, and hosts implement each capability exactly once —
the same symmetry as AI operations mirroring builder UI actions.

## Worked example

> "Make the hero area background green"

1. Context: outline lists `{ widgetId: "abc123", name: "hero", digest: "Hero: 'Run your whole business…'" }`.
2. Model calls `get_block_details(["hero"])` → hero JSON Schema (including
   the shared `SectionBackground` schema), guidance, current settings.
3. Model calls `propose_edit_plan`:

```json
{
    "summary": "Set the hero section's background to green",
    "operations": [
        {
            "op": "update-settings",
            "widgetId": "abc123",
            "patch": {
                "background": { "type": "color", "backgroundColor": "#16a34a" }
            }
        }
    ]
}
```

4. `validatePlan`: structure ✓, `abc123` exists ✓, merged settings pass
   `heroAi.schema` ✓. Preview updates; user clicks Apply; `onChange` fires.

Had the user said "make the _site_ green", the same pipeline emits
`update-theme` patching the palette instead — same vocabulary, different op.

## Open questions / later phases

- **Rich text.** `description` fields are TipTap `TextEditorContent` — deep
  JSON the model will get wrong often. `richTextSchema` should accept
  **markdown strings** from the model and convert to `TextEditorContent`
  during validation (a `z.transform` calling a markdown→TipTap converter in
  `@frontlit/text-editor`), while serializing the _current_ content back to
  markdown for context. This keeps the model in its native format and needs
  a small converter pair in the text-editor package.
- **Media.** The model must never invent image URLs. Phase 1: it may only
  reuse `Media` objects already present in the page (listed in context) or
  clear them. Phase 2 is the `list_media` tool backed by the host's media
  service (see "Host-injected capabilities").
- **Streaming/latency.** `AiEditResponse` is a single promise today; a
  streaming transport (progress + summary tokens) can be layered on without
  changing the op model.
- **Agentic/batch edits.** Because context assembly, validation, and
  `applyPlan` are all pure and isomorphic, a server-side agent ("apply this
  rebrand to all 40 pages") is the same pipeline minus the review UI —
  gated on trust in the repair loop.

## Implementation order

1. `createBlockRegistry` + the `blocks` prop on `PageBuilder`/`PageRenderer`
   (useful independent of AI).
2. Shared Zod schemas (`WidgetDefaultSettings`, `SectionBackground`, `Media`,
   theme, SEO) + `ai` definitions for 2–3 pilot blocks (hero, grid, faq).
3. `/ai` subpath: op types, `validatePlan`, `applyPlan`, context/prompt
   builders — pure functions, exhaustively unit-tested (this layer is where
   all the correctness lives).
4. Prompt box + diff/review UI in `PageBuilder` behind the `ai` prop; a
   reference transport implementation in the demo host app.
5. Markdown ⇄ TipTap converters; `ai` definitions for the remaining blocks.
6. Repair-loop tuning against a prompt test-suite (instruction → expected
   plan) that runs in CI, so schema or prompt changes can't silently regress
   editing quality.

## Review by GPT 5.6. Sol

### Findings

1. **High: validation and normalization are conflated, so schema transforms
   will not reach builder state.** `validatePlan` returns an `AiEditPlan`, and
   `applyPlan` applies that plan later. However, the rich-text design explicitly
   relies on a Zod transform from model-authored markdown to
   `TextEditorContent`. Calling `safeParse` only proves that a transformed value
   exists; applying the original patch would still write markdown into settings.
   The contract must distinguish the model input type from the persisted
   settings type and carry parsed output forward. Prefer a block codec with
   separate `inputSchema`, `decodePatch`, and `encodeForContext` operations, or
   have validation return a normalized executable plan or the fully materialized
   next state.

2. **High: plan validation must be defined as a sequential state transition,
   not a collection of independent checks.** Later operations can target a
   newly added `ref`, update the same block twice, move a block relative to a
   block moved earlier, or target a block already removed. Correct validation
   therefore requires reducing over a scratch state in operation order while
   resolving references and applying normalized settings. The document does not
   specify this. `validatePlan` and `applyPlan` should share one transition
   engine so the claim that applying a validated plan never throws is an
   enforceable invariant rather than duplicated logic.

3. **High: there is no base revision, so the interleaving claim is incorrect.**
   Context is current when a request starts, but a user can edit the page while
   the model is running or while its preview is open. Re-validating the returned
   plan against newer state does not prove that it still expresses the intended
   edit; a referenced block may have changed meaning while retaining its id.
   `AiEditRequest` and the preview must carry a state revision or fingerprint.
   On mismatch, the builder should reject, explicitly rebase, or regenerate the
   plan. Likewise, undoing by restoring a whole previous state object can erase
   manual edits made after the AI edit; undo needs ordered history semantics or
   a scoped inverse change.

4. **High: the server trust and authorization model is missing from the
   architecture.** A serialized client context is sufficient for model context
   and local validation, but it is not authoritative page state. More
   importantly, block tools can query host data and currently receive only
   model-authored arguments. Server executors need request-scoped execution
   context such as actor, tenant, page, permissions, and `AbortSignal`; the host
   route must authenticate, authorize, and load or verify canonical page state
   before invoking them. This remains a host responsibility, but the package
   contract and reference flow need to make it mandatory rather than implicit.

5. **High: schemas cannot enforce the claimed provenance guarantees.** A
   `productIds: string[]` schema proves only that ids are strings, and a
   `Media` schema proves only that an object has the right shape. Neither proves
   that the model obtained an id from `list_products`, reused an existing media
   item, owns the referenced resource, or did not invent a URL. Tool results
   should yield opaque, request-scoped handles or an allowlist that server-side
   semantic validation resolves to authorized resources. The document should
   replace statements such as "the model never invents URLs" with an enforced
   provenance design.

6. **High: the cross-cutting service design does not actually cross the
   browser/server boundary.** `HostServices` is injected into `PageBuilder` and
   contains React components, browser `File` objects, and functions. It cannot
   be serialized to the host's server route, yet that route is where
   `list_media` must execute. Split this into `BrowserHostServices` for editor UI
   and a separate `ServerAiCapabilities` registry for model-callable operations,
   joined by stable capability names and schemas. "Implement once" is not a
   realistic invariant across these two runtimes, though both implementations
   can share a domain service below their adapters.

7. **Medium: the registry is described as shared, but the design creates two
   independently assembled registries.** The browser registers `Widget`
   objects while the server registers `defaultBlockAiDefinitions` and custom AI
   definitions. Their block sets, metadata, schemas, and versions can drift.
   Define a React-free block manifest as the shared source of identity,
   metadata, schema, and version, then bind browser components and server
   executors separately. Include a manifest fingerprint in the request and
   response so drift is detected. The design must also document the Next.js
   Server Component boundary: registries containing functions and React
   components cannot be passed from a server page to a client renderer as
   serialized props.

8. **Medium: layout compatibility is absent from the validation inputs.**
   `WidgetMetadata.compatibleWith` depends on `PageType`, but `validatePlan`
   receives only `PageBuilderState` and `BlockRegistry`; `PageBuilderState`
   does not contain `pageData` or page type. An AI plan can therefore add a
   registered block to an incompatible page while still passing the documented
   checks. Validation should receive an explicit immutable edit context that
   includes page type and other host policies, with registry hooks for custom
   placement, cardinality, and deletion constraints rather than hard-coding
   only `header` and `footer`.

9. **Medium: references are underspecified and collision-prone.** Operations
   use a plain `widgetId: string`, positions are plain strings, and added blocks
   can declare a plain string `ref`. The document does not define how a later
   target distinguishes an existing widget id from a ref, whether refs must be
   unique, or whether `start` and `end` may collide with ids. Use a discriminated
   target such as `{ widgetId } | { ref }` and a similarly explicit position
   type. Validation should reject duplicate refs and ambiguous or forward
   references.

10. **Medium: model-callable tools need an operational safety contract.**
    Merging tools from every block introduces name collisions with other blocks
    and package tools, while the architecture specifies no maximum turns, tool
    calls, result size, timeout, cancellation, rate limit, or error redaction.
    Tool descriptions and returned host content are also untrusted prompt input.
    Namespace tools by block or capability, reject duplicate names, pass an
    execution budget and abort signal, cap and sanitize results, and document
    prompt-injection handling. `autoApply` should be disabled for plans affected
    by untrusted tool content unless policy validation constrains their scope.

11. **Medium: the preview diff should be computed from states, not operations.**
    A per-operation change list can misrepresent merge-patch deletion,
    normalization, defaults, transforms, and interactions between multiple
    operations. The review UI should diff the base state against the
    materialized next state and treat the model's summary as untrusted display
    text. This also gives undo and audit logging the actual committed change.

12. **Low: the proposed test strategy is too model-output-specific.** A prompt
    test suite that expects one exact plan will be brittle because multiple
    plans may be semantically equivalent. Add property tests for transition
    invariants, schema round trips, reference resolution, and stale revisions;
    golden tests for context and tool schemas; adversarial tests for malformed
    and injected content; and semantic model evaluations that accept equivalent
    final states rather than one serialized plan.

### Overall assessment

The core direction is sound: small declarative operations, runtime block
contracts, pure state transitions, and a host-owned model call are the right
boundaries. The design is not yet strong enough to support its guarantees,
primarily because it treats validation as a boolean gate rather than a
normalizing, revision-aware transition over authoritative context. Resolve the
state-transition contract, client/server capability split, provenance model,
and registry versioning before building the prompt UI; those choices shape the
public API and will be expensive to retrofit.
