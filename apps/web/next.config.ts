import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backend = process.env.SERVER_INTERNAL_URL?.replace(/\/$/, "") || "http://server:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/ws/:path*", destination: `${backend}/ws/:path*` },
      { source: "/healthz", destination: `${backend}/healthz` },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
