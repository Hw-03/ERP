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
 *   npx playwright test --ui  # UI 모드
 *
 * 전용 DB·전용 백엔드(포트 8021)·시드는 globalSetup 이 자동 처리한다(실 mes.db 미접촉).
 * 프론트는 전용 포트 3100 에서 next dev 로 띄우고, /api/* 는 BACKEND_INTERNAL_URL 로 8021 에 프록시.
 */
import { defineConfig, devices } from "@playwright/test";

const FRONT_PORT = 3100;
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
  // CI 러너 부하 + next dev 라우트 컴파일 + SQLite 경합으로 기본 타임아웃이 가끔 초과돼
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
    // 전용 프론트(3100, next dev — 현재 코드 보장). /api/* → 전용 백엔드(8021) 프록시.
    command: `npx next dev -p ${FRONT_PORT}`,
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
