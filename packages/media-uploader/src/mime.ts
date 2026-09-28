const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
const ARCHIVE_EXTENSIONS = [".zip", ".tar", ".gz", ".rar", ".7z", ".tar.gz"];
const DOCUMENT_EXTENSIONS = [
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".md",
  ".json",
  ".rtf",
];

export type MimeCategory =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "document"
  | "other";

function getExtension(name?: string | null): string {
  if (!name) return "";
  const lastDot = name.lastIndexOf(".");
  return lastDot !== -1 ? name.slice(lastDot).toLowerCase() : "";
}

export function getMimeCategory(
  mimeType?: string | null,
  fileName?: string | null,
): MimeCategory {
  const mime = mimeType?.toLowerCase().trim() ?? "";
  const ext = getExtension(fileName);

  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.includes(ext)) {
    return "image";
  }
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.includes(ext)) {
    return "video";
  }
  if (mime.startsWith("audio/") || AUDIO_EXTENSIONS.includes(ext)) {
    return "audio";
  }
  if (mime === "application/pdf" || ext === ".pdf") {
    return "pdf";
  }
  if (
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("compressed") ||
    mime.includes("archive") ||
    ARCHIVE_EXTENSIONS.includes(ext)
  ) {
    return "archive";
  }
  if (
    mime.includes("word") ||
    mime.includes("sheet") ||
    mime.includes("excel") ||
    mime.includes("presentation") ||
    mime.startsWith("text/") ||
    DOCUMENT_EXTENSIONS.includes(ext)
  ) {
    return "document";
  }

  return "other";
}

export function matchesMime(
  fileType: string,
  fileName?: string,
  acceptedTypes?: string[],
): boolean {
  if (!acceptedTypes || acceptedTypes.length === 0) return true;
  if (acceptedTypes.includes("*/*") || acceptedTypes.includes("*")) return true;

  const mime = fileType.toLowerCase().trim();
  const ext = getExtension(fileName);

  return acceptedTypes.some((pattern) => {
    const p = pattern.toLowerCase().trim();
    if (p === "*/*" || p === "*") return true;

    // File extension match (e.g. ".pdf", ".zip")
    if (p.startsWith(".")) {
      return ext === p;
    }

    // Wildcard match (e.g. "image/*", "video/*", "audio/*")
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1); // e.g. "image/"
      return mime.startsWith(prefix);
    }

    // Exact MIME match (e.g. "application/pdf", "image/png")
    if (mime === p) return true;

    // If browser gave generic application/octet-stream or empty, check extension
    if (p === "application/pdf" && ext === ".pdf") return true;

    return false;
  });
}

export function allowsImages(acceptedTypes?: string[]): boolean {
  if (!acceptedTypes || acceptedTypes.length === 0) return true;
  if (acceptedTypes.includes("*/*") || acceptedTypes.includes("*")) return true;

  return acceptedTypes.some((pattern) => {
    const p = pattern.toLowerCase().trim();
    if (p === "*/*" || p === "*" || p === "image/*") return true;
    if (p.startsWith("image/")) return true;
    if (IMAGE_EXTENSIONS.includes(p)) return true;
    return false;
  });
}
