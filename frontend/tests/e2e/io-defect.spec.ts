/**
 * P2-1 / 시나리오 5: 불량 격리·해제.
 *
 * 불량은 별도 최상위 "불량" 탭(입출고 work type 아님). 라이브 정책(2026-06-04 확인):
 * 새 불량(격리)·정상 복귀(해제) 모두 즉시 처리(approvalKind="none").
 * PR #17에서 삭제됐던 spec 을 전용 DB 인프라 위에서 재작성.
 */
import { expect, test } from "@playwright/test";
import { loginAsOperator } from "./_helpers";

test.describe("불량 — 격리 / 해제", () => {
  test.beforeEach(async ({ page }) => {
    // 창고 역할로 로그인 — 기본 출처 "창고 재고", 격리 위치 "창고", 목록 기본 스코프 "전체".
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("새 불량 격리 → 정상 복귀", async ({ page }) => {
    await page.goto("/mes?tab=defect");
    // hub 3장 카드 진입 화면 확인 — cold next dev 라우트 컴파일 흡수를 위해 첫 단언만 넉넉히.
    await expect(page.getByRole("button").filter({ hasText: "불량 격리" })).toBeVisible({ timeout: 30_000 });

    // ── 격리 ──────────────────────────────────────────────
    // 사이드바 탭과 구분: 카드 description "정상 재고" 텍스트까지 filter.
    await page.getByRole("button").filter({ hasText: "불량 격리" }).filter({ hasText: "정상 재고" }).click();
    // Step 1: 출처(창고 재고)·격리 부서(조립) 기본값 유지 → Step 2로 이동
    await page.getByRole("button", { name: /다음/ }).click();
    // Step 2: 시드 원자재 행 "추가".
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "추가", exact: true })
      .click();
    // 장바구니: 수량 + 사유 카테고리
    await page.getByPlaceholder("예: 3").fill("5");
    await page
      .locator("select")
      .filter({ hasText: "외관 불량" })
      .first()
      .selectOption("외관 불량");
    // 제출 → ConfirmModal → 확인
    await page.getByRole("button", { name: /격리하기 \(1건\)/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "격리하기", exact: true })
      .click();

    // 격리 후 hub 자동 복귀를 명시적으로 기다린 뒤 "격리 목록" 카드 진입 (재로드 경합 flaky 방지)
    await expect(
      page.getByRole("button").filter({ hasText: "불량 격리" }).filter({ hasText: "정상 재고" }),
    ).toBeVisible();
    await page.getByRole("button").filter({ hasText: "격리 목록" }).filter({ hasText: "격리 항목" }).click();
    // mes 는 모바일·데스크톱 셸을 CSS(lg:hidden)로 둘 다 DOM 에 렌더. 모바일 불량 허브가
    // 첫 화면에서 격리 목록을 함께 보여주므로 같은 품목명/버튼/빈 메시지가 (숨은) 모바일 셸에도
    // 존재 → 보이는(데스크톱) 요소만 골라야 strict 위반을 피한다. [[project_e2e_dual_shell_visible_filter]]
    await expect(page.getByText("E2E원자재튜브").filter({ visible: true }).first()).toBeVisible();

    // ── 해제(정상 복귀) ───────────────────────────────────
    await page.getByRole("button", { name: "처리", exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByRole("heading", { name: /불량 처리/ })).toBeVisible();
    await page
      .locator("select")
      .filter({ hasText: "외관 불량" })
      .first()
      .selectOption("외관 불량");
    // 정상 복귀는 ConfirmModal 없이 직접 제출.
    // 재설계 후 "정상 복귀" ActionCard 와 제출 버튼이 공존 → 화살표 포함 제출 버튼만 정확히 겨냥.
    await page.getByRole("button", { name: "정상 복귀 →" }).click();

    // 처리 후 hub 자동 복귀를 명시적으로 기다린 뒤 "격리 목록" 카드 재진입 (재로드 경합 flaky 방지)
    await expect(
      page.getByRole("button").filter({ hasText: "불량 격리" }).filter({ hasText: "정상 재고" }),
    ).toBeVisible();
    await page.getByRole("button").filter({ hasText: "격리 목록" }).filter({ hasText: "격리 항목" }).click();
    await expect(
      page.getByText("격리된 불량 재고가 없습니다.").filter({ visible: true }).first(),
    ).toBeVisible();
  });
});
