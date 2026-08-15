import type {
    LibraryImage,
    UnsplashSearchResult,
} from "@frontlit/image-uploader";
import { listMedia, searchUnsplash, type Media } from "@/lib/api";

export type FrontLitImage = Media & LibraryImage;

export function toLibraryImage(media: Media): FrontLitImage {
    return { ...media, id: media.mediaId };
}

export async function loadLibrary(query: string): Promise<FrontLitImage[]> {
    const result = await listMedia({ itemsPerPage: 60 });
    const needle = query.trim().toLowerCase();
    const items = needle
        ? result.items.filter((item) =>
              `${item.fileName ?? ""} ${item.alt ?? ""}`
                  .toLowerCase()
                  .includes(needle),
          )
        : result.items;
    return items.map(toLibraryImage);
}

export async function searchUnsplashAdapter(
    q?: string,
): Promise<UnsplashSearchResult> {
    const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
            () => reject(new Error("Unsplash request timed out")),
            8000,
        );
    });
    return Promise.race([searchUnsplash(q), timeout]);
}
