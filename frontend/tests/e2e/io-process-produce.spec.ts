/**
 * P2-1 / 시나리오 4: 부서 입출고 — 생산(BOM 자동 전개).
 *
 * 라이브 정책(2026-06-04 확인): 생산은 BOM 강제(부모 direct + 자식 bom_auto) — manual
 * 라인이 없어 approvalKind="none" → 즉시 반영. 따라서 최종 버튼은 "즉시 반영하기 N건"이고,
 * 확인 다이얼로그의 확정 버튼은 "즉시 반영"이다.
 *
 * 자식 자재는 부서(조립) PRODUCTION 재고에서 소비된다 — globalSetup 이 조립 부서에 시드.
 */
import { expect, test } from "@playwright/test";
import { gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("입출고 V2 — 부서 입출고(생산)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("생산 wizard(BOM 전개) → 즉시 반영", async ({ page }) => {
    await gotoWarehouseCompose(page);

    // 1. 작업 유형: 부서 입출고
    await pickWorkType(page, /부서 입출고/);

    // 2. 대상 부서(조립 기본 선택) + 방향: 생산 입고 → 다음 단계로
    await page.getByRole("button", { name: "생산 입고" }).first().click();
    await page.getByRole("button", { name: /다음 단계로/ }).click();

    // 3. BOM 부모(E2E조립튜브) 행의 "BOM" 으로 자동 전개
    await page
      .getByRole("row", { name: /E2E조립튜브/ })
      .getByRole("button", { name: "BOM", exact: true })
      .click();

    // 4. 품목 확인 → 제출확인 (부서 생산재고 시드로 재고 충분 → 활성화)
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 즉시 반영하기 (결재 없음)
    await page.getByRole("button", { name: /즉시 반영하기/ }).click();

    // 확인 다이얼로그 → 즉시 반영 확정
    await expect(page.getByRole("dialog", { name: /진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "즉시 반영", exact: true }).click();

    // 종착: 완료 다이얼로그 (즉시 반영)
    await expect(page.getByRole("dialog", { name: /완료/ })).toBeVisible();
  });
});
