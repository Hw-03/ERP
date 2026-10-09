import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function fixture(request: APIRequestContext) {
  const seed = await json(request, `/api/items/${readSeed().rawItem.item_id}`);
  expect(seed.model_slots.length).toBeGreaterThan(0);
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `불량 처리검수 ${randomUUID().slice(0, 8)}`, unit: "EA", initial_quantity: 20,
    process_type_code: seed.process_type_code, model_slots: seed.model_slots,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function origins(request: APIRequestContext, itemId: string) {
  return (await json(request, "/api/defects/locations")).filter((row: { item_id: string }) => row.item_id === itemId);
}
async function snapshot(request: APIRequestContext, itemId: string) {
  return { item: await json(request, `/api/items/${itemId}`), cells: await json(request, `/api/inventory/locations/${itemId}`),
    records: await origins(request, itemId), logs: await json(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`) };
}
async function quarantine(request: APIRequestContext, actors: CommonActors, itemId: string, quantity: number, memo: string) {
  const response = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: itemId, qty: quantity, source: "warehouse", target_dept: "창고",
    reason_category: "외관 불량", reason_memo: memo,
  } });
  expect(response.status(), await response.text()).toBe(200);
  return (await origins(request, itemId)).find((row: { reason_memo: string }) => row.reason_memo === memo);
}
async function openList(page: Page, itemName: string) {
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).click();
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
  const summary = page.getByTestId("defect-item-group-summary").filter({ hasText: itemName, visible: true });
  const rows = page.getByRole("article", { name: `${itemName} 격리 기록` }).filter({ visible: true });
  await expect.poll(async () => await summary.count() + await rows.count()).toBeGreaterThan(0);
  for (const group of await summary.all()) if (await group.getAttribute("aria-expanded") !== "true") await group.getByRole("button", { name: /격리/ }).click();
  await expect(rows.first()).toBeVisible();
  return { summary, rows };
}
async function reason(page: Page) {
  await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
}

test("DEFECT-RETURN PC-DELTA-DEFECT-05/06 8.13-03/04/05 활성업체·숨김경합·당시이름·PIN취소·실제격리수량", async ({ page, request, actors }) => {
  const item = await fixture(request);
  const origin = await quarantine(request, actors, item.item_id, 3, "반품 원건 메모");
  const supplierName = `반품공급검수${randomUUID().slice(0, 8)}`;
  const supplierReply = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name: supplierName } });
  expect(supplierReply.status(), await supplierReply.text()).toBe(201);
  const supplier = await supplierReply.json();
  const hiddenReply = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name: `${supplierName}숨김` } });
  expect(hiddenReply.status(), await hiddenReply.text()).toBe(201);
  const hidden = await hiddenReply.json();
  expect((await request.patch(`/api/suppliers/${hidden.supplier_id}`, { data: { requester_employee_id: actors.approver.employee_id, is_active: false } })).ok()).toBeTruthy();
  const before = await snapshot(request, item.item_id);
  await loginUi(page, actors.requester);
  const { rows } = await openList(page, item.item_name);
  await rows.getByRole("button", { name: "처리", exact: true }).click();
  await page.getByRole("spinbutton").filter({ visible: true }).fill("1");
  await page.getByRole("button", { name: /^반품 즉시/ }).click();
  await reason(page);
  await page.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill("창고 격리 반품 독립메모");
  await page.getByRole("button", { name: "공급업체 선택 →", exact: true }).click();
  const picker = page.getByRole("region", { name: "공급업체 검색·선택" });
  await picker.getByRole("textbox", { name: "공급업체 검색" }).fill(supplierName);
  await expect(picker.getByRole("button", { name: `${supplierName}숨김`, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "반품 확인", exact: true })).toBeDisabled();
  await picker.getByRole("button", { name: supplierName, exact: true }).click();
  expect((await request.patch(`/api/suppliers/${supplier.supplier_id}`, { data: { requester_employee_id: actors.approver.employee_id, is_active: false } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "반품 확인", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "반품 확인", exact: true });
  await expect(confirmation).toContainText(item.item_name);
  await expect(confirmation).toContainText(supplierName);
  await expect(confirmation).toContainText("1개");
  const rejected = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/stock-requests"));
  await confirmation.getByRole("button", { name: "즉시 반품", exact: true }).click();
  expect((await rejected).status()).toBe(422);
  await expect(page.getByText(/숨김.*공급업체|활성.*공급업체/).filter({ visible: true })).toBeVisible();
  expect(await snapshot(request, item.item_id)).toEqual(before);
  expect((await request.patch(`/api/suppliers/${supplier.supplier_id}`, { data: { requester_employee_id: actors.approver.employee_id, is_active: true } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "반품 확인", exact: true }).click();
  const submitted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/stock-requests"));
  await confirmation.getByRole("button", { name: "즉시 반품", exact: true }).click();
  const response = await submitted;
  expect(response.status(), await response.text()).toBe(201);
  const work = await response.json();
  expect(work).toMatchObject({ status: "completed", supplier_id: supplier.supplier_id, supplier_name_snapshot: supplierName });
  const after = await snapshot(request, item.item_id);
  expect(after.item.warehouse_qty).toBe(before.item.warehouse_qty);
  expect(Number(after.records.find((row: { record_id: string }) => row.record_id === origin.record_id).available_quantity)).toBe(2);
  const original = after.logs.find((log: { transaction_type: string }) => log.transaction_type === "SUPPLIER_RETURN");
  expect(original).toBeTruthy();
  expect(original.supplier_name_snapshot).toBe(supplierName);
  expect((await request.patch(`/api/suppliers/${supplier.supplier_id}`, { data: { requester_employee_id: actors.approver.employee_id, name: `${supplierName}변경` } })).ok()).toBeTruthy();
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  const historyRow = page.locator(`[data-log-id="${original.log_id}"]`).filter({ visible: true }).first();
  await expect(historyRow).toContainText("반품");
  await historyRow.click();
  await expect(page.getByTestId("history-key-point-summary")).toContainText(supplierName);
  await expect(page.getByTestId("history-key-point-summary")).not.toContainText(`${supplierName}변경`);
  await expect(page.getByTestId("history-stock-movement-summary")).toContainText(/창고.*격리/);
  await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
  await expect(page.getByRole("button", { name: "취소 확정", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "취소 사유", exact: true }).fill("반품 원건 원복 검수");
  await page.getByLabel("PIN", { exact: true }).fill("1111");
  await page.getByRole("button", { name: "취소 확정", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/PIN/);
  expect(await snapshot(request, item.item_id)).toEqual(after);
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(async () => Number((await origins(request, item.item_id)).find((row: { record_id: string }) => row.record_id === origin.record_id).available_quantity)).toBe(3);
  const cancelled = await snapshot(request, item.item_id);
  expect(cancelled.item.warehouse_qty).toBe(before.item.warehouse_qty);
  expect(cancelled.logs.filter((log: { reverses_log_id: string }) => log.reverses_log_id === original.log_id)).toHaveLength(1);
  expect(cancelled.logs.find((log: { log_id: string }) => log.log_id === original.log_id).cancelled).toBe(true);
  await expect(page.getByRole("button", { name: "이 내역 취소", exact: true })).toHaveCount(0);
});

test("DEFECT-LIVE 8.6-03 8.7-07 PC-DELTA-DEFECT-02 격리 부분·전량 복귀와 폐기는 원건·다른 카드·건수를 즉시 갱신한다", async ({ page, request, actors }) => {
  const item = await fixture(request);
  const first = await quarantine(request, actors, item.item_id, 2, "첫 격리 자동갱신 원건");
  const second = await quarantine(request, actors, item.item_id, 3, "둘째 격리 자동갱신 원건");
  const before = await snapshot(request, item.item_id);
  await loginUi(page, actors.requester);
  const { rows, summary } = await openList(page, item.item_name);
  const mine = page.getByRole("button", { name: "내가 격리", exact: true }).filter({ visible: true });
  await mine.click();
  const count = page.getByText("격리 중", { exact: true }).filter({ visible: true }).locator("..");
  await expect(count).toContainText("2건");
  await expect(summary).toContainText("기록 2건");
  await expect(rows).toHaveCount(2);
  const firstRow = rows.filter({ hasText: "첫 격리 자동갱신 원건" });
  const secondRow = rows.filter({ hasText: "둘째 격리 자동갱신 원건" });
  for (const step of [
    { memo: "첫 격리 자동갱신 원건", action: "restore", quantity: 1, remaining: 1, count: 2 },
    { memo: "첫 격리 자동갱신 원건", action: "restore", quantity: 1, remaining: 0, count: 1 },
    { memo: "둘째 격리 자동갱신 원건", action: "scrap", quantity: 1, remaining: 2, count: 1 },
    { memo: "둘째 격리 자동갱신 원건", action: "scrap", quantity: 2, remaining: 0, count: 0 },
  ]) {
    if (await summary.count() && await summary.getAttribute("aria-expanded") !== "true") await summary.getByRole("button", { name: /격리/ }).click();
    await rows.filter({ hasText: step.memo }).getByRole("button", { name: "처리", exact: true }).click();
    if (step.action === "scrap") await page.getByRole("button", { name: /^전체 폐기/ }).filter({ visible: true }).click();
    await page.getByRole("spinbutton").filter({ visible: true }).fill(String(step.quantity));
    await reason(page);
    await page.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill(`선택 원건 ${step.memo} ${step.action} ${step.quantity}`);
    await page.getByRole("button", { name: step.action === "restore" ? "정상 복귀 →" : "즉시 폐기 →", exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog", { name: step.action === "restore" ? "정상 복귀 확인" : "폐기 확인", exact: true });
    await expect(dialog).toContainText(item.item_name);
    await expect(dialog).toContainText(`${step.quantity}개`);
    const submitted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(step.action === "restore" ? "/api/defects/unquarantine" : "/api/stock-requests"));
    await dialog.getByRole("button", { name: step.action === "restore" ? "즉시 복귀" : "즉시 폐기", exact: true }).click();
    expect((await submitted).status()).toBe(step.action === "restore" ? 200 : 201);
    await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).click();
    await expect(mine).toHaveAttribute("aria-pressed", "true");
    await expect(count).toContainText(`${step.count}건`);
    if (await summary.count() && await summary.getAttribute("aria-expanded") !== "true") await summary.getByRole("button", { name: /격리/ }).click();
    if (step.remaining) await expect(rows.filter({ hasText: step.memo })).toContainText(`${step.remaining}개`);
    else await expect(rows.filter({ hasText: step.memo })).toHaveCount(0);
    if (step.action === "restore") {
      await expect(secondRow).toContainText("3개");
      expect(Number((await origins(request, item.item_id)).find((row: { record_id: string }) => row.record_id === first.record_id)?.available_quantity ?? 0)).toBe(step.remaining);
      expect((await origins(request, item.item_id)).find((row: { record_id: string }) => row.record_id === second.record_id)).toEqual(before.records.find((row: { record_id: string }) => row.record_id === second.record_id));
    }
  }
  await expect(firstRow).toHaveCount(0);
  await expect(secondRow).toHaveCount(0);
  await expect(summary).toHaveCount(0);
  const after = await snapshot(request, item.item_id);
  expect(after.item.warehouse_qty).toBe(Number(before.item.warehouse_qty) + 2);
  expect(after.records).toHaveLength(0);
  expect(after.logs.filter((log: { transaction_type: string }) => log.transaction_type === "UNMARK_DEFECTIVE")).toHaveLength(2);
  expect(after.logs.filter((log: { transaction_type: string }) => log.transaction_type === "DEFECT_SCRAP")).toHaveLength(2);
  expect(after.logs.filter((log: { reason_memo: string | null; transaction_type: string }) => log.reason_memo?.includes("첫 격리 자동갱신 원건") && log.transaction_type === "UNMARK_DEFECTIVE")).toHaveLength(2);
});

test("DEFECT-BULK 8.18-01/03/04/07 같은품목 독립원건 전체잔량·각원건재확인·한묶음실행", async ({ page, request, actors }) => {
  const item = await fixture(request);
  const first = await quarantine(request, actors, item.item_id, 2, "일괄 첫째 메모");
  const second = await quarantine(request, actors, item.item_id, 3, "일괄 둘째 메모");
  const before = await snapshot(request, item.item_id);
  await loginUi(page, actors.requester);
  const { summary, rows } = await openList(page, item.item_name);
  await expect(rows).toHaveCount(2);
  await expect(summary).toContainText("5개");
  await summary.getByRole("button", { name: "여러 건 선택", exact: true }).click();
  await rows.filter({ hasText: "일괄 첫째 메모" }).getByRole("checkbox").check();
  await rows.filter({ hasText: "일괄 둘째 메모" }).getByRole("checkbox").check();
  await summary.getByRole("button", { name: "선택 처리 2건", exact: true }).click();
  await expect(page.getByRole("spinbutton").filter({ visible: true })).toHaveCount(0);
  const reviewed = page.getByRole("region", { name: "선택 원건 재확인" });
  await expect(reviewed.getByRole("article")).toHaveCount(2);
  await expect(reviewed.locator(`[data-record-id="${first.record_id}"]`)).toContainText("일괄 첫째 메모");
  await expect(reviewed.locator(`[data-record-id="${first.record_id}"]`)).toContainText("잔량 전체 2개");
  await expect(reviewed.locator(`[data-record-id="${first.record_id}"]`)).toContainText(actors.requester.name);
  await expect(reviewed.locator(`[data-record-id="${second.record_id}"]`)).toContainText("일괄 둘째 메모");
  await expect(reviewed.locator(`[data-record-id="${second.record_id}"]`)).toContainText("잔량 전체 3개");
  await expect(reviewed.locator(`[data-record-id="${second.record_id}"]`)).toContainText(actors.requester.name);
  for (const origin of [first, second]) {
    const at = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(origin.defective_at) ? origin.defective_at : `${origin.defective_at}Z`);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
    await expect(reviewed.locator(`[data-record-id="${origin.record_id}"]`)).toContainText(`${parts.year}년 ${parts.month}월 ${parts.day}일 ${parts.hour}시 ${parts.minute}분`);
  }
  await reason(page);
  await page.getByRole("button", { name: "정상 복귀 →", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "정상 복귀 확인", exact: true });
  await expect(confirmation).toContainText("일괄 첫째 메모");
  await expect(confirmation).toContainText("일괄 둘째 메모");
  await expect(confirmation).toContainText("5개 (2건)");
  const submitted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/defects/unquarantine/bulk"));
  await confirmation.getByRole("button", { name: "즉시 복귀", exact: true }).click();
  const response = await submitted;
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(response.request().postDataJSON().lines.map((line: { record_id: string; quantity: number }) => ({ record_id: line.record_id, quantity: line.quantity })).sort((left: { record_id: string }, right: { record_id: string }) => left.record_id.localeCompare(right.record_id))).toEqual(
    [{ record_id: first.record_id, quantity: 2 }, { record_id: second.record_id, quantity: 3 }].sort((left, right) => left.record_id.localeCompare(right.record_id)),
  );
  const after = await snapshot(request, item.item_id);
  expect(after.item.warehouse_qty).toBe(Number(before.item.warehouse_qty) + 5);
  expect(after.item.pending_quantity).toBe(before.item.pending_quantity);
  for (const cell of before.cells) {
    const current = after.cells.find((row: { department: string; status: string }) => row.department === cell.department && row.status === cell.status);
    expect(Number(current.quantity)).toBe(Number(cell.quantity) - (cell.department === "창고" && cell.status === "DEFECTIVE" ? 5 : 0));
    expect(current.pending_quantity).toBe(cell.pending_quantity);
  }
  expect(after.records).toHaveLength(0);
  const restorations = after.logs.filter((log: { transaction_type: string }) => log.transaction_type === "UNMARK_DEFECTIVE");
  expect(restorations).toHaveLength(2);
  expect(new Set(restorations.map((log: { operation_id: string }) => log.operation_id)).size).toBe(1);
  expect(restorations[0].operation_id).toBeTruthy();
  const previewReply = await request.post(`/api/inventory/operations/${restorations[0].operation_id}/cancel/preview`);
  expect(previewReply.ok(), await previewReply.text()).toBeTruthy();
  const inverse = await previewReply.json();
  expect(inverse.defect_records.map((record: { record_id: string }) => record.record_id).sort()).toEqual([first.record_id, second.record_id].sort());
  await expect(page.getByRole("article", { name: `${item.item_name} 격리 기록` })).toHaveCount(0);
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  const bundleRow = page.locator('[data-history-main-row="true"]').filter({ hasText: /정상\s*복귀/, visible: true });
  await expect(bundleRow).toHaveCount(1);
  const primaryId = await bundleRow.getAttribute("data-log-id");
  expect(restorations.map((log: { log_id: string }) => log.log_id)).toContain(primaryId);
  const expand = bundleRow.getByRole("button", { name: /^작업 구성 (펼치기|접기)$/ });
  const controls = await expand.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  if (await expand.getAttribute("aria-expanded") === "false") await expand.click();
  await expect(bundleRow.getByRole("button", { name: "작업 구성 접기", exact: true })).toHaveAttribute("aria-expanded", "true");
  const childRow = page.locator(`[id="${controls}"]`);
  await expect(childRow).toContainText(item.mes_code);
  const secondary = restorations.find((log: { log_id: string }) => log.log_id !== primaryId);
  await childRow.click();
  await expect(page.locator(`[data-history-detail-log-id="${secondary.log_id}"]`)).toBeVisible();
  await bundleRow.click();
  await expect(page.locator(`[data-history-detail-log-id="${primaryId}"]`)).toBeVisible();
  await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
  const cancellation = page.getByTestId("history-cancel-confirmation");
  await expect(cancellation).toContainText("취소할 내역 2건");
  await cancellation.getByRole("textbox", { name: "취소 사유", exact: true }).fill("일괄 복귀 두 원건 원복 검수");
  await cancellation.getByLabel("PIN", { exact: true }).fill("0000");
  const reversed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/inventory/operations/${restorations[0].operation_id}/cancel`));
  await cancellation.getByRole("button", { name: "취소 확정", exact: true }).click();
  expect((await reversed).status()).toBe(200);
  const cancelled = await snapshot(request, item.item_id);
  expect(cancelled.item.warehouse_qty).toBe(before.item.warehouse_qty);
  expect(Number(cancelled.records.find((record: { record_id: string }) => record.record_id === first.record_id).available_quantity)).toBe(2);
  expect(Number(cancelled.records.find((record: { record_id: string }) => record.record_id === second.record_id).available_quantity)).toBe(3);
  expect(cancelled.logs.filter((log: { reverses_log_id: string }) => restorations.some((original: { log_id: string }) => original.log_id === log.reverses_log_id))).toHaveLength(2);
  expect(cancelled.logs.filter((log: { log_id: string }) => restorations.some((original: { log_id: string }) => original.log_id === log.log_id)).every((log: { cancelled: boolean }) => log.cancelled)).toBe(true);
});
