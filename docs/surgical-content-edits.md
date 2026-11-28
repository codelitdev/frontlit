# Surgical Content Edits — PRD

Status: Proposed, 2026-11-28. Not implemented.
Scope: Small, targeted edits to rich-text content (articles, product updates, documentation pages) and page-builder pages, for coding agents over MCP. Also stale-save protection, so an open dashboard editor or builder can't overwrite those edits. The edit engine lives in `@frontlit/text-editor` and `@frontlit/page-builder`, so CourseLit and any other host can reuse it.

## 1. Problem

Coding agents that edit FrontLit content complain that even a one-word fix needs a huge payload.

- **Writes replace the whole body.** `update_article`, `update_product_update` and `update_documentation_page` take the full body (`markdown` or TipTap `content`). `update_page` replaces the whole `layout`.
- **Reads are as heavy as writes.** `get_article` returns the full TipTap JSON for both the draft and the published version. `get_page` returns the stored layout with TipTap rich text and builder bookkeeping.
- **Write replies echo the whole document back.**

So fixing a typo in a 3,000-word article costs about three full copies of the article. Agents also make mistakes when they have to retype a long document: sections go missing, wording drifts, and blocks get changed by accident.

CourseLit uses the same two packages, so it has the same problem.

A related problem: the article, product update and page editors autosave the whole draft, and nothing checks whether the draft changed since the editor loaded it. If an agent edits a page while the builder is open, the builder's next autosave silently overwrites the agent's change. This already happens with `update_*`. Small edits will make it more common. The documentation editor is already protected: it sends `expectedDraftVersion`, and the server answers a stale save with `409 STALE_DOCS_DRAFT`.

## 2. Goals and non-goals

Goals

- **G1.** A small change costs a small payload, both to read and to write.
- **G2.** One way of editing for all content types: the exact-match `str_replace` that agents already use for files.
- **G3.** One engine that works with any host. Packages do the edit; hosts load, save and expose it.
- **G4.** An edit never changes content it didn't target. A failed edit changes nothing.
- **G5.** No writer silently overwrites another. This covers agents, the dashboard editors and the builder.

Non-goals

- Live collaborative editing, CRDTs, or pushing "draft changed" events to open editors.
- Stable node or block IDs in stored content.
- Edits through the dashboard or the public REST API. This version covers MCP only.
- Site chrome (`site.json`: header, footer, theme, redirects), email broadcasts, and other text-editor content. They follow later using the same engine (§10).

## 3. Key idea

Every kind of content gets one **editable text form** that converts back with nothing lost:

| Content | Stored as | Editable text form |
| --- | --- | --- |
| Article, product update, documentation page | TipTap JSON | Markdown with MDX-style rich blocks. Any block Markdown can't express becomes a raw TipTap block (D2). |
| Page | Layout of blocks | Page file JSON (`page.v1.json`), with rich text as Markdown, as in Git-connected repos (D3). |

Every edit follows the same steps:

```
load draft (and its draftVersion)
  → convert to its editable text
  → apply exact-match replacements
  → convert back
  → save through the existing update path, with expectedDraftVersion = the version loaded
```

The agent reads the editable text, sends only `{ old_str, new_str }` pairs, and gets a short reply back.

## 4. Decisions

### D1. Text replacement, not structural operations

Alternatives we rejected:

- **JSON Patch on TipTap JSON.** Long paths that break when anything above them moves, and the agent still has to read the whole tree.
- **Stable node IDs plus node operations.** Every editor (FrontLit and CourseLit) would have to keep IDs on every node through pasting and splitting. It needs a schema migration, and agents get a second way of editing to learn.
- **Block-index operations for pages.** Indexes go out of date when someone reorders blocks, and they can't change one sentence inside a rich-text field.
- **Unified diffs.** Agents are unreliable with hunk headers and line numbers.

