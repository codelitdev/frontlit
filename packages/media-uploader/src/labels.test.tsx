import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Radix portals render nothing on the server; render the dialog in place so
// its text can be read from static markup.
const actualDialog = await import("@radix-ui/react-dialog");
mock.module("@radix-ui/react-dialog", () => ({
  ...actualDialog,
  Portal: ({ children }: { children: ReactNode }) => children,
}));

const { ImageUploadDialog, MediaUploadDialog, defaultMediaUploaderLabels } =
  await import("./index");

const uploadMedia = async () => ({ id: "m1", url: "https://example.com/a.png" });
const listMedia = async () => [];
const searchUnsplash = async () => ({ configured: true, items: [] });

/** Text and attribute values of the markup, without tags. */
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("media uploader labels", () => {
  it("keeps the English text when no labels are passed", () => {
    const html = renderToStaticMarkup(
      <ImageUploadDialog
        open
        onSelect={() => {}}
        uploadMedia={uploadMedia}
        listMedia={listMedia}
        searchUnsplash={searchUnsplash}
        maxUploadBytes={10 * 1024 * 1024}
      />,
    );
    expect(html).toContain("Select image");
    expect(html).toContain(
      "Upload a new image, choose one from your library, or pick from Unsplash.",
    );
    expect(html).toContain(">Upload<");
    expect(html).toContain(">Your media<");
    expect(html).toContain(">Unsplash<");
    expect(html).toContain("Drop image here or click");
    expect(text(html)).toContain(
      "image/jpeg, image/png, image/gif, image/webp · up to 10.0 MB",
    );
    expect(html).toContain("Alt text");
    expect(html).toContain('placeholder="Describe the image for accessibility"');
    expect(html).toContain("Upload image");
    expect(html).toContain('<span class="sr-only">Close</span>');
  });

  it("keeps the English text of the file dialog and its other tabs", () => {
    const file = renderToStaticMarkup(
      <MediaUploadDialog open onSelect={() => {}} uploadMedia={uploadMedia} />,
    );
    expect(file).toContain("Select file");
    expect(file).toContain("Upload a new file.");
    expect(file).toContain("Drop file here or click");
    expect(text(file)).toContain("Any file · up to 50.0 MB");
    expect(file).toContain("Upload file");

    const library = renderToStaticMarkup(
      <MediaUploadDialog
        open
        defaultTab="media"
        onSelect={() => {}}
        uploadMedia={uploadMedia}
        listMedia={listMedia}
      />,
    );
    expect(library).toContain('placeholder="Search library"');
    expect(library).toContain("No media yet");
    expect(library).toContain(">Select<");

    const unsplash = renderToStaticMarkup(
      <ImageUploadDialog
        open
        defaultTab="unsplash"
        onSelect={() => {}}
        uploadMedia={uploadMedia}
        searchUnsplash={searchUnsplash}
      />,
    );
    expect(unsplash).toContain('placeholder="Search Unsplash"');
  });

  it("shows the labels passed in, including function labels", () => {
    const html = renderToStaticMarkup(
      <ImageUploadDialog
        open
        onSelect={() => {}}
        uploadMedia={uploadMedia}
        listMedia={listMedia}
        maxUploadBytes={10 * 1024 * 1024}
        labels={{
          selectImageTitle: "Seleccionar imagen",
          description: ({ kind, library }) =>
            `Sube ${kind === "image" ? "una imagen" : "un archivo"}${library ? " o elige una de tu biblioteca" : ""}.`,
          uploadTab: "Subir",
          libraryTab: "Tus archivos",
          dropImage: "Suelta la imagen aquí o haz clic",
          upTo: (size) => `hasta ${size}`,
          uploadImage: "Subir imagen",
          close: "Cerrar",
        }}
      />,
    );
    expect(html).toContain("Seleccionar imagen");
    expect(html).toContain("Sube una imagen o elige una de tu biblioteca.");
    expect(html).toContain(">Subir<");
    expect(html).toContain(">Tus archivos<");
    expect(html).toContain("Suelta la imagen aquí o haz clic");
    expect(text(html)).toContain("· hasta 10.0 MB");
    expect(html).toContain("Subir imagen");
    expect(html).toContain('<span class="sr-only">Cerrar</span>');
    // Labels that were not passed stay English.
    expect(html).toContain("Alt text");
    expect(html).not.toContain("Select image");
  });

  it("lets an explicit title win over the labels", () => {
    const html = renderToStaticMarkup(
      <ImageUploadDialog
        open
        title="Cover"
        onSelect={() => {}}
        uploadMedia={uploadMedia}
        labels={{ selectImageTitle: "Seleccionar imagen" }}
      />,
    );
    expect(html).toContain("Cover");
    expect(html).not.toContain("Seleccionar imagen");
  });

  it("builds the English error messages", () => {
    const labels = defaultMediaUploaderLabels;
    expect(
      labels.formatNotAccepted("application/pdf", ["image/png", "image/gif"]),
    ).toBe(
      "File format not accepted (application/pdf). Allowed: image/png, image/gif.",
    );
    expect(labels.formatNotAccepted("", [])).toBe(
      "File format not accepted (unknown). Allowed: all formats.",
    );
    expect(labels.fileTooLarge("10.0 MB")).toBe(
      "File is too large. Maximum allowed size is 10.0 MB.",
    );
    expect(labels.uploading(42)).toBe("Uploading… 42%");
    expect(labels.description({ kind: "file", library: true, unsplash: false })).toBe(
      "Upload a new file or choose one from your library.",
    );
    expect(labels.description({ kind: "image", library: false, unsplash: true })).toBe(
      "Upload a new image or pick from Unsplash.",
    );
  });
});
