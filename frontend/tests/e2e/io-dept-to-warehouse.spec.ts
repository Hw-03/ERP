/**
 * P2-1 / 시나리오 3: 부서 → 창고 회수.
 *
 * 라이브 정책(2026-06-04 확인): dept_to_warehouse 도 requiresApproval → 창고 결재.
 * D5c(창고→부서)와 골격 동일, 방향만 반대(출발 부서). 회수 대상은 부서 생산재고가 있어야
 * 하므로 globalSetup 이 조립 부서에 시드한 원자재(E2E원자재튜브)를 사용.
 */
import { expect, test } from "@playwright/test";
import { clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 부서 → 창고 회수", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("부서 → 창고 wizard → 창고 결재 요청 생성", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 1. 작업 유형: 창고 입출고
    await pickWorkType(page, /창고 입출고/);

    // 2. 세부 작업: 부서 → 창고 + 출발 부서(조립) → 다음 단계로
    await page.getByRole("button", { name: /부서 → 창고/ }).first().click();
    await page.getByRole("button", { name: "조립", exact: true }).click();
    await clickNextStep(page);

    // 3. 품목 선택 — 조립 부서에 재고 있는 원자재 낱개
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