Exact matching also detects conflicts: if someone changed the text in the meantime, `old_str` no longer matches and the edit is rejected.

### D2. Markdown, with a raw block for anything Markdown can't express

The article and product update editors use `defaultProfile`, which allows content that Markdown can't express. We checked with the current serializer:

| Content | Converts to Markdown? |
| --- | --- |
| Resized image | No |
| Table with merged cells | No |
| Table cell with several paragraphs | No |
| Underline | No |

If we used plain Markdown, an article with one resized image could never be edited.

So the editable form converts each **top-level block** separately:

- A block that has a lossless Markdown form is written as Markdown.
- A block that doesn't is written as a raw TipTap block:

````markdown
Some normal paragraph, edited as Markdown.

```tiptap
{"type":"image","attrs":{"src":"https://…/a.png","alt":"Team","width":300}}
```
````

- Converting back reads a `tiptap` fence as JSON. The JSON is validated against the profile, exactly as TipTap `content` input already is.
- The JSON is written with sorted keys, so converting again gives exactly the same text.
- Agents edit text inside raw blocks with the same `str_replace`.

Why this approach:

- It works for any profile, including CourseLit's and any blocks added later, with no new Markdown syntax per feature.
- Most content stays readable Markdown.

The raw block exists **only in the editable form** (`get_*` / `edit_*`). Docs Markdown files, Git sync and the `markdown` input of `create_*` / `update_*` don't accept it. The docs profile allows nothing beyond Markdown, so docs never produce a raw block.

### D3. The page file JSON is the editable form for pages

It is the same format Git-connected teams edit in `frontlit/pages/*.json`, and the `frontlit-pages` skill already teaches it. Page saves already go through it (`canonicalizeSettings`), so stored content always equals its file. Page rich text only allows basic formatting, so its Markdown is lossless.

- `old_str` for rich text inside a page uses JSON escaping (`\n`, `\"`), just as in a repository.
- The page SEO fields are in the file, so `edit_page` can change them. The page name and slug stay on `update_page`.
- After the edit, the layout is rebuilt with `revisionDraftLayout`, which Git sync and rollback already use. Block ids become positional (`<slug>-<n>`).

### D4. Tools

| Tool | Edits |
| --- | --- |
| `edit_article` | the article draft body |
| `edit_product_update` | the product update draft body |
| `edit_documentation_page` | the documentation page draft body |
| `edit_page` | the page draft (page file: layout and SEO) |

Why separate tools:

- They mirror the Write/Edit split agents know.
- Each has a small output schema.
- Each reuses the permission scope of its `update_*` tool.

The document tools come from the existing `registerDocumentTools` factory.

Input: `{ <id>, edits: [{ old_str, new_str }] }`.

Reply:

```json
{ "id": "…", "status": "published_with_changes", "draftVersion": 7, "updatedAt": "…", "diagnostics": [] }
```

The reply never includes the body.

### D5. Edit semantics

- `edits` holds 1–50 items, applied **in order**, each against the result of the previous one.
- Each `old_str` must be non-empty and match **exactly once**. Matching is exact: no whitespace or case normalization.
- `new_str` may be empty, which deletes the text, but must differ from `old_str`.
- To insert, include nearby text in `old_str` and repeat it in `new_str`.
- **All or nothing.** If any edit fails to match, or the result fails to convert back or validate, nothing is saved.
- `edit_*` never creates or replaces a whole body. That stays on `update_*`.

### D6. One draft version, compare-and-swap on every draft write

- **`draftVersion` on every draft.**
  - Documents already have the column, which only docs use today. Articles and product updates start using it.
  - Pages get `pages.draft_version integer not null default 1`.
- **Every write that changes draft columns increments it by one.** Saves include dashboard saves, `update_*`, `edit_*`, discard, restore and Git import.
- **The write only succeeds if the version is unchanged:**
  ```sql
  UPDATE … SET …, draft_version = draft_version + 1 WHERE id = $id AND draft_version = $expected
  ```
  Zero rows updated means stale. If no expected version is given, the version is still incremented but not checked.
