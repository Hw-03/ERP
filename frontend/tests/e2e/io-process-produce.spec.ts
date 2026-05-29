/**
 * P2-1 / 시나리오 4: 부서 입출고 - 생산 (BOM 자동 전개).
 *
 *  - process work type → produce sub_type
 *  - BOM 자동 전개 / 포함·제외 토글
 *  - 결재 없이 즉시 반영 (manual line 없으면 none)
 *  - 라벨 "생산" 일관성 (이전 "생산 | 입고" 폐기 회귀 방어)
 */
import { expect, test } from "@playwright/test";

test.describe("입출고 V2 — 부서 입출고 / 생산 (BOM 전개)", () => {
  test.fixme(
    !process.env.E2E_SEED_READY,
    "BOM 시드 데이터 결정 전 — 활성화 보류",
  );

  test("BOM 부모 선택 → 자식 자동 전개 → 일부 제외 → 제출", async ({ page }) => {
    await page.goto("/legacy");

    await page.getByRole("tab", { name: /입출고/ }).first().click();
    await page.getByRole("button", { name: /부서 입출고/ }).first().click();
    await page.getByRole("button", { name: /^생산$/ }).first().click();

    // 시드 후 구체화:
    // 1) 부서 선택
    // 2) BOM 부모 품목 검색 → "BOM 적용" 버튼
    // 3) 자식 라인 N개 자동 전개 확인
    // 4) 한 자식 "포함" 토글 OFF (제외)
    // 5) 수량 입력 (부모)
    // 6) 제출 → 즉시 반영 결과 확인
    // 7) 내역 탭에서 main 라벨이 "생산" 인지 확인 (NOT "생산 | 입고")

    await expect(page.getByRole("button", { name: /^생산$/ })).toBeVisible();
  });
});
