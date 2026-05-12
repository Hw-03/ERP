const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

/**
 * dev (npm run dev) 와 production build/start 가 같은 `.next/` 를 공유하면
 * 빌드 산출물이 dev manifest 를 덮어써 dev 서버를 재시작해야 한다.
 * phase 별로 distDir 를 분리해서 충돌을 막는다.
 *   - dev    → .next
 *   - build  → .next-prod
 *   - start  → .next-prod
 */
module.exports = (phase) => {
  /** @type {import('next').NextConfig} */
  const config = {
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
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next" : ".next-prod",
  };
  return config;
};
