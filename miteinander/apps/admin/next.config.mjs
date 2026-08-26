/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Der Anwendungskern liegt als TypeScript-Quelle im Monorepo.
  transpilePackages: ['@miteinander/core'],
};

export default nextConfig;
