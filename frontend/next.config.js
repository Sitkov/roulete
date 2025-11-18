const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: []
  },
  output: 'standalone',
  typescript: {
    // Allow production builds to succeed even if there are type errors.
    ignoreBuildErrors: true
  },
  eslint: {
    // Ignore ESLint errors during production builds.
    ignoreDuringBuilds: true
  },
  async rewrites() {
    // Proxy Next.js /api/* to backend during dev and prod (same machine)
    const backend = process.env.BACKEND_ORIGIN || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`
      }
    ];
  }
};

module.exports = withPWA(nextConfig);


