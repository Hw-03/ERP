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
 * 전용 DB·전용 백엔드(포트 8021 또는 8022)·시드는 globalSetup 이 자동 처리한다(실 mes.db 미접촉).
 * 프론트는 기본 전용 포트 3100의 custom Next server로 띄운다. 로컬 OS가 3100을
 * 예약한 경우 verify_e2e.ps1이 E2E_FRONTEND_PORT로 승인된 대체 포트(현재 3300)를 전달한다.
 * /api/* 는 선택된 전용 백엔드의 BACKEND_INTERNAL_URL로 프록시.
 */
import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import { assertSupportedNodeVersion } from "./scripts/require-node-20.cjs";
import {
  approvedE2eBackendPort,
  approvedE2eFrontendPort,
  assertE2eRunOwnership,
  canonicalE2eBaseUrl,
  dedicatedE2eWebServerEnv,
} from "./tests/e2e/e2e-lifecycle.mjs";

assertSupportedNodeVersion(process.version);

const FRONT_PORT = approvedE2eFrontendPort(process.env.E2E_FRONTEND_PORT);
const BACKEND_PORT = approvedE2eBackendPort(process.env.E2E_BACKEND_PORT);
const BASE_URL = canonicalE2eBaseUrl(process.env.E2E_BASE_URL, FRONT_PORT);
const RUN_TOKEN = process.env.DEXCOWIN_E2E_RUN_TOKEN;
const LOCK_DIR = path.join(__dirname, "tests", "e2e", ".e2e-run-lock");
assertE2eRunOwnership({ lockDir: LOCK_DIR, runToken: RUN_TOKEN });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // 백엔드 SQLite 가 동시 쓰기에 약함 — 순차 실행
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 위와 같은 이유로 워커 1개
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  // CI 러너 부하 + custom Next dev 라우트 컴파일 + SQLite 경합으로 기본 타임아웃이 가끔 초과돼
  // flaky 발생 → per-test·assertion 타임아웃을 넉넉히 상향해 완충.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: {
    // 전용 custom Next server(기본 3100). /api/* → 선택된 전용 백엔드 프록시.
    command: `node scripts/next-server.js dev --hostname 127.0.0.1 --port ${FRONT_PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: dedicatedE2eWebServerEnv(BACKEND_PORT),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
