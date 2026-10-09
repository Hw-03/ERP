import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function createItem(request: APIRequestContext, name: string, process = "TR", slot = 1, quantity = 10): Promise<Item> {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: name, process_type_code: process, model_slots: [slot], unit: "EA", initial_quantity: quantity,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function filter(page: Page, index: number, label: string) {
  await page.getByRole("combobox").filter({ visible: true }).nth(index).click();
  await page.getByRole("listbox").getByRole("option", { name: label, exact: true }).click();
}
async function openPicker(page: Page) {
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /^창고 입출고/);
  await page.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).click();
  await clickNextStep(page);
  for (let index = 0; index < 3; index++) await filter(page, index, "전체");
}
async function pick(page: Page, item: Item) {
  await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.mes_code!);
  const response = page.waitForResponse(row => row.url().endsWith("/api/io/preview") && row.request().method() === "POST");
  await page.getByRole("row").filter({ hasText: item.item_name, visible: true }).getByRole("button", { name: "낱개", exact: true }).click();
  expect((await response).status()).toBe(200);
}
async function confirmStep(page: Page) {
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
  await expect(confirm).toBeVisible();
  return confirm;
}
async function submitUi(page: Page) {
  const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
  await confirm.getByRole("button", { name: /^창고 결재 요청/ }).click();
  const response = page.waitForResponse(row => /^\/api\/io\/(?:submit|draft\/[^/]+\/submit)$/.test(new URL(row.url()).pathname) && row.request().method() === "POST");
  await page.getByRole("dialog").getByRole("button", { name: "결재 요청", exact: true }).click();
  const submitted = await response;
  expect(submitted.ok(), await submitted.text()).toBeTruthy();
  const value = await submitted.json();
  await page.getByRole("dialog").getByRole("button", { name: "확인", exact: true }).click();
  return value;
}

test("IO-PICKER 8.1-06 8.2-01/02 전체 모집단·복합 필터·추가 표시·선택 경로·한 오류 진행 차단", async ({ page, request, actors }) => {
  test.setTimeout(180_000);
  const prefix = `작성필터${randomUUID().slice(0, 8)}`;
  const models = await json(request, "/api/models");
  const firstModel = models.find((row: { slot: number }) => row.slot === 1);
  const otherModel = models.find((row: { slot: number; model_name: string }) => row.slot !== 1 && row.model_name);
  expect(otherModel).toBeTruthy();
  const items: Item[] = [];
  for (let index = 0; index < 201; index++) items.push(await createItem(request, `${prefix}-${String(index).padStart(3, "0")}`,
    index === 200 ? "AR" : "TR", index === 200 ? otherModel.slot : 1, index === 0 || index === 200 ? 10 : 0));
  await loginUi(page, actors.requester); await openPicker(page);
  const operator = page.getByRole("button", { name: new RegExp(actors.requester.name) }).filter({ visible: true }).first();
  await expect(operator).toContainText(actors.requester.name);
  await expect(operator).toContainText(actors.requester.department);
  const search = page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true });
  await search.fill(prefix);
  const rows = page.getByRole("row").filter({ hasText: prefix, visible: true });
  await expect(rows).toHaveCount(200);
  const initial = await rows.allTextContents();
  await expect(page.getByRole("button", { name: /100개 더 보기 \(201 \/ 201\)/ })).toBeVisible();
  await page.getByRole("button", { name: /100개 더 보기/ }).click();
  await expect(rows).toHaveCount(201);
  const expanded = await rows.allTextContents();
  expect(expanded.slice(0, 200)).toEqual(initial);
  expect(new Set(expanded.map(text => text.match(new RegExp(`${prefix}-\\d{3}`))?.[0]))).toEqual(new Set(items.map(item => item.item_name)));
  await filter(page, 0, "조립");
  await expect(rows).toHaveCount(1); await expect(rows).toContainText(items[200].item_name);
  await filter(page, 1, firstModel.model_name);
  await expect(rows).toHaveCount(0); await expect(page.getByText("필터에 맞는 품목 없음", { exact: true })).toBeVisible();
  await filter(page, 1, otherModel.model_name); await expect(rows).toHaveCount(1);
  await filter(page, 2, "공정완료"); await expect(rows).toHaveCount(0);
  await filter(page, 2, "원자재"); await expect(rows).toHaveCount(1);
  await expect(search).toHaveValue(prefix);
  for (let index = 0; index < 3; index++) await filter(page, index, "전체");
  await pick(page, items[0]); await pick(page, items[200]);
  await advanceToQuantityStep(page);
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await expect(cart.locator("[data-io-line]")).toHaveCount(2);
  for (const [item, department] of [[items[0], "튜브"], [items[200], "조립"]] as const) {
    const line = cart.locator("[data-io-line]").filter({ hasText: item.item_name });
    await expect(line.locator("[data-io-identity]")).toContainText(item.mes_code!);
    await expect(line.getByRole("spinbutton", { name: "수량", exact: true })).toHaveValue("1");
    await expect(line.locator("[data-io-location]")).toContainText(new RegExp(`창고.*${department}`));
    await expect(line.locator("[data-io-stock]")).toContainText(/가능 재고.*10.*실행 후.*9/);
  }
  const before = await json(request, `/api/items/${items[0].item_id}`);
  const logsBefore = await json(request, `/api/inventory/transactions?item_id=${items[0].item_id}&limit=1000`);
  const quantity = cart.locator("[data-io-line]").filter({ hasText: items[0].item_name }).getByRole("spinbutton", { name: "수량", exact: true });
  await quantity.fill("11"); await quantity.blur();
  await expect(cart).toContainText("부족");
  await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeDisabled();
  expect(await json(request, `/api/items/${items[0].item_id}`)).toEqual(before);
  expect(await json(request, `/api/inventory/transactions?item_id=${items[0].item_id}&limit=1000`)).toEqual(logsBefore);
  await quantity.fill("2"); await quantity.blur();
  await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeEnabled();
});

