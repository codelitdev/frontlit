# Text editor blocks example

A Vite + React app that runs the **workspace** `@frontlit/text-editor` with
every library block — Image, Video, Audio, PDF, File, Embed, Callout, Tabs,
Accordion and Steps — and uploads media to [MediaLit](https://medialit.cloud)
for real. Unlike `examples/components-demo`, which installs the published
packages, this one tracks the code in `packages/text-editor`.

What it shows:

- `defineProfile` with the block library, and the `/` insert menu.
- `MediaPickerContextProvider`: picking a file uploads it straight from the
  browser to MediaLit over tus, then the block stores only the media ID.
- `resolveMedia`: the editor and the `TextRenderer` beside it turn IDs into
  URLs from the host's own lookup.
- `unavailable`: tick "Embed unavailable" to grey Embed out in the `/` menu,
  and `validateContent` (with `previous`) to see what a server would accept.
- `serializeMarkdown`: the Markdown form of the document.

The MediaLit API key stays on the server. `vite.config.ts` stands in for a
host backend with two routes: `POST /api/media/signature` (a short-lived
upload signature) and `POST /api/media/:id/seal` (keeps the upload and returns
its URL). The document and the ID → URL map are kept in `localStorage`.

## Run

From the repo root:

```sh
bun install
bun run --filter @frontlit/text-editor build
cp examples/text-editor-blocks/.env.example examples/text-editor-blocks/.env
# set MEDIALIT_APIKEY (and MEDIALIT_SERVER for a non-default MediaLit)
bun run --filter @frontlit/text-editor-blocks-example dev
```

Open [http://localhost:5174](http://localhost:5174). Rebuild the package (or
run `bun run --filter @frontlit/text-editor dev` alongside) to pick up changes
in `packages/text-editor`.

Without a key the editor still works; choosing a media file shows
"Upload failed" with the reason.
