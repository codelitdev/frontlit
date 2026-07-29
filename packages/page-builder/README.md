# @frontlit/page-builder

Block-based page builder and renderer for FrontLit. Adapted from CourseLit's
`page-blocks` / `page-primitives` / `page-models` packages and converged
into a single, self-contained package with **no backend dependency** —
themes, blocks and the WYSIWYG builder all run entirely client-side.

Rich text editing and rendering (TipTap) live in the sibling
[`@frontlit/text-editor`](../text-editor) package, which this package
depends on — see that package's README for why editing and rendering are
combined there instead of split the way CourseLit splits them.

## What's inside

| Subpath                             | What it exports                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@frontlit/page-builder`            | Everything below, re-exported from one place                                                                                |
| `@frontlit/page-builder/models`     | `Theme`, `WidgetInstance`, `Widget<T>`, `Page`, `Media`, etc. (re-exports `TextEditorContent` from `@frontlit/text-editor`) |
| `@frontlit/page-builder/primitives` | Themed UI atoms (`Button`, `Header1-4`, `Section`, `PageCard`, ...) + 5 built-in themes                                     |
| `@frontlit/page-builder/components` | Shared presentational bits: `Image`, `NavLink`, `VideoWithPreview` (re-exports `TextRenderer` from `@frontlit/text-editor`) |
| `@frontlit/page-builder/blocks`     | The block library: `Header`, `Hero`, `Content`, `Featured`, `Faq`, `Pricing`, `Banner`, `EmailForm`, `Footer`               |
| `@frontlit/page-builder/renderer`   | `PageRenderer` — renders a page's `WidgetInstance[]` layout, with an `editing` mode for use inside the builder              |
| `@frontlit/page-builder/builder`    | `PageBuilder` — the full WYSIWYG editor (add/remove/reorder blocks, edit settings, switch themes)                           |

`createDefaultLayout()` / `getDefaultTheme()` (exported from the root) build
a ready-to-render, FrontLit-branded landing page layout using every block —
handy both as a demo and as a sensible starting point for new pages.

`header` and `footer` are required layout-level blocks. The builder repairs
legacy or empty initial layouts by adding them, keeps them at the outer
edges, and never permits moving or deleting them. In FrontLit applications
their settings are hydrated from the team's shared published/draft state,
so editing navigation on one page applies consistently across all pages.

## Usage

```tsx
// Read-only rendering (e.g. a published page or the marketing site):
import {
    PageRenderer,
    createDefaultLayout,
    getDefaultTheme,
} from "@frontlit/page-builder";

<PageRenderer
    layout={createDefaultLayout()}
    theme={getDefaultTheme()}
    pageData={{ pageType: "landing" }}
/>;

// The interactive editor:
import { PageBuilder } from "@frontlit/page-builder";

<PageBuilder
    onChange={({ layout, theme }) => {
        /* persist however you like */
    }}
/>;
```

Both `PageRenderer` and `PageBuilder` are client components (this package
ships with a blanket `"use client"` directive — see below).

## Design notes / deliberate simplifications (first draft)

- **No backend.** CourseLit's blocks talk to a GraphQL API, a media-upload
  service, and LMS-specific models (`Course`, `PaymentPlan`, `Address`,
  `Profile`, `State`). None of that exists here yet. Image fields are plain
  URL text inputs, and `@frontlit/text-editor`'s `Editor` embeds uploaded
  images as data URLs instead of calling an upload API.
- **Simplified settings editors.** CourseLit's per-block `admin-widget.tsx`
  files lean on a large `@courselit/components-library` (media selectors,
  color pickers, section-background panels, sliders, etc.). Instead, each
  block ships a lightweight `editor.tsx` built from the small, dependency-free
  form primitives in `src/blocks/_shared/fields.tsx`. Fine-grained visual
  controls (padding sliders, per-state color pickers, background image
  pickers) were intentionally dropped for this first draft — the theme
  system still drives all typography/color, just with fewer per-block
  overrides exposed in the UI.
- **`"use client"` everywhere.** tsup/esbuild doesn't reliably preserve
  `"use client"` directives across bundled/shared chunks when mixing client
  and non-client modules (see `scripts/add-use-client.mjs`, which
  post-processes `dist/**/*.js`). Since this package is fundamentally
  UI/interaction-heavy, every emitted file is marked as a client boundary
  rather than fighting the bundler over a handful of pure-data modules.
- **`featured` is a rewrite, not a port.** CourseLit's `featured` block
  fetches "products" (courses) over GraphQL. Here it's a generic feature
  grid (icon + title + description), meant for showcasing a SaaS product's
  pillars.

## Building

```sh
pnpm --filter @frontlit/page-builder build        # tsup + tailwind CSS build
pnpm --filter @frontlit/page-builder check-types   # tsc --noEmit over all of src
```
