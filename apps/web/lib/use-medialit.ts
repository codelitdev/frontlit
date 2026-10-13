"use client";

import { useEffect, useRef, useState } from "react";
import { Upload as TUSUpload, type UploadOptions } from "tus-js-client";

/**
 * Direct-to-MediaLit resumable upload, ported from
 * `sendlit/apps/web/lib/use-medialit.ts`. The browser never talks to
 * FrontLit's own server for the file bytes: it fetches a short-lived
 * signature from the same-origin BFF proxy, then uploads straight to
 * MediaLit over TUS (architecture.md §9.1).
 */
interface UseMediaLitProps {
  signatureEndpoint: string;
  access?: "public" | "private";
  onUploadComplete?: (media: Record<string, any>) => void;
  onUploadError?: (error: Error) => void;
}

export function useMediaLit({
  signatureEndpoint,
  access = "public",
  onUploadComplete,
  onUploadError,
}: UseMediaLitProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadRef = useRef<TUSUpload | null>(null);

  async function getSignature(): Promise<{
    signature?: string;
    endpoint?: string;
  }> {
    const res = await fetch(signatureEndpoint, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to obtain upload signature.");
    }
    return res.json();
  }

  function uploadFile(
    fileToUpload: File,
    metadata: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    setIsUploading(true);
    setUploadProgress(0);

    return new Promise((resolve, reject) => {
      getSignature()
        .then(({ signature, endpoint }) => {
          if (!signature || !endpoint) {
            const err = new Error("Failed to obtain upload signature");
            setIsUploading(false);
            onUploadError?.(err);
            reject(err);
            return;
          }

          const tusOptions: UploadOptions = {
            endpoint: `${endpoint}/media/create/resumable`,
            removeFingerprintOnSuccess: true,
            retryDelays: [0, 3000, 5000],
            headers: { "x-medialit-signature": signature },
            metadata: {
              fileName: fileToUpload.name,
              mimeType: fileToUpload.type,
              access,
              ...metadata,
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              setUploadProgress((bytesUploaded / bytesTotal) * 100);
            },
            onError: (error) => {
              setIsUploading(false);
              onUploadError?.(error);
              reject(error);
            },
            onSuccess: (payload) => {
              try {
                const mediaString = payload.lastResponse.getHeader("Media");
                const media = mediaString ? JSON.parse(mediaString) : null;
                if (!media) throw new Error("Upload completed without media metadata");
                setUploadProgress(100);
                onUploadComplete?.(media);
                resolve(media);
              } catch (error) {
                const uploadError =
                  error instanceof Error ? error : new Error("Failed to parse media");
                onUploadError?.(uploadError);
                reject(uploadError);
              } finally {
                setIsUploading(false);
              }
            },
          };

          const upload = new TUSUpload(fileToUpload, tusOptions);
          uploadRef.current = upload;
          upload.start();
        })
        .catch((error) => {
          setIsUploading(false);
          onUploadError?.(error);
          reject(error);
        });
    });
  }

  function cancelUpload() {
    uploadRef.current?.abort();
    uploadRef.current = null;
    setIsUploading(false);
  }

  useEffect(() => cancelUpload, []);

  return { isUploading, uploadProgress, uploadFile, cancelUpload };
}
