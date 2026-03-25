import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/branceclaw-api/:path*",
        destination: "http://127.0.0.1:18800/:path*",
      },
    ];
  },
};

export default nextConfig;
