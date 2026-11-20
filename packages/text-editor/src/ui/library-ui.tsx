"use client";

import React, { useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import {
  AppWindow,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Info,
  ListOrdered,
  ChevronsUpDown,
  Paperclip,
  PanelTop,
  Video,
} from "lucide-react";
import type { BlockSchema } from "../core/types";
import { CALLOUT_TYPES } from "../core/library/text-blocks";
import { MEDIA_KINDS } from "../core/library/media";
import { parseVideoUrl } from "../core/urls";
import {
  BlockFrame,
  ItemFrame,
  inputClass,
  paragraph,
  SettingsField,
  smallButton,
  TextField,
  useEditorBlocks,
} from "./block-frame";
import { EmbedFrame } from "./embed-frame";
import { MEDIA_ACCEPT } from "./media-picker";
import { FileLink, HostedVideo, PdfView } from "./media-views";
import type { BlockSettingsProps, BlockUi } from "./types";
import { mediaUrl } from "./types";

const textInput = `${inputClass} w-full`;

function TextSetting({
  label,
  name,
  props,
  nullable = true,
}: {
  label: string;
  name: string;
  props: BlockSettingsProps;
  nullable?: boolean;
}) {
  return (
    <SettingsField label={label}>
      <input
        className={textInput}
        value={(props.attrs[name] as string | null) ?? ""}
        onChange={(event) =>
          props.update({
            [name]: nullable && !event.target.value ? null : event.target.value,
          })
        }
      />
    </SettingsField>
  );
}

/** Picks a file of the block's kind through the host picker and stores its ID. */
function usePick(props: ReactNodeViewProps | BlockSettingsProps) {
  const { pickMedia, previews } = useEditorBlocks();
  const name = props.node.type.name;
  const kind = MEDIA_KINDS[name];
  if (!pickMedia || !kind) return null;
  return async () => {
    const picked = await pickMedia({ kind, accept: MEDIA_ACCEPT[kind] });
    if (!picked) return;
    previews.set(picked.id, { url: picked.previewUrl, name: picked.name });
    const attrs: Record<string, unknown> = { media: picked.id };
    if (name === "video") Object.assign(attrs, { provider: null, videoId: null });
    if (name === "image")
      Object.assign(attrs, { src: null, alt: picked.alt ?? props.node.attrs.alt });
    if ("updateAttributes" in props) props.updateAttributes(attrs);
    else props.update(attrs);
  };
}

/** Preview URL of the block's media: picked this session, or resolved by the host. */
function usePreview(id: unknown) {
  const { previews, resolveMedia } = useEditorBlocks();
  if (typeof id !== "string") return null;
  const picked = previews.get(id);
  if (picked?.url) return { url: picked.url, name: picked.name };
  return mediaUrl(resolveMedia, id);
}

function ChooseButton({ props, noun }: { props: ReactNodeViewProps; noun: string }) {
  const pick = usePick(props);
  if (!pick || !props.editor.isEditable) return null;
  return (
    <button
      type="button"
      className={`${smallButton} border border-input`}
      onClick={() => void pick()}
    >
      {props.node.attrs.media ? `Replace ${noun}` : `Choose ${noun}`}
    </button>
  );
}

function MediaBody({ props, noun }: { props: ReactNodeViewProps; noun: string }) {
  const { node } = props;
  const preview = usePreview(node.attrs.media);
  const name = node.type.name;
  let body: React.ReactNode;
  if (!node.attrs.media)
    body = <p className="te-block__empty">No {noun} chosen yet.</p>;
  else if (!preview)
    body = (
      <p className="te-block__empty">{`${noun[0].toUpperCase()}${noun.slice(1)} ${node.attrs.media}`}</p>
    );
  else if (name === "image")
    // biome-ignore lint/performance/noImgElement: editor preview of host media.
    body = (
      <img
        src={preview.url}
        alt={node.attrs.alt ?? ""}
        className="max-w-full h-auto rounded-md"
      />
    );
  else if (name === "video")
    body = <video className="te-video__file" src={preview.url} controls />;
  else if (name === "audio")
    body = <audio className="te-audio" src={preview.url} controls />;
  else if (name === "pdf")
    body = <PdfView url={preview.url} title={node.attrs.title} />;
  else
    body = <FileLink url={preview.url} label={node.attrs.label} name={preview.name} />;
  return (
    <div className="te-block__content" contentEditable={false}>
      {body}
      <div className="mt-2 flex items-center gap-2">
        <ChooseButton props={props} noun={noun} />
      </div>
    </div>
  );
}

function VideoUrlField({
  props,
  onDone,
}: {
  props: ReactNodeViewProps | BlockSettingsProps;
  onDone?: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const parsed = parseVideoUrl(value);
    if (!parsed) {
      setError("Paste a YouTube or Vimeo link.");
      return;
    }
    const attrs = { media: null, ...parsed };
    if ("updateAttributes" in props) props.updateAttributes(attrs);
    else props.update(attrs);
    setValue("");
    setError(null);
    onDone?.();
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          className={textInput}
          placeholder="YouTube or Vimeo link"
          aria-label="YouTube or Vimeo link"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        <button
          type="button"
          className={`${smallButton} border border-input`}
          onClick={apply}
        >
          Use
        </button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function VideoView(props: ReactNodeViewProps) {
  const { node, editor } = props;
  const { provider, videoId, media, caption } = node.attrs;
  const preview = usePreview(media);
  return (
    <BlockFrame label="Video" props={props}>
      <div className="te-block__content" contentEditable={false}>
        {provider && videoId ? (
          <div className="te-video">
            <HostedVideo provider={provider} videoId={videoId} title={caption} />
          </div>
        ) : media ? (
          preview ? (
            <video className="te-video__file" src={preview.url} controls />
          ) : (
            <p className="te-block__empty">Video {media}</p>
          )
        ) : (
          editor.isEditable && (
            <div className="flex flex-col gap-2">
              <VideoUrlField props={props} />
              <ChooseButton props={props} noun="video file" />
            </div>
          )
        )}
      </div>
    </BlockFrame>
  );
}

function VideoSettings(props: BlockSettingsProps) {
  const pick = usePick(props);
  return (
    <>
      <SettingsField label="Video link">
        <VideoUrlField props={props} />
      </SettingsField>
      {pick && (
        <button
          type="button"
          className={`${smallButton} mb-2 border border-input`}
          onClick={() => void pick()}
        >
          Choose video file
        </button>
      )}
      <TextSetting label="Caption" name="caption" props={props} />
    </>
  );
}

function EmbedView(props: ReactNodeViewProps) {
  const { code, title, height } = props.node.attrs;
  return (
    <BlockFrame label="Embed" props={props}>
      <div className="te-block__content" contentEditable={false}>
        {code ? (
          <EmbedFrame code={code} title={title} height={height} />
        ) : (
          <p className="te-block__empty">Add HTML in the embed settings.</p>
        )}
      </div>
    </BlockFrame>
  );
}

function EmbedSettings(props: BlockSettingsProps) {
  return (
    <>
      <SettingsField label="HTML, CSS and JavaScript">
        <textarea
          className={`${textInput} h-40 py-1 font-mono`}
          value={props.attrs.code ?? ""}
          spellCheck={false}
          onChange={(event) => props.update({ code: event.target.value })}
        />
      </SettingsField>
      <TextSetting label="Title (for screen readers)" name="title" props={props} />
      <SettingsField label="Height (px)">
        <input
          className={textInput}
          type="number"
          min={50}
          max={4000}
          value={props.attrs.height ?? ""}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            props.update({
              height:
                Number.isFinite(value) && value >= 50 && value <= 4000 ? value : null,
            });
          }}
        />
      </SettingsField>
      <p className="text-xs text-muted-foreground">
        Runs in a sandboxed frame. It can resize itself with{" "}
        <code>{'parent.postMessage({ height }, "*")'}</code>.
      </p>
    </>
  );
}

function CalloutView(props: ReactNodeViewProps & { types: readonly string[] }) {
  return (
    <BlockFrame
      label="Callout"
      props={props}
      fields={
        <>
          <select
            className={inputClass}
            aria-label="Callout type"
            value={props.node.attrs.type ?? "info"}
            disabled={!props.editor.isEditable}
            onChange={(event) => props.updateAttributes({ type: event.target.value })}
          >
            {props.types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <TextField
            props={props}
            name="title"
            placeholder="Title (optional)"
            nullable
          />
        </>
      }
    />
  );
}

type UiFactory = (schema: BlockSchema) => Omit<BlockUi, "schema">;

const media = (
  noun: string,
  label: string,
  icon: BlockUi["insert"]["icon"],
  keywords: string[],
) =>
  ((schema: BlockSchema) => ({
    insert: {
      label,
      icon,
      keywords,
      create: () => ({ type: schema.name, attrs: { media: null } }),
    },
    view: (props: ReactNodeViewProps) => (
      <BlockFrame label={label} props={props}>
        <MediaBody props={props} noun={noun} />
      </BlockFrame>
    ),
  })) satisfies UiFactory;

/** Browser UI of the library blocks, by block name. */
export const LIBRARY_UI: Record<string, UiFactory> = {
  callout: (schema) => {
    const types = CALLOUT_TYPES.filter(
      (type) => schema.attrs.type?.validate(type) === true,
    );
    return {
      insert: {
        label: "Callout",
        icon: Info,
        keywords: ["note", "tip", "warning", "info", "danger", "admonition"],
        create: () => ({
          type: "callout",
          attrs: { type: types.includes("info") ? "info" : types[0] },
          content: [paragraph()],
        }),
      },
      view: (props) => <CalloutView {...props} types={types} />,
    };
  },
  tabs: () => ({
    insert: {
      label: "Tabs",
      icon: PanelTop,
      keywords: ["tab", "switch"],
      create: () => ({
        type: "tabs",
        content: ["Tab 1", "Tab 2"].map((label) => ({
          type: "tab",
          attrs: { label },
          content: [paragraph()],
        })),
      }),
    },
    view: (props) => <BlockFrame label="Tabs" props={props} />,
    addChild: {
      label: "Add tab",
      create: (count) => ({
        type: "tab",
        attrs: { label: `Tab ${count + 1}` },
        content: [paragraph()],
      }),
    },
  }),
  tab: () => ({
    insert: {
      label: "Tab",
      icon: PanelTop,
      keywords: [],
      create: () => ({ type: "tab" }),
    },
    view: (props) => (
      <ItemFrame
        props={props}
        fields={<TextField props={props} name="label" placeholder="Tab label" />}
      />
    ),
  }),
  steps: () => ({
    insert: {
      label: "Steps",
      icon: ListOrdered,
      keywords: ["sequence", "guide", "how to"],
      create: () => ({
        type: "steps",
        content: [
          {
            type: "step",
            content: [{ type: "heading", attrs: { level: 3 } }, paragraph()],
          },
        ],
      }),
    },
    view: (props) => <BlockFrame label="Steps" props={props} />,
    addChild: {
      label: "Add step",
      create: () => ({
        type: "step",
        content: [{ type: "heading", attrs: { level: 3 } }, paragraph()],
      }),
    },
  }),
  step: () => ({
    insert: {
      label: "Step",
      icon: ListOrdered,
      keywords: [],
      create: () => ({ type: "step" }),
    },
    view: (props) => <ItemFrame props={props} />,
  }),
  accordions: () => ({
    insert: {
      label: "Accordion",
      icon: ChevronsUpDown,
      keywords: ["faq", "collapse", "details", "toggle"],
      create: () => ({
        type: "accordions",
        content: [
          { type: "accordion", attrs: { title: "Question" }, content: [paragraph()] },
        ],
      }),
    },
    view: (props) => <BlockFrame label="Accordion" props={props} />,
    addChild: {
      label: "Add item",
      create: () => ({
        type: "accordion",
        attrs: { title: "Question" },
        content: [paragraph()],
      }),
    },
  }),
  accordion: () => ({
    insert: {
      label: "Accordion item",
      icon: ChevronsUpDown,
      keywords: [],
      create: () => ({ type: "accordion" }),
    },
    view: (props) => (
      <ItemFrame
        props={props}
        fields={<TextField props={props} name="title" placeholder="Title" />}
      />
    ),
  }),
  image: (schema) => ({
    insert: {
      label: "Image",
      icon: ImageIcon,
      keywords: ["picture", "photo", "img"],
      create: () => ({ type: "image", attrs: { src: null } }),
    },
    // Images stored by URL keep Tiptap's own view (with resizing).
    ...(schema.attrs.media
      ? {
          view: (props: ReactNodeViewProps) => (
            <BlockFrame label="Image" props={props}>
              <MediaBody props={props} noun="image" />
            </BlockFrame>
          ),
          settings: (props: BlockSettingsProps) => (
            <TextSetting label="Alt text" name="alt" props={props} nullable={false} />
          ),
        }
      : {}),
  }),
  video: () => ({
    insert: {
      label: "Video",
      icon: Video,
      keywords: ["youtube", "vimeo", "movie", "clip"],
      create: () => ({ type: "video", attrs: {} }),
    },
    view: VideoView,
    settings: VideoSettings,
  }),
  audio: (schema) => ({
    ...media("audio file", "Audio", FileAudio, ["sound", "podcast", "mp3"])(schema),
    settings: (props) => <TextSetting label="Caption" name="caption" props={props} />,
  }),
  pdf: (schema) => ({
    ...media("PDF", "PDF", FileText, ["document", "slides", "handout"])(schema),
    settings: (props) => <TextSetting label="Title" name="title" props={props} />,
  }),
  file: (schema) => ({
    ...media("file", "File", Paperclip, ["download", "attachment", "worksheet"])(
      schema,
    ),
    settings: (props) => <TextSetting label="Link text" name="label" props={props} />,
  }),
  embed: () => ({
    insert: {
      label: "Embed",
      icon: AppWindow,
      keywords: ["html", "code", "iframe", "widget", "script"],
      create: () => ({ type: "embed", attrs: { code: "" } }),
    },
    view: EmbedView,
    settings: EmbedSettings,
  }),
};

/** UI for a library block schema (with its options applied), if the library has one. */
export function libraryUi(schema: BlockSchema): BlockUi | undefined {
  const factory = LIBRARY_UI[schema.name];
  return factory ? { schema, ...factory(schema) } : undefined;
}

/** Code blocks with file name and language fields (profiles with `codeBlockFields`). */
export function CodeBlockFieldsView(props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="te-block-code">
      <div className="te-block__bar" contentEditable={false}>
        <TextField props={props} name="title" placeholder="File name" nullable />
        <TextField
          props={props}
          name="language"
          placeholder="Language"
          nullable
          className="w-24"
        />
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
