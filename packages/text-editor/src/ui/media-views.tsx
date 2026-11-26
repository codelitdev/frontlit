import React from "react";
import { Download, FileText } from "lucide-react";
import { videoEmbedUrl, type VideoProvider } from "../core/urls";
import { defaultTextEditorLabels, type TextEditorLabels } from "../labels";

/**
 * Static media markup shared by the renderer and the editor's previews.
 * React elements only; URLs come from the host (`resolveMedia`) or are built
 * from a provider and video ID, never from author HTML.
 */
export function HostedVideo({
  provider,
  videoId,
  title,
  labels = defaultTextEditorLabels,
}: {
  provider: VideoProvider;
  videoId: string;
  title?: string | null;
  labels?: Pick<TextEditorLabels, "video">;
}) {
  const src = videoEmbedUrl(provider, videoId);
  if (!src) return null;
  return (
    <iframe
      className="te-video__frame"
      src={src}
      title={title || labels.video}
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      loading="lazy"
    />
  );
}

export function Caption({ text }: { text?: string | null }) {
  return text ? <figcaption className="te-media__caption">{text}</figcaption> : null;
}

export function FileLink({
  url,
  label,
  name,
  labels = defaultTextEditorLabels,
}: {
  url: string;
  label?: string | null;
  name?: string;
  labels?: Pick<TextEditorLabels, "downloadFile">;
}) {
  return (
    <a className="te-file" href={url} download={name ?? true} rel="noopener noreferrer">
      <Download className="te-file__icon" aria-hidden />
      <span>{label || name || labels.downloadFile}</span>
    </a>
  );
}

export function PdfView({
  url,
  title,
  labels = defaultTextEditorLabels,
}: {
  url: string;
  title?: string | null;
  labels?: Pick<TextEditorLabels, "pdf" | "openPdf">;
}) {
  return (
    <object
      className="te-pdf"
      data={url}
      type="application/pdf"
      aria-label={title || labels.pdf}
    >
      <a className="te-file" href={url} rel="noopener noreferrer">
        <FileText className="te-file__icon" aria-hidden />
        <span>{title || labels.openPdf}</span>
      </a>
    </object>
  );
}
