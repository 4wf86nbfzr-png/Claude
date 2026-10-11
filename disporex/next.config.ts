import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Getrennte Ausgabeverzeichnisse (z. B. .next-e2e für den Test-Dev-Server), damit ein
  // paralleler `next build` den laufenden Dev-Server nicht in eine HMR-Reload-Schleife bringt.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pino", "pino-pretty", "pg", "exceljs", "nodemailer"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
