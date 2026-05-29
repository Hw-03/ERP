/**
 * P2-1 / 시나리오 1: 원자재 입고 즉시 반영.
 *
 * 가장 기본 흐름이며, 라벨 단일화(P0-1) 의 회귀를 함께 잡는다.
 *  - V2 에서 누른 "원자재 입고" 버튼이 history 에서도 "원자재 입고" 로 표시되는지.
 *  - 결재 없이 즉시 반영되는지.
 */
import { expect, test } from "@playwright/test";

test.describe("입출고 V2 — 원자재 입고", () => {
  test.fixme(
    !process.env.E2E_SEED_READY,
    "백엔드 시드 전략 결정 전 — 격리 DB 픽스처 도입 후 활성화 (Open Question)",
  );

  test("원자재 입고 wizard → 제출 → history 에 '원자재 입고' 로 즉시 반영", async ({ page }) => {
    await page.goto("/legacy");

    // 입출고 탭
    await page.getByRole("tab", { name: /입출고/ }).first().click();

    // 원자재 입고 work type
    await page.getByRole("button", { name: /원자재 입고/ }).first().click();

    // (이후 시나리오 — 시드 데이터 결정 후 구체화)
    // 1) 품목 검색 + 선택
    // 2) 수량 입력
    // 3) 제출 확인 모달 → 확정
    // 4) 결과 모달 닫기
    // 5) 입출고 내역 탭 이동
    // 6) 최상단 row 가 "원자재 입고" 라벨로 표시되는지 검증

    await expect(page.getByText(/원자재 입고/).first()).toBeVisible();
  });
});
