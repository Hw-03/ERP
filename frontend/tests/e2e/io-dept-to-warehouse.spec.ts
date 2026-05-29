/**
 * P2-1 / 시나리오 3: 부서 → 창고 회수.
 *
 *  - approval 경로 (반대 방향)
 *  - "부서 → 창고" 라벨이 V2 / 큐 / 내역 모두에서 동일
 */
import { expect, test } from "@playwright/test";

test.describe("입출고 V2 — 부서 → 창고 회수", () => {
  test.fixme(
    !process.env.E2E_SEED_READY,
    "백엔드 시드 전략 결정 전 — 활성화 보류",
  );

  test("부서 → 창고 wizard → 결재 요청", async ({ page }) => {
    await page.goto("/legacy");

    await page.getByRole("tab", { name: /입출고/ }).first().click();
    await page.getByRole("button", { name: /창고 입출고/ }).first().click();
    await page.getByRole("button", { name: /부서 → 창고/ }).first().click();

    await expect(page.getByRole("button", { name: /부서 → 창고/ })).toBeVisible();
  });
});
