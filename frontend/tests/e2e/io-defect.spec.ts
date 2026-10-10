/**
 * P2-1 / 시나리오 5: 불량 격리·해제.
 *
 * 불량은 별도 최상위 "불량" 탭(입출고 work type 아님). 라이브 정책(2026-06-04 확인):
 * 새 불량(격리)·정상 복귀(해제) 모두 즉시 처리(approvalKind="none").
 * PR #17에서 삭제됐던 spec 을 전용 DB 인프라 위에서 재작성.
 */
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loginAsOperator, readSeed } from "./_helpers";

test.describe("불량 — 격리 / 해제", () => {
  test.beforeEach(async ({ page }) => {
    // 창고 역할로 로그인 — 격리 위치 "창고", 목록 기본 스코프 "전체".
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("새 불량 격리 → 정상 복귀", async ({ page }) => {
    const activeRecords = async (): Promise<Array<{ record_id: string; item_id: string; reason_memo: string | null }>> => {
      const response = await page.request.get("/api/defects/locations");
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    const existingMarker = `기존 격리 ${randomUUID()}`;
    const existing = await page.request.post("/api/defects/quarantine", { data: {
      actor_employee_id: readSeed().warehouseEmployee.employee_id,
      item_id: readSeed().rawItem.item_id,
      qty: 1,
      source: "warehouse",
      target_dept: "창고",
      reason_category: "외관 불량",
      reason_memo: existingMarker,
    } });
    expect(existing.status(), await existing.text()).toBe(200);
    const before = await activeRecords();
    const existingRecords = before.filter((record) => record.reason_memo === existingMarker);
    expect(existingRecords).toHaveLength(1);
    const priorIds = new Set(before.map((record) => record.record_id));
    const marker = `새 격리 ${randomUUID()}`;

    try {
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
    // 장바구니: 수량 + 사유 카테고리
    await page.getByPlaceholder("예: 3").fill("5");
    // 사유 마스터 선택 다이얼로그에서 활성 카테고리를 선택한다.
    await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    await page.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill(marker);
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
    await expect(page.getByText("E2E원자재튜브").filter({ visible: true }).first()).toBeVisible();
    const created = (await activeRecords()).filter((record) => !priorIds.has(record.record_id));
    expect(created).toHaveLength(1);
    expect(created[0].item_id).toBe(readSeed().rawItem.item_id);
    expect(created[0].reason_memo).toBe(marker);

    // ── 해제(정상 복귀) ───────────────────────────────────
    await page.getByRole("searchbox", { name: "불량 검색" }).filter({ visible: true }).fill(marker);
    const createdRow = page.getByRole("article", { name: "E2E원자재튜브 격리 기록" }).filter({ hasText: marker, visible: true });
    await expect(createdRow).toHaveCount(1);
    await createdRow.getByRole("button", { name: "처리", exact: true }).click();
    await expect(page.getByRole("heading", { name: /불량 처리/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "정상 복귀 →" })).toBeDisabled();
    await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "검사 통과", exact: true }).click();
    // 정상 복귀 제출 후 즉시 처리 확인창에서 확정한다.
    // 재설계 후 "정상 복귀" ActionCard 와 제출 버튼이 공존 → 화살표 포함 제출 버튼만 정확히 겨냥.
    await page.getByRole("button", { name: "정상 복귀 →" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "즉시 복귀", exact: true })
      .click();

    // 처리 후 hub 자동 복귀를 명시적으로 기다린 뒤 "격리 목록" 카드 재진입 (재로드 경합 flaky 방지)
    await expect(
      page.getByRole("button").filter({ hasText: "불량 처리", visible: true }),
    ).toBeVisible();
    await page.getByRole("button").filter({ hasText: "격리 목록" }).filter({ hasText: "격리 항목" }).click();
    await expect.poll(async () => {
      const ids = (await activeRecords()).map((record) => record.record_id);
      return {
        createdStillPresent: ids.includes(created[0].record_id),
        priorIds: ids.filter((id) => priorIds.has(id)).sort(),
        allIds: ids.sort(),
      };
    }).toEqual({ createdStillPresent: false, priorIds: [...priorIds].sort(), allIds: [...priorIds].sort() });
    } finally {
      if ((await activeRecords()).some((record) => record.record_id === existingRecords[0].record_id)) {
        const restored = await page.request.post("/api/defects/unquarantine", { data: {
          actor_employee_id: readSeed().warehouseEmployee.employee_id,
          record_id: existingRecords[0].record_id,
          item_id: readSeed().rawItem.item_id,
          qty: 1,
          dept: "창고",
          reason_category: "검사 통과",
        } });
        expect(restored.status(), await restored.text()).toBe(200);
      }
    }
  });
});
