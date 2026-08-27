/**
 * Playwright E2E 설정 (P2-1).
 *
 * 첫 사용 시:
 *   cd frontend
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *
 * 실행:
 *   npm run test:e2e          # headless
 *   npm run test:e2e:headed   # 브라우저 보임
 *   npm run test:e2e:ui       # UI 모드
 *
 * 전용 DB·전용 백엔드(포트 8021)·시드는 globalSetup 이 자동 처리한다(실 mes.db 미접촉).
 * 프론트는 기본 전용 포트 3100의 custom Next server로 띄운다. 로컬 OS가 3100을
 * 예약한 경우 verify_e2e.ps1이 E2E_FRONTEND_PORT로 대체 포트를 전달한다.
 * /api/* 는 BACKEND_INTERNAL_URL로 8021에 프록시.
 */
import { defineConfig, devices } from "@playwright/test";
import { assertSupportedNodeVersion } from "./scripts/require-node-20.cjs";

assertSupportedNodeVersion(process.version);

function portFromEnvironment(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`E2E_FRONTEND_PORT must be an integer between 1 and 65535 (received: ${value})`);
  }
  return port;
}

const FRONT_PORT = portFromEnvironment(process.env.E2E_FRONTEND_PORT, 3100);
const BACKEND_PORT = 8021;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // 백엔드 SQLite 가 동시 쓰기에 약함 — 순차 실행
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 위와 같은 이유로 워커 1개
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  // CI 러너 부하 + custom Next dev 라우트 컴파일 + SQLite 경합으로 기본 타임아웃이 가끔 초과돼
  // flaky 발생 → per-test·assertion 타임아웃을 넉넉히 상향해 완충.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${FRONT_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: {
    // 전용 custom Next server(기본 3100). /api/* → 전용 백엔드(8021) 프록시.
    command: `node scripts/next-server.js dev --hostname 127.0.0.1 --port ${FRONT_PORT}`,
    url: `http://127.0.0.1:${FRONT_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BACKEND_INTERNAL_URL: `http://127.0.0.1:${BACKEND_PORT}` },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
