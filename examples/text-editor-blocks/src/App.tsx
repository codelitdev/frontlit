import { useCallback, useMemo, useState } from "react";
import {
  Editor,
  MediaPickerContextProvider,
  TextRenderer,
  accordion,
  audio,
  callout,
  defineProfile,
  embed,
  file,
  image,
  pdf,
  steps,
  tabs,
  video,
  type PickMedia,
  type ResolveMedia,
  type TextEditorContent,
} from "@frontlit/text-editor";
import { serializeMarkdown, validateContent } from "@frontlit/text-editor/blocks";
import { chooseFile, uploadToMediaLit, type UploadedMedia } from "./upload";

/** A lesson-style profile with every library block. Media blocks store MediaLit IDs. */
const lesson = defineProfile({
  base: { exclude: ["table"], headings: { levels: [2, 3, 4] } },
  blocks: [
    image({ media: true }),
    video(),
    audio(),
    pdf(),
    file(),
    embed(),
    callout(),
    tabs(),
    accordion(),
    steps(),
  ],
});

const STORAGE_KEY = "text-editor-blocks-example";
type MediaMap = Record<string, Omit<UploadedMedia, "mediaId">>;
interface Saved {
  doc: TextEditorContent;
  media: MediaMap;
}

const starter: Saved = {
  doc: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Lesson" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Type / for blocks. Image, Video, Audio, PDF and File upload to MediaLit.",
          },
        ],
      },
    ],
  } as TextEditorContent,
  media: {},
};

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved?.doc) return saved;
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return starter;
}

function save(value: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the page still works, it just won't remember.
  }
}

export function App() {
  const [initial] = useState(load);
  const [doc, setDoc] = useState(initial.doc);
  const [media, setMedia] = useState(initial.media);
  const [upload, setUpload] = useState<string | null>(null);
  const [embedLocked, setEmbedLocked] = useState(false);

  // The host's media library: a picked file is uploaded, then its ID is stored in the block.
  const pickMedia = useCallback<PickMedia>(
    async ({ accept }) => {
      const chosen = await chooseFile(accept);
      if (!chosen) return null;
      try {
        setUpload(`Uploading ${chosen.name}… 0%`);
        const uploaded = await uploadToMediaLit(chosen, (percent) =>
          setUpload(`Uploading ${chosen.name}… ${percent}%`),
        );
        const { mediaId, ...entry } = uploaded;
        setMedia((current) => {
          const next = { ...current, [mediaId]: entry };
          save({ doc, media: next });
          return next;
        });
        setUpload(null);
        return {
          id: mediaId,
          previewUrl: entry.url,
          name: entry.name,
          mimeType: entry.mimeType,
        };
      } catch (error) {
        setUpload(
          `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },
    [doc],
  );

  const resolveMedia = useCallback<ResolveMedia>((id) => media[id] ?? null, [media]);
  const unavailable = embedLocked ? { embed: "Upgrade to add embeds" } : undefined;

  const report = useMemo(
    () =>
      validateContent(lesson, doc, {
        previous: initial.doc,
        unavailable: embedLocked ? { embed: "plan_required" } : undefined,
      }),
    [doc, embedLocked, initial.doc],
  );
  const markdown = useMemo(() => {
    try {
      return serializeMarkdown(lesson, doc);
    } catch (error) {
      return `Not representable as Markdown: ${error instanceof Error ? error.message : error}`;
    }
  }, [doc]);

  return (
    <MediaPickerContextProvider pickMedia={pickMedia}>
      <header className="example-header">
        <h1>Text editor blocks</h1>
        <label>
          <input
            type="checkbox"
            checked={embedLocked}
            onChange={(event) => setEmbedLocked(event.target.checked)}
          />{" "}
          Embed unavailable
        </label>
        <button
          type="button"
          onClick={() => {
            save(starter);
            location.reload();
          }}
        >
          Reset
        </button>
        {upload && <span role="status">{upload}</span>}
      </header>
      <main className="example-grid">
        <section aria-label="Editor" className="example-pane">
          <Editor
            profile={lesson}
            unavailable={unavailable}
            initialContent={initial.doc}
            resolveMedia={resolveMedia}
            debounceMs={300}
            onChange={(json) => {
              setDoc(json as TextEditorContent);
              save({ doc: json as TextEditorContent, media });
            }}
          />
        </section>
        <section aria-label="Rendered" className="example-pane example-rendered">
          <TextRenderer profile={lesson} json={doc} resolveMedia={resolveMedia} />
        </section>
      </main>
      <section className="example-output">
        <details>
          <summary>
            validateContent:{" "}
            {report.diagnostics.length
              ? `${report.diagnostics.length} problem(s)`
              : "OK"}
          </summary>
          <pre data-testid="diagnostics">
            {JSON.stringify(report.diagnostics, null, 2)}
          </pre>
        </details>
        <details>
          <summary>serializeMarkdown</summary>
          <pre data-testid="markdown">{markdown}</pre>
        </details>
      </section>
    </MediaPickerContextProvider>
  );
}
