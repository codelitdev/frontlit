import type { MetadataRoute } from "next";

/** Makes the admin app installable, which iPhone and iPad need before they
 * allow Web Push notifications. Colors match the light app background. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FrontLit",
    short_name: "FrontLit",
    description: "The front office of your SaaS: website, content and support inbox.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f6f2",
    theme_color: "#f9f6f2",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
