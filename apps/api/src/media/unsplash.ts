export type UnsplashPhoto = {
    id: string;
    alt?: string;
    thumbUrl: string;
    url: string;
    photographer?: string;
};

type UnsplashSearchResponse = {
    results?: Array<{
        id: string;
        alt_description?: string | null;
        description?: string | null;
        urls?: {
            small?: string;
            regular?: string;
        };
        user?: {
            name?: string;
        };
    }>;
};

export function isUnsplashConfigured() {
    return Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim());
}

export function mapUnsplashResults(
    payload: UnsplashSearchResponse,
): UnsplashPhoto[] {
    return (payload.results ?? []).flatMap((photo) => {
        const url = photo.urls?.regular;
        const thumbUrl = photo.urls?.small ?? url;
        if (!photo.id || !url || !thumbUrl) return [];
        return [
            {
                id: photo.id,
                url,
                thumbUrl,
                alt: photo.alt_description || photo.description || undefined,
                photographer: photo.user?.name,
            },
        ];
    });
}

export async function searchUnsplash(query: string): Promise<UnsplashPhoto[]> {
    const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
    if (!key) {
        throw new Error("UNSPLASH_ACCESS_KEY is not configured");
    }

    const params = new URLSearchParams({
        query,
        per_page: "12",
        client_id: key,
    });
    const response = await fetch(
        `https://api.unsplash.com/search/photos?${params}`,
    );
    if (!response.ok) {
        throw new Error("Failed to search Unsplash");
    }
    return mapUnsplashResults(
        (await response.json()) as UnsplashSearchResponse,
    );
}
