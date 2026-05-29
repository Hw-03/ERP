/**
 * P2-1 / 시나리오 2: 창고 → 부서 결재 요청.
 *
 *  - approval 경로 (즉시 반영 X)
 *  - StockRequest bridge 생성 + 큐에 등장
 *  - 결재 라벨 일관성 (요청 큐 / draft cart / 내역)
 */
import { expect, test } from "@playwright/test";

test.describe("입출고 V2 — 창고 → 부서 결재 요청", () => {
  test.fixme(
    !process.env.E2E_SEED_READY,
    "백엔드 시드 전략 + P0-3 인증 도입 전 — 활성화 보류",
  );

  test("창고 → 부서 wizard → 결재 요청 → 요청 큐 등장", async ({ page }) => {
    await page.goto("/legacy");

    await page.getByRole("tab", { name: /입출고/ }).first().click();
    await page.getByRole("button", { name: /창고 입출고/ }).first().click();
    await page.getByRole("button", { name: /창고 → 부서/ }).first().click();

    // 시드 데이터 결정 후 구체화:
    // 1) 도착 부서 선택
    // 2) BOM 품목 선택 → 자동 전개 자식 확인
    // 3) 일부 자식 제외 (포함 토글)
    // 4) 결재 요청 제출
    // 5) "결재 요청 보냄" 결과 확인
    // 6) 요청 큐 탭 이동 → 방금 요청 row 표시 + 라벨 "창고 → 부서" 확인

    await expect(page.getByRole("button", { name: /창고 → 부서/ })).toBeVisible();
  });
});
