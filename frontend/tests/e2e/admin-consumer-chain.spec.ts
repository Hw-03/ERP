import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";
import type { Item, Supplier } from "../../lib/api";

const adminHeaders = (actors: CommonActors) => ({ "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code });
async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), `${url}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function unlockAdmin(page: Page, section: string): Promise<void> {
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: section, exact: true }).click();
}
async function suppliers(page: Page, direction: "입고" | "출고" = "입고"): Promise<void> {
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /^원자재 입출고/);
  await page.getByRole("button", { name: direction, exact: true }).filter({ visible: true }).click();
  await clickNextStep(page);
  await expect(page.getByPlaceholder("업체명을 입력하세요").filter({ visible: true })).toBeVisible();
}

test.use({ trace: "retain-on-failure" });

test("8.19-03 관리자 모델 연결 변경은 열린 재고 필터·품목 코드·모델 연결 수에 같은 기준", async ({ page, context, request, actors }) => {
  const models = await read<{ slot: number; symbol: string; model_name: string }[]>(request, "/api/models");
  const first = models.find((model) => model.slot === 1)!;
  const second = models.find((model) => model.slot === 2)!;
  const created = await request.post("/api/items", { headers: adminHeaders(actors), data: {
    item_name: `모델연결${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [first.slot], initial_quantity: 5,
  } });
  expect(created.status()).toBe(201);
  const createdItem: Item = await created.json();
  const item = await read<Item>(request, `/api/items/${createdItem.item_id}`);
  const before = await read<Item[]>(request, "/api/items?limit=2000");
  const beforeCount = before.filter((row) => row.model_slots.includes(second.slot)).length;
  const observer = await context.newPage();
  try {
    await loginUi(observer, actors.other);
    await observer.getByRole("textbox", { name: "자재 검색", exact: true }).fill(item.item_name);
    await observer.locator('button[aria-controls="inventory-filter-panel"]').click();
    const filters = observer.locator("#inventory-filter-panel");
    await filters.getByRole("button", { name: second.model_name, exact: true }).click();
    const inventoryRow = observer.locator("tr[role=button]").filter({ hasText: item.item_name, visible: true });
    await expect(inventoryRow).toHaveCount(0);
    await loginUi(page, actors.approver);
    await unlockAdmin(page, "품목 관리");
    const row = page.locator(`[data-item-id="${item.item_id}"]`);
    if (await row.getAttribute("aria-selected") !== "true") await row.click();
    await page.getByRole("button", { name: `${first.model_name} (${first.symbol})`, exact: true }).click();
    await page.getByRole("button", { name: `${second.model_name} (${second.symbol})`, exact: true }).click();
    await expect(page.locator("[aria-readonly]")).toHaveText(`${second.symbol}-TR-${String(item.serial_no).padStart(4, "0")}`);
    const write = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}`) && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await write).status()).toBe(200);
    const current = await read<Item>(request, `/api/items/${item.item_id}`);
    expect(current.model_slots).toEqual([second.slot]);
    expect(current.warehouse_qty).toBe(item.warehouse_qty);
    expect(current.mes_code).toBe(`${second.symbol}-TR-${String(item.serial_no).padStart(4, "0")}`);
    await expect(inventoryRow).toBeVisible({ timeout: 30_000 });
    await expect(inventoryRow).toContainText(current.mes_code!);
    await observer.getByRole("textbox", { name: "자재 검색", exact: true }).fill("");
    await observer.getByRole("textbox", { name: "자재 검색", exact: true }).fill(item.item_name);
    await filters.getByRole("button", { name: second.model_name, exact: true }).click();
    await filters.getByRole("button", { name: first.model_name, exact: true }).click();
    await expect(inventoryRow).toHaveCount(0);
    await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "모델 관리", exact: true }).click();
    const modelRow = page.getByRole("grid", { name: "모델 목록" }).getByRole("row").filter({ hasText: second.model_name });
    if (await modelRow.getAttribute("aria-selected") !== "true") await modelRow.click();
    await expect(page.getByText("연결 품목 수", { exact: true }).locator("..").locator("div").nth(1)).toHaveText(String(beforeCount + 1));
    const after = await read<Item[]>(request, "/api/items?limit=2000");
    expect(after.filter((entry) => entry.model_slots.includes(second.slot))).toHaveLength(beforeCount + 1);
  } finally { await observer.close(); }
});

test("PC-DELTA-SUPPLIER-01 실제 업체 생성·정렬·이름수정·숨김·복원은 후보와 당시 내역을 구분", async ({ page, request, actors }) => {
  const suffix = randomUUID().slice(0, 8);
  const names = [`ZuluQA${suffix}`, `AlphaQA${suffix}`, `하늘QA${suffix}`, `가람QA${suffix}`];
  for (const name of names) {
    const response = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name } });
    expect(response.status(), await response.text()).toBe(201);
  }
  await loginUi(page, actors.approver);
  await suppliers(page);
  const picker = page.getByRole("region", { name: "공급업체 검색·선택", exact: true }).filter({ visible: true });
  const search = picker.getByPlaceholder("업체명을 입력하세요");
  await search.fill(suffix);
  const listed = picker.getByRole("listitem");
  await expect(listed).toHaveCount(4);
  expect(await listed.locator("button:first-child").allTextContents()).toEqual([names[1], names[0], names[3], names[2]]);
  const originalName = `BetaQA${suffix}`;
  await search.fill(originalName);
  const adding = page.waitForResponse((response) => response.url().endsWith("/api/suppliers") && response.request().method() === "POST");
  await picker.getByRole("button", { name: "추가하고 선택", exact: true }).click();
  const supplier: Supplier = await (await adding).json();
  await expect(picker.getByRole("button", { name: `${originalName} 선택됨`, exact: true })).toBeVisible();
  const itemResponse = await request.post("/api/items", { headers: adminHeaders(actors), data: {
    item_name: `업체당시${suffix}`, process_type_code: "TR", model_slots: [1], initial_quantity: 0,
  } });
  expect(itemResponse.status()).toBe(201);
  const item: Item = await itemResponse.json();
  const receipt = await request.post("/api/io/submit", { data: {
    requester_employee_id: actors.approver.employee_id, work_type: "receive", sub_type: "receive_supplier", supplier_id: supplier.supplier_id,
    client_request_id: randomUUID(), bundles: [{ bundle_id: randomUUID(), source_kind: "direct_item", source_item_id: item.item_id, title: item.item_name, quantity: 1,
      lines: [{ line_id: randomUUID(), item_id: item.item_id, item_name: item.item_name, direction: "in", from_bucket: "none", to_bucket: "warehouse", quantity: 1, origin: "direct" }] }],
  } });
  expect(receipt.status(), await receipt.text()).toBe(201);
  const logs = await read<{ log_id: string; supplier_name_snapshot: string }[]>(request, `/api/inventory/transactions?item_id=${item.item_id}`);
  expect(logs[0].supplier_name_snapshot).toBe(originalName);
  await picker.getByRole("button", { name: `${originalName} 이름 수정`, exact: true }).click();
  const changedName = `GammaQA${suffix}`;
  await picker.getByRole("textbox", { name: `${originalName} 이름 수정`, exact: true }).fill(changedName);
  await picker.getByRole("button", { name: "이름 저장", exact: true }).click();
  await search.fill(changedName);
  await expect(picker.getByRole("button", { name: `${changedName} 선택됨`, exact: true })).toBeVisible();
  await picker.getByRole("button", { name: `${changedName} 숨김`, exact: true }).click();
  await expect(picker.getByRole("button", { name: changedName, exact: true })).toHaveCount(0);
  await picker.getByRole("button", { name: "숨김 업체 관리", exact: true }).click();
  await expect(picker.getByRole("button", { name: new RegExp(`^${changedName}\\s*숨김$`) })).toBeDisabled();
  await picker.getByRole("button", { name: `${changedName} 복원`, exact: true }).click();
  await picker.getByRole("button", { name: "숨김 업체 닫기", exact: true }).click();
  await expect(picker.getByRole("button", { name: changedName, exact: true })).toBeEnabled();
  await picker.getByRole("button", { name: changedName, exact: true }).click();
  await expect(picker.getByRole("button", { name: `${changedName} 선택됨`, exact: true })).toBeVisible();
  expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(logs);
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  await page.locator(`[data-log-id="${logs[0].log_id}"]`).first().click();
  await expect(page.locator(`[data-history-detail-log-id="${logs[0].log_id}"]`).filter({ visible: true })).toContainText(originalName);
});

test("PC-DELTA-MATERIAL-01 실제 출고 초안·확인·제출과 잘못된 PIN 거부·한번 취소는 같은 재고", async ({ page, request, actors }) => {
  const suffix = randomUUID().slice(0, 8);
  const supplierResponse = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name: `수령업체${suffix}` } });
  expect(supplierResponse.status()).toBe(201);
  const supplier: Supplier = await supplierResponse.json();
  const created = await request.post("/api/items", { headers: adminHeaders(actors), data: {
    item_name: `원자재출고${suffix}`, process_type_code: "TR", model_slots: [1], initial_quantity: 7,
    sales_review_required: true, bom_stock_exempt: true,
  } });
  expect(created.status()).toBe(201);
  const item: Item = await created.json();
  const before = await read(request, `/api/items/${item.item_id}`);
  const originalLogs = await read<{ log_id: string }[]>(request, `/api/inventory/transactions?item_id=${item.item_id}`);
  await loginUi(page, actors.approver);
  await suppliers(page, "출고");
  const picker = page.getByRole("region", { name: "공급업체 검색·선택", exact: true }).filter({ visible: true });
  await picker.getByPlaceholder("업체명을 입력하세요").fill(supplier.name);
  await picker.getByRole("button", { name: supplier.name, exact: true }).click();
  await clickNextStep(page);
  const filters = page.getByRole("combobox").filter({ visible: true });
  await expect(filters).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    await filters.nth(index).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  }
  await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.item_name);
  await page.getByRole("row").filter({ hasText: item.item_name, visible: true }).getByRole("button", { name: "선택", exact: true }).click();
  await advanceToQuantityStep(page);
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await cart.getByRole("spinbutton").first().fill("2");
  await expect(cart.getByRole("spinbutton").first()).toHaveValue("2");
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  const confirmation = page.locator("[data-io-confirm]").filter({ visible: true });
  await expect(confirmation).toContainText(item.item_name);
  await expect(confirmation).toContainText(item.mes_code!);
  await confirmation.getByPlaceholder("사급·샘플 등 출고 사유를 입력하세요").fill("샘플 발송 검수");
  const draftWrite = page.waitForResponse((response) => response.url().endsWith("/api/io/draft") && response.request().method() === "PUT");
  await confirmation.getByRole("button", { name: "저장", exact: true }).click();
  const draft = await (await draftWrite).json();
  expect(draft).toMatchObject({ status: "draft", sub_type: "outbound_supplier", supplier_id: supplier.supplier_id, notes: "샘플 발송 검수" });
  expect(draft.bundles[0].lines[0].quantity).toBe(2);
  expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
  expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(originalLogs);
  await page.getByRole("tab", { name: /^작성 중/ }).filter({ visible: true }).click();
  const draftRow = page.getByRole("row").filter({ hasText: item.item_name, visible: true });
  await draftRow.getByRole("button", { name: "이어서 작업", exact: true }).click();
  await expect(cart.getByRole("spinbutton").first()).toHaveValue("2");
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  await expect(confirmation.getByPlaceholder("사급·샘플 등 출고 사유를 입력하세요")).toHaveValue("샘플 발송 검수");
  await confirmation.getByRole("button", { name: /즉시 반영하기/ }).click();
  const commitDialog = page.getByRole("dialog", { name: /원자재 출고를 진행하시겠습니까/ });
  await expect(commitDialog).toContainText(supplier.name);
  await expect(commitDialog).toContainText("샘플 발송 검수");
  const committed = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/io/draft/${draft.batch_id}/submit` && response.request().method() === "POST");
  await commitDialog.getByRole("button", { name: "즉시 반영", exact: true }).click();
  const commitResult = await committed;
  expect(commitResult.status(), await commitResult.text()).toBe(201);
  await expect(page.getByRole("dialog", { name: /입출고 반영 완료/ })).toBeVisible();
  const after = await read<Item>(request, `/api/items/${item.item_id}`);
  expect(after.warehouse_qty).toBe(5);
  const logs = await read<{ log_id: string; operation_id: string | null; transaction_type: string; supplier_name_snapshot: string; quantity_change: number }[]>(request, `/api/inventory/transactions?item_id=${item.item_id}`);
  const outbound = logs.filter((log) => log.transaction_type === "MATERIAL_OUT");
  expect(outbound).toHaveLength(1);
  expect(outbound[0].operation_id).toBeTruthy();
  expect(outbound[0]).toMatchObject({ quantity_change: -2, supplier_name_snapshot: supplier.name });
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  await page.locator(`[data-log-id="${outbound[0].log_id}"]`).first().click();
  const detail = page.locator(`[data-history-detail-log-id="${outbound[0].log_id}"]`).filter({ visible: true });
  await expect(detail).toContainText(supplier.name);
  const panel = page.getByRole("complementary", { name: item.item_name, exact: true }).filter({ visible: true });
  await panel.getByRole("button", { name: "이 내역 취소", exact: true }).click();
  await page.getByRole("textbox", { name: "취소 사유", exact: true }).fill("출고 취소 검수");
  await page.getByLabel("PIN", { exact: true }).fill("1111");
  await page.getByRole("button", { name: "취소 확정", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("PIN");
  expect((await read<Item>(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(5);
  expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(logs);
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(async () => (await read<Item>(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(7);
  const cancelled = await read<{ reverses_log_id?: string }[]>(request, `/api/inventory/transactions?item_id=${item.item_id}`);
  expect(cancelled.filter((log) => log.reverses_log_id === outbound[0].log_id)).toHaveLength(1);
  await expect(panel.getByRole("button", { name: "이 내역 취소", exact: true })).toHaveCount(0);
  const repeated = await request.post(`/api/inventory/transactions/${outbound[0].log_id}/cancel`, { data: { employee_code: actors.approver.employee_code, pin: "0000", reason: "반복 취소" } });
  expect(repeated.status()).toBe(422);
  expect(await repeated.text()).toContain("이미 취소된 작업입니다.");
  expect((await read<Item>(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(7);
  expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(cancelled);
});
