import React from "react";
import {
  H5P_DEFAULT_HEIGHT,
  H5P_MAX_HEIGHT,
  H5P_MIN_HEIGHT,
} from "../core/library/links";
import { isExternalUrl } from "../core/urls";

/**
 * Static markup for Button, WebPreview and H5P, shared by the renderer and
 * the editor. `inert` (editor previews) draws links as plain elements so a
 * click edits the block instead of leaving the page.
 */

const linkProps = (href: string) =>
  isExternalUrl(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};

export function LinkButton({
  href,
  label,
  variant,
  inert,
}: {
  href?: string | null;
  label?: string | null;
  variant?: string | null;
  inert?: boolean;
}) {
  if (!label || (!href && !inert)) return null;
  const className = "te-button";
  const data = { "data-variant": variant === "secondary" ? "secondary" : "primary" };
  return (
    <p className="te-button-row">
      {inert || !href ? (
        <span className={className} {...data}>
          {label}
        </span>
      ) : (
        <a className={className} href={href} {...data} {...linkProps(href)}>
          {label}
        </a>
      )}
    </p>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function WebPreviewCard({
  url,
  title,
  description,
  image,
  inert,
}: {
  url?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  inert?: boolean;
}) {
  if (!url) return null;
  const host = hostOf(url);
  const body = (
    <>
      {image && (
        // biome-ignore lint/performance/noImgElement: static renderer output.
        <img className="te-web-preview__image" src={image} alt="" loading="lazy" />
      )}
      <span className="te-web-preview__body">
        <span className="te-web-preview__title">{title || host}</span>
        {description && (
          <span className="te-web-preview__description">{description}</span>
        )}
        <span className="te-web-preview__host">{host}</span>
      </span>
    </>
  );
  return inert ? (
    <span className="te-web-preview">{body}</span>
  ) : (
    <a className="te-web-preview" href={url} {...linkProps(url)}>
      {body}
    </a>
  );
}

export function H5PFrame({
  src,
  title,
  height,
}: {
  src?: string | null;
  title?: string | null;
  height?: number | null;
}) {
  if (!src) return null;
  const h = Math.min(
    H5P_MAX_HEIGHT,
    Math.max(H5P_MIN_HEIGHT, height ?? H5P_DEFAULT_HEIGHT),
  );
  return (
    <iframe
      className="te-h5p"
      src={src}
      title={title || "H5P activity"}
      // Cross-origin content keeps its own origin; it needs scripts and storage.
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      allow="fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      loading="lazy"
      style={{ width: "100%", height: h, border: 0 }}
    />
  );
}
