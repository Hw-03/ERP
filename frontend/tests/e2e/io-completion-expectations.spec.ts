import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, changeEmployee } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType, readSeed } from "./_helpers";

async function read(request: APIRequestContext, url: string) {
  const reply = await request.get(url);
  expect(reply.ok(), await reply.text()).toBeTruthy();
  return reply.json();
}
async function fixture(request: APIRequestContext) {
  const seed = await read(request, `/api/items/${readSeed().rawItem.item_id}`);
  const reply = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: `입출고완료${randomUUID().slice(0, 8)}`, process_type_code: seed.process_type_code,
    model_slots: seed.model_slots, legacy_item_type: "원자재", unit: "EA", initial_quantity: 27,
    initial_locations: [{ department: "튜브", quantity: 7 }],
  } });
  expect(reply.status(), await reply.text()).toBe(201);
  return reply.json();
}
async function allFilters(page: Page) {
  const filters = page.getByRole("combobox").filter({ visible: true });
  await expect(filters).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    await filters.nth(index).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  }
}
async function confirmation(page: Page) {
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
  await expect(confirm).toBeVisible();
  return confirm;
}

test("IO-RAW-COMPLETE 8.17-02/04/05/07 원자재 입고는 부서 선택 없이 창고 즉시 완료·현재/후 수량·실제 이력이 일치", async ({ page, request, actors }) => {
  const item = await fixture(request);
  const employee = await changeEmployee(request, actors.requester, { warehouse_role: "primary" });
  const before = await read(request, `/api/items/${item.item_id}`);
  expect(before.warehouse_qty).toBe(20);
  expect(before.production_total).toBe(7);
  await loginUi(page, employee);
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /^원자재 입출고/);
  await page.getByRole("button", { name: "입고", exact: true }).filter({ visible: true }).click();
  await clickNextStep(page);
  const supplierName = `즉시입고업체${randomUUID().slice(0, 8)}`;
  await page.getByPlaceholder("업체명을 입력하세요").filter({ visible: true }).fill(supplierName);
  await page.getByRole("button", { name: "추가하고 선택", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: `${supplierName} 선택됨`, exact: true })).toBeVisible();
  await clickNextStep(page);
  await allFilters(page);
  await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.mes_code);
  const preview = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith("/api/io/preview"));
  await page.getByRole("row").filter({ hasText: item.item_name, visible: true }).getByRole("button", { name: "선택", exact: true }).click();
  expect((await preview).status()).toBe(200);
  await advanceToQuantityStep(page);
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await expect(cart.locator("[data-io-stock]")).toContainText(/창고 수량.*20.*실행 후.*21/);
  expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
  await cart.getByRole("spinbutton").fill("0");
  await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeDisabled();
  expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
  await cart.getByRole("spinbutton").fill("1");
  const confirm = await confirmation(page);
  await expect(confirm).toContainText(item.item_name);
  await expect(confirm).toContainText("즉시 재고 반영");
  await expect(confirm).toContainText("창고 권한으로 즉시 입고");
  await expect(confirm).not.toContainText(/부서 결재|BOM/);
  await expect(confirm.getByRole("button", { name: /결재 요청/ })).toHaveCount(0);
  const memo = `창고 입고 ${randomUUID().slice(0, 8)}`;
  await confirm.getByPlaceholder("작업 메모").fill(memo);
  await confirm.getByRole("button", { name: /^즉시 반영하기/ }).click();
  const dialog = page.getByRole("dialog", { name: /원자재 입고를 진행하시겠습니까/ });
  await expect(dialog).not.toContainText(/부서 결재|BOM/);
  const submitted = page.waitForResponse(reply => reply.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(reply.url()).pathname));
  await dialog.getByRole("button", { name: "즉시 반영", exact: true }).click();
  const reply = await submitted;
  expect(reply.status(), await reply.text()).toBe(201);
  const result = await reply.json();
  expect(result.requires_approval).toBe(false);
  expect(result.status).toBe("completed");
  const done = page.getByRole("dialog", { name: /창고 입고 완료/ });
  await expect(done).toBeVisible();
  await expect(done).not.toContainText(/부서 결재|BOM|승인 대기|결재 요청/);
  const after = await read(request, `/api/items/${item.item_id}`);
  expect(after.warehouse_qty).toBe(Number(before.warehouse_qty) + 1);
  expect(after.production_total).toBe(before.production_total);
  expect(after.defective_total).toBe(before.defective_total);
  const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  const log = logs.find((row: { operation_batch_id: string }) => row.operation_batch_id === result.batch.batch_id);
  expect(log).toBeTruthy();
  expect(log.warehouse_qty_before).toBe(20);
  expect(log.warehouse_qty_after).toBe(21);
  await done.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  const history = page.locator(`[data-log-id="${log.log_id}"]`).filter({ visible: true }).first();
  await expect(history).toContainText("원자재 입고");
  await expect(history).toContainText(item.item_name);
  await expect(history).toContainText(employee.name);
  await expect(history.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /창고 20 \+1→21/);
  await history.click();
  const detail = page.getByTestId("history-key-point-summary").filter({ visible: true });
  const impactGroups = detail.getByRole("button", { name: /^창고 재고 ·/ });
  await expect.poll(async () => await impactGroups.count() + await detail.getByLabel("창고 재고 20 +1→21 EA", { exact: true }).count()).toBeGreaterThan(0);
  for (const group of await impactGroups.all()) {
    if (await group.getAttribute("aria-expanded") === "false") await group.click();
    await expect(group).toHaveAttribute("aria-expanded", "true");
  }
  await expect(detail.getByLabel("창고 재고 20 +1→21 EA", { exact: true })).toBeVisible();
  await expect(detail.getByTestId("history-participant-row").first()).toContainText(employee.name);
  const selectedDetail = page.locator(`[data-history-detail-log-id="${log.log_id}"]`).filter({ visible: true });
  await expect(selectedDetail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
});

