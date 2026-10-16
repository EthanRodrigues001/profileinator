import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

// Production: static export that the Rust `hq` binary serves. Dev: proxy /api to a running `hq ui`.
const nextConfig: NextConfig = {
  ...(dev ? {} : { output: "export" as const }),
  images: { unoptimized: true },
  ...(dev ? { rewrites: async () => [{ source: "/api/:op", destination: "http://127.0.0.1:4777/api/:op" }] } : {}),
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
