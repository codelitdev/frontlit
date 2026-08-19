import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    outputFileTracingRoot: monorepoRoot,
    images: {
        remotePatterns: [{ protocol: "https", hostname: "**" }],
    },
    allowedDevOrigins: ["*.localhost"],
};

export default nextConfig;
