/**
 * P2-1 / 시나리오 2: 창고 → 부서 자동 승인.
 *
 * 라이브 정책: 창고 결재권자가 요청한 warehouse_to_dept 는 자동 승인되어 즉시 반영된다.
 */
import { expect, test } from "@playwright/test";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 창고 → 부서 자동 승인", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("창고 → 부서 wizard → 자동 승인 후 즉시 반영", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 1. 작업 유형: 창고 입출고
    await pickWorkType(page, /창고 입출고/);

    // 2. 세부 작업: 창고 → 부서 → 다음 단계로 (도착 부서는 품목코드로 자동 판정)
    await page.getByRole("button", { name: /창고 → 부서/ }).first().click();
    await clickNextStep(page);

    // 3. 품목 선택 — 원자재 낱개
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "낱개", exact: true })
      .click();
    await advanceToQuantityStep(page);

    // 4. 품목 확인 → 제출확인
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 창고 결재권자 자동 승인
    await page.getByRole("button", { name: /자동 승인 후 즉시 반영/ }).click();
    await expect(page.getByRole("dialog", { name: /창고 반출을 진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "자동 승인 후 즉시 반영", exact: true }).click();

    // 종착: 자동 승인 후 즉시 반영 완료
    const doneDialog = page.getByRole("dialog", { name: /입출고 반영 완료/ });
    await expect(doneDialog).toBeVisible();
    await expect(doneDialog.getByText("자동 승인되어 입출고가 반영되었습니다")).toBeVisible();
  });
});
