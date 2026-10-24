# @frontlit/preview

See your FrontLit pages in the browser while you edit them.

If your website's pages live in a Git repository as JSON files (a `frontlit/` folder with `pages/*.json` and `site.json`), this tool shows them on your computer the way FrontLit draws them: same blocks, theme, fonts, header and footer. Save a file and the browser updates by itself. You don't need a FrontLit account, a login or an internet connection to your site.

## Before you start

You need [Node.js](https://nodejs.org) **20.19 or newer** (22.12+ also works). Check with:

```sh
node --version
```

## Quick start

1. Open a terminal in your repository (the folder that contains `frontlit/`).
2. Run:

   ```sh
   npx @frontlit/preview@alpha
   ```

   The first run downloads the tool, which takes a few seconds.
3. Open **http://127.0.0.1:4310** in your browser.
4. Edit any file in `frontlit/` and save. The page reloads with your change.

Press **Ctrl+C** in the terminal to stop.

> **Why `@alpha`?** The tool is in early release. `@alpha` always gets the newest version.

## Using the preview

- **Switch pages** with the drop-down at the top. Each file in `pages/` is one page: `index.json` is `/`, `pricing.json` is `/pricing`. Pages marked `"published": false` show too, so you can check drafts.
- **Light and dark mode:** use the button in the top bar.
- **Phone and tablet sizes:** use your browser's device mode (in Chrome: right-click → *Inspect* → the phone icon, then pick a width such as 390 px).
- **Mistakes are fine.** If a file has invalid JSON or a setting FrontLit doesn't accept, the page shows the error instead. Fix it, save, and the page comes back.

## Show your site name and logo

The header shows "Local preview" until you tell the tool your site's name. Your name and logo are stored in your FrontLit settings rather than the repository, so the tool can't find them alone.

Create `frontlit/preview.context.json`:

```json
{
  "branding": {
    "title": "Acme",
    "subtitle": "Invoices that chase themselves",
    "logo": { "url": "assets/logo.svg", "alt": "Acme" }
  }
}
```

- `title` is your site name, the same one set in FrontLit.
- `subtitle` and `logo` are optional. The logo path is relative to this file, so `assets/logo.svg` means `frontlit/assets/logo.svg`.

This file is only for your computer. Add it to `.gitignore` so it isn't committed:

```sh
echo "frontlit/preview.context.json" >> .gitignore
```

### Optional: sample posts for blog-style pages

Pages with a content feed (for example a blog listing) normally show articles from FrontLit. Locally they show a placeholder box. To see real-looking entries, add sample items for that page's address to the same file:

```json
{
  "branding": { "title": "Acme" },
  "feeds": {
    "/blog": [
      { "title": "Our first post", "href": "/", "description": "A short summary." }
    ]
  }
}
```

## Options

```sh
npx @frontlit/preview@alpha [site-folder] [--port <number>] [--context <file>]
```

| Option | What it does | Default |
| --- | --- | --- |
| `site-folder` | The folder that has `pages/` in it. Use `.` if your pages are at the repository root. | `frontlit` |
| `--port` | Serve on another port, if 4310 is busy. | `4310` |
| `--context` | Use a branding file from somewhere else. | `<site-folder>/preview.context.json` |
| `--help` | Print the usage line. | |

Example: `npx @frontlit/preview@alpha website --port 5000`.

## Images

Put images in your repository (for example `frontlit/assets/`) and point to them from page JSON:

- **Relative paths** start from the JSON file: from `pages/index.json`, use `../assets/hero.webp`.
- **Paths starting with `/`** start from the repository root: `/frontlit/assets/hero.webp`.
- **`https://` links** load from the web as usual.

Only image files inside your repository are shown (`.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`, `.svg`).

**Embed snippets are different.** The tool doesn't change URLs written inside an embed's HTML. Use a full `https://` URL there, or `/__frontlit/assets/frontlit/assets/<file>` for an image in your repository.

## What it doesn't show

This tool shows your pages, not everything your live site does:

- Blog posts, docs pages and other content stored in FrontLit (only the pages in `pages/` exist)
- Redirects from `site.json`
- Search and the chat assistant
- Real form submissions: forms only show their success message
- FrontLit's production image optimization

Before you publish, open your pull request on GitHub and check the **FrontLit / pages preview** link. That's the real thing, built the same way as your live site.

## Troubleshooting

| Message or problem | Fix |
| --- | --- |
| `No pages directory in …` | Run the command from your repository, or pass the folder that contains `pages/`, e.g. `npx @frontlit/preview@alpha website`. |
| Port 4310 already in use | Another preview is probably still running. Stop it with Ctrl+C, or use `--port 4311`. |
| `Page not found` | There is no `pages/<name>.json` for that address. Check the file name. Names use lowercase letters, numbers and hyphens. |
| An image doesn't show | Check the path is relative to the JSON file, and that the file is inside the repository and is an image. |
| The header says "Local preview" | Add `preview.context.json` with your site name (see above). |
| `Unsupported engine` or a syntax error on start | Update Node.js to 20.19 or newer. |

## For FrontLit contributors

The package ships its CLI (`cli.mjs`), server (`server.mjs`, `site.mjs`) and Vite client (`client/`) as source, so it has no build step. It renders with `@frontlit/page-builder`'s client renderer, `schema` and `theme` entry points.

- Run from the monorepo: build `@frontlit/text-editor` and `@frontlit/page-builder`, then `bun packages/preview/cli.mjs <site-folder>`.
- Tests: `bun run --cwd packages/preview test`.
- Once installed from npm, the client runs from `node_modules`. The server therefore pre-bundles the JSX runtime and allows page-builder's package folder for its fonts. Test packaging changes from a packed tarball: `bun pm pack`, then `npm install <tarball>` in an empty folder. A workspace run alone isn't enough.
- The context file can also hold `site` (the same shape as `site.json`; `site.json` values win) and `themeId` (a bundled theme preset, used when there is no theme object).
