/**
 * P2-1 / 시나리오 1: 원자재 입고.
 *
 * V2 에서 누른 "원자재 입고" 가 끝까지 같은 단어로 흐르는지(P0-1 라벨 회귀 방어).
 * 라이브 정책: 낱개 1라인 입고는 부서 결재 대상이지만 창고 정/부 요청자는 자가승인되어
 * 즉시 반영된다. 완료 다이얼로그의 메시지로 실제 반영 완료를 확인한다.
 *
 * 원자재 입고 work type 은 창고 정/부 직원에게만 노출 → 창고 역할로 로그인.
 */
import { expect, test } from "@playwright/test";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 원자재 입고", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("원자재 입고 wizard → 부서 자가승인 → 즉시 반영", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 1. 작업 유형: 원자재 입고
    await pickWorkType(page, /원자재 입고/);

    // 2. 세부 작업(원자재 입고 단일) → 다음 단계로
    await clickNextStep(page);

    // 3. 입고 품목 선택 — 시드 원자재 행의 "선택"
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "선택" })
      .click();
    await advanceToQuantityStep(page);

    // 4. 품목 확인 → 제출확인
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 부서 결재 요청 (낱개 라인 → 부서 결재)
    await page.getByRole("button", { name: /부서 결재 요청/ }).click();

    // 확인 다이얼로그 → 결재 요청 확정
    await expect(page.getByRole("dialog", { name: /요청하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "결재 요청", exact: true }).click();

    // 종착: 자가승인 즉시 반영 (상태 대상 알림과 중복되므로 다이얼로그로 스코프)
    const doneDialog = page.getByRole("dialog", { name: /부서 결재 요청 완료/ });
    await expect(doneDialog).toBeVisible();
    await expect(doneDialog.getByText("입출고가 반영되었습니다.")).toBeVisible();
  });
});
