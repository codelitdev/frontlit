import { z } from "zod";

/** A FrontLit media library id, as returned by `register_media` /
 * `list_media`. Not the MediaLit id. */
export const mediaIdSchema = z
  .string()
  .regex(
    /^med_[A-Za-z0-9_-]+$/,
    "mediaId must be a FrontLit media id (med_…) from register_media or list_media.",
  );

const httpUrlSchema = z
  .string()
  .regex(/^https?:\/\/\S+$/, "Must be an absolute http(s) URL.");

/** The stored and served featured image of an article, documentation page
 * or product update. `mediaId` is set when the image comes from the team's
 * media library; `url`/`thumbnailUrl` are then copied from that library item. */
export const featuredImageSchema = z.object({
  mediaId: mediaIdSchema.optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  alt: z.string().optional(),
});
export type FeaturedImage = z.infer<typeof featuredImageSchema>;

export const FEATURED_IMAGE_DESCRIPTION =
  'Featured image. One of: a media library id string ("med_…", from register_media or list_media), an absolute image URL string, or an object { mediaId?: "med_…", url?: string, thumbnailUrl?: string, alt?: string } with mediaId or url. With mediaId, url and thumbnailUrl are filled from the media library. Example: { "mediaId": "med_abc123", "alt": "Dashboard screenshot" }. null clears it.';

/** What callers may send. A `med_…` string is shorthand for `{ mediaId }`;
 * any other string must be an image URL. Unknown keys are rejected. */
export const featuredImageInputSchema = z
  .union([
    z
      .string()
      .regex(
        /^(med_[A-Za-z0-9_-]+|https?:\/\/\S+)$/,
        'featuredImage must be a media id ("med_…") or an absolute http(s) image URL.',
      ),
    z
      .object({
        mediaId: mediaIdSchema.optional(),
        url: httpUrlSchema.optional(),
        thumbnailUrl: httpUrlSchema.optional(),
        alt: z.string().max(1000).optional(),
      })
      .strict()
      .refine((value) => value.mediaId || value.url, {
        message: "featuredImage needs a mediaId (med_…) or a url.",
      }),
  ])
  .describe(FEATURED_IMAGE_DESCRIPTION);
export type FeaturedImageInput = z.infer<typeof featuredImageInputSchema>;
