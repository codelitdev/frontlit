# @frontlit/media-uploader

A reusable media and file upload dialog with library and Unsplash tabs for React. Framework-agnostic: it depends only on `react` and `react-dom`.

Hosts provide their own storage adapters (or backend endpoints) via `MediaUploaderProvider`, and can invoke `MediaUploadDialog` or `ImageUploadDialog` anywhere in their UI.

## Installation

```sh
npm i @frontlit/media-uploader
# or
pnpm add @frontlit/media-uploader
# or
bun add @frontlit/media-uploader
```

Peer dependencies: `react` and `react-dom` (^18 or ^19).

### CSS

Import the compiled stylesheet. It includes the required layout, dialog, tab, and responsive utilities:

```ts
import "@frontlit/media-uploader/styles.css";
```

If you already run Tailwind CSS v4 in your host application, you can scan the package instead:

```css
@source "./node_modules/@frontlit/media-uploader";
```

## Usage

### 1. Setup Providers with Adapters

Wrap your application (or a subtree) with `MediaUploaderProvider` to wire up file uploading, library browsing, and Unsplash search:

```tsx
import { MediaUploaderProvider } from "@frontlit/media-uploader";

function App({ children }: { children: React.ReactNode }) {
  return (
    <MediaUploaderProvider
      uploadMedia={async (file, meta) => {
        const formData = new FormData();
        formData.append("file", file);
        if (meta.alt) formData.append("alt", meta.alt);
        if (meta.title) formData.append("title", meta.title);

        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        return res.json();
      }}
      listMedia={async (query) => {
        const res = await fetch(`/api/media?q=${encodeURIComponent(query)}`);
        return res.json();
      }}
      searchUnsplash={async (query) => {
        const res = await fetch(`/api/unsplash?q=${encodeURIComponent(query ?? "")}`);
        return res.json();
      }}
    >
      {children}
    </MediaUploaderProvider>
  );
}
```

### 2. General Media Dialog (`MediaUploadDialog`)

Use `MediaUploadDialog` to select any file type (images, videos, documents, archives, etc.):

```tsx
import { useState } from "react";
import { MediaUploadDialog, type SelectedMedia } from "@frontlit/media-uploader";
import "@frontlit/media-uploader/styles.css";

function MediaPicker() {
  const [open, setOpen] = useState(false);

  function handleSelect(media: SelectedMedia) {
    console.log("Selected file:", media.src, media.fileName, media.mimeType);
    setOpen(false);
  }

  return (
    <MediaUploadDialog
      open={open}
      onOpenChange={setOpen}
      title="Upload documents"
      acceptedTypes={["application/pdf", "image/*"]}
      maxUploadBytes={50 * 1024 * 1024} // 50MB
      onSelect={handleSelect}
    >
      <button onClick={() => setOpen(true)}>Choose File</button>
    </MediaUploadDialog>
  );
}
```

### 3. Image-Specific Dialog (`ImageUploadDialog`)

`ImageUploadDialog` is a pre-configured convenience component for image selection with alt text metadata support:

```tsx
import { useState } from "react";
import { ImageUploadDialog, type SelectedImage } from "@frontlit/media-uploader";

function AvatarPicker() {
  const [open, setOpen] = useState(false);

  return (
    <ImageUploadDialog
      open={open}
      onOpenChange={setOpen}
      title="Select avatar"
      onSelect={(img: SelectedImage) => {
        console.log("Image selected:", img.src, img.alt);
      }}
    >
      <button onClick={() => setOpen(true)}>Change Avatar</button>
    </ImageUploadDialog>
  );
}
```

## What's inside

- `MediaUploadDialog` — General-purpose file & media dialog with drag-and-drop upload, library browser, and Unsplash tabs.
- `ImageUploadDialog` — Specialized dialog pre-configured for images and alt-text editing.
- `MediaUploaderProvider` / `ImageUploaderProvider` — React Context providers for storage and search adapters.
- `useMediaUploaderAdapters` / `useImageUploaderAdapters` — Hook to access configured adapters within dialogs.
- `formatFileSize` — Formats byte count into human-readable strings (`KB`, `MB`, `GB`).
- `matchesMime`, `allowsImages`, `getMimeCategory` — MIME type matching, categorizing, and filtering utilities.

## License

MIT