test("IO-MYREQUEST 8.2-06 상태·품목·수량·경로·메모와 수정 재제출 취소가 실제 요청과 일치", async ({ page, request, actors }) => {
  const item = await createItem(request, `내요청검수${randomUUID().slice(0, 8)}`);
  await loginUi(page, actors.requester); await openPicker(page); await pick(page, item); await advanceToQuantityStep(page);
  const confirm = await confirmStep(page);
  await confirm.getByPlaceholder("작업 메모").fill("원본 요청 메모");
  const created = await submitUi(page);
  expect(created.stock_request_id).toBeTruthy();
  await page.getByRole("tab", { name: "내 요청", exact: true }).click();
  const original = page.locator(`[data-stock-request-id="${created.stock_request_id}"]`);
  await expect(original).toContainText(item.item_name); await expect(original).toContainText(item.mes_code!);
  await expect(original).toContainText("원본 요청 메모"); await expect(original).toContainText(/창고.*튜브/);
  await expect(original).toContainText("대기");
  await expect(original).toContainText("이동 1개");
  expect((await json(request, `/api/stock-requests/${created.stock_request_id}`)).lines[0].quantity).toBe(1);
  await original.getByRole("button", { name: "수정", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "요청 수정 — PIN 확인" });
  await edit.getByPlaceholder("PIN", { exact: true }).fill("0000");
  await edit.getByRole("button", { name: "수정 시작", exact: true }).click();
  const quantity = page.locator("[data-io-cart]").filter({ visible: true }).getByRole("spinbutton", { name: "수량", exact: true });
  await expect(quantity).toHaveValue("1");
  await quantity.fill("2"); await quantity.blur();
  const revised = await confirmStep(page);
  await expect(revised.getByPlaceholder("작업 메모")).toHaveValue("원본 요청 메모");
  await revised.getByPlaceholder("작업 메모").fill("수정 요청 메모");
  const resubmitted = await submitUi(page);
  expect(resubmitted.stock_request_id).toBeTruthy();
  const stored = await json(request, `/api/stock-requests/${resubmitted.stock_request_id}`);
  expect(stored.notes).toContain("수정 요청 메모"); expect(stored.lines[0].quantity).toBe(2);
  expect(stored.requester_employee_id).toBe(actors.requester.employee_id);
  expect(stored.lines[0]).toMatchObject({ item_id: item.item_id, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" });
  await page.getByRole("tab", { name: "내 요청", exact: true }).click();
  const current = page.locator(`[data-stock-request-id="${resubmitted.stock_request_id}"]`);
  await expect(current).toContainText("수정 요청 메모"); await expect(current).toContainText("이동 2개");
  await current.getByRole("button", { name: "요청 취소", exact: true }).click();
  const cancel = page.getByRole("dialog", { name: "요청 취소 — PIN 확인" });
  await cancel.getByPlaceholder("PIN", { exact: true }).fill("0000");
  await cancel.getByRole("button", { name: "요청 취소", exact: true }).click();
  await expect(cancel).not.toBeVisible(); await expect(current).toContainText("취소");
  await expect(current.getByRole("button", { name: "수정", exact: true })).toHaveCount(0);
  expect((await json(request, `/api/stock-requests/${resubmitted.stock_request_id}`)).status.toLowerCase()).toBe("cancelled");
  const stock = await json(request, `/api/items/${item.item_id}`);
  expect(stock.warehouse_qty).toBe(10); expect(stock.pending_quantity).toBe(0);
});

test("IO-STALE-DRAFT 8.1-03 빈 초안의 새 요청 진입과 복원 후 바뀐 현재 재고 재검증", async ({ page, request, actors }) => {
  const item = await createItem(request, `초안최신재고${randomUUID().slice(0, 8)}`, "TR", 1, 1);
  await loginUi(page, actors.requester); await gotoWarehouseCompose(page);
  await page.getByRole("tab", { name: /^작성 중/ }).click();
  const empty = page.getByTestId("warehouse-empty-work-area");
  await expect(empty).toContainText("작업 중인 요청이 없습니다.");
  await empty.getByRole("button", { name: "요청 작성", exact: true }).click();
  await expect(page.getByRole("button", { name: /^창고 입출고/ }).filter({ visible: true })).toBeVisible();
  await openPicker(page); await pick(page, item); await advanceToQuantityStep(page);
  const confirm = await confirmStep(page);
  await confirm.getByPlaceholder("작업 메모").fill("재고가 바뀌기 전 저장");
  const saved = page.waitForResponse(response => response.url().endsWith("/api/io/draft") && response.request().method() === "PUT");
  await confirm.getByRole("button", { name: "저장", exact: true }).click();
  const draft = await (await saved).json();
  expect(draft.bundles[0].lines[0].quantity).toBe(1);
  await page.getByRole("tab", { name: /^작성 중/ }).click();
  const submitted = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept",
    lines: [{ item_id: item.item_id, quantity: 1, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" }],
  } });
  expect(submitted.status()).toBe(201);
  const consumed = await submitted.json();
  expect((await request.post(`/api/stock-requests/${consumed.request_id}/approve`, { data: {
    actor_employee_id: actors.approver.employee_id, pin: "0000",
  } })).status()).toBe(200);
  const before = await json(request, `/api/items/${item.item_id}`);
  const logs = await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  expect(before.warehouse_qty).toBe(0);
  await page.reload();
  await page.getByRole("row").filter({ hasText: item.item_name, visible: true }).getByRole("button", { name: "이어서 작업", exact: true }).click();
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await expect(cart.locator("[data-io-identity]")).toContainText(item.mes_code!);
  await expect(cart.getByRole("spinbutton", { name: "수량", exact: true })).toHaveValue("1");
  await expect(cart.locator("[data-io-stock]")).toContainText(/가능 재고.*0/);
  await expect(cart).toContainText("부족");
  await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeDisabled();
  expect(await json(request, `/api/items/${item.item_id}`)).toEqual(before);
  expect(await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(logs);
});
