/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: { buildActivity: false },
  eslint: {
    dirs: ["app", "lib", "features", "components"],
  },
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
