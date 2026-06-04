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
    // "창고 재고" 출처 격리를 위해 창고 역할로 로그인(격리 부서 기본=내 부서 조립).
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("새 불량 격리 → 정상 복귀", async ({ page }) => {
    await page.goto("/legacy?tab=defect");
    await expect(page.getByRole("heading", { name: "불량 처리" })).toBeVisible();

    // ── 격리 ──────────────────────────────────────────────
    await page.getByRole("button", { name: "+ 새 불량 추가" }).click();
    // 출처(창고 재고)·격리 부서(조립) 기본값 유지. 시드 원자재 행 "추가".
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
    await page.getByRole("button", { name: /격리하기/ }).click();

    // 격리 목록에 항목 등장(즉시 처리)
    await expect(page.getByText(/불량 1건/)).toBeVisible();
    await expect(page.getByText("E2E원자재튜브")).toBeVisible();

    // ── 해제(정상 복귀) ───────────────────────────────────
    await page.getByRole("button", { name: "처리", exact: true }).click();
    await expect(page.getByRole("heading", { name: /정상 복귀/ })).toBeVisible();
    await page
      .locator("select")
      .filter({ hasText: "외관 불량" })
      .first()
      .selectOption("외관 불량");
    await page.getByRole("button", { name: /정상 복귀/ }).click();

    // 격리 재고 0 으로 복귀 (KPI — 빈상태 <p>는 레이아웃 중복으로 hidden 일 수 있어 KPI 로 검증)
    await expect(page.getByRole("button", { name: /격리 중 0/ })).toBeVisible();
  });
});