- **The `expectedDraftVersion` rule:**

| Writer | Content | `expectedDraftVersion` |
| --- | --- | --- |
| Dashboard REST `PATCH` | articles, product updates, pages | required on every request |
| Dashboard REST `PATCH` | docs | required (unchanged) |
| MCP `update_*` | articles, product updates, pages | optional (a full replace is a deliberate overwrite) |
| MCP `update_*` | docs | required (unchanged) |
| MCP `edit_*` | all | not taken. Uses the version it loaded internally (§3); the exact match protects the targeted text |

- A stale write returns `STALE_DRAFT` (`409` over REST) with the current `draftVersion`. For `edit_*`, the agent simply calls again; the exact match decides whether the edit still applies. Docs keep `STALE_DOCS_DRAFT`, which their GitHub flows also use; clients treat both codes the same way.

### D7. Reads return the editable text

- `get_article`, `get_product_update` and `get_documentation_page` return the draft body as editable Markdown (D2), plus metadata and `draftVersion`. They no longer return TipTap JSON or the published body. The status field shows whether the draft differs from the live version.
- `get_page` returns the draft as page file text (D3), plus name, slug, status, `draftVersion` and the shared-widget flag. It no longer returns the stored layout.
- **Raw text block.** The editable text is returned as its own raw `text` content block. The JSON content block holds only the metadata. `structuredContent` holds everything. This way, Markdown isn't escaped a second time inside a JSON string, and agents can copy `old_str` from it directly.
  - During PR 3, verify which block Claude Code and Codex actually show the model.
- We need no backwards compatibility, because there is no production yet. TipTap JSON stays available over REST and as `content` input.

### D8. Errors

| Code | When | Message includes |
| --- | --- | --- |
| `EDIT_NOT_FOUND` | `old_str` matches nothing | edit index; "re-read with `get_*`" |
| `EDIT_AMBIGUOUS` | `old_str` matches more than once | edit index, match count, "add surrounding text" |
| `EDIT_INVALID` | empty `old_str`, `old_str === new_str`, more than 50 edits | edit index |
| `STALE_DRAFT` | someone saved between load and save | current `draftVersion`; "call again" |
| *(existing codes)* | the edited text fails to convert back or validate | existing diagnostics, with line numbers into the edited text |

### D9. Stale-save protection in the dashboard

The save queue and conflict handling in `documentation-editor.tsx` move into one shared `useDraftAutosave` hook in `apps/web`. The article editor, the product update editor, the documentation editor and the page builder all use it. The docs editor's behavior stays the same.

1. **Saving.** Saves are queued one at a time. Each sends the last `draftVersion` the editor saw and stores the version from the response, so the editor never conflicts with itself. The article and product update editors save directly today, so they get this queue for the first time.
2. **Conflict.** On `STALE_DRAFT` or `STALE_DOCS_DRAFT`:
   - autosave pauses;
   - local edits stay on screen;
   - publishing is disabled;
   - a banner says the draft was changed elsewhere and offers two choices:
     - **Reload saved draft:** discard local edits and remount the editor or builder (new `key`) with the server draft.
     - **Keep my version:** save the local state with the server's current `draftVersion`, overwriting the other change as an explicit choice.
   - The docs editor keeps its existing Compare view as an extra.
3. **Focus check.** When the tab becomes visible again with no unsaved edits, the editor fetches the draft. If it is newer, the editor reloads it quietly and shows "Updated with changes made elsewhere". With unsaved edits it does nothing, and the next save hits the conflict as above.

The page builder needs no package changes: the host remounts it.

Builder saves of the shared header/footer and the theme are not covered here; they ship with `edit_site` (§10).

## 5. Package API (host-agnostic)

