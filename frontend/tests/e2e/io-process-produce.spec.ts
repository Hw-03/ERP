/**
 * P2-1 / 시나리오 4: 부서 입출고 — 생산(BOM 자동 전개).
 *
 * 라이브 정책(2026-06-04 확인): 생산은 BOM 강제(부모 direct + 자식 bom_auto) — manual
 * 라인이 없어 approvalKind="none" → 즉시 반영. 따라서 최종 버튼은 "즉시 반영하기 N건"이고,
 * 확인 다이얼로그의 확정 버튼은 "즉시 반영"이다.
 *
 * 자식 자재는 품목 소속 공정(TR → 튜브) PRODUCTION 재고에서 소비된다 — globalSetup 이 튜브 공정에 시드.
 */
import { expect, test } from "@playwright/test";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

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
    await clickNextStep(page);

    // 3. BOM 부모(E2E조립튜브) 행의 "BOM" 으로 자동 전개
    await page
      .getByRole("row", { name: /E2E조립튜브/ })
      .getByRole("button", { name: "BOM", exact: true })
      .click();
    await advanceToQuantityStep(page);

    // 4. 품목 확인 → 제출확인 (자식 품목 소속 공정 생산재고 시드로 재고 충분 → 활성화)
    await page.getByRole("button", { name: /제출확인/ }).click();

    // 5. 최종 확인 — 즉시 반영하기 (결재 없음)
    await page.getByRole("button", { name: /즉시 반영하기/ }).click();

    // 확인 다이얼로그 → 즉시 반영 확정
    await expect(page.getByRole("dialog", { name: /진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "즉시 반영", exact: true }).click();

    // 종착: 완료 다이얼로그 (즉시 반영)
    await expect(page.getByRole("dialog", { name: /완료/ })).toBeVisible();
  });

  test("생산 BOM 자식 라인은 강제 잠김 — 제외/수량편집 불가", async ({ page }) => {
    // isBomForced("produce")=true → 자식(bom_auto) 라인의 포함 토글·수량이 잠긴다.
    // README 의 "BOM 자동 전개 / 포함·제외" 중 produce 분기는 '제외 불가(잠김)'가 정답.
    await gotoWarehouseCompose(page);
    await pickWorkType(page, /부서 입출고/);
    await page.getByRole("button", { name: "생산 입고" }).first().click();
    await clickNextStep(page);
    await page
      .getByRole("row", { name: /E2E조립튜브/ })
      .getByRole("button", { name: "BOM", exact: true })
      .click();
    await advanceToQuantityStep(page);

    // 품목 확인 묶음 카드 펼치기 → 자식 라인 노출
    // (76e4ffd2 — BOM 상위에 mes_code span 추가로 accessible name 사이에 코드가 끼어듦)
    await page.getByRole("button", { name: /E2E조립튜브.*기준 수량/ }).click();

    // 자식은 "상위 품목과 함께 자동 처리" + 수량 잠김(disabled)
    await expect(page.getByText("상위 품목과 함께 자동 처리")).toBeVisible();
    const childLine = page.getByRole("listitem").filter({ hasText: "상위 품목과 함께 자동 처리" });
    await expect(childLine.getByRole("spinbutton", { name: /수량/ })).toBeDisabled();
  });
});
