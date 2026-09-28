import { describe, expect, it } from "vitest";
import {
  getFeaturedImageAlt,
  getFeaturedImageUrl,
  toFeaturedImageRef,
} from "./featured-image";
import type { FrontLitImage } from "./frontlit-image-uploader";

describe("toFeaturedImageRef", () => {
  it("converts library media with mediaId and thumbnails", () => {
    const media: FrontLitImage = {
      mediaId: "med_abc",
      id: "med_abc",
      mediaLitId: "ml_123",
      url: "https://cdn.example.com/ml_123.jpg",
      thumbnailUrl: "https://cdn.example.com/ml_123_thumb.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      alt: "A scenic view",
      caption: null,
      createdAt: null,
      updatedAt: null,
    };

    const ref = toFeaturedImageRef({
      src: "https://cdn.example.com/ml_123.jpg",
      alt: "Override alt",
      media,
    });

    expect(ref).toEqual({
      mediaId: "med_abc",
      url: "https://cdn.example.com/ml_123.jpg",
      thumbnailUrl: "https://cdn.example.com/ml_123_thumb.jpg",
      alt: "A scenic view",
    });
  });

  it("converts external / unsplash image without media object", () => {
    const ref = toFeaturedImageRef({
      src: "https://images.unsplash.com/photo-123",
      alt: "Unsplash photo",
    });

    expect(ref).toEqual({
      url: "https://images.unsplash.com/photo-123",
      alt: "Unsplash photo",
    });
  });
});

describe("getFeaturedImageUrl and getFeaturedImageAlt", () => {
  it("resolves raw string URLs", () => {
    expect(getFeaturedImageUrl("https://cdn.example.com/banner.jpg")).toBe(
      "https://cdn.example.com/banner.jpg",
    );
    expect(getFeaturedImageAlt("https://cdn.example.com/banner.jpg")).toBe("");
  });

  it("resolves objects with url, file, or src", () => {
    expect(getFeaturedImageUrl({ url: "https://cdn.example.com/url.jpg" })).toBe(
      "https://cdn.example.com/url.jpg",
    );
    expect(getFeaturedImageUrl({ file: "https://cdn.example.com/file.jpg" })).toBe(
      "https://cdn.example.com/file.jpg",
    );
    expect(getFeaturedImageUrl({ src: "https://cdn.example.com/src.jpg" })).toBe(
      "https://cdn.example.com/src.jpg",
    );
  });

  it("resolves alt text from alt, caption, or title", () => {
    expect(getFeaturedImageAlt({ alt: "Alt text" })).toBe("Alt text");
    expect(getFeaturedImageAlt({ caption: "Caption text" })).toBe("Caption text");
    expect(getFeaturedImageAlt({ title: "Title text" })).toBe("Title text");
  });

  it("returns null or empty string for invalid/empty inputs", () => {
    expect(getFeaturedImageUrl(null)).toBeNull();
    expect(getFeaturedImageUrl(undefined)).toBeNull();
    expect(getFeaturedImageUrl({})).toBeNull();
    expect(getFeaturedImageAlt(null)).toBe("");
  });
});
