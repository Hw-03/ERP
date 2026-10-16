import { randomUUID } from "crypto";
import type { APIRequestContext, Dialog, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

const headers = (actors: CommonActors) => ({ "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code });

async function makeItem(request: APIRequestContext, actors: CommonActors, process: string, initialLocations: { department: string; quantity: number }[] = []): Promise<Item> {
  const response = await request.post("/api/items", { headers: headers(actors), data: {
    item_name: `플래그검수${process}${randomUUID().slice(0, 8)}`, process_type_code: process, model_slots: [1],
    initial_quantity: initialLocations.reduce((total, entry) => total + entry.quantity, 0), initial_locations: initialLocations,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function bom(request: APIRequestContext, actors: CommonActors, parent: Item, child: Item): Promise<void> {
  const response = await request.post("/api/bom", { headers: headers(actors), data: { parent_item_id: parent.item_id, child_item_id: child.item_id, quantity: 1, unit: "EA" } });
  expect(response.status(), await response.text()).toBe(201);
}
async function toggle(page: Page, item: Item, flag: "영업 확인 필요" | "BOM 재고 미반영", checked: boolean): Promise<void> {
  const discardDraft = async (dialog: Dialog): Promise<void> => {
    expect(dialog.type()).toBe("beforeunload");
    await dialog.accept();
  };
  page.on("dialog", discardDraft);
  try { await page.goto("/mes?tab=admin"); }
  finally { page.off("dialog", discardDraft); }
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "품목 관리", exact: true }).click();
  const row = page.locator(`[data-item-id="${item.item_id}"]`);
  if (await row.getAttribute("aria-selected") !== "true") await row.click();
  const checkbox = page.getByRole("checkbox", { name: flag, exact: true });
  await checkbox.setChecked(checked);
  await expect(checkbox).toBeChecked({ checked });
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saved).status()).toBe(200);
}
async function step(page: Page, number: number): Promise<void> {
  await page.getByTestId("shipping-wizard-next").click();
  await expect(page.getByTestId(`shipping-wizard-step-${number}`)).toBeVisible();
}

test.use({ trace: "retain-on-failure" });

test("8.19-06 관리자 영업 확인 ON/OFF는 실제 출하 2·5단계의 표시를 바꾼다", async ({ page, request, actors }) => {
  const component = await makeItem(request, actors, "PR");
  const pa = await makeItem(request, actors, "PA");
  const pf = await makeItem(request, actors, "PF");
  await bom(request, actors, pa, component);
  await bom(request, actors, pf, pa);
  await loginUi(page, actors.approver);
  for (const checked of [true, false]) {
    await toggle(page, component, "영업 확인 필요", checked);
    await page.goto("/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
    await page.getByTestId("shipping-pf-search").fill(pf.item_name);
    await page.getByTestId(`shipping-pf-option-${pf.item_id}`).click();
    await step(page, 2);
    const editor = page.locator(`[data-bom-line-child="${component.item_id}"]`);
    await expect(editor).toHaveAttribute("data-sales-review", String(checked));
    await expect(editor.getByText("영업 확인", { exact: true })).toHaveCount(checked ? 1 : 0);
    await step(page, 3);
    await step(page, 4);
    await step(page, 5);
    const final = page.getByTestId(`shipping-final-line-pa-${component.item_id}`);
    await expect(final).toHaveAttribute("data-sales-review", String(checked));
    await expect(final.getByText("영업 확인", { exact: true })).toHaveCount(checked ? 1 : 0);
    await expect(page.getByTestId("shipping-submit-request")).toBeEnabled();
  }
  expect(await (await request.get(`/api/inventory/transactions?item_id=${component.item_id}`)).json()).toEqual([]);
});

test("8.19-06 관리자 BOM 미반영 ON/OFF는 실제 자동 생산의 자식 표시와 소비 수량을 바꾼다", async ({ page, request, actors }) => {
  const child = await makeItem(request, actors, "TR", [{ department: "튜브", quantity: 5 }]);
  const parent = await makeItem(request, actors, "AF");
  await bom(request, actors, parent, child);
  const initialLogs: { log_id: string; quantity_change: number }[] = await (await request.get(`/api/inventory/transactions?item_id=${child.item_id}`)).json();
  expect(initialLogs).toHaveLength(1);
  expect(initialLogs[0].quantity_change).toBe(5);
  const initialLogIds = new Set(initialLogs.map((log) => log.log_id));
  const initial: Item = await (await request.get(`/api/items/${child.item_id}`)).json();
  expect(initial.production_total).toBe(5);
  expect(initial.warehouse_qty).toBe(0);
  await loginUi(page, actors.approver);
  for (const checked of [true, false]) {
    await toggle(page, child, "BOM 재고 미반영", checked);
    await gotoWarehouseCompose(page);
    await pickWorkType(page, /부서 입출고/);
    await page.getByRole("button", { name: "생산 입고", exact: true }).filter({ visible: true }).click();
    await clickNextStep(page);
    const filters = page.getByRole("combobox").filter({ visible: true });
    for (let index = 0; index < await filters.count(); index++) {
      await filters.nth(index).click();
      await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    }
    await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(parent.item_name);
    await page.getByRole("row").filter({ hasText: parent.item_name, visible: true }).getByRole("button", { name: "BOM", exact: true }).click();
    await advanceToQuantityStep(page);
    const bundle = page.getByRole("button", { name: new RegExp(`${parent.item_name}.*기준 수량`) }).filter({ visible: true });
    if (await bundle.getAttribute("aria-expanded") !== "true") await bundle.locator("[data-io-identity]").click({ position: { x: 4, y: 4 } });
    const childRow = page.locator("li").filter({ has: page.getByText(child.item_name, { exact: true }), visible: true });
    await expect(childRow.getByText("BOM 재고 미반영", { exact: true })).toHaveCount(checked ? 1 : 0);
    if (checked) await expect(childRow.getByRole("button", { name: "BOM 재고 미반영 항목", exact: true })).toBeDisabled();
    else await expect(childRow.getByRole("button", { name: "재고 반영 변경", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: /즉시 반영하기/ }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog", { name: /진행하시겠습니까/ });
    const submitted = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/io/submit" && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "즉시 반영", exact: true }).click();
    const response = await submitted;
    expect(response.status(), await response.text()).toBe(201);
    await expect(page.getByRole("dialog", { name: /입출고 반영 완료/ })).toBeVisible();
    const current: Item = await (await request.get(`/api/items/${child.item_id}`)).json();
    expect(current.production_total).toBe(checked ? 5 : 4);
    const logs: { log_id: string; quantity_change: number }[] = await (await request.get(`/api/inventory/transactions?item_id=${child.item_id}`)).json();
    expect(logs.filter((log) => initialLogIds.has(log.log_id))).toEqual(initialLogs);
    const consumptionLogs = logs.filter((log) => !initialLogIds.has(log.log_id));
    expect(consumptionLogs.map((log) => log.quantity_change)).toEqual(checked ? [] : [-1]);
    const produced: Item = await (await request.get(`/api/items/${parent.item_id}`)).json();
    expect(produced.production_total).toBe(checked ? 1 : 2);
  }
});
