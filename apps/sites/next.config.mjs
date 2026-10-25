import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageRemoteHosts } from "./lib/image-hosts.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDir, "../..");
// `"use cache"` storage: this process's memory, plus Redis when `REDIS_URL`
// is set so every replica shares entries and tag invalidations
// (docs/site-delivery.md §4.1). Decided at runtime, so one build serves both.
const cacheHandler = path.join(appDir, "cache-handler.cjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  outputFileTracingIncludes: { "/**": ["./cache-handler.cjs"] },
  cacheComponents: true,
  // proxy.ts must see the `rsc` header and `_rsc` parameter that tell HTML
  // and RSC requests apart, to keep mismatched ones out of shared caches
  // (lib/edge-cache.ts). Next strips both before the proxy by default.
  skipProxyUrlNormalize: true,
  cacheHandlers: { default: cacheHandler, remote: cacheHandler },
  cacheLife: {
    // Public content is invalidated by tag on publish. The hour only bounds
    // staleness if an invalidation is lost; past it, the entry is refreshed
    // in the background while the stale one is served, for up to 30 days.
    site: { stale: 300, revalidate: 3600, expire: 30 * 24 * 3600 },
    // No REVALIDATE_WEBHOOK_SECRET: nothing invalidates, so refresh often.
    siteUnmanaged: { stale: 60, revalidate: 60, expire: 30 * 24 * 3600 },
  },
  // Version-skew protection. Read at build time: replicas of one image
  // already agree, so this matters only for separately built replicas.
  deploymentId: process.env.DEPLOYMENT_ID || undefined,
  // Optional separate host for /_next/static (content-hashed, immutable).
  // Read at build time.
  assetPrefix: process.env.ASSET_PREFIX || undefined,
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
