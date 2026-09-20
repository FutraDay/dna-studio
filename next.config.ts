import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: ["playwright", "sharp"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
