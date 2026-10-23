# @frontlit/preview

Read-only local previews of FrontLit repository pages using the existing page-builder React renderer, compiled styles, fonts and shadow-root embeds. Node 20.19+ (or 22.12+) is required.

```sh
npx @frontlit/preview@alpha ./frontlit
npx @frontlit/preview@alpha ./frontlit --port 4311 --context ./preview.context.json
```

In the monorepo, build `@frontlit/text-editor` and `@frontlit/page-builder`, then run `bun packages/preview/cli.mjs <site-folder>`. The default address is http://127.0.0.1:4310. Changes to page JSON, site JSON, images or context refresh the browser. Invalid files display diagnostics and recover on the next edit. Use the toolbar to select pages or switch color mode; browser device emulation works normally.

The site folder contains `pages/*.json` and optional `site.json`. Shared chrome and theme come from `site.json`. Missing values can fall back to a local context file (`preview.context.json` in the site folder, or `--context`). Branding lives outside FrontLit's Git site format, so provide it explicitly:

```json
{
  "branding": {
    "title": "John's Piping Pizza",
    "subtitle": "Dough. Heat. Repeat.",
    "logo": { "url": "assets/logo.svg", "alt": "John's Piping Pizza" }
  },
  "site": {},
  "feeds": {
    "/blog": [
      { "title": "Our pizza notebook", "href": "/", "description": "A local feed fixture." }
    ]
  }
}
```

`site` accepts the same chrome/theme structure as `site.json`; local site fields win. An optional `themeId` selects a bundled preset when there is no theme object. This is a local snapshot, not an authenticated export endpoint. No FrontLit credentials or backend are required. Use a gitignored context file for private fixture data.

Repository images resolve relative to their owning JSON file, or relative to the repository root for paths starting with `/`. Only image files inside that root are served through the asset endpoint, including symlink checks. Without a Git root, the site folder's parent is the root. HTTPS media remains remote. URLs inside raw embed HTML are not rewritten; use a permanent HTTPS URL or the local asset URL (`/__frontlit/assets/<repository-relative-path>`).

Page routes correspond to `pages/*.json`. Draft pages are deliberately previewable. Backend article/doc detail routes, redirects, chatbot, search and production image optimization are not implemented. Feeds use explicit local fixtures or a visible placeholder; forms receive no team/API identity and use page-builder's local success behavior. This previews the client renderer; the hosted site uses server rendering, so the release preview remains the final integration check. Keep the renderer dependency aligned with the release being targeted.

The package ships its Vite client and CLI as source and needs no separate build. `bun run --cwd packages/preview test` checks normalization, local media boundaries and missing/invalid input behavior.

Installed from npm, the client runs from `node_modules`, so the server pre-bundles the JSX runtime and allows page-builder's package folder for its fonts. Test packaging changes from a packed tarball (`bun pm pack`, then `npm install <tarball>` in an empty folder), not only from the workspace.
