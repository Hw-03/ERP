/**
 * P2-1 / 시나리오 3: 부서 → 창고 회수.
 *
 * 라이브 정책: 창고 결재권자가 요청한 dept_to_warehouse 는 자동 승인되어 즉시 반영된다.
 * 창고→부서와 골격은 동일하고 방향만 반대다. 회수 대상은 부서 생산재고가 있어야
 * 하므로 globalSetup 이 튜브 부서에 시드한 원자재(E2E원자재튜브)를 사용.
 */
import { expect, test } from "@playwright/test";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 부서 → 창고 회수", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("부서 → 창고 wizard → 자동 승인 후 즉시 반영", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 1. 작업 유형: 창고 입출고
    await pickWorkType(page, /창고 입출고/);

    // 2. 세부 작업: 부서 → 창고 → 다음 단계로 (출발 부서는 품목코드로 자동 판정)
    await page.getByRole("button", { name: /부서 → 창고/ }).first().click();
    await clickNextStep(page);

    // 3. 품목 선택 — 튜브 부서에 재고 있는 원자재 낱개
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "낱개", exact: true })
      .click();
    await advanceToQuantityStep(page);

    // 4. 품목 확인 → 제출확인
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 창고 결재권자 자동 승인
    await page.getByRole("button", { name: /자동 승인 후 즉시 반영/ }).click();
    await expect(page.getByRole("dialog", { name: /창고 반입을 진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "자동 승인 후 즉시 반영", exact: true }).click();

    // 종착: 자동 승인 후 즉시 반영 완료
    const doneDialog = page.getByRole("dialog", { name: /입출고 반영 완료/ });
    await expect(doneDialog).toBeVisible();
    await expect(doneDialog.getByText("자동 승인되어 입출고가 반영되었습니다")).toBeVisible();
  });
});
