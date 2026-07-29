/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@codelitdev/design-system"],
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**" },
        ],
    },
    async redirects() {
        return [
            { source: "/pages", destination: "/website/pages", permanent: true },
            { source: "/settings/branding", destination: "/website/branding", permanent: true },
            { source: "/settings/domain", destination: "/website/domain", permanent: true },
            {
                source: "/settings/code-injection",
                destination: "/website/code-injection",
                permanent: true,
            },
            { source: "/settings/chatbot", destination: "/website/chatbot", permanent: true },
        ];
    },
};

export default nextConfig;