```ts
// @frontlit/text-editor — packages/text-editor/src/core/edit.ts
export type TextEdit = { old_str: string; new_str: string };
export class TextEditError extends Error {
  index: number;
  code: "EDIT_NOT_FOUND" | "EDIT_AMBIGUOUS" | "EDIT_INVALID";
  matches?: number;
}
/** Pure string engine: exact, once-only, ordered, all-or-nothing. */
export function applyTextEdits(source: string, edits: TextEdit[]): string;
/** Content → editable Markdown (raw `tiptap` blocks where needed, D2). */
export function toEditableMarkdown(profile: Profile, content: unknown): string;
/** Editable Markdown → content, validated against the profile. */
export function fromEditableMarkdown(profile: Profile, markdown: string): JSONContent;
/** toEditableMarkdown → applyTextEdits → fromEditableMarkdown. */
export function editContent(profile: Profile, content: unknown, edits: TextEdit[]): JSONContent;
```

```ts
// @frontlit/page-builder — packages/page-builder/src/schema/edit.ts
/** serializePageFile → applyTextEdits → parsePageFile. */
export function editPageDocument(doc: PageDocument, edits: TextEdit[]): PageDocument;
```

`toEditableMarkdown` / `fromEditableMarkdown` reuse `serializeMarkdown` / `parseMarkdown`, with the raw-block handling added for top-level blocks only. `page-builder` already depends on `text-editor`.

**What the host does.** FrontLit and CourseLit each implement `edit_*` as:

1. Load the draft and its `draftVersion`.
2. Call the package function.
3. Save through the host's **existing** update path, with `expectedDraftVersion` set to the version loaded.

That existing path already does authorization, the Git-owned check, validation, the publishability report, the docs hash and index, and media sync. So `edit_*` adds no new save logic.

The profiles:

| Content | Profile |
| --- | --- |
| Articles, product updates | `defaultProfile` |
| Docs | `docsProfile` |
| Pages | `draftDocument` → `editPageDocument` → `revisionDraftLayout` → `updatePage` |

## 6. Prerequisite: converting to text and back must be exact

For every stored value `C`:

- `fromEditable(toEditable(C))` equals `C` after `normalizeTextEditorContent`.
- `toEditable(fromEditable(toEditable(C))) === toEditable(C)`: converting again gives exactly the same text.

Tests:

- **Every block and mark** in `content.v1.json`, through `docsProfile` and `defaultProfile`. Today `profile.test.ts` covers only library blocks.
- **Content only the editor can produce, with no Markdown form:** resized images, merged-cell tables, table cells with several paragraphs, underline. These must round-trip as raw blocks.
- **Every page block** in `page.v1.json`, through the page file form. Extend `files.test.ts`.

## 7. Requirements

| ID | Requirement |
| --- | --- |
| SE-ENGINE | `applyTextEdits` implements D5 exactly. It is pure, with no I/O. |
| SE-ROUNDTRIP | The §6 tests pass. |
| SE-EDIT | The four `edit_*` tools behave per D2–D5 and save through the existing update path. |
| SE-READ | The `get_*` tools return the editable text as a raw text block, exactly as `edit_*` sees it (D7). |
| SE-ISOLATION | After an edit, the editable text outside the replaced ranges is byte-for-byte unchanged. |
| SE-ATOMIC | A failed edit leaves the row unchanged. |
| SE-VERSION | Every draft write increments `draftVersion`, and a write with an out-of-date expected version is refused (D6). |
| SE-STALE | A stale dashboard save is refused. Local edits are kept, and the person chooses to reload or keep their version (D9). |
| SE-FOCUS | When the tab becomes visible, an editor with no unsaved edits reloads a newer draft (D9). |
| SE-PORTABLE | The package functions have no FrontLit API, database or MCP imports. |

## 8. Acceptance scenarios

