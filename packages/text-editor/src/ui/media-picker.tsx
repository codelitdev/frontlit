"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MediaKind } from "../core/library/media";

export type { MediaKind };

/** What the host picker returns: the stored media ID and a URL to preview it in the editor. */
export interface PickedMedia {
  id: string;
  previewUrl?: string;
  name?: string;
  mimeType?: string;
  alt?: string;
}

export interface MediaPickRequest {
  kind: MediaKind;
  /** `accept` string for a file input, e.g. `video/*`. */
  accept: string;
}

export type PickMedia = (request: MediaPickRequest) => Promise<PickedMedia | null>;

export const MEDIA_ACCEPT: Record<MediaKind, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  pdf: "application/pdf",
  file: "*/*",
};

const MediaPickerContext = createContext<PickMedia | null>(null);

/**
 * Supplies the editor's media picker (upload or library). The package never
 * fetches or uploads media itself; blocks store the returned ID.
 */
export function MediaPickerContextProvider({
  pickMedia,
  children,
}: {
  pickMedia: PickMedia;
  children: ReactNode;
}) {
  return (
    <MediaPickerContext.Provider value={pickMedia}>
      {children}
    </MediaPickerContext.Provider>
  );
}

export function useMediaPicker(): PickMedia | null {
  return useContext(MediaPickerContext);
}
