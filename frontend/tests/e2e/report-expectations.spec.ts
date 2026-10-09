import { test, expect, changeEmployee, loginUi } from "./_common-expectations";
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import type { APIRequestContext, Page, Route } from "@playwright/test";
import type { Employee } from "../../lib/api/types/employees";
import type { WeeklyReportResponse } from "../../lib/api/types/weekly";
import { fixturePython } from "./_admin-export-expectations";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shifted = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const dateLabel = (date: string) => { const [y, m, d] = date.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
const editor = (page: Page) => page.getByRole("textbox", { name: "작업 내역", exact: true }).filter({ visible: true });
async function daily(page: Page) {
  await page.goto("/mes?tab=dailyReport");
  await expect(editor(page)).toBeVisible();
}
async function putReport(request: APIRequestContext, employee: Employee, date: string, content: string) {
  const response = await request.put(`/api/daily-work-reports/${employee.employee_id}/${date}`, { headers: { "X-MES-Employee-Code": employee.employee_code }, data: { actor_employee_id: employee.employee_id, content } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function actualSave(page: Page, content: string) {
  const saved = page.waitForResponse((response) => response.url().includes("/daily-work-reports/") && response.request().method() === "PUT" && response.ok());
  await editor(page).fill(content);
  await saved;
  await expect(page.getByText(/^저장됨 · /).filter({ visible: true })).toBeVisible();
}

test("8.20-01 오늘·과거 UI와 미래 UI·실제 조회저장 API 차단", async ({ page, request, actors }) => {
  await loginUi(page, actors.requester); await daily(page);
  await expect(page.getByRole("button", { name: "다음 날", exact: true }).filter({ visible: true })).toBeDisabled();
  await page.getByRole("button", { name: "일보 날짜 선택", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "일보 날짜 선택", exact: true });
  await expect(dialog.getByRole("button", { name: dateLabel(shifted(today(), 1)), exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: dateLabel(shifted(today(), -1)), exact: true }).click();
  await actualSave(page, "지난 날짜 실제 저장");
  await expect(editor(page)).toHaveValue("지난 날짜 실제 저장");
  await expect(page.getByText(/^저장됨 · /).filter({ visible: true })).toBeVisible();
  const future = shifted(today(), 1);
  for (const url of [`/api/daily-work-reports?work_date=${future}`, `/api/daily-work-reports/${actors.requester.employee_id}/${future}`, `/api/daily-work-reports/${actors.requester.employee_id}/${future}/activity`]) {
    expect((await request.get(url)).status()).toBe(422);
  }
  expect((await request.put(`/api/daily-work-reports/${actors.requester.employee_id}/${future}`, { data: { actor_employee_id: actors.requester.employee_id, content: "미래 저장 거부" } })).status()).toBe(422);
});

test("8.20-02/04/05 빈 일보·동명이인·비활성 과거 행·타인 읽기전용", async ({ page, request, actors }) => {
  const date = today();
  const sameName = actors.requester.name;
  const other = await changeEmployee(request, actors.other, { name: sameName, department: "튜브" });
  await putReport(request, other, date, "다른 직원의 보존할 내용");
  await loginUi(page, actors.requester); await daily(page);
  await actualSave(page, "지울 본인 내용"); await actualSave(page, "");
  await expect(page.getByText(/^저장됨 · /).filter({ visible: true })).toBeVisible();
  await page.reload(); await expect(editor(page)).toHaveValue("");
  await changeEmployee(request, other, { is_active: false });
  await page.getByRole("tab", { name: "전체 일보", exact: true }).filter({ visible: true }).click();
  const chips = page.getByTestId("daily-work-report-author-chips").filter({ visible: true });
  const listed = await (await request.get(`/api/daily-work-reports?work_date=${date}`)).json();
  await expect(chips.getByRole("button")).toHaveCount(listed.length);
  await expect(chips.getByRole("button", { name: new RegExp(`${sameName}.*조립`) })).toBeVisible();
  await chips.getByRole("button", { name: new RegExp(`${sameName}.*튜브`) }).click();
  await expect(page.getByText("다른 직원의 보존할 내용", { exact: true })).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
  const forbidden = await request.put(`/api/daily-work-reports/${other.employee_id}/${date}`, { data: { actor_employee_id: actors.requester.employee_id, content: "타인 수정 거부" } });
  expect(forbidden.status()).toBe(403);
  expect((await (await request.get(`/api/daily-work-reports/${other.employee_id}/${date}`)).json()).content).toBe("다른 직원의 보존할 내용");
  await chips.getByRole("button", { name: new RegExp(`${sameName}.*조립`) }).click();
  await expect(editor(page)).toHaveValue("");
});

test("PC-DELTA-DAILY-01 저장중 최신 입력·빈 저장·실패 이탈차단·실제 버튼 재시도", async ({ page, actors }) => {
  await loginUi(page, actors.requester); await daily(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let intercepted!: () => void;
  const started = new Promise<void>((resolve) => { intercepted = resolve; });
  let first = true;
  await page.route("**/api/daily-work-reports/**", async (route) => {
    if (route.request().method() === "PUT" && first) { first = false; intercepted(); await gate; }
    await route.continue();
  });
  await editor(page).fill("저장 중 첫 내용"); await started;
  await editor(page).fill("저장 중 최신 내용"); release();
  await expect(page.getByText(/^저장됨 · /).filter({ visible: true })).toBeVisible();
  await page.reload(); await expect(editor(page)).toHaveValue("저장 중 최신 내용");
  await actualSave(page, "");
  await expect(editor(page)).toHaveValue("");
  await page.unroute("**/api/daily-work-reports/**");
  await page.route("**/api/daily-work-reports/**", (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { detail: "검수용 저장 실패" } }) : route.continue());
  await editor(page).fill("실패 후 보존할 내용");
  await expect(page.getByText("저장 실패 · 다시 시도하세요")).toBeVisible();
  await page.getByRole("button", { name: /^대시보드/ }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/tab=dailyReport/); await expect(editor(page)).toHaveValue("실패 후 보존할 내용");
  await page.unroute("**/api/daily-work-reports/**");
  const retry = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/daily-work-reports/") && response.ok());
  await page.getByRole("button", { name: "다시 시도", exact: true }).filter({ visible: true }).click(); await retry;
  await page.reload(); await expect(editor(page)).toHaveValue("실패 후 보존할 내용");
});

test("8.20-03 같은 직원 두 실제탭 최종본과 기존 감사 CSV 전후내용", async ({ page, context, request, actors }) => {
  await loginUi(page, actors.requester); await daily(page);
  const second = await context.newPage(); await loginUi(second, actors.requester); await daily(second);
  await actualSave(page, "두 탭 첫 저장"); await actualSave(second, "두 탭 최종 저장");
  await page.reload(); await expect(editor(page)).toHaveValue("두 탭 최종 저장");
  const audit = await request.get(`/api/admin/activity-audit/${today().slice(0, 7)}.csv`, { headers: { "X-Admin-Pin": "0000" } });
  expect(audit.status()).toBe(200);
  const csv = await audit.text();
  expect(csv).toContain(actors.requester.employee_code);
  expect(csv).toContain('""before"": ""두 탭 첫 저장""');
  expect(csv).toContain('""after"": ""두 탭 최종 저장""');
});

/** Injected read fixture verifies presentation only, not real inventory classification. */
function activityFixture(employee: Employee) {
  return { work_date: today(), employee_id: employee.employee_id,
    summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 2, BOX: 3 } }], cancelled_count: 1,
    details: [{ type: "solo", key: "report-cancellation", logs: [{ log_id: "report-cancellation", item_id: "report-item", item_name: "일보 취소 검수품", mes_code: "QA-TF-0001", item_unit: "EA", transaction_type: "RECEIVE", quantity_change: -2, quantity_before: 8, quantity_after: 6, warehouse_qty_before: 8, warehouse_qty_after: 6, department: "창고", created_at: `${today()}T01:00:00Z`, requested_at: `${today()}T01:00:00Z`, executor_name: employee.name, operation_kind: "CANCELLATION", operation_effective_status: "cancellation", operation_display_label: "원자재 입고 취소", cancelled: false, cancel_reason: "일보 취소 검수 사유", reverses_log_id: "original-report-log", inventory_effect: [{ scope: "warehouse", delta: -2, quantity_before: 8, quantity_after: 6 }] }] }] };
}
for (const mobile of [false, true]) {
  test(`8.20-06/07/08/09/10/12 ${mobile ? "mobile" : "PC"} 주입 거래 단위·취소 상세·반복토글·미작성 독립`, async ({ page, actors }) => {
    const errors: string[] = []; const warnings: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") warnings.push(message.text()); });
    await page.route("**/api/daily-work-reports/*/*/activity", (route) => route.fulfill({ status: 200, json: activityFixture(actors.requester) }));
    await page.route("**/api/inventory/transactions?**", (route) => {
      if (new URL(route.request().url()).searchParams.get("log_id") !== "original-report-log") return route.continue();
      return route.fulfill({ status: 200, json: [{ ...activityFixture(actors.requester).details[0].logs[0], log_id: "original-report-log", quantity_change: 2, warehouse_qty_before: 6, warehouse_qty_after: 8, operation_kind: "BUSINESS", operation_effective_status: "cancelled", operation_display_label: "원자재 입고", reverses_log_id: null, cancelled: true, notes: "원래 입고 근거", inventory_effect: [{ scope: "warehouse", delta: 2, quantity_before: 6, quantity_after: 8 }] }] });
    });
    await page.route("**/api/inventory/transactions/original-report-log/edits", (route) => route.fulfill({ status: 200, json: [] }));
    await loginUi(page, actors.requester); if (mobile) await page.setViewportSize({ width: 390, height: 844 }); await daily(page);
    await expect(editor(page)).toHaveValue("");
    if (mobile) await page.getByRole("button", { name: /MES 작업 기록 .* 펼치기/ }).filter({ visible: true }).click();
    const region = page.getByRole("region", { name: "MES 작업 기록", exact: true }).filter({ visible: true });
    await expect(region).toContainText("1건"); await expect(region).toContainText("2 EA · 3 BOX");
    await expect(region).toContainText("취소 1건"); await expect(region).toContainText("수량은 취소된 작업을 제외한 완료 작업 합계입니다.");
    await expect(region).toContainText("일보 작성 여부와 관계없이 해당 직원의 MES 작업을 표시합니다.");
    for (let i = 0; i < 3; i++) {
      if (mobile) await expect(page.getByTestId("daily-work-report-viewport")).toHaveAttribute("data-scroll-mode", "scroll");
      else await expect(page.getByTestId("daily-work-report-result").locator("..")).toHaveCSS("overflow-y", "hidden");
      await region.getByRole("button", { name: "창고 거래 상세 펼치기", exact: true }).click();
      if (mobile) await expect(page.getByTestId("daily-work-report-viewport")).toHaveAttribute("data-scroll-mode", "scroll");
      else await expect(page.getByTestId("daily-work-report-result").locator("..")).toHaveCSS("overflow-y", "auto");
      const card = region.getByTestId("daily-work-activity-card");
      await expect(card).toContainText("원자재 입고 취소"); await expect(card).toContainText("취소 거래");
      await expect(card).toContainText("취소자"); await expect(card).toContainText(actors.requester.name);
      await expect(card).toContainText("일보 취소 검수 사유"); await expect(card).toContainText("8 EA → 6 EA");
      await expect(card).toContainText(`${Number(today().slice(5, 7))}월 ${Number(today().slice(8, 10))}일`);
      await card.getByRole("button", { name: "원래 작업 보기", exact: true }).click();
      const original = card.getByRole("region", { name: "원래 작업 상세", exact: true });
      await expect(original).toContainText("원래 입고 근거");
      await expect(original.getByRole("button", { name: "이 내역 취소", exact: true })).toHaveCount(0);
      await card.getByRole("button", { name: "원래 작업 접기", exact: true }).click();
      await region.getByRole("button", { name: "창고 거래 상세 접기", exact: true }).click();
      await expect(region.getByTestId("daily-work-activity-details")).toHaveCount(0);
    }
    expect(errors).toEqual([]); expect(warnings.filter((message) => /Cannot update|Maximum update|while rendering/.test(message))).toEqual([]);
    await expect(page.locator("nextjs-portal [data-nextjs-dialog]")).toHaveCount(0);
    await page.route("**/api/daily-work-reports/*/*/activity", (route) => route.fulfill({ status: 200, json: { ...activityFixture(actors.requester), summary: [] } }));
    await page.reload(); await expect(editor(page)).toHaveValue("");
    if (mobile) await page.getByRole("button", { name: /MES 작업 기록 .* 펼치기/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "창고 거래 상세 펼치기", exact: true }).filter({ visible: true }).click();
    await expect(page.getByTestId("daily-work-activity-card")).toContainText("원자재 입고 취소");
  });
}

test("8.20-08 AS 사용출고 취소의 주입 역방향·담당자·사유", async ({ page, actors }) => {
  const activity = activityFixture(actors.requester);
  const log = activity.details[0].logs[0];
  Object.assign(log, { transaction_type: "INTERNAL_USE", department: "AS", quantity_change: 2, warehouse_qty_before: 6, warehouse_qty_after: 8, operation_display_label: "AS 사용출고 취소", reverses_log_id: null, inventory_effect: [{ scope: "warehouse", delta: 2, quantity_before: 6, quantity_after: 8 }] });
  await page.route("**/api/daily-work-reports/*/*/activity", (route) => route.fulfill({ status: 200, json: activity }));
  await loginUi(page, actors.requester); await daily(page);
  await page.getByRole("button", { name: "창고 거래 상세 펼치기", exact: true }).filter({ visible: true }).click();
  const card = page.getByTestId("daily-work-activity-card").filter({ visible: true });
  await expect(card).toContainText("AS 사용출고 취소"); await expect(card).toContainText("취소 거래");
  await expect(card).toContainText("6 EA → 8 EA"); await expect(card).toContainText(actors.requester.name);
  await expect(card).toContainText("일보 취소 검수 사유");
  await expect(card.getByTestId("daily-work-activity-direction")).toHaveAttribute("aria-label", "AS → 창고");
});

test("8.20-11 같은 주입 거래를 일보와 실제 이력 상세에서 유형·상태·방향 비교", async ({ page, actors }) => {
  const activity = activityFixture(actors.requester);
  Object.assign(activity.details[0].logs[0], {
    department_qty_before: 0, department_qty_after: 0,
    request_order_stock: { status: "available", reason: null, warehouse_qty_before: 8, warehouse_qty_after: 6, department_qty_before: 0, department_qty_after: 0 },
  });
  await page.route("**/api/daily-work-reports/*/*/activity", (route) => route.fulfill({ status: 200, json: activity }));
  await page.route("**/api/inventory/transactions/display-groups?**", (route) => route.fulfill({ status: 200, json: { groups: activity.details, next_cursor: null, has_more: false } }));
  await page.route("**/api/inventory/transactions/report-cancellation/edits", (route) => route.fulfill({ status: 200, json: [] }));
  await loginUi(page, actors.requester); await daily(page);
  await page.getByRole("button", { name: "창고 거래 상세 펼치기", exact: true }).filter({ visible: true }).click();
  const card = page.getByTestId("daily-work-activity-card").filter({ visible: true });
  for (const text of ["원자재 입고 취소", "취소 거래", "8 EA → 6 EA", actors.requester.name]) await expect(card).toContainText(text);
  await expect(card.getByTestId("daily-work-activity-direction")).toHaveAttribute("aria-label", "창고 → 공급사");
  await page.goto("/mes?tab=history");
  await page.locator('[data-history-main-row="true"][data-log-id="report-cancellation"]').click();
  const detail = page.getByTestId("desktop-right-panel").filter({ visible: true });
  await detail.getByRole("button", { name: /창고 재고.*1품목/ }).click();
  for (const text of ["원자재 입고 취소", "취소 거래", actors.requester.name]) await expect(detail).toContainText(text);
  const direction = detail.getByTestId("history-stock-movement-summary");
  await expect(direction).toContainText(/창고[\s\S]*공급사/);
  await expect(direction).toContainText(/창고\s*8\s*6/);
  await expect(detail.getByLabel("창고 재고 8 -2→6 EA", { exact: true })).toBeVisible();
});

test("8.20-11 같은 주입 정거래의 완료상태·유형·방향을 일보와 이력 상세에서 비교", async ({ page, actors }) => {
  const activity = activityFixture(actors.requester);
  activity.cancelled_count = 0;
  const group = activity.details[0];
  group.key = "report-receive";
  Object.assign(group.logs[0], { log_id: "report-receive", quantity_change: 2, quantity_before: 6, quantity_after: 8,
    warehouse_qty_before: 6, warehouse_qty_after: 8, department_qty_before: 0, department_qty_after: 0,
    operation_kind: "BUSINESS", operation_effective_status: "completed", operation_display_label: "원자재 입고",
    cancel_reason: null, reverses_log_id: null, inventory_effect: [{ scope: "warehouse", delta: 2, quantity_before: 6, quantity_after: 8 }],
    request_order_stock: { status: "available", reason: null, warehouse_qty_before: 6, warehouse_qty_after: 8, department_qty_before: 0, department_qty_after: 0 },
  });
  await page.route("**/api/daily-work-reports/*/*/activity", (route) => route.fulfill({ status: 200, json: activity }));
  await page.route("**/api/inventory/transactions/display-groups?**", (route) => route.fulfill({ status: 200, json: { groups: [group], next_cursor: null, has_more: false } }));
  await page.route("**/api/inventory/transactions/report-receive/edits", (route) => route.fulfill({ status: 200, json: [] }));
  await loginUi(page, actors.requester); await daily(page);
  await page.getByRole("button", { name: "창고 거래 상세 펼치기", exact: true }).filter({ visible: true }).click();
  const card = page.getByTestId("daily-work-activity-card").filter({ visible: true });
  await expect(card).toContainText("원자재 입고");
  await expect(card).toContainText("완료");
  await expect(card).toContainText("6 EA → 8 EA");
  await page.goto("/mes?tab=history");
  await page.locator('[data-history-main-row="true"][data-log-id="report-receive"]').click();
  const detail = page.getByTestId("desktop-right-panel").filter({ visible: true });
  await detail.getByRole("button", { name: /창고 재고.*1품목/ }).click();
  await expect(detail).toContainText("원자재 입고");
  await expect(detail).toContainText("완료");
  await expect(detail.getByTestId("history-stock-movement-summary")).toContainText(/공급사[\s\S]*창고/);
  await expect(detail.getByTestId("history-stock-movement-summary")).toContainText(/창고\s*6\s*8/);
});

function weeklyFixture(): WeeklyReportResponse {
  const row = { item_id: "weekly-report-item", mes_code: "QA-TF-0001", item_name: "주간 검수품", prev_qty: 7, produce_qty: 2, receive_qty: 3, out_qty: 1, defect_qty: 1, current_qty: 10, delta: 3 };
  return { week_start: "2026-07-27", week_end: "2026-08-02", report_status: "verified", basis_version: 2,
    groups: [{ process_code: "TF", dept_name: "튜브", label: "튜브", item_count: 1, prev_qty: 7, increase_qty: 5, decrease_qty: 2, produce_qty: 2, receive_qty: 3, out_qty: 1, defect_qty: 1, current_qty: 10, delta: 3, items: [row] }],
    summary: { total_current_qty: 10, total_produce_qty: 2, total_receive_qty: 3, total_out_qty: 1, total_defect_qty: 1, groups_increasing: 1, groups_decreasing: 0, groups_unchanged: 0 }, warnings: [], production_matrix: [],
    validation: { status: "verified", message: "재고 경계와 활동 원장 검산 완료", failures: [] } };
}
test("8.21-02/03/04/05 주입 숫자는 실제 공정카드·품목 열·모델0 안내에 일치", async ({ page, actors }) => {
  await page.route("**/api/inventory/weekly-report?**", (route) => route.fulfill({ status: 200, json: weeklyFixture() }));
  await loginUi(page, actors.requester); await page.goto("/mes?tab=weekly");
  await expect(page.getByText("전체 생산 2개", { exact: true })).toBeVisible();
  await expect(page.getByTestId("weekly-stock-total")).toHaveText("전체 정상재고 10개");
  await expect(page.getByText("모델별 집계 0", { exact: true })).toBeVisible();
  await expect(page.getByText("모델 정보가 없거나 공용인 품목은 모델별 집계에서 제외됩니다.", { exact: true })).toBeVisible();
  await expect(page.getByText(/생산 실적 없음/)).toHaveCount(0);
  const region = page.getByRole("region", { name: "튜브 품목 상세", exact: true }).filter({ visible: true });
  await expect(region.getByRole("columnheader", { name: "전주 정상재고", exact: true })).toBeVisible();
  await expect(region.getByRole("columnheader", { name: "현재 정상재고", exact: true })).toBeVisible();
  const row = region.getByTestId("weekly-detail-desktop-row-weekly-report-item");
  const cells = await row.locator("td").allTextContents();
  expect(cells.slice(2).map((value) => value.trim())).toEqual(["7", "2", "3", "1", "1", "10", "+3"]);
  const card = page.getByRole("button", { name: /튜브.*TF/ }).filter({ visible: true });
  await expect(card).toContainText("10"); await expect(card).toContainText("+5"); await expect(card).toContainText("-2");
});

test("8.21-06/07/10 실제 서버 집계 범위와 검산·분류 안내가 화면에 표시된다", async ({ page, actors }, info) => {
  await loginUi(page, actors.requester);
  const weeklyRoute = "**/api/inventory/weekly-report?**";
  let observedData: WeeklyReportResponse | undefined;
  let observedStatus: number | undefined;
  let observedWeek: { week_start: string | null; week_end: string | null } | undefined;
  const captureWeekly = async (route: Route) => {
    const request = route.request();
    // A late dashboard prefetch is not the report consumed by the new document.
    if (new URL(request.frame().url()).searchParams.get("tab") !== "weekly") {
      await route.continue();
      return;
    }
    const url = new URL(request.url());
    const response = await route.fetch();
    observedStatus = response.status();
    observedWeek = { week_start: url.searchParams.get("week_start"), week_end: url.searchParams.get("week_end") };
    try {
      if (response.ok()) observedData = await response.json() as WeeklyReportResponse;
    } finally {
      await route.fulfill({ response });
    }
  };
  await page.route(weeklyRoute, captureWeekly);
  await page.goto("/mes?tab=weekly");
  const guide = page.getByTestId("weekly-aggregation-guide");
  await expect(guide).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  expect(observedStatus).toBe(200);
  expect(observedData).toBeDefined();
  const data = observedData!;
  expect(observedWeek).toEqual({ week_start: data.week_start, week_end: data.week_end });
  expect(data.report_status).not.toBe("failed");
  await guide.getByText("집계·검산 기준", { exact: true }).click();
  for (const key of ["inventory", "production_matrix"]) {
    expect(data.aggregation_scope?.[key]).toBeTruthy();
    await expect(guide).toContainText(data.aggregation_scope![key]);
  }
  if (data.report_status !== "verified") {
    await expect(guide).toContainText("기존 기준·검산 전");
    await expect(guide).not.toContainText("검산 완료");
  }
  // The verified UI branch uses real server scope strings with an explicitly injected report.
  info.annotations.push({ type: "dataMode", description: "actual current report first; verified display branch projects real aggregation_scope onto synthetic quantities" });
  await page.route("**/api/inventory/weekly-report?**", (route) => route.fulfill({ status: 200, json: { ...weeklyFixture(), aggregation_scope: data.aggregation_scope } }));
  await page.reload();
  await guide.getByText("집계·검산 기준", { exact: true }).click();
  await expect(guide).toContainText(/재고 경계.*원장.*검산|전주.*순변화.*현재/);
  for (const name of ["격리", "복귀", "폐기", "재작업"]) await expect(guide).toContainText(name);
  await expect(guide).toContainText(data.aggregation_scope!.verified_rework);
  await info.attach("weekly-server-scope", { body: await page.screenshot(), contentType: "image/png" });
});

test("8.21-07 주입 검산실패는 숫자표 대신 원인만 표시", async ({ page, actors }) => {
  const data = weeklyFixture(); data.report_status = "failed"; data.validation = { status: "failed", message: "활동 순증 불일치", failures: [{ problem_id: "QA-WEEKLY-MISMATCH", item_id: "weekly-report-item", mes_code: "QA-TF-0001", reason: "재고 경계 불일치" }] };
  await page.route("**/api/inventory/weekly-report?**", (route) => route.fulfill({ status: 200, json: data }));
  await loginUi(page, actors.requester); await page.goto("/mes?tab=weekly");
  await expect(page.getByRole("heading", { name: "집계 검산 실패", exact: true })).toBeVisible();
  await expect(page.getByText(/QA-WEEKLY-MISMATCH/)).toBeVisible();
  await expect(page.getByTestId("weekly-detail-desktop-row-weekly-report-item")).toHaveCount(0);
  await expect(page.getByTestId("weekly-production-card")).toHaveCount(0);
});

test("8.21-01/11 실제 브라우저 F705 수신·선택 연도·유효 XLSX", async ({ page, actors }, testInfo) => {
  // Fixture only enables the read-only frozen download UI; file response is real.
  await page.route("**/api/inventory/weekly-report?**", (route) => route.fulfill({ status: 200, json: weeklyFixture() }));
  await loginUi(page, actors.requester); await page.goto("/mes?tab=weekly");
  const year = Number(today().slice(0, 4));
  const response = page.waitForResponse((res) => res.url().includes(`/production-log/f705-02.xlsx?year=${year}`) && res.ok());
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "F705-02 생산일지 다운로드", exact: true }).filter({ visible: true }).click();
  await response; const download = await downloaded;
  expect(download.suggestedFilename()).toContain(`${year} 생산일지.xlsx`);
  const file = testInfo.outputPath(`F705-${randomUUID().slice(0, 8)}.xlsx`); await download.saveAs(file);
  const parsed = spawnSync("python", ["-c", "import json,sys;from openpyxl import load_workbook;w=load_workbook(sys.argv[1],data_only=False);print(json.dumps({'sheets':len(w.worksheets),'formulas':sum(isinstance(c.value,str) and c.value.startswith('=') for s in w for row in s for c in row)}))", file], { encoding: "utf8", windowsHide: true });
  expect(parsed.status, parsed.stderr).toBe(0);
  const workbook = JSON.parse(parsed.stdout); expect(workbook.sheets).toBeGreaterThan(0); expect(workbook.formulas).toBeGreaterThan(0);
  await testInfo.attach("real-f705-workbook", { path: file, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
});

test("8.21-01 실제 연도경계 주차 화면은 두 연도 F705 파일의 해당 날짜 합과 일치", async ({ page, request, actors }, info) => {
  info.annotations.push({ type: "dataMode", description: "synthetic legacy rows only in mes_e2e; actual weekly API, selected calendar week and two actual downloads" });
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: { item_name: `보고서경계${randomUUID().slice(0, 8)}`, process_type_code: "HF", model_slots: [1], unit: "EA", initial_quantity: 10 } });
  expect(created.ok(), await created.text()).toBe(true);
  const item = await created.json();
  const logIds = fixturePython<string[]>([
    "import json,os,uuid", "from datetime import datetime", "from app.database import SessionLocal", "from app.models import TransactionLog,TransactionTypeEnum",
    "v=json.loads(os.environ['EXPORT_FIXTURE']);db=SessionLocal()", "try:", "    ids=[]",
    "    for occurred,quantity in [('2025-12-28T14:59:00',4),('2025-12-31T14:59:00',2),('2025-12-31T15:00:00',3),('2026-01-04T15:00:00',1)]:",
    "        row=TransactionLog(item_id=uuid.UUID(v['itemId']),transaction_type=TransactionTypeEnum.PRODUCE,quantity_change=quantity,created_at=datetime.fromisoformat(occurred))",
    "        db.add(row);db.flush();ids.append(str(row.log_id))", "    db.commit();print(json.dumps(ids))", "finally:", "    db.close()",
  ].join("\n"), { itemId: item.item_id });
  try {
    const weekly = await request.get("/api/inventory/weekly-report?week_start=2025-12-29&week_end=2026-01-04");
    expect(weekly.ok()).toBe(true);
    const data: WeeklyReportResponse = await weekly.json();
    const model = data.production_matrix!.find((row) => row.model_key === "DX3000")!;
    expect(model.hf_qty).toBe(5);
    await loginUi(page, actors.requester);
    await page.goto("/mes?tab=weekly");
    await page.getByRole("button", { name: /년 \d+월 \d+주차/ }).filter({ visible: true }).click();
    const popup = page.getByText(/^\d{4}년 \d+월$/, { exact: true }).filter({ visible: true });
    for (let step = 0; step < 12 && await popup.textContent() !== "2026년 1월"; step += 1) await popup.locator("..").getByRole("button").first().click();
    await expect(popup).toHaveText("2026년 1월");
    const selected = page.waitForResponse((response) => response.url().includes("week_start=2025-12-29") && response.ok());
    await page.getByRole("button", { name: "28 29 30 31 1 2 3", exact: true }).filter({ visible: true }).click();
    await selected;
    await expect(page.getByRole("button", { name: /2025년 12월.*12\/29.*1\/4/ }).filter({ visible: true })).toBeVisible();
    const modelRow = page.getByRole("row", { name: /DX3000/ }).filter({ visible: true });
    await expect(modelRow.getByRole("cell").nth(2)).toHaveText("5");
    const files: { year: number; path: string }[] = [];
    for (const year of [2025, 2026]) {
      if (year === 2026) await page.getByTitle("다음 주", { exact: true }).click();
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "F705-02 생산일지 다운로드", exact: true }).filter({ visible: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(`${year} 생산일지.xlsx`);
      const path = info.outputPath(`boundary-${year}.xlsx`); await download.saveAs(path); files.push({ year, path });
      await info.attach(`boundary-${year}`, { path, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }
    const parsed = spawnSync("python", ["-c", [
      "import json,sys;from datetime import date,timedelta;from openpyxl import load_workbook",
      "start=date(2025,12,29);days=[start+timedelta(days=i) for i in range(7)];parts=[]",
      "for year,path in [(2025,sys.argv[1]),(2026,sys.argv[2])]:",
      "    w=load_workbook(path,data_only=True);parts.append(sum(w[f'{d.year%100:02d}.{d.month:02d}'].cell(3,3+d.day).value or 0 for d in days if d.year==year));w.close()",
      "print(json.dumps(parts))",
    ].join("\n"), files[0].path, files[1].path], { encoding: "utf8", windowsHide: true });
    expect(parsed.status, parsed.stderr).toBe(0);
    const quantities: number[] = JSON.parse(parsed.stdout);
    expect(quantities).toEqual([2, 3]);
    expect(quantities.reduce((sum, quantity) => sum + quantity, 0)).toBe(model.hf_qty);
    await page.getByTitle("이전 주", { exact: true }).click();
    await expect(modelRow.getByRole("cell").nth(2)).toHaveText(String(model.hf_qty));
    await info.attach("year-boundary-week", { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    fixturePython([
      "import json,os,uuid", "from app.database import SessionLocal", "from app.models import TransactionLog",
      "v=json.loads(os.environ['EXPORT_FIXTURE']);db=SessionLocal()", "try:",
      "    db.query(TransactionLog).filter(TransactionLog.log_id.in_([uuid.UUID(value) for value in v['ids']])).delete(synchronize_session=False)",
      "    db.commit();print('null')", "finally:", "    db.close()",
    ].join("\n"), { ids: logIds });
  }
});

test("PC-DELTA-WEEKLY-01 실제 PF 픽업·취소 뒤 같은탭 주간 수량 자동갱신", async ({ page, request, actors }, testInfo) => {
  test.setTimeout(120_000);
  const headers = { "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code };
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  for (const process of ["AF", "PA", "PF"]) {
    const created = await request.post("/api/items", { headers, data: { item_name: `주간픽업${suffix}-${process}`, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: 0 } });
    expect(created.ok(), await created.text()).toBeTruthy(); ids[process] = (await created.json()).item_id;
  }
  const payload = { requester_employee_id: actors.approver.employee_id, work_type: "process", sub_type: "adjust_in", to_department: "출하", notes: "주간보고 PF 픽업 검수 재고" };
  const preview = await request.post("/api/io/preview", { headers, data: { ...payload, targets: [{ source_kind: "manual", item_id: ids.PF, quantity: 1 }] } });
  expect(preview.ok(), await preview.text()).toBeTruthy();
  const stock = await request.post("/api/io/submit", { headers, data: { ...payload, bundles: (await preview.json()).bundles } });
  expect(stock.ok(), await stock.text()).toBeTruthy();
  const submitted = await stock.json();
  if (submitted.stock_request_id) {
    const approved = await request.post(`/api/stock-requests/${submitted.stock_request_id}/approve`, { headers, data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } });
    expect(approved.ok(), await approved.text()).toBeTruthy();
  }
  for (const [parent, child] of [["PA", "AF"], ["PF", "PA"]]) {
    const bom = await request.post("/api/bom", { headers, data: { parent_item_id: ids[parent], child_item_id: ids[child], quantity: 1, unit: "EA" } });
    expect(bom.ok(), await bom.text()).toBeTruthy();
  }
  const created = await request.post("/api/shipping/requests", { headers, data: { base_pf_item_id: ids.PF, requested_by_name: actors.approver.name, invoice_number: `QA-WEEK-${suffix}`, request_quantity: 1, client_request_id: randomUUID() } });
  expect(created.ok(), await created.text()).toBeTruthy(); const shippingId = (await created.json()).request_id;
  try {
    const prepared = await request.post(`/api/shipping/requests/${shippingId}/prepare-complete`, { headers, data: { serial_numbers: `QA-SN-${suffix}` } });
    expect(prepared.ok(), await prepared.text()).toBeTruthy();
    await loginUi(page, actors.approver);
    const monday = shifted(today(), -((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7));
    const sunday = shifted(monday, 6);
    const url = `/api/inventory/weekly-report?week_start=${monday}&week_end=${sunday}`;
    const before = await (await request.get(url)).json();
    expect(before.report_status).not.toBe("failed");
    const beforePf = before.production_matrix.reduce((sum: number, row: { pf_qty: number }) => sum + Number(row.pf_qty), 0);
    await page.getByRole("button", { name: /^주간보고/ }).filter({ visible: true }).click();
    await expect(page.getByTestId("weekly-production-card")).toBeVisible();
    await page.getByRole("complementary").getByRole("button", { name: /^출하(?:\s|$)/ }).click();
    await page.getByRole("button").filter({ hasText: "출하 관리", visible: true }).first().click();
    await page.locator(`[data-shipping-request-id="${shippingId}"]`).filter({ visible: true }).click();
    await page.getByTestId("shipping-pickup-from-detail").click();
    const picked = page.waitForResponse((res) => res.url().includes(`/requests/${shippingId}/pickup-complete`) && res.ok());
    await page.getByRole("button", { name: "확인 후 실행", exact: true }).filter({ visible: true }).click(); await picked;
    const latest = await (await request.get(url)).json();
    const latestPf = latest.production_matrix.reduce((sum: number, row: { pf_qty: number }) => sum + Number(row.pf_qty), 0);
    expect(latestPf).toBe(beforePf + 1);
    await page.getByRole("button", { name: /^주간보고/ }).filter({ visible: true }).click();
    const model = latest.production_matrix.find((row: { model_key: string; pf_qty: number }) => Number(row.pf_qty) > Number(before.production_matrix.find((prior: { model_key: string }) => prior.model_key === row.model_key)?.pf_qty ?? 0));
    expect(model, "실제 픽업으로 PF가 증가한 모델").toBeTruthy();
    const modelRow = page.getByRole("row", { name: new RegExp(model.model_label) }).filter({ visible: true });
    await expect(modelRow.getByRole("cell").nth(6)).toHaveText(Number(model.pf_qty).toLocaleString());
    await testInfo.attach("weekly-after-real-pickup", { body: await page.screenshot(), contentType: "image/png" });
    // Real browser download is reconciled to the real API-backed PF model row.
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "F705-02 생산일지 다운로드", exact: true }).filter({ visible: true }).click();
    const download = await downloaded;
    const workbookPath = testInfo.outputPath("weekly-pickup-f705.xlsx"); await download.saveAs(workbookPath);
    const parsed = spawnSync("python", ["-c", [
      "import json,sys;from datetime import date,timedelta;from openpyxl import load_workbook",
      "w=load_workbook(sys.argv[1],data_only=True);start=date.fromisoformat(sys.argv[2]);end=date.fromisoformat(sys.argv[3])",
      "rows={'DX3000':27,'ADX4000W':28,'ADX6000FB':29,'COCOON':30,'SOLO':31};row=rows[sys.argv[4]]",
      "days=[start+timedelta(days=i) for i in range((end-start).days+1)]",
      "values=[w[f'{d.year%100:02d}.{d.month:02d}'].cell(row,3+d.day).value or 0 for d in days]",
      "months=sorted({(d.year,d.month) for d in days})",
      "totals=[{'cached':w[f'{y%100:02d}.{m:02d}'].cell(row,35).value,'inputs':sum(w[f'{y%100:02d}.{m:02d}'].cell(row,c).value or 0 for c in range(4,35))} for y,m in months]",
      "print(json.dumps({'weeklyPF':sum(values),'monthlyTotals':totals}))",
    ].join("\n"), workbookPath, monday, sunday, model.model_key], { encoding: "utf8", windowsHide: true });
    expect(parsed.status, parsed.stderr).toBe(0);
    const workbook = JSON.parse(parsed.stdout);
    expect(workbook.weeklyPF).toBe(Number(model.pf_qty));
    for (const month of workbook.monthlyTotals) expect(month.cached).toBe(month.inputs);
    await testInfo.attach("real-pickup-f705-numeric-reconciliation", { path: workbookPath, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await page.getByRole("complementary").getByRole("button", { name: /^출하(?:\s|$)/ }).click();
    await page.getByRole("button").filter({ hasText: "출하 이력", visible: true }).first().click();
    await page.locator(`[data-shipping-request-id="${shippingId}"]`).filter({ visible: true }).click();
    await page.getByTestId("shipping-pickup-cancel-from-history").click();
    const cancelled = page.waitForResponse((res) => res.url().includes(`/requests/${shippingId}/pickup-cancel`) && res.ok());
    await page.getByRole("button", { name: "확인 후 실행", exact: true }).filter({ visible: true }).click(); await cancelled;
    await page.getByRole("button", { name: /^주간보고/ }).filter({ visible: true }).click();
    const restored = await (await request.get(url)).json();
    expect(restored.production_matrix.reduce((sum: number, row: { pf_qty: number }) => sum + Number(row.pf_qty), 0)).toBe(beforePf);
    const restoredModel = restored.production_matrix.find((row: { model_label: string }) => row.model_label === model.model_label);
    if (Number(restored.summary.total_produce_qty) === 0) {
      await expect(page.getByText("이번 주 생산 실적 없음 · 모델별 공정 생산 기록이 없습니다.", { exact: true })).toBeVisible();
      await expect(modelRow).toHaveCount(0);
    } else {
      await expect(modelRow.getByRole("cell").nth(6)).toHaveText(Number(restoredModel?.pf_qty ?? 0) === 0 ? "—" : Number(restoredModel.pf_qty).toLocaleString());
    }
  } finally {
    await request.post(`/api/shipping/requests/${shippingId}/pickup-cancel`, { headers });
    await request.post(`/api/shipping/requests/${shippingId}/prepare-cancel`, { headers, data: { reason: "전용 검수 요청 정리" } });
    await request.delete(`/api/shipping/requests/${shippingId}`, { headers });
  }
});
