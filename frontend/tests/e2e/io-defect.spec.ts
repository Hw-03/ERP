/**
 * P2-1 / 시나리오 5: 불량 격리·해제.
 *
 *  - defect work type → defect_quarantine / defect_restore
 *  - 라벨 "새 불량" / "불량 해제" 일관성 (이전 "새 격리" / "격리 해제" 폐기 회귀 방어)
 */
import { expect, test } from "@playwright/test";

test.describe("입출고 V2 — 불량", () => {
  test.fixme(
    !process.env.E2E_SEED_READY,
    "백엔드 시드 전략 결정 전 — 활성화 보류",
  );

  test("불량 격리 → 즉시 반영 → 라벨 '새 불량'", async ({ page }) => {
    await page.goto("/legacy");

    await page.getByRole("tab", { name: /입출고/ }).first().click();
    await page.getByRole("button", { name: /^불량$/ }).first().click();
    await page.getByRole("button", { name: /새 불량/ }).first().click();

    // 시드 후 구체화:
    // 1) 부서 선택
    // 2) 정상 재고 보유 품목 검색 → 선택
    // 3) 수량 입력
    // 4) 제출
    // 5) 내역에서 "새 불량" 라벨 확인 (NOT "새 격리")

    await expect(page.getByRole("button", { name: /새 불량/ })).toBeVisible();
  });

  test("불량 해제 → 즉시 반영 → 라벨 '불량 해제'", async ({ page }) => {
    await page.goto("/legacy");

    await page.getByRole("tab", { name: /입출고/ }).first().click();
    await page.getByRole("button", { name: /^불량$/ }).first().click();
    await page.getByRole("button", { name: /불량 해제/ }).first().click();

    await expect(page.getByRole("button", { name: /불량 해제/ })).toBeVisible();
  });
});
