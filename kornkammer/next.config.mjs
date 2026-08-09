/**
 * Mit `DEMO_EXPORT=1` baut Next die Seite als statisches Verzeichnis.
 * Daraus macht `tools/demo-bundle.mjs` eine einzelne HTML-Datei zum
 * Weitergeben. Kopfzeilen gibt es im Exportmodus nicht — dort liefert
 * kein Node-Server aus, also waere die Angabe wirkungslos.
 */
const istExport = process.env.DEMO_EXPORT === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [420, 640, 828, 1080, 1280, 1600, 1920, 2560, 3840],
    unoptimized: istExport,
  },
  ...(istExport
    ? { output: 'export' }
    : {
        async headers() {
          return [
            {
              // Videos und Poster sind unveraenderlich benannt; lange Cachezeit ist sicher.
              source: '/video/:path*',
              headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
            },
          ]
        },
      }),
}

export default nextConfig
