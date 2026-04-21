/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: { buildActivity: false },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_INTERNAL_URL || "http://localhost:8010"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
