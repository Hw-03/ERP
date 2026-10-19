// This template is copied into the disposable frontend root, beside the base config.
import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...base,
  retries: 0,
  workers: 1,
  maxFailures: 1,
  globalTeardown: "../scripts/dev/mes-flaky-diagnosis/owned-teardown.ts",
  outputDir: process.env.MES_DIAG_OUTPUT + "/test-results",
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.MES_DIAG_OUTPUT + "/report.json" }],
    ["html", { outputFolder: process.env.MES_DIAG_OUTPUT + "/playwright-report", open: "never" }],
  ],
  // Keep original test/expect/webServer budgets; trace success and first failure alike.
  use: { ...base.use, trace: "on", screenshot: "only-on-failure", video: "off" },
  webServer: {
    ...base.webServer,
    command: "node ../scripts/dev/mes-flaky-diagnosis/serve-next.cjs",
    stdout: "pipe",
    stderr: "pipe",
    reuseExistingServer: false,
  },
});
