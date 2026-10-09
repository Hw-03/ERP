import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi, changeEmployee } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

const ADMIN = { "X-Admin-Pin": "0000" };
async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function create(request: APIRequestContext, name: string, process: string, quantity = 0): Promise<Item> {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: name, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: quantity,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function filter(page: Page, index: number, value: string): Promise<void> {
  await page.getByRole("combobox").filter({ visible: true }).nth(index).click();
  await page.getByRole("listbox").getByRole("option", { name: value, exact: true }).click();
}
async function receipt(page: Page, supplier: string): Promise<void> {
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /^원자재 입출고/);
  await page.getByRole("button", { name: "입고", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("대상 부서", { exact: true })).toHaveCount(0);
  await clickNextStep(page);
  await page.getByPlaceholder("업체명을 입력하세요").filter({ visible: true }).fill(supplier);
  await page.getByRole("button", { name: "추가하고 선택", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: `${supplier} 선택됨`, exact: true })).toBeVisible();
  await clickNextStep(page);
  await expect(page.getByRole("button", { name: /수량 조정/ }).and(page.locator('button:not([data-testid="io-step-nav-item"])')).filter({ visible: true })).toBeDisabled();
  for (let index = 0; index < 3; index++) await filter(page, index, "전체");
}

test.use({ trace: "retain-on-failure" });

test("8.17-02 원자재 입고 부서필터는 후보만 바꾸고 선택품·창고위치·수량을 보존한다", async ({ page, request, actors }) => {
  const suffix = randomUUID().slice(0, 8);
  const raw = await create(request, `원자재필터${suffix}`, "TR", 10);
  const assemblyRaw = await create(request, `조립원자재필터${suffix}`, "AR");
  const employee = await changeEmployee(request, actors.requester, { warehouse_role: "primary" });
  const before = await read<Item>(request, `/api/items/${raw.item_id}`);
  await loginUi(page, employee);
  await receipt(page, `입고필터업체${suffix}`);
  const search = page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true });
  await search.fill(raw.mes_code!);
  const row = page.getByRole("row").filter({ hasText: raw.item_name, visible: true });
  const previewed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/io/preview"));
  await row.getByRole("button", { name: "선택", exact: true }).click();
  const preview = await previewed;
  expect(preview.status(), await preview.text()).toBe(200);
  const result = await preview.json();
  expect(result.bundles[0].lines[0]).toMatchObject({ item_id: raw.item_id, from_bucket: "none", to_bucket: "warehouse", to_department: null });
  await filter(page, 0, "조립");
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("button", { name: /수량 조정/ }).and(page.locator('button:not([data-testid="io-step-nav-item"])')).filter({ visible: true })).toBeEnabled();
  await search.fill(assemblyRaw.mes_code!);
  await expect(page.getByRole("row").filter({ hasText: assemblyRaw.item_name, visible: true })).toHaveCount(1);
  await advanceToQuantityStep(page);
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await expect(cart.locator("[data-io-line]")).toHaveCount(1);
  await expect(cart).toContainText(raw.item_name);
  await expect(cart).not.toContainText(assemblyRaw.item_name);
  await expect(cart.getByLabel("입고 위치: 창고", { exact: true })).toBeVisible();
  await expect(cart.getByRole("combobox")).toHaveCount(0);
  await expect(cart.getByRole("spinbutton", { name: "수량", exact: true })).toHaveValue("1");
  await expect(cart.locator("[data-io-stock]")).toContainText(/창고 수량.*10.*실행 후.*11/);
  expect(await read<Item>(request, `/api/items/${raw.item_id}`)).toEqual(before);
});

test("8.17-03 현재 전체 공정의 원자재만 선택하고 공정·조립·일반분류·삭제와 선택후분류변경은 진행을 막는다", async ({ page, request, actors }) => {
  test.setTimeout(120_000);
  const family = `입고후보${randomUUID().slice(0, 8)}`;
  const processes = await read<{ code: string }[]>(request, "/api/codes/process-types");
  const items: Item[] = [];
  for (const process of processes) items.push(await create(request, `${family}-${process.code}`, process.code));
  const rawItems = items.filter((item) => item.process_type_code?.endsWith("R"));
  const excluded = items.filter((item) => !item.process_type_code?.endsWith("R"));
  expect(rawItems.some((item) => item.process_type_code === "AR")).toBe(true);
  expect(excluded.some((item) => item.process_type_code === "AF")).toBe(true);
  const ordinary = await create(request, `${family}-일반분류`, "TF");
  expect((await request.put(`/api/items/${ordinary.item_id}`, { headers: ADMIN, data: { legacy_item_type: "일반" } })).status()).toBe(200);
  const deleted = await create(request, `${family}-삭제`, "TR");
  expect((await request.patch(`/api/items/${deleted.item_id}/soft-delete`, { headers: ADMIN })).status()).toBe(200);
  const employee = await changeEmployee(request, actors.requester, { warehouse_role: "primary" });
  await loginUi(page, employee);
  await receipt(page, `${family}-업체`);
  const search = page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true });
  await search.fill(family);
  const rows = page.getByRole("row").filter({ hasText: family, visible: true });
  await expect(rows).toHaveCount(rawItems.length);
  for (const item of rawItems) await expect(rows.filter({ hasText: item.item_name })).toBeVisible();
  for (const item of [...excluded, ordinary, deleted]) {
    await search.fill(item.mes_code!);
    await expect(page.getByRole("row").filter({ hasText: item.item_name, visible: true })).toHaveCount(0);
    await expect(page.getByText("필터에 맞는 품목 없음", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /수량 조정/ }).and(page.locator('button:not([data-testid="io-step-nav-item"])')).filter({ visible: true })).toBeDisabled();
  }
  const selected = rawItems.find((item) => item.process_type_code === "TR")!;
  await search.fill(selected.mes_code!);
  const previewed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/io/preview"));
  await page.getByRole("row").filter({ hasText: selected.item_name, visible: true }).getByRole("button", { name: "선택", exact: true }).click();
  expect((await previewed).status()).toBe(200);
  await expect(page.getByRole("button", { name: /수량 조정/ }).and(page.locator('button:not([data-testid="io-step-nav-item"])')).filter({ visible: true })).toBeEnabled();
  expect((await request.put(`/api/items/${selected.item_id}`, { headers: ADMIN, data: { process_type_code: "TF" } })).status()).toBe(200);
  await expect(page.getByRole("row").filter({ hasText: selected.item_name, visible: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /수량 조정/ }).and(page.locator('button:not([data-testid="io-step-nav-item"])')).filter({ visible: true })).toBeDisabled();
  expect(await read<unknown[]>(request, `/api/inventory/transactions?item_id=${selected.item_id}&limit=1000`)).toEqual([]);
});
