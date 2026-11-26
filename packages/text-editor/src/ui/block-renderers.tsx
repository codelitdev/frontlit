import React from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeProps } from "@tiptap/static-renderer";
import {
  CircleAlert,
  CircleCheck,
  Info,
  Lightbulb,
  OctagonAlert,
  StickyNote,
} from "lucide-react";
import { isVideoId } from "../core/urls";
import { DocsTabs } from "../components/docs-tabs";
import { EmbedFrame } from "./embed-frame";
import { H5PFrame, LinkButton, WebPreviewCard } from "./link-views";
import { Caption, FileLink, HostedVideo, PdfView } from "./media-views";
import { mediaUrl, type ResolveMedia } from "./types";
import { defaultTextEditorLabels, type TextEditorLabels } from "../labels";

type BlockProps = NodeProps<ProseMirrorNode, React.ReactNode>;

const childAttrs = (node: ProseMirrorNode) => {
  const attrs: Record<string, any>[] = [];
  node.forEach((child) => {
    attrs.push(child.attrs);
  });
  return attrs;
};

const CALLOUT_ICONS = {
  note: StickyNote,
  tip: Lightbulb,
  info: Info,
  success: CircleCheck,
  warning: CircleAlert,
  danger: OctagonAlert,
};

export function Callout({ node, children }: BlockProps) {
  const type = (node.attrs.type ?? "info") as keyof typeof CALLOUT_ICONS;
  const Icon = CALLOUT_ICONS[type] ?? Info;
  return (
    <div className="te-callout" data-type={type} role="note">
      <Icon className="te-callout__icon" aria-hidden />
      <div className="te-callout__body">
        {node.attrs.title && <p className="te-callout__title">{node.attrs.title}</p>}
        {children}
      </div>
    </div>
  );
}

export function Tabs({ node, children }: BlockProps) {
  return (
    <DocsTabs className="te-tabs" labels={childAttrs(node).map((attrs) => attrs.label)}>
      {children}
    </DocsTabs>
  );
}

export function Steps({ children }: BlockProps) {
  return <ol className="te-steps">{children}</ol>;
}

export function Step({ children }: BlockProps) {
  return <li className="te-step">{children}</li>;
}

export function Accordions({ children }: BlockProps) {
  return <div className="te-accordions">{children}</div>;
}

export function Accordion({ node, children }: BlockProps) {
  return (
    <details className="te-accordion">
      <summary className="te-accordion__title">{node.attrs.title}</summary>
      <div className="te-accordion__body">{children}</div>
    </details>
  );
}

/** Renderers of the library's text blocks. */
export const textBlockRenderers = (
  labels: TextEditorLabels = defaultTextEditorLabels,
) => ({
  button: ({ node }: BlockProps) => (
    <LinkButton
      href={node.attrs.href}
      label={node.attrs.label}
      variant={node.attrs.variant}
    />
  ),
  webPreview: ({ node }: BlockProps) => (
    <WebPreviewCard
      url={node.attrs.url}
      title={node.attrs.title}
      description={node.attrs.description}
      image={node.attrs.image}
    />
  ),
  h5p: ({ node }: BlockProps) => (
    <H5PFrame
      src={node.attrs.src}
      title={node.attrs.title}
      height={node.attrs.height}
      labels={labels}
    />
  ),
  callout: Callout,
  tabs: Tabs,
  tab: ({ children }: BlockProps) => <>{children}</>,
  steps: Steps,
  step: Step,
  accordions: Accordions,
  accordion: Accordion,
});

/**
 * Renderers of the library's media and embed blocks. Media URLs come only
 * from the host's `resolveMedia`; a block without a source renders nothing.
 */
export function mediaBlockRenderers(
  resolveMedia?: ResolveMedia,
  labels: TextEditorLabels = defaultTextEditorLabels,
) {
  const resolve = (id: unknown) => mediaUrl(resolveMedia, id);
  return {
    image: ({ node }: BlockProps) => {
      const { media, src, alt, title, width, height } = node.attrs;
      const url = media ? resolve(media)?.url : src;
      if (!url) return null;
      return (
        // biome-ignore lint/performance/noImgElement: static renderer output.
        <img
          className="max-w-full h-auto rounded-md"
          src={url}
          alt={alt ?? ""}
          title={title ?? undefined}
          width={width ?? undefined}
          height={height ?? undefined}
        />
      );
    },
    video: ({ node }: BlockProps) => {
      const { media, provider, videoId, caption } = node.attrs;
      let body: React.ReactNode = null;
      if (provider && isVideoId(provider, videoId))
        body = (
          <div className="te-video">
            <HostedVideo
              provider={provider}
              videoId={videoId}
              title={caption}
              labels={labels}
            />
          </div>
        );
      else if (media) {
        const file = resolve(media);
        if (file)
          body = (
            <video
              className="te-video__file"
              src={file.url}
              controls
              preload="metadata"
            />
          );
      }
      if (!body) return null;
      return (
        <figure className="te-media">
          {body}
          <Caption text={caption} />
        </figure>
      );
    },
    audio: ({ node }: BlockProps) => {
      const file = resolve(node.attrs.media);
      if (!file) return null;
      return (
        <figure className="te-media">
          <audio className="te-audio" src={file.url} controls preload="metadata" />
          <Caption text={node.attrs.caption} />
        </figure>
      );
    },
    pdf: ({ node }: BlockProps) => {
      const file = resolve(node.attrs.media);
      return file ? (
        <PdfView url={file.url} title={node.attrs.title} labels={labels} />
      ) : null;
    },
    file: ({ node }: BlockProps) => {
      const file = resolve(node.attrs.media);
      return file ? (
        <FileLink
          url={file.url}
          label={node.attrs.label}
          name={file.name}
          labels={labels}
        />
      ) : null;
    },
    embed: ({ node }: BlockProps) =>
      node.attrs.code ? (
        <EmbedFrame
          code={node.attrs.code}
          title={node.attrs.title}
          height={node.attrs.height}
          defaultTitle={labels.embeddedContent}
        />
      ) : null,
  };
}
