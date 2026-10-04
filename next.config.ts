import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js resolves its local worker at runtime; preserve native Node package paths.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
