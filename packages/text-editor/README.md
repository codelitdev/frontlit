# @frontlit/text-editor

A rich text editor and renderer for React, built on [Tiptap](https://tiptap.dev).
You get:

- **`Editor`**: a writing surface with a toolbar, a `/` menu for inserting blocks
  (callouts, tabs, video, …), drag-to-reorder and keyboard shortcuts.
- **`TextRenderer`**: shows saved content on your pages, without loading the editor.
- **Markdown in and out**, plus **validation** you can run on your server, so the
  editor, your API and your pages all agree on what a document may contain.

It needs only `react` and `react-dom`: no Next.js, no backend and no upload service.

## Contents

- [Quick start](#quick-start)
- [Core ideas](#core-ideas)
- [Choosing what the editor allows](#choosing-what-the-editor-allows)
- [Removing, hiding or disabling blocks](#removing-hiding-or-disabling-blocks)
- [Images, video and other media](#images-video-and-other-media)
- [Adding your own block](#adding-your-own-block)
- [Saving and validating on the server](#saving-and-validating-on-the-server)
- [Rendering content](#rendering-content)
- [Keyboard and accessibility](#keyboard-and-accessibility)
- [For AI agents](#for-ai-agents)
- [Styling](#styling)
- [What's exported](#whats-exported)
- [Reference: the documentation profile](#reference-the-documentation-profile)

## Quick start

**1. Install** (React 18 or 19 is a peer dependency):

```sh
npm i @frontlit/text-editor
```

**2. Import the stylesheet** once, for example in your app's entry file. Tailwind is
not required.

```ts
import "@frontlit/text-editor/styles.css";
```

**3. Add an editor and show what was written:**

```tsx
import { useState } from "react";
import { Editor, TextRenderer, emptyDoc, type TextEditorContent } from "@frontlit/text-editor";

export function Notes() {
  const [doc, setDoc] = useState<TextEditorContent>(emptyDoc);
  return (
    <>
      <Editor
        initialContent={doc}
        onChange={(json) => setDoc(json as TextEditorContent)} // save it wherever you like
      />
      <TextRenderer json={doc} />
    </>
  );
}
```

`onChange` fires about a second after the author stops typing (`debounceMs` changes
that). It gives you the document as JSON; store that JSON and pass it back as
`initialContent` next time, or to `TextRenderer` to display it.

A runnable app with every block is in this repo at
[`examples/text-editor-blocks`](https://github.com/codelitdev/frontlit/tree/main/examples/text-editor-blocks).

## Core ideas

| Term | What it means |
| --- | --- |
| **Document** | The content, as Tiptap JSON: `{ "type": "doc", "content": [...] }`. This is what you store. |
| **Block** | One piece of a document: a paragraph, a heading, a callout, a video… Some blocks hold other blocks (a callout holds paragraphs). |
| **Base nodes and marks** | The everyday building blocks (headings, lists, quotes, code, tables) and text styles (bold, italic, links). |
| **Library blocks** | Ready-made rich blocks you can turn on: Image, Video, Callout, Tabs and more. Off unless you list them. |
| **Profile** | The rule book for a kind of document: which base nodes, marks and blocks it may contain. One profile drives the editor, the renderer, Markdown conversion and validation. |
| **Markdown form** | Every block can be written as Markdown, e.g. `<Callout type="tip">…</Callout>`. Useful for APIs, Git and AI agents. |

## Choosing what the editor allows

Without a `profile`, the editor uses `"default"`: a general-purpose editor whose `/`
menu offers text blocks and images. Pass `profile="documentation"` for the profile
FrontLit uses for help-center docs.

For anything else, **define your own profile**. Put it in a file both your browser code
and your server can import: `@frontlit/text-editor/blocks` has no React in it.

```ts
// content-profile.ts
import { defineProfile, image, video, callout, tabs } from "@frontlit/text-editor/blocks";

export const lessonProfile = defineProfile({
  base: {
    exclude: ["table"], // no tables in lessons
    headings: { levels: [2, 3] }, // only ## and ### headings
    marks: { exclude: ["underline", "highlight"] },
  },
  blocks: [image({ media: true }), video(), callout(), tabs()],
});
```

```tsx
<Editor profile={lessonProfile} initialContent={doc} onChange={save} />
<TextRenderer profile={lessonProfile} json={doc} />
```

Use the same profile in both places, so pages show exactly what the editor allows.

### Base nodes and marks

Everything below is on unless you exclude it.

| Kind | Names you can exclude |
| --- | --- |
| Base nodes (`base.exclude`) | `heading`, `blockquote`, `bulletList`, `orderedList`, `codeBlock`, `horizontalRule`, `hardBreak`, `table` |
| Marks (`base.marks.exclude`) | `bold`, `italic`, `strike`, `code`, `underline`, `highlight`, `link` |
| Heading levels (`base.headings.levels`) | Any of `1`–`6` |

Paragraphs and plain text are always allowed.

### The block library

Each block is a function you call inside `blocks: [...]`, so you can pass options.

| Block | Add with | Markdown | Options |
| --- | --- | --- | --- |
| Image | `image()` | `![alt](https://…)` or `<Image media="…" />` | `media`, `hosts`, `allowBase64`, `resize` |
| Video | `video()` | `<Video url="https://youtu.be/…" />` | `media` (uploads), `providers` (YouTube, Vimeo) |
| Audio | `audio()` | `<Audio media="…" />` | |
| PDF | `pdf()` | `<PDF media="…" />` | |
| File | `file()` | `<File media="…" />` | |
| Embed | `embed()` | `<Embed>` with an html code block | `maxBytes` |
| Callout | `callout()` | `<Callout type="tip">…</Callout>` | `types` (note, tip, info, success, warning, danger) |
| Tabs | `tabs()` | `<Tabs>` with `<Tab value="…">` | |
| Accordion | `accordion()` | `<Accordions>` with `<Accordion title="…">` | |
| Steps | `steps()` | `<Steps>` with `<Step>` | |
| Button | `button()` | `<Button label="Start" href="/start" />` | |
| Web preview | `webPreview()` | `<WebPreview url="…" title="…" />` | |
| H5P | `h5p()` | `<H5P src="https://h5p.org/h5p/embed/…" />` | `hosts` (default h5p.org, \*.h5p.com) |

Embeds run in a sandboxed frame that can't read your page, its cookies or storage.

## Removing, hiding or disabling blocks

Pick the approach that matches what should happen to content that already exists.

**Remove a block completely.** Leave it out of your profile's `blocks`, or exclude a
base node or mark. The `/` menu stops offering it, and `validateContent` refuses
documents that contain it. Do this only when no saved document uses it.

```ts
// Everything from the lesson profile except tabs, and no code blocks.
export const simpleLesson = defineProfile({
  base: { exclude: ["table", "codeBlock"] },
  blocks: [image({ media: true }), video(), callout()],
});
```

**Hide a block from the menus but keep accepting it.** Use `options.menu`. Existing
blocks keep working, can be edited, and can still arrive through Markdown or your API.

```ts
defineProfile({
  blocks: [image(), callout(), embed()],
  options: { menu: ["image", "callout"] }, // Embed no longer in the / menu
});
```

**Disable a block for some users, with a reason.** For example, only on a paid plan.
The block stays in the profile; the `/` menu shows it greyed out with your reason:

```tsx
<Editor
  profile={lessonProfile}
  unavailable={{ embed: "Upgrade to Pro to add embeds" }}
  onChange={save}
/>
```

Enforce it on your server with the same rule (see
[Saving and validating](#saving-and-validating-on-the-server)). Authors can keep and
edit the embeds they already have; they just can't add more.

**Limit the text styles.** Exclude marks, e.g. `base: { marks: { exclude: ["underline"] } }`.

## Images, video and other media

There are two ways to handle images:

- **Simplest:** `image()` stores a URL. Without anything else, pasted or uploaded
  images in the `"default"` profile are embedded as data URLs. Use
  `ImagePickerContextProvider` to plug in your own image picker instead.
- **With your own upload service:** `image({ media: true })`, `video()`, `audio()`,
  `pdf()` and `file()` store a **media ID**, not a URL. You provide two functions:

```tsx
import {
  Editor,
  MediaPickerContextProvider,
  TextRenderer,
  type PickMedia,
} from "@frontlit/text-editor";

// 1. Called when the author chooses a file (`kind` is "image", "video", …).
//    Upload it and return its ID, or null if they cancelled.
const pickMedia: PickMedia = async ({ kind, accept }) => {
  const file = await openFileDialog(accept); // your UI
  if (!file) return null;
  const { id, url } = await uploadToYourStorage(file); // your service
  return { id, previewUrl: url, name: file.name };
};

// 2. Turns an ID back into a URL when showing the document.
const resolveMedia = (id: string) => mediaUrls[id] ?? null;

<MediaPickerContextProvider pickMedia={pickMedia}>
  <Editor profile={lessonProfile} resolveMedia={resolveMedia} onChange={save} />
</MediaPickerContextProvider>;

<TextRenderer profile={lessonProfile} json={doc} resolveMedia={resolveMedia} />;
```

The package never uploads or fetches media itself. The example app wires this to
[MediaLit](https://medialit.cloud).

## Adding your own block

A block has up to four parts. Only the first is required.

| Part | What it does | Runs on |
| --- | --- | --- |
| `BlockSchema` | Name, fields (attributes), Markdown tag, validation rules | Browser and server |
| `BlockUi` | Its `/` menu entry, how it looks while editing, a settings popover | Browser |
| Renderer component | How it looks on your pages | Browser or server |
| Profile entry | Turns it on | Both |

This walk-through builds a **Quiz** block: one question with a correct answer.

### Step 1: describe the block

```ts
// quiz-block.ts (server-safe: no React)
import { attr, type BlockSchema } from "@frontlit/text-editor/blocks";

export const quiz: BlockSchema = {
  name: "quiz", // node name in the JSON; letters only, unique in the profile
  tag: "Quiz", // Markdown: <Quiz question="…" answer="…" />
  group: "block", // a top-level block
  attrs: {
    question: attr.text("The question learners see.", { required: true }),
    answer: attr.text("The correct answer."),
    hint: attr.optionalText("Shown after a wrong answer."),
  },
  // Used in the format reference for APIs and AI agents.
  docs: {
    summary: "A one-question quiz.",
    example: '<Quiz question="2 + 2?" answer="4" />',
  },
};
```

Attribute helpers:

| Helper | Value | Use for |
| --- | --- | --- |
| `attr.text(description)` | string (may be empty) | Text the author types |
| `attr.optionalText(description)` | string or `null` | Optional text |
| `attr.oneOf(values, description, message)` | one of `values`, or `null` | A fixed set of choices |
| `attr.integer(description, min, max)` | whole number, or `null` | Sizes and counts |
| `attr.media(description)` | a media ID | Uploaded files |

Any attribute can also be a plain object with `default`, `description` and a
`validate(value)` that returns `true` or an error message. Add `url: "link"` for URLs,
so they get the built-in safety checks.

Validation runs on every autosave, while the author is still typing. Let fields be
empty or `null` until they're filled in, instead of rejecting them. For a value the
block can't work without (like a button's link), add `requiredToPublish: true`: the
editor still saves it empty, but `incompleteBlocks` reports it so you can block
publishing, and the format reference lists it as required. `required: true` means
the prop must appear in Markdown.

A block that holds other blocks (like a callout) sets `content: "block+"`. Its
editing view then shows an editable area automatically.

### Step 2: turn it on

```ts
// content-profile.ts
import { defineProfile, callout } from "@frontlit/text-editor/blocks";
import { quiz } from "./quiz-block";

export const lessonProfile = defineProfile({ blocks: [callout(), quiz] });
```

The profile now parses and writes `<Quiz … />` in Markdown and validates quiz
attributes. Without the steps below, the editor shows the block as a plain box, and
pages render it as an empty `<div data-te-block="quiz">`.

### Step 3: how it looks while editing

```tsx
// quiz-ui.tsx (browser)
import { HelpCircle } from "lucide-react"; // any icon component works
import {
  BlockFrame,
  SettingsField,
  TextField,
  type BlockUi,
} from "@frontlit/text-editor";
import { quiz } from "./quiz-block";

export const quizUi: BlockUi = {
  schema: quiz,
  // The / menu entry.
  insert: {
    label: "Quiz",
    description: "A question with one right answer",
    group: "Interactive", // the / menu section; default "Blocks"
    icon: HelpCircle,
    keywords: ["question", "test"],
    create: () => ({ type: "quiz", attrs: { question: "" } }),
  },
  // Shown inside the document. BlockFrame adds the label bar, settings and remove buttons.
  view: (props) => (
    <BlockFrame
      label="Quiz"
      props={props}
      fields={<TextField props={props} name="question" placeholder="Question" />}
    >
      <TextField props={props} name="answer" placeholder="Correct answer" />
    </BlockFrame>
  ),
  // Optional: fields in the gear (settings) popover.
  settings: ({ attrs, update }) => (
    <SettingsField label="Hint">
      <input
        value={attrs.hint ?? ""}
        onChange={(event) => update({ hint: event.target.value || null })}
      />
    </SettingsField>
  ),
};
```

Pass it to the editor:

```tsx
<Editor profile={lessonProfile} blocks={[quizUi]} onChange={save} />
```

`BlockFrame` gives every block the same accessible controls: a labelled bar,
Alt+F10 to reach it from the text, and Escape to go back. Keep custom fields labelled.
The package aims for WCAG 2.2 AA.

### Step 4: how it looks on your pages

```tsx
import type { BlockRendererProps } from "@frontlit/text-editor";

function LearnerQuiz({ attrs }: BlockRendererProps) {
  return <QuizCard question={attrs.question} answer={attrs.answer} hint={attrs.hint} />;
}

<TextRenderer profile={lessonProfile} json={doc} blocks={{ quiz: LearnerQuiz }} />;
```

The component receives `node`, `attrs`, `children` (for blocks that hold other
blocks) and `resolveMedia`. It can have its own state, e.g. to check answers.

### Changing a built-in block

Built-in blocks take options, e.g. `callout({ types: ["tip", "warning"] })`. To give
one a different look on your pages, pass your own renderer under its name:
`blocks={{ callout: MyCallout }}`. To change how it looks while editing, pass a
`BlockUi` with the same `schema` (take it from `lessonProfile.blockSchemas.get("callout")`).

## Saving and validating on the server

Never trust JSON sent by a browser. Validate it with the same profile before saving:

```ts
import { validateContent } from "@frontlit/text-editor/blocks";
import { lessonProfile } from "./content-profile";

const result = validateContent(lessonProfile, body.content, {
  previous: storedDoc, // what is saved now (from your database, not the request)
  unavailable: user.isPro ? undefined : { embed: "plan_required" },
});
if (result.diagnostics.some((d) => d.blocksSave)) {
  return res.status(422).json({ diagnostics: result.diagnostics });
}
save(result.content); // canonical JSON
```

Each diagnostic has a `code`, a readable `message` and, where it applies, a
`fieldPath` (or `line`/`column` for Markdown). With `unavailable`, a document may
keep the blocks it already had (`previous`), but can't add more.

Before publishing, check for blocks that were saved half-filled (a Button without
its link renders nothing):

```ts
import { incompleteBlocks } from "@frontlit/text-editor/blocks";

const blockers = incompleteBlocks(lessonProfile, doc); // [] when ready to publish
```

Content sent whole by an API client or AI agent can be refused outright when
`incompleteBlocks` finds something; FrontLit's API does this for Markdown.

To accept or return Markdown instead of JSON:

```ts
import { parseMarkdown, serializeMarkdown, ContentError } from "@frontlit/text-editor/blocks";

try {
  const json = parseMarkdown(lessonProfile, markdown); // Markdown → JSON
  const text = serializeMarkdown(lessonProfile, json); // JSON → Markdown
} catch (error) {
  if (error instanceof ContentError) console.error(error.diagnostics); // with line numbers
}
```

## Rendering content

```tsx
<TextRenderer
  json={doc}
  profile={lessonProfile}
  resolveMedia={resolveMedia} // for media blocks
  blocks={{ quiz: LearnerQuiz }} // your block renderers
  theme={theme} // optional typography and link styles
/>
```

`TextRenderer` outputs plain React elements and doesn't need the editor. In React
Server Components (e.g. the Next.js App Router), import it from the renderer entry,
which leaves the editor out of your page bundle:

```tsx
import { TextRenderer } from "@frontlit/text-editor/renderer";
```

Links with unsafe schemes are never rendered, and media URLs come only from your
`resolveMedia`.

## Keyboard and accessibility

| Keys | What it does |
| --- | --- |
| `/` | Opens the insert menu at the cursor; type to filter. ↑/↓ (or Ctrl+P/N, Tab/Shift+Tab) move, Home/End jump to the ends, PageUp/PageDown move by five, Enter inserts, Escape dismisses. |
| Ctrl/⌘ + Shift + ↑ / ↓ | Moves the block holding the cursor up or down (what the drag handle does). |
| Alt + F10 | Moves focus to the current block's controls (type, title, settings, remove). |
| Escape | In a block's controls, returns to its text; in a settings popover, closes it and returns to its button. |

The editing area is a labelled text box. Set its name with `ariaLabel` (default
"Rich text editor"). Screen readers announce the highlighted `/` menu option while
focus stays in the text.

## For AI agents

`contentFormat()` (from `@frontlit/text-editor/docs`) describes the documentation
profile's format as data: the syntax, every block with its props, types and an
example, and the limits. `describeContentFormat()` returns the same as compact text,
for an API or MCP field description. The generated file `schema/content.v1.json` is
published at `https://frontlit.app/schema/content.v1.json`. Regenerate it with
`bun run schema:generate`; a test fails when it's out of date.

For your own profile, `formatReference(profile)` (from `@frontlit/text-editor/blocks`)
gives the same data.

## Styling

`styles.css` includes everything: the editor's own styles, default colors, and the
styles for rendered content. It uses CSS variables (`--primary`, `--muted`,
`--border`, …), so your theme's colors apply when you define them.

If you run Tailwind CSS v4 yourself, skip `styles.css` and import the parts instead:

```css
@import "@frontlit/text-editor/tokens.css";
@import "@frontlit/text-editor/prose.css";
@source "./node_modules/@frontlit/text-editor";
```

## What's exported

| Entry | For | Main exports |
| --- | --- | --- |
| `@frontlit/text-editor` | Browser | `Editor`, `TextRenderer`, `MediaPickerContextProvider`, `ImagePickerContextProvider`, `BlockFrame`, `ItemFrame`, `TextField`, `SettingsField`, `emptyDoc`, types `BlockUi`, `BlockRendererProps`, `TextEditorContent` |
| `@frontlit/text-editor/renderer` | Server components | `TextRenderer`, type `BlockRendererProps` |
| `@frontlit/text-editor/blocks` | Browser and server | `defineProfile`, the block library (`image()`, `callout()`, …), `attr`, `validateContent`, `incompleteBlocks`, `parseMarkdown`, `serializeMarkdown`, `formatReference`, `ContentError`, type `BlockSchema` |
| `@frontlit/text-editor/docs` | Server | The documentation profile: `parseDocsMarkdown`, `serializeDocsMarkdown`, `validateDocsContent`, `contentFormat`, `describeContentFormat` |
| `@frontlit/text-editor/styles.css` | Browser | All styles |

Lower-level helpers for advanced use: `normalizeTextEditorContent`,
`extractTextFromTextEditorContent`, `truncateTextEditorContent` (for excerpts),
`createExtensions`, `createId`, `extractHeadings`, `extractTextFromNode`.

`TextRenderer`'s `theme` follows a small `TextRendererTheme` type, so this package
doesn't depend on `@frontlit/page-builder`.

## Reference: the documentation profile

`@frontlit/text-editor/docs` is a server-safe entry for documentation validation,
CommonMark/GFM conversion, bounded YAML frontmatter, source-path mapping, and
versioned content hashes (DM-VALIDATE, DM-CONVERT, DM-SOURCE, DM-ROUTE). It does
not load React or create an editor, node view or upload control. Import
`@frontlit/text-editor/headings` for the lightweight heading policy alone.

```ts
import { parseDocsMarkdown, serializeDocsMarkdown, validateDocsContent } from "@frontlit/text-editor/docs";

const { content, frontmatter } = parseDocsMarkdown(markdown, { file: "manual/setup.md" });
const report = validateDocsContent(content);
const exported = serializeDocsMarkdown(content, frontmatter);
```

Parsing requires frontmatter with a title by default. Use `{ frontmatter: false }`
for editor Markdown bodies with metadata supplied separately. Unsupported content
throws `DocsContentError` with structured diagnostics; validation returns a report
without replacing invalid input with an empty document. A serialization failure
must prevent a draft write.

The profile supports paragraphs, headings 1–6, bold/italic/strike/inline-code/link
marks, nested lists, blockquotes, fenced code, horizontal rules, block images,
rectangular tables with one header row and one paragraph per cell, and the blocks
Callout, Tabs, Steps, Cards, Accordion, CodeGroup, TypeTable, Button, WebPreview and
H5P. It rejects raw HTML/MDX, task lists, footnotes, inline images,
merged/multiblock/aligned tables, resize attributes, and unsupported marks. Images
require stable HTTPS URLs. URL syntax checks do not establish asset ownership or
prove third-party privacy; the API must verify managed-media provenance separately
(DM-MEDIA).

Normalizations apply schema defaults, retain an omitted root array as `[]`, and
represent absent image alt descriptions as `""`. Markdown semantic comparisons
ignore empty top-level paragraphs used for spacing; canonical JSON retains them.
Unknown frontmatter stays bounded plain data. YAML aliases, custom tags, duplicate
keys, and prototype-sensitive metadata keys are rejected. Module safety ceilings
are 1 MiB of Markdown/text, 20,000 nodes, depth 64, and 32 KiB of metadata; request
transport limits can be smaller.

Use `<Editor profile="documentation" />` and `<TextRenderer profile="documentation" />`
for docs. Heading IDs use Unicode text, remove punctuation, and get unique suffixes
in document order.

## License

MIT
