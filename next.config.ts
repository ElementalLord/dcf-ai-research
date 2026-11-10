import type { NextConfig } from "next";

// Baseline security headers. Kept free of a strict Content-Security-Policy so no
// existing script or style breaks; add one later following Next's CSP guide.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Restricted workspaces should never appear in search results.
const privatePaths = ["/resources/:path*", "/research/:path*", "/review/:path*", "/corpus/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF.js resolves its local worker at runtime; preserve native Node package paths.
  serverExternalPackages: ["pdf-parse"],
  headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...privatePaths.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ];
  },
};

export default nextConfig;
