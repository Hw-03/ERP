// Copied to the disposable testDir only. This is environment readiness, not a target result.
import { test, expect } from "@playwright/test";

test("MES-DIAG-APP-READY", async ({ page }) => {
  await page.goto("/mes?tab=dashboard");
  await expect(page.getByRole("combobox")).toBeEnabled();
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
});
