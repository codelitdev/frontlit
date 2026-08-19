# @frontlit/page-builder

Block-based page builder and renderer for React. Self-contained — no backend and no framework lock-in. Themes, blocks, and the WYSIWYG builder all run client-side.

Rich text editing and rendering live in [`@frontlit/text-editor`](https://www.npmjs.com/package/@frontlit/text-editor), which this package depends on and installs automatically.

## Installation

```sh
npm i @frontlit/page-builder
# or
pnpm add @frontlit/page-builder
```

Peer dependencies: `react` and `react-dom` (^18 or ^19). Next.js is **not** required. Tailwind is **not** required — import the compiled stylesheet:

```ts
import "@frontlit/page-builder/styles.css";
```

That file includes the utilities, default tokens, the theme-picker fonts (Inter, Playfair, and the rest), and the TipTap prose styles from `@frontlit/text-editor`. Hosts that already inject those faces via `next/font` keep working: `--font-inter` on the document still wins.

**Future:** split the theme-picker faces out of `styles.css` into an opt-in `@frontlit/page-builder/fonts.css`. Hosts that already load Inter, Playfair, and the rest (for example via `next/font`) can skip that file; everyone else imports it next to `styles.css`. `--font-*` on the document and the system-font fallbacks in `theme.css` stay as they are.

If the host already runs Tailwind CSS v4, you can skip `styles.css` and scan the packages instead. Import the prose sheet so rich-text lists and code blocks survive Tailwind preflight:

```css
@import "@frontlit/page-builder/theme.css";
@import "@frontlit/text-editor/prose.css";
@source "./node_modules/@frontlit/page-builder";
@source "./node_modules/@frontlit/text-editor";
```

## Usage

```tsx
import {
    PageRenderer,
    PageBuilder,
    createDefaultLayout,
    getDefaultTheme,
} from "@frontlit/page-builder";
import "@frontlit/page-builder/styles.css";

// Read-only rendering (a published page, a marketing site, a preview):
<PageRenderer
    layout={createDefaultLayout()}
    theme={getDefaultTheme()}
    pageData={{ pageType: "landing" }}
/>;

// The interactive editor — persist however you like:
<PageBuilder
    onChange={({ layout, theme }) => {
        /* save */
    }}
/>;
```

Both `PageRenderer` and `PageBuilder` are client components (this package ships with a `"use client"` directive on UI entries).

### Optional: client-side routing

Internal `/...` links render as native `<a>` tags by default, so the package works in Vite, Remix, Astro, or any other React host. Next.js (or any other router) can inject its own link:

```tsx
import Link from "next/link";
import {
    PageRenderer,
    type PageBuilderLinkProps,
} from "@frontlit/page-builder";

function AppLink(props: PageBuilderLinkProps) {
    return <Link {...props} />;
}

<PageRenderer layout={layout} theme={theme} linkComponent={AppLink} />;
```

`PageBuilder` accepts the same `linkComponent` prop and forwards it to the live preview.

## What's inside

| Subpath                             | What it exports                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@frontlit/page-builder`            | Everything below, re-exported from one place                                                                                |
| `@frontlit/page-builder/models`     | `Theme`, `WidgetInstance`, `Widget<T>`, `Page`, `Media`, etc. (re-exports `TextEditorContent` from `@frontlit/text-editor`) |
| `@frontlit/page-builder/primitives` | Themed UI atoms (`Button`, `Header1-4`, `Section`, `PageCard`, ...) + built-in themes                                       |
| `@frontlit/page-builder/components` | Shared presentational bits: `Image`, `NavLink`, `VideoWithPreview` (re-exports `TextRenderer` from `@frontlit/text-editor`) |
| `@frontlit/page-builder/blocks`     | The block library: Header, Hero, Content, Featured, Faq, Pricing, Banner, EmailForm, Footer, …                              |
| `@frontlit/page-builder/renderer`   | `PageRenderer` — renders a page's `WidgetInstance[]` layout, with an `editing` mode for use inside the builder              |
| `@frontlit/page-builder/builder`    | `PageBuilder` — the full WYSIWYG editor (add/remove/reorder blocks, edit settings, switch themes)                           |
| `@frontlit/page-builder/data-slots` | Server-safe helper for hosts to resolve named data slots before rendering                                                   |

`createDefaultLayout()` / `getDefaultTheme()` (exported from the root) build a ready-to-render starter landing page.

`header` and `footer` are required layout-level blocks. The builder repairs legacy or empty initial layouts by adding them, keeps them at the outer edges, and never permits moving or deleting them.

## License

MIT
