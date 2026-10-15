import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";
import { readSeed } from "./_helpers";

async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("DEFECT-HISTORY 8.5-10/11 8.6-07/08 8.13-03/12/13 격리·복귀·반품·취소의 실제 숫자쌍·처리자·시각·사유와 연결", async ({ page, request, actors }) => {
  const seed = await read(request, `/api/items/${readSeed().rawItem.item_id}`);
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: `불량이력쌍${randomUUID().slice(0, 8)}`, process_type_code: seed.process_type_code,
    model_slots: seed.model_slots, unit: "EA", initial_quantity: 20,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const item = await created.json();
  const quarantined = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 2,
    source: "warehouse", target_dept: "창고", reason_category: "외관 불량", reason_memo: "격리 독립 메모",
  } });
  expect(quarantined.status(), await quarantined.text()).toBe(200);
  const origin = (await read(request, "/api/defects/locations")).find((row: { item_id: string }) => row.item_id === item.item_id);
  const restored = await request.post("/api/defects/unquarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, record_id: origin.record_id,
    dept: "창고", qty: 1, reason_category: "외관 불량", reason_memo: "복귀 독립 메모",
  } });
  expect(restored.status(), await restored.text()).toBe(200);
  const supplierReply = await request.post("/api/suppliers", { data: {
    requester_employee_id: actors.approver.employee_id, name: `이력쌍업체${randomUUID().slice(0, 8)}`,
  } });
  expect(supplierReply.status(), await supplierReply.text()).toBe(201);
  const supplier = await supplierReply.json();
  const returned = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "defect_return", supplier_id: supplier.supplier_id,
    reason_category: "외관 불량", reason_memo: "반품 독립 메모",
    lines: [{ record_id: origin.record_id, item_id: item.item_id, quantity: 1, from_bucket: "defective", from_department: "창고", to_bucket: "none" }],
  } });
  expect(returned.status(), await returned.text()).toBe(201);
  expect((await returned.json()).status).toBe("completed");
  const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  const quarantineLog = logs.find((log: { transaction_type: string }) => log.transaction_type === "MARK_DEFECTIVE");
  const restoreLog = logs.find((log: { transaction_type: string }) => log.transaction_type === "UNMARK_DEFECTIVE");
  const returnLog = logs.find((log: { transaction_type: string }) => log.transaction_type === "SUPPLIER_RETURN");
  expect(quarantineLog).toBeTruthy();
  expect(restoreLog).toBeTruthy();
  expect(returnLog).toBeTruthy();
  await loginUi(page, actors.requester);
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  for (const step of [
    { log: quarantineLog, label: "불량 격리", normal: "20 -2→18", defective: "0 +2→2", memo: "격리 독립 메모" },
    { log: restoreLog, label: "정상 복귀", normal: "18 +1→19", defective: "2 -1→1", memo: "복귀 독립 메모" },
    { log: returnLog, label: "반품", normal: null, defective: "1 -1→0", memo: "반품 독립 메모" },
  ]) {
    const row = page.locator(`[data-log-id="${step.log.log_id}"]`).filter({ visible: true }).first();
    await expect(row).toContainText(step.label);
    await expect(row).toContainText(item.item_name);
    await expect(row).toContainText(actors.requester.name);
    await expect(row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`불량 ${step.defective}`.replace(/[+]/g, "\\+").replace(/-/g, "[−-]")));
    if (step.normal) await expect(row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`창고 ${step.normal}`.replace(/[+]/g, "\\+").replace(/-/g, "[−-]")));
    else await expect(row.getByLabel(/재고 변동:/)).not.toHaveAttribute("aria-label", /창고|부서/);
    const instant = step.log.requested_at ?? step.log.created_at;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(/[Z]|[+]\d{2}:?\d{2}$/.test(instant) ? instant : `${instant}Z`)).map((part) => [part.type, part.value]));
    await expect(row).toContainText(`${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`);
    await row.click();
    const detail = page.locator(`[data-history-detail-log-id="${step.log.log_id}"]`).filter({ visible: true });
    const summary = detail.getByTestId("history-key-point-summary");
    await expect(summary).toContainText(step.label);
    await expect(summary.getByTestId("history-participant-row").filter({ hasText: actors.requester.name }).first()).toContainText(actors.requester.name);
    await expect(summary).toContainText(`${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}시 ${parts.minute}분`);
    const impactGroups = summary.getByRole("button", { name: /^(창고|불량) 재고 ·/ });
    if (step.normal) await expect(impactGroups).toHaveCount(2);
    else await expect.poll(async () => await impactGroups.count() + await summary.getByLabel(`불량 재고 ${step.defective} EA`, { exact: true }).count()).toBeGreaterThan(0);
    for (const group of await impactGroups.all()) {
      if (await group.getAttribute("aria-expanded") === "false") await group.click();
      await expect(group).toHaveAttribute("aria-expanded", "true");
    }
    await expect(summary.getByLabel(`불량 재고 ${step.defective} EA`, { exact: true })).toBeVisible();
    if (step.normal) await expect(summary.getByLabel(`창고 재고 ${step.normal} EA`, { exact: true })).toBeVisible();
    else await expect(summary.getByLabel(/창고 재고 .*→/)).toHaveCount(0);
    await expect(detail.getByText("불량 사유", { exact: true }).locator("..")).toContainText("외관 불량");
    await expect(detail.getByText("메모", { exact: true }).locator("..")).toContainText(step.memo);
  }
  await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
  await page.getByRole("textbox", { name: "취소 사유", exact: true }).fill("반품 원건 숫자쌍 원복");
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "취소 확정", exact: true }).click();
  await expect.poll(async () => (await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).filter((log: { reverses_log_id: string }) => log.reverses_log_id === returnLog.log_id).length).toBe(1);
  const afterLogs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  const reversal = afterLogs.find((log: { reverses_log_id: string }) => log.reverses_log_id === returnLog.log_id);
  const original = afterLogs.find((log: { log_id: string }) => log.log_id === returnLog.log_id);
  expect(original).toMatchObject({ cancelled: true, operation_id: returnLog.operation_id, quantity_before: returnLog.quantity_before, quantity_after: returnLog.quantity_after, reason_memo: returnLog.reason_memo });
  expect((await read(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(19);
  expect(Number((await read(request, "/api/defects/locations")).find((row: { record_id: string }) => row.record_id === origin.record_id).available_quantity)).toBe(1);
  const cancelledRow = page.locator(`[data-log-id="${reversal.log_id}"]`).filter({ visible: true }).first();
  const preservedRow = page.locator(`[data-log-id="${returnLog.log_id}"]`).filter({ visible: true }).first();
  await expect(preservedRow).toBeVisible();
  await expect(preservedRow).toHaveAttribute("data-history-cancelled", "true");
  await expect(cancelledRow).toContainText("반품 취소");
  await expect(cancelledRow.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /불량 0 \+1→1/);
  await cancelledRow.click();
  const cancelDetail = page.locator(`[data-history-detail-log-id="${reversal.log_id}"]`).filter({ visible: true });
  const cancelSummary = cancelDetail.getByTestId("history-key-point-summary");
  const cancelGroup = cancelSummary.getByRole("button", { name: /^불량 재고 ·/ });
  await expect.poll(async () => await cancelGroup.count() + await cancelSummary.getByLabel("불량 재고 0 +1→1 EA", { exact: true }).count()).toBeGreaterThan(0);
  if (await cancelGroup.count() && await cancelGroup.getAttribute("aria-expanded") === "false") await cancelGroup.click();
  await expect(cancelDetail.getByTestId("history-key-point-summary").getByLabel("불량 재고 0 +1→1 EA", { exact: true })).toBeVisible();
  await cancelDetail.getByRole("button", { name: "원래 작업 보기", exact: true }).click();
  const originalDetail = page.locator(`[data-history-detail-log-id="${returnLog.log_id}"]`).filter({ visible: true });
  await expect(originalDetail).toBeVisible();
  await expect(originalDetail.getByTestId("history-key-point-summary")).toContainText("취소됨");
  await originalDetail.getByRole("button", { name: "취소 작업 보기", exact: true }).click();
  await expect(cancelDetail).toBeVisible();
  await expect(cancelDetail.getByTestId("history-key-point-summary")).toContainText("반품 취소");
});