| # | Scenario | Expected |
| --- | --- | --- |
| A1 | Fix one typo in a ~3,000-word article | Request and reply each under 1 KB; only that word changes |
| A2 | Three edits in one call, the second relying on the first | All three apply, in order |
| A3 | `old_str` appears twice | `EDIT_AMBIGUOUS` (matches: 2), nothing saved |
| A4 | The text was changed in the editor after the agent read it | `EDIT_NOT_FOUND`, nothing saved |
| A5 | The edit leaves an unclosed `<Callout>` | Existing diagnostics with line numbers, nothing saved |
| A6 | Article with a resized image and a merged-cell table; fix a typo in a nearby paragraph | Succeeds; the image and table are unchanged |
| A7 | Change the caption text inside a raw `tiptap` block | Succeeds, and the result is validated |
| A8 | Edit a hero heading and a feature-grid item's rich text on a page | Only those settings change; the builder opens the page normally |
| A9 | Edit the page SEO `description` via `edit_page` | Draft updated; the page shows as `published_with_changes` |
| A10 | Edit a Git-owned page or doc | Same error as `update_*` |
| A11 | `get_article` / `get_page` | The editable text is its own raw block, and a copied `old_str` matches it |
| A12 | Publish after editing | Published output equals the edited draft |
| A13 | Builder open; an agent runs `edit_page`; the person then changes a block | Save refused with `409`; autosave pauses; the person's change stays on screen; the agent's edit stays in the database; banner shown |
| A14 | In the A13 banner, choose "Reload saved draft" | The agent's edit is shown; autosave resumes |
| A15 | In the A13 banner, choose "Keep my version" | The person's state is saved over the agent's edit |
| A16 | Article editor open, no unsaved edits; an agent edits; the person returns to the tab | The editor reloads quietly and shows the agent's edit |
| A17 | Typing quickly in any editor | No false conflicts |
| A18 | Two `edit_article` calls at the same moment, on different paragraphs | Both apply, or one returns `STALE_DRAFT` and applies when called again |

Each scenario gets an automated test where possible: package tests, API tests in the style of `markdown-body.test.ts`, and web tests for the hook. A1, A6, A8, A9, A12 and A13–A16 also need a full end-to-end browser smoke test: locally first, then on QA (per AGENTS.md).

## 9. Rollout

One PR at a time, each tested and smoke-tested before the next.

1. **Draft versions and stale-save protection.** This fixes today's silent overwrite on its own, and the edit tools build on it.
   - `draftVersion` for articles, product updates and pages, with compare-and-swap on writes.
   - `expectedDraftVersion` on REST and `update_*`, and `STALE_DRAFT`.
   - The `useDraftAutosave` hook in all four editors.
   - Covers A13–A17, tested with `update_*` as the second writer.
2. **Engine.** `applyTextEdits`, editable Markdown with raw blocks, `editContent`, `editPageDocument`, and the §6 tests.
3. **Documents.** The three `edit_*` document tools and the new document `get_*` output. Covers A1–A7, A10–A12, A18.
4. **Pages.** `edit_page` and the new `get_page` output. Covers A8–A11, and A13 with `edit_page`.
5. **Skills.** Update the `frontlit-pages` and `frontlit-docs` skills and the MCP tool descriptions: read with `get_*`, change with `edit_*`, use `update_*` only for full rewrites.

## 10. Limitations and follow-ups

- **People will see conflicts.** While an agent and a person work on the same draft, the person may see the banner. The focus check makes this rare.
- **The first edit canonicalizes the stored JSON.** Content the editor saved may not be in canonical form. The first edit stores it in canonical form; rendering stays the same.
- **Positional page block ids.** Inserting or removing a block shifts the ids after it, as Git sync and rollback already do.
- **Follow-ups:**
  - `edit_site` for `site.json`, with stale-save protection for the header/footer/theme saves.
  - Edits to email broadcasts via `editContent`.
  - REST edit endpoints, if a non-MCP client needs them.
