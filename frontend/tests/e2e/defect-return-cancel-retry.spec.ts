import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { DefectLocation, Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function state(request: APIRequestContext, itemId: string) {
  return {
    item: await read<Item>(request, `/api/items/${itemId}`),
    cells: await read(request, `/api/inventory/locations/${itemId}`),
    records: (await read<DefectLocation[]>(request, "/api/defects/locations")).filter((row) => row.item_id === itemId),
    logs: await read<{ log_id: string; operation_id: string; transaction_type: string; supplier_name_snapshot: string; cancelled: boolean; reverses_log_id: string | null }[]>(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`),
  };
}

test.use({ trace: "retain-on-failure" });

test("PC-DELTA-DEFECT-06 실제 반품취소 성공응답 유실 뒤 stale 확인 재시도는 원건만 복구하고 역거래를 중복하지 않는다", async ({ page, request, actors }) => {
  const suffix = randomUUID().slice(0, 8);
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: `반품취소재시도${suffix}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 10,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const item = await created.json() as Item;
  const quarantine = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 2, source: "warehouse", target_dept: "창고", reason_category: "외관 불량", reason_memo: "취소 재시도 원건",
  } });
  expect(quarantine.status(), await quarantine.text()).toBe(200);
  const origin = (await state(request, item.item_id)).records[0];
  const beforeReturn = await state(request, item.item_id);
  const supplier = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name: `반품당시업체${suffix}` } });
  expect(supplier.status(), await supplier.text()).toBe(201);
  const vendor = await supplier.json() as { supplier_id: string; name: string };
  // Prepare the completed original through the real API; all cancellation/retry actions below use the UI.
  const returned = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, client_request_id: `defect-return:${randomUUID()}`, request_type: "defect_return",
    supplier_id: vendor.supplier_id, reason_category: "외관 불량", reason_memo: "독립 반품 원건",
    lines: [{ item_id: item.item_id, record_id: origin.record_id, quantity: 1, from_bucket: "defective", from_department: "창고", to_bucket: "none" }],
  } });
  expect(returned.status(), await returned.text()).toBe(201);
  const afterReturn = await state(request, item.item_id);
  const original = afterReturn.logs.find((row) => row.transaction_type === "SUPPLIER_RETURN");
  expect(original?.operation_id).toBeTruthy();
  const renamed = await request.patch(`/api/suppliers/${vendor.supplier_id}`, { data: { requester_employee_id: actors.approver.employee_id, name: `${vendor.name}현재` } });
  expect(renamed.status(), await renamed.text()).toBe(200);
  await loginUi(page, actors.requester);
  const readSnapshots = new Map<string, unknown>();
  // Keep actual pre-cancellation read responses to deterministically retain a stale confirmation.
  // The cancellation POST and its retry always reach the real server.
  await page.route("**/api/inventory/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method !== "GET" && !url.endsWith("/cancel/preview")) { await route.continue(); return; }
    if (readSnapshots.has(url)) { await route.fulfill({ status: 200, json: readSnapshots.get(url) }); return; }
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBeTruthy();
    readSnapshots.set(url, await response.json());
    await route.fulfill({ response });
  });
  const cancelUrl = `**/api/inventory/operations/${original!.operation_id}/cancel`;
  const responses: number[] = [];
  await page.route(cancelUrl, async (route) => {
    const response = await route.fetch();
    responses.push(response.status());
    if (responses.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  try {
    await page.goto("/mes?tab=history");
    await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
    await page.locator(`[data-log-id="${original!.log_id}"]`).filter({ visible: true }).first().click();
    await expect(page.getByTestId("history-key-point-summary")).toContainText(vendor.name);
    await expect(page.getByTestId("history-key-point-summary")).not.toContainText(`${vendor.name}현재`);
    await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
    await page.getByRole("textbox", { name: "취소 사유", exact: true }).fill("연결 유실 재시도 원복 확인");
    await page.getByLabel("PIN", { exact: true }).fill("0000");
    await page.getByRole("button", { name: "취소 확정", exact: true }).click();
    await expect.poll(() => responses).toEqual([200]);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("취소 처리 여부를 확인한 뒤 다시 시도");
    const cancelled = await state(request, item.item_id);
    expect(cancelled.item.warehouse_qty).toBe(beforeReturn.item.warehouse_qty);
    expect(cancelled.cells).toEqual(beforeReturn.cells);
    expect(Number(cancelled.records.find((row) => row.record_id === origin.record_id)?.available_quantity)).toBe(2);
    expect(cancelled.logs.filter((row) => row.reverses_log_id === original!.log_id)).toHaveLength(1);
    expect(cancelled.logs.find((row) => row.log_id === original!.log_id)?.cancelled).toBe(true);
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect.poll(() => responses).toEqual([200, 409]);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("취소 미리보기 이후 재고 또는 예약 상태가 변경되었습니다");
    expect(await state(request, item.item_id)).toEqual(cancelled);
    expect(cancelled.logs.find((row) => row.reverses_log_id === original!.log_id)?.supplier_name_snapshot).toBe(vendor.name);
  } finally {
    await page.unroute(cancelUrl);
    await page.unroute("**/api/inventory/**");
  }
  await page.reload();
  await page.locator(`[data-log-id="${original!.log_id}"]`).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "이 내역 취소", exact: true })).toHaveCount(0);
});