for (const row of [
  { title: "창고정 반출", role: "primary", direction: "창고 → 부서", done: true, warehouseAfter: 19, departmentAfter: 8 },
  { title: "창고부 반입", role: "deputy", direction: "부서 → 창고", done: true, warehouseAfter: 21, departmentAfter: 6 },
  { title: "일반 반출", role: "none", direction: "창고 → 부서", done: false, warehouseAfter: 20, departmentAfter: 7 },
  { title: "일반 반입", role: "none", direction: "부서 → 창고", done: false, warehouseAfter: 20, departmentAfter: 7 },
]) {
  test(`IO-COMPLETION 8.14-07 ${row.title} 완료·대기 문구는 실제 승인상태와 같은 위치 수량을 표시한다`, async ({ page, request, actors }) => {
    const item = await fixture(request);
    const employee = await changeEmployee(request, actors.requester, { warehouse_role: row.role });
    const before = await read(request, `/api/items/${item.item_id}`);
    expect(before.warehouse_qty).toBe(20);
    expect(before.production_total).toBe(7);
    let requestId: string | null = null;
    try {
      await loginUi(page, employee);
      await gotoWarehouseCompose(page);
      await pickWorkType(page, /^창고 입출고/);
      await page.getByRole("button", { name: new RegExp(row.direction) }).filter({ visible: true }).click();
      await clickNextStep(page);
      await allFilters(page);
      await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.mes_code);
      const preview = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith("/api/io/preview"));
      await page.getByRole("row").filter({ hasText: item.item_name, visible: true }).getByRole("button", { name: "낱개", exact: true }).click();
      expect((await preview).status()).toBe(200);
      await advanceToQuantityStep(page);
      const confirm = await confirmation(page);
      await confirm.getByPlaceholder("작업 메모").fill(`정확한 ${row.title} 상태 검수`);
      await expect(confirm).toContainText(row.done ? "자동 승인 후 즉시 반영" : "창고 결재 필요");
      if (row.done) await expect(confirm.getByRole("button", { name: /결재 요청/ })).toHaveCount(0);
      await confirm.getByRole("button", { name: row.done ? /^자동 승인 후 즉시 반영/ : /^창고 결재 요청/ }).click();
      const dialog = page.getByRole("dialog");
      const submitted = page.waitForResponse(reply => reply.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(reply.url()).pathname));
      await dialog.getByRole("button", { name: row.done ? "자동 승인 후 즉시 반영" : "결재 요청", exact: true }).click();
      const reply = await submitted;
      expect(reply.status(), await reply.text()).toBe(201);
      const result = await reply.json();
      requestId = result.stock_request_id;
      expect(requestId).toBeTruthy();
      expect(result.requires_approval).toBe(!row.done);
      expect((await read(request, `/api/stock-requests/${requestId}`)).status).toBe(row.done ? "completed" : "reserved");
      const done = page.getByRole("dialog", { name: row.done ? /입출고 반영 완료/ : /창고 결재 요청 완료/ });
      await expect(done).toBeVisible();
      if (row.done) {
        await expect(done).toContainText("자동 승인되어 입출고가 반영되었습니다");
        await expect(done).not.toContainText(/승인 대기|결재 요청/);
      } else await expect(done).toContainText(/결재 요청|승인 대기/);
      const after = await read(request, `/api/items/${item.item_id}`);
      expect(after.warehouse_qty).toBe(row.warehouseAfter);
      expect(Number(after.locations.find((cell: { department: string; status: string }) => cell.department === "튜브" && cell.status === "PRODUCTION").quantity)).toBe(row.departmentAfter);
      expect(after.defective_total).toBe(before.defective_total);
      if (!row.done) expect(after.quantity).toBe(before.quantity);
    } finally {
      if (requestId && !row.done) await request.post(`/api/stock-requests/${requestId}/cancel`, { data: { actor_employee_id: employee.employee_id, pin: "0000" } });
    }
  });
}
