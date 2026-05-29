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
 * 백엔드는 별도로 띄워둬야 한다:
 *   powershell -ExecutionPolicy Bypass -File ../scripts/dev/start-backend.ps1
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // 백엔드 SQLite 가 동시 쓰기에 약함 — 순차 실행
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 위와 같은 이유로 워커 1개
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: {
    // E2E_EXISTING_SERVER=1 면 webServer 띄우지 않고 기존 dev 서버 재사용.
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
