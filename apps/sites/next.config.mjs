import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageRemoteHosts } from "./lib/image-hosts.mjs";

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  images: {
    remotePatterns: imageRemoteHosts.map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
  async headers() {
    return [
      {
        // Theme fonts are referenced by stable URLs (see lib/fonts.ts).
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  allowedDevOrigins: ["*.localhost"],
};

export default nextConfig;
