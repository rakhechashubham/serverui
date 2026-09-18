import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SERVER_INTERNAL_URL is a server-side rewrite target (Docker service name or
// local Go process). It is not exposed to the browser. Browser-facing API
// location is resolved by src/lib/runtime (NEXT_PUBLIC_API_BASE / heuristics).
const backend = process.env.SERVER_INTERNAL_URL?.replace(/\/$/, "") || "http://server:8080";

// Desktop Tauri bundles a static export. Web/Docker keep standalone + rewrites.
const staticExport = process.env.SERVERUI_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: staticExport ? "export" : "standalone",
  images: staticExport ? { unoptimized: true } : undefined,
  devIndicators: false,
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
  ...(staticExport
    ? {}
    : {
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
      }),
};

export default nextConfig;
