export interface Media {
    mediaId: string;
    originalFileName?: string;
    mimeType?: string;
    size?: number;
    caption?: string;
    /** Public URL of the asset. */
    file?: string;
    /** Thumbnail URL, falls back to `file` when absent. */
    thumbnail?: string;
}
