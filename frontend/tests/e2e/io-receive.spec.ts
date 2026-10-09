/**
 * P2-1 / 시나리오 1: 원자재 입고.
 *
 * 원자재 입출고의 입고 방향을 선택하고 공급업체·품목 선택부터 실제 반영까지 검증한다.
 * 라이브 정책: 원자재 입고는 결재 없이 즉시 반영된다.
 * 완료 다이얼로그의 메시지로 실제 반영 완료를 확인한다.
 *
 * 원자재 입출고 work type 은 창고 정/부 직원에게만 노출 → 창고 역할로 로그인.
 */
import { expect, test } from "@playwright/test";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 원자재 입고", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("원자재 입고 wizard → 즉시 반영", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 원자재 입출고에서 입고 방향을 명시한 뒤 공급업체 단계로 진행한다.
    await pickWorkType(page, /원자재 입출고/);
    await page.getByRole("button", { name: "입고", exact: true }).click();
    await clickNextStep(page);

    // 2. 공급업체 추가·선택 → 다음 단계로
    await page.getByPlaceholder("업체명을 입력하세요").fill("E2E 공급업체");
    await page.getByRole("button", { name: "추가하고 선택" }).click();
    await expect(page.getByRole("button", { name: "E2E 공급업체 선택됨" })).toBeVisible();
    await clickNextStep(page);

    // 3. 입고 품목 선택 — 시드 원자재 행의 "선택"
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "선택" })
      .click();
    await advanceToQuantityStep(page);

    // 4. 품목 확인 → 제출확인
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 결재 없이 즉시 반영
    await page.getByRole("button", { name: /즉시 반영하기/ }).click();

    // 확인 다이얼로그 → 즉시 반영 확정
    await expect(page.getByRole("dialog", { name: /원자재 입고를 진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "즉시 반영", exact: true }).click();

    // 종착: 즉시 반영 완료 (상태 대상 알림과 중복되므로 다이얼로그로 스코프)
    const doneDialog = page.getByRole("dialog", { name: "창고 입고 완료", exact: true });
    await expect(doneDialog).toBeVisible();
    await expect(doneDialog.getByText("입출고가 반영되었습니다.")).toBeVisible();
  });
});
