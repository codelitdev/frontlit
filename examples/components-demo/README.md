# FrontLit components demo

A Vite + React app in this repo that installs the **published** packages from npm:

- `@frontlit/page-builder` — WYSIWYG `PageBuilder` and read-only `PageRenderer`
- `@frontlit/text-editor` — TipTap `Editor` and static `TextRenderer`

No Tailwind in this app. Each package ships compiled CSS. The text-editor pane
imports only `@frontlit/text-editor/styles.css`; the page-builder pane imports
only `@frontlit/page-builder/styles.css`.

The example is a workspace member, and its FrontLit dependencies use the
`npm:` protocol so it exercises the published packages instead of the local
workspace copies.

## Run

From the repo root:

```sh
bun install
bun run --filter @frontlit/components-demo dev
```

Open [http://localhost:5173](http://localhost:5173).

| URL                                  | What you see                                   |
| ------------------------------------ | ---------------------------------------------- |
| `/`                                  | Interactive `PageBuilder`                      |
| `/?demo=page-builder&view=published` | `PageRenderer` fed by the builder's `onChange` |
| `/?demo=text-editor`                 | Editor and renderer side by side               |

Query params are used instead of hashes so in-page `#features` / `#pricing` links in the starter layout stay on the rendered page.
