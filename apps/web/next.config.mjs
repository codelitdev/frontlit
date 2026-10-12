import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: [
    "@codelitdev/design-system",
    "@frontlit/api-contract",
    "@frontlit/media-uploader",
    "@frontlit/page-builder",
    "@frontlit/text-editor",
    "@sendlit/email-blocks",
    "@sendlit/email-editor",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      {
        source: "/pages",
        destination: "/website/pages",
        permanent: true,
      },
      {
        source: "/settings/branding",
        destination: "/website/branding",
        permanent: true,
      },
      {
        source: "/settings/domain",
        destination: "/website/domain",
        permanent: true,
      },
      {
        source: "/settings/code-injection",
        destination: "/website/code-injection",
        permanent: true,
      },
      {
        source: "/settings/chatbot",
        destination: "/website/chatbot",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
