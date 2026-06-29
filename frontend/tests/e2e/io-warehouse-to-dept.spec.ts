/**
 * P2-1 / 시나리오 2: 창고 → 부서 결재 요청.
 *
 * 라이브 정책(2026-06-04 확인): warehouse_to_dept 는 requiresApproval → approvalKind
 * "warehouse" → 창고 결재. 최종 버튼 "창고 결재 요청 N건" → 확인 다이얼로그 "결재 요청"
 * → "창고 결재 요청 완료" 다이얼로그. 창고 정/부(이필욱)에게 "창고 승인함" 큐도 존재.
 */
import { expect, test } from "@playwright/test";
import { clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 창고 → 부서 결재 요청", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("창고 → 부서 wizard → 창고 결재 요청 생성", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 1. 작업 유형: 창고 입출고
    await pickWorkType(page, /창고 입출고/);

    // 2. 세부 작업: 창고 → 부서 + 도착 부서(조립) → 다음 단계로
    await page.getByRole("button", { name: /창고 → 부서/ }).first().click();
    await page.getByRole("button", { name: "조립", exact: true }).click();
    await clickNextStep(page);

    // 3. 품목 선택 — 원자재 낱개
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "낱개", exact: true })
      .click();

    // 4. 품목 확인 → 제출확인
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 창고 결재 요청
    await page.getByRole("button", { name: /창고 결재 요청/ }).click();
    await expect(page.getByRole("dialog", { name: /하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "결재 요청", exact: true }).click();

    // 종착: 창고 결재 요청 완료
    await expect(page.getByRole("dialog", { name: /창고 결재 요청 완료/ })).toBeVisible();
  });
});
