/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [{ protocol: "https", hostname: "**" }],
    },
    allowedDevOrigins: ["*.localhost"],
};

export default nextConfig;
