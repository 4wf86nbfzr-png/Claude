import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', 'imapflow', 'mailparser', 'nodemailer'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          /*
            HSTS: ein Browser, der die Seite einmal über HTTPS geladen hat,
            versucht es danach gar nicht mehr über HTTP. Über eine unverschlüsselte
            Verbindung wird der Kopf von Browsern ignoriert, er schadet also auch
            in der Entwicklung nicht. Ohne `preload` – das ist eine Entscheidung
            mit langer Bindung und gehört bewusst getroffen, nicht nebenbei.
          */
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default config;
