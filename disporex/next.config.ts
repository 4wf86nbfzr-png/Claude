import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Getrennte Ausgabeverzeichnisse (z. B. .next-e2e für den Test-Dev-Server), damit ein
  // paralleler `next build` den laufenden Dev-Server nicht in eine HMR-Reload-Schleife bringt.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pino", "pino-pretty", "pg", "exceljs", "nodemailer"],
  async headers() {
    // Content-Security-Policy nur im Produktionsbuild: die Dev-Werkzeuge von Next brauchen eval.
    // 'unsafe-inline' für Skripte bleibt nötig, weil Next die Hydrationsdaten inline ausliefert
    // und keine Nonce-Weitergabe (Proxy/Middleware) eingerichtet ist – siehe SECURITY.md.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }, { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
