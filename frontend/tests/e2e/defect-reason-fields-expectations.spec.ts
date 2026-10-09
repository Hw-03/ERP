import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { DefectLocation, Item, TransactionLog } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function create(request: APIRequestContext): Promise<Item> {
  const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: `사유필드${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 20,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test("DEFECT-REASON-FIELDS 8.6-09/8.10-04/8.13-07 실제 카테고리 단독 격리·복귀·폐기·반품은 없는 메모를 만들지 않는다", async ({ page, request, actors }) => {
  const item = await create(request);
  const quarantined = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 4,
    source: "warehouse", target_dept: "창고", reason_category: "외관 불량",
  } });
  expect(quarantined.status(), await quarantined.text()).toBe(200);
  const origin = (await read<DefectLocation[]>(request, "/api/defects/locations")).find(row => row.item_id === item.item_id)!;
  expect(origin.reason_category).toBe("외관 불량");
  expect(origin.reason_memo || null).toBeNull();
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).click();
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
  const grouped = page.getByTestId("defect-item-group-summary").filter({ hasText: item.item_name, visible: true });
  await expect.poll(async () => await grouped.count() + await page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true }).count()).toBeGreaterThan(0);
  if (await grouped.count() && await grouped.getAttribute("aria-expanded") !== "true") await grouped.getByRole("button", { name: /격리/ }).click();
  const record = page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true });
  await expect(record.getByTestId("defect-reason-summary")).toContainText("외관 불량");
  await expect(record.getByText("메모 없음", { exact: true })).toBeVisible();
  await expect(record.getByTestId("defect-reason-summary")).not.toContainText("메모 없음");

  const restored = await request.post("/api/defects/unquarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, record_id: origin.record_id,
    dept: "창고", qty: 1, reason_category: "검사 통과",
  } });
  expect(restored.status(), await restored.text()).toBe(200);
  const supplierReply = await request.post("/api/suppliers", { data: {
    requester_employee_id: actors.approver.employee_id, name: `사유필드업체${randomUUID().slice(0, 8)}`,
  } });
  expect(supplierReply.status(), await supplierReply.text()).toBe(201);
  const supplier = await supplierReply.json();
  const returned = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "defect_return", supplier_id: supplier.supplier_id,
    reason_category: "외관 불량",
    lines: [{ record_id: origin.record_id, item_id: item.item_id, quantity: 1, from_bucket: "defective", from_department: "창고", to_bucket: "none" }],
  } });
  expect(returned.status(), await returned.text()).toBe(201);
  expect((await returned.json()).status).toBe("completed");
  const scrapped = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "scrap_normal", reason_category: "외관 불량",
    lines: [{ item_id: item.item_id, quantity: 1, from_bucket: "warehouse", to_bucket: "none" }],
  } });
  expect(scrapped.status(), await scrapped.text()).toBe(201);
  expect((await scrapped.json()).status).toBe("completed");
  const logs = (await read<TransactionLog[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`))
    .filter(log => ["MARK_DEFECTIVE", "UNMARK_DEFECTIVE", "DEFECT_SCRAP", "SUPPLIER_RETURN"].includes(log.transaction_type));
  expect(logs).toHaveLength(4);
  expect(logs.every(log => Boolean(log.reason_category) && !log.reason_memo)).toBe(true);
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  for (const log of logs) {
    const row = page.locator(`[data-log-id="${log.log_id}"]`).filter({ visible: true }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("메모", { exact: true })).toHaveCount(0);
    await row.click();
    const detail = page.locator(`[data-history-detail-log-id="${log.log_id}"]`).filter({ visible: true });
    await expect(detail.getByText("불량 사유", { exact: true }).locator("..")).toContainText(log.reason_category!);
    await expect(detail.getByText("메모", { exact: true })).toHaveCount(0);
  }
  expect((await read<Item>(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(16);
  expect(Number((await read<DefectLocation[]>(request, "/api/defects/locations")).find(row => row.record_id === origin.record_id)!.available_quantity)).toBe(2);
});

test("DEFECT-REASON-LEGACY 8.6-09/8.10-04/8.13-07 읽기 전용 과거 메모 단독 투영은 사유를 만들어 중복 표시하지 않는다", async ({ page, request, actors }) => {
  const item = await create(request);
  const memo = `과거 단독메모${randomUUID().slice(0, 8)}`;
  const quarantined = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 2,
    source: "warehouse", target_dept: "창고", reason_category: "외관 불량", reason_memo: memo,
  } });
  expect(quarantined.status(), await quarantined.text()).toBe(200);
  const origin = (await read<DefectLocation[]>(request, "/api/defects/locations")).find(row => row.item_id === item.item_id)!;
  const supplierReply = await request.post("/api/suppliers", { data: {
    requester_employee_id: actors.approver.employee_id, name: `과거메모업체${randomUUID().slice(0, 8)}`,
  } });
  expect(supplierReply.status(), await supplierReply.text()).toBe(201);
  const supplier = await supplierReply.json();
  const returned = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "defect_return", supplier_id: supplier.supplier_id,
    reason_category: "외관 불량", reason_memo: memo,
    lines: [{ record_id: origin.record_id, item_id: item.item_id, quantity: 1, from_bucket: "defective", from_department: "창고", to_bucket: "none" }],
  } });
  expect(returned.status(), await returned.text()).toBe(201);
  expect((await returned.json()).status).toBe("completed");
  const beforeItem = await read<Item>(request, `/api/items/${item.item_id}`);
  const beforeOrigins = await read<DefectLocation[]>(request, "/api/defects/locations");
  const beforeLogs = await read<TransactionLog[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  const log = beforeLogs.find(row => row.transaction_type === "MARK_DEFECTIVE")!;
  expect(log.reason_category).toBe("외관 불량");
  expect(log.reason_memo).toBe(memo);
  // Only GET responses for this fixture are projected; the server retains the valid submitted category.
  function legacyView(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(legacyView);
    if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      const projected = Object.fromEntries(Object.entries(row).map(([key, child]) => [key, legacyView(child)]));
      if (row.item_id === item.item_id && (row.log_id === log.log_id || row.reason_memo === memo)) {
        return { ...projected, reason_category: null, reason_category_id: null };
      }
      return projected;
    }
    return value;
  }
  await page.route("**/api/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET" || !(pathname === "/api/defects/locations" || pathname.startsWith("/api/inventory/transactions"))) {
      await route.continue(); return;
    }
    const response = await route.fetch();
    if (!response.ok()) { await route.fulfill({ response }); return; }
    await route.fulfill({ response, json: legacyView(await response.json()) });
  });
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).click();
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
  const grouped = page.getByTestId("defect-item-group-summary").filter({ hasText: item.item_name, visible: true });
  await expect.poll(async () => await grouped.count() + await page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true }).count()).toBeGreaterThan(0);
  if (await grouped.count() && await grouped.getAttribute("aria-expanded") !== "true") await grouped.getByRole("button", { name: /격리/ }).click();
  const record = page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true });
  await expect(record.getByTestId("defect-reason-summary")).toContainText("격리 사유미입력");
  await expect(record.getByTestId("defect-reason-summary")).not.toContainText(memo);
  await expect(record.getByText(memo, { exact: true })).toHaveCount(1);
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  const legacyLogs = beforeLogs.filter(entry => ["MARK_DEFECTIVE", "SUPPLIER_RETURN"].includes(entry.transaction_type));
  expect(legacyLogs).toHaveLength(2);
  for (const entry of legacyLogs) {
    const row = page.locator(`[data-log-id="${entry.log_id}"]`).filter({ visible: true }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("사유", { exact: true })).toHaveCount(0);
    await row.click();
    const detail = page.locator(`[data-history-detail-log-id="${entry.log_id}"]`).filter({ visible: true });
    await expect(detail.getByText("불량 사유", { exact: true })).toHaveCount(0);
    await expect(detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
    await expect(detail.getByText(memo, { exact: true })).toHaveCount(1);
  }
  expect(await read<Item>(request, `/api/items/${item.item_id}`)).toEqual(beforeItem);
  expect(await read<DefectLocation[]>(request, "/api/defects/locations")).toEqual(beforeOrigins);
  expect(await read<TransactionLog[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(beforeLogs);
});
