import React from "react";
import { Download, FileText } from "lucide-react";
import { videoEmbedUrl, type VideoProvider } from "../core/urls";

/**
 * Static media markup shared by the renderer and the editor's previews.
 * React elements only; URLs come from the host (`resolveMedia`) or are built
 * from a provider and video ID, never from author HTML.
 */
export function HostedVideo({
  provider,
  videoId,
  title,
}: {
  provider: VideoProvider;
  videoId: string;
  title?: string | null;
}) {
  const src = videoEmbedUrl(provider, videoId);
  if (!src) return null;
  return (
    <iframe
      className="te-video__frame"
      src={src}
      title={title || "Video"}
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
}: {
  url: string;
  label?: string | null;
  name?: string;
}) {
  return (
    <a className="te-file" href={url} download={name ?? true} rel="noopener noreferrer">
      <Download className="te-file__icon" aria-hidden />
      <span>{label || name || "Download file"}</span>
    </a>
  );
}

export function PdfView({ url, title }: { url: string; title?: string | null }) {
  return (
    <object
      className="te-pdf"
      data={url}
      type="application/pdf"
      aria-label={title || "PDF"}
    >
      <a className="te-file" href={url} rel="noopener noreferrer">
        <FileText className="te-file__icon" aria-hidden />
        <span>{title || "Open PDF"}</span>
      </a>
    </object>
  );
}
