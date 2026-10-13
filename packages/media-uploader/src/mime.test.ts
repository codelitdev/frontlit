import { describe, expect, it } from "bun:test";
import { allowsImages, getMimeCategory, matchesMime } from "./mime";

describe("matchesMime", () => {
  it("allows all files when acceptedTypes is undefined or empty", () => {
    expect(matchesMime("image/png", "photo.png", undefined)).toBe(true);
    expect(matchesMime("application/pdf", "doc.pdf", [])).toBe(true);
    expect(matchesMime("video/mp4", "movie.mp4", ["*/*"])).toBe(true);
    expect(matchesMime("application/zip", "archive.zip", ["*"])).toBe(true);
  });

  it("matches wildcard MIME patterns", () => {
    expect(matchesMime("image/jpeg", "pic.jpg", ["image/*"])).toBe(true);
    expect(matchesMime("image/webp", "pic.webp", ["image/*"])).toBe(true);
    expect(matchesMime("application/pdf", "doc.pdf", ["image/*"])).toBe(false);

    expect(matchesMime("video/mp4", "clip.mp4", ["video/*"])).toBe(true);
    expect(matchesMime("video/webm", "clip.webm", ["video/*"])).toBe(true);
    expect(matchesMime("audio/mp3", "song.mp3", ["video/*"])).toBe(false);
  });

  it("matches file extension patterns", () => {
    expect(matchesMime("application/pdf", "contract.pdf", [".pdf"])).toBe(true);
    expect(matchesMime("application/pdf", "contract.PDF", [".pdf"])).toBe(true);
    expect(matchesMime("application/zip", "bundle.zip", [".pdf", ".zip"])).toBe(true);
    expect(matchesMime("image/png", "image.png", [".pdf", ".docx"])).toBe(false);
  });

  it("matches exact MIME types", () => {
    expect(matchesMime("application/pdf", "manual.pdf", ["application/pdf"])).toBe(
      true,
    );
    expect(matchesMime("application/json", "data.json", ["application/pdf"])).toBe(
      false,
    );
  });

  it("handles generic octet-stream with recognized extension", () => {
    expect(
      matchesMime("application/octet-stream", "manual.pdf", ["application/pdf"]),
    ).toBe(true);
  });
});

describe("allowsImages", () => {
  it("returns true for unset or wildcard types", () => {
    expect(allowsImages(undefined)).toBe(true);
    expect(allowsImages([])).toBe(true);
    expect(allowsImages(["*/*"])).toBe(true);
    expect(allowsImages(["*"])).toBe(true);
  });

  it("returns true when image types or extensions are included", () => {
    expect(allowsImages(["image/*"])).toBe(true);
    expect(allowsImages(["image/png", "image/jpeg"])).toBe(true);
    expect(allowsImages([".png", ".jpg"])).toBe(true);
    expect(allowsImages(["application/pdf", "image/*"])).toBe(true);
  });

  it("returns false when restricted to non-image formats", () => {
    expect(allowsImages(["application/pdf"])).toBe(false);
    expect(allowsImages(["video/*", "audio/*"])).toBe(false);
    expect(allowsImages([".pdf", ".docx", ".zip"])).toBe(false);
  });
});

describe("getMimeCategory", () => {
  it("correctly identifies image formats", () => {
    expect(getMimeCategory("image/png", "photo.png")).toBe("image");
    expect(getMimeCategory("image/svg+xml", "icon.svg")).toBe("image");
    expect(getMimeCategory("", "cover.webp")).toBe("image");
  });

  it("correctly identifies video formats", () => {
    expect(getMimeCategory("video/mp4", "lesson.mp4")).toBe("video");
    expect(getMimeCategory("", "recording.mov")).toBe("video");
  });

  it("correctly identifies audio formats", () => {
    expect(getMimeCategory("audio/mpeg", "podcast.mp3")).toBe("audio");
    expect(getMimeCategory("", "voice.wav")).toBe("audio");
  });

  it("correctly identifies pdf files", () => {
    expect(getMimeCategory("application/pdf", "worksheet.pdf")).toBe("pdf");
    expect(getMimeCategory("", "guide.pdf")).toBe("pdf");
  });

  it("correctly identifies archives", () => {
    expect(getMimeCategory("application/zip", "assets.zip")).toBe("archive");
    expect(getMimeCategory("", "package.tar.gz")).toBe("archive");
  });

  it("correctly identifies documents", () => {
    expect(getMimeCategory("text/plain", "notes.txt")).toBe("document");
    expect(getMimeCategory("text/markdown", "readme.md")).toBe("document");
    expect(getMimeCategory("", "report.docx")).toBe("document");
  });

  it("defaults to other for unknown types", () => {
    expect(getMimeCategory("application/octet-stream", "binary.bin")).toBe("other");
  });
});
