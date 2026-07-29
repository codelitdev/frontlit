import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/api";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default OG image (architecture.md §12.3) — used whenever a route has no
 * more specific social/featured image or team logo, so shares never render
 * bare. Routes that set their own `openGraph.images` in `generateMetadata`
 * take precedence over this file-convention fallback. */
export default async function Image({
    params,
}: {
    params: Promise<{ teamId: string }>;
}) {
    const { teamId } = await params;
    const settings = await getSettings(teamId);
    const siteName = settings?.title || "FrontLit site";

    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#111827",
                color: "#ffffff",
                fontSize: 72,
                fontWeight: 700,
                textAlign: "center",
                padding: "0 80px",
            }}
        >
            {siteName}
        </div>,
        size,
    );
}
