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
    // 창고 역할로 로그인 — 격리 위치 "창고", 목록 기본 스코프 "전체".
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("새 불량 격리 → 정상 복귀", async ({ page }) => {
    const quarantineMemo = `격리 복귀 E2E ${Date.now().toString(36)}`;
    await page.goto("/mes?tab=defect");
    // 4장 허브의 통합 등록·처리 카드 확인 — 첫 컴파일만 넉넉히 기다린다.
    const workCard = page.getByRole("button").filter({ hasText: "불량 처리", visible: true });
    await expect(workCard).toBeVisible({ timeout: 30_000 });

    // ── 격리 ──────────────────────────────────────────────
    await workCard.click();
    await page.getByRole("button").filter({ hasText: "격리 등록", visible: true }).click();
    // 같은 화면에서 출처를 고르면 품목으로 바로 진행한다.
    await expect(page.getByRole("button", { name: /^부서 재고/ }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^창고 재고/ }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "조립", exact: true }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^창고 재고/ }).filter({ visible: true }).click();
    // Step 2: 시드 원자재 행 "추가".
    await page
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: /장바구니에 추가/ })
      .click();
    await page.getByRole("button", { name: "수량·처리 정보 →", exact: true }).filter({ visible: true }).click();
    // 장바구니: 수량 + 사유 카테고리
    await page.getByPlaceholder("예: 3").fill("5");
    // 사유 마스터 선택 다이얼로그에서 활성 카테고리를 선택한다.
    await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    await page.getByRole("textbox", { name: "메모", exact: true }).filter({ visible: true }).fill(quarantineMemo);
    // 제출 → ConfirmModal → 확인
    await page.getByRole("button", { name: /격리하기 \(1건\)/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "격리하기", exact: true })
      .click();

    // 격리 후 hub 자동 복귀를 명시적으로 기다린 뒤 "격리 목록" 카드 진입 (재로드 경합 flaky 방지)
    await expect(
      page.getByRole("button").filter({ hasText: "불량 처리", visible: true }),
    ).toBeVisible();
    await page.getByRole("button").filter({ hasText: "격리 목록" }).filter({ hasText: "격리 항목" }).click();
    // mes 는 모바일·데스크톱 셸을 CSS(lg:hidden)로 둘 다 DOM 에 렌더. 모바일 불량 허브가
    // 첫 화면에서 격리 목록을 함께 보여주므로 같은 품목명/버튼/빈 메시지가 (숨은) 모바일 셸에도
    // 존재 → 보이는(데스크톱) 요소만 골라야 strict 위반을 피한다. [[project_e2e_dual_shell_visible_filter]]
    await page.getByRole("searchbox", { name: "불량 검색", exact: true }).filter({ visible: true }).fill(quarantineMemo);
    const record = page.getByRole("article", { name: "E2E원자재튜브 격리 기록", exact: true }).filter({ hasText: quarantineMemo, visible: true });
    await expect(record).toBeVisible();

    // ── 해제(정상 복귀) ───────────────────────────────────
    await record.getByRole("button", { name: "처리", exact: true }).click();
    await expect(page.getByRole("heading", { name: /불량 처리/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "정상 복귀 →" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "사유 카테고리 선택", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "메모", exact: true })).toHaveValue("");
    const recoveries: unknown[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/defects/unquarantine") recoveries.push(request.postDataJSON());
    });
    // 정상 복귀 제출 후 즉시 처리 확인창에서 확정한다.
    // 재설계 후 "정상 복귀" ActionCard 와 제출 버튼이 공존 → 화살표 포함 제출 버튼만 정확히 겨냥.
    await page.getByRole("button", { name: "정상 복귀 →" }).click();
    await expect(page.getByRole("dialog", { name: "정상 복귀 확인", exact: true })).toBeVisible();
    expect(recoveries).toHaveLength(0);
    const recoveryPending = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/defects/unquarantine" && response.request().method() === "POST");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "즉시 복귀", exact: true })
      .click();
    const recovery = await recoveryPending;
    expect(recovery.ok(), await recovery.text()).toBeTruthy();
    expect(recoveries).toEqual([expect.objectContaining({ qty: 5, reason_category: null, reason_category_id: null, reason_memo: null })]);

    // 처리 후 hub 자동 복귀를 명시적으로 기다린 뒤 "격리 목록" 카드 재진입 (재로드 경합 flaky 방지)
    await expect(
      page.getByRole("button").filter({ hasText: "불량 처리", visible: true }),
    ).toBeVisible();
    await page.getByRole("button").filter({ hasText: "격리 목록" }).filter({ hasText: "격리 항목" }).click();
    await expect(page.getByRole("heading", { name: "격리 목록", exact: true }).filter({ visible: true })).toBeVisible();
    // 다른 시나리오의 격리 기록은 보존하고 이번에 만든 기록의 복귀만 검증한다.
    await expect(record).toHaveCount(0);
    const locations = await page.request.get("/api/defects/locations");
    expect(locations.ok(), await locations.text()).toBeTruthy();
    expect((await locations.json()).filter((entry: { reason_memo: string | null }) => entry.reason_memo === quarantineMemo)).toHaveLength(0);
  });
});
