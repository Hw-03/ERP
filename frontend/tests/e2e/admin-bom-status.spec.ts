import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

async function item(request: APIRequestContext, id: string): Promise<Item> {
  const response = await request.get(`/api/items/${id}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
function stock(value: Item) {
  return { warehouse: value.warehouse_qty, production: value.production_total, defective: value.defective_total,
    reserved: value.pending_quantity, locations: value.locations };
}
async function open(page: Page): Promise<void> {
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "BOM 관리", exact: true }).click();
  await page.getByRole("button", { name: /미배치 원자재/ }).click();
}

test.use({ trace: "retain-on-failure" });

test("PC-DELTA-BOMUNMATCHED-01 실제 상태 저장·재진입·분류복원과 저장실패 이전 선택을 보존한다", async ({ page, request, actors }) => {
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code }, data: {
    item_name: `미배치검수${randomUUID().slice(0, 8)}`, process_type_code: "AR", model_slots: [1], initial_quantity: 5, legacy_item_type: "원자재",
  } });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).item_id;
  const before = await item(request, id);
  const logs = await (await request.get(`/api/inventory/transactions?item_id=${id}`)).json();
  await loginUi(page, actors.approver);
  await open(page);
  const status = (label: string) => page.getByRole("checkbox", { name: `${before.item_name} (${before.mes_code}) ${label}`, exact: true });
  for (const [label, value] of [["보류", "HOLD"], ["중복", "DUPLICATE"], ["불용", "DISUSED"], ["불용", null]] as const) {
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/items/${id}/bom-unmatched-status`) && response.request().method() === "PATCH");
    await status(label).click();
    expect((await saved).status()).toBe(200);
    await expect(status(label)).toBeChecked({ checked: value !== null });
    const current = await item(request, id);
    expect(current.bom_unmatched_status).toBe(value);
    expect(current.legacy_item_type).toBe(value === "DISUSED" ? "불용" : before.legacy_item_type);
    expect(stock(current)).toEqual(stock(before));
    expect(await (await request.get(`/api/inventory/transactions?item_id=${id}`)).json()).toEqual(logs);
    await open(page);
    await expect(status(label)).toBeChecked({ checked: value !== null });
  }
  await status("보류").click();
  await expect(status("보류")).toBeChecked();
  const held = await item(request, id);
  expect(held.bom_unmatched_status).toBe("HOLD");
  const endpoint = `**/api/items/${id}/bom-unmatched-status`;
  // Only the failed response is injected. Every successful state is written to the real fixture API.
  await page.route(endpoint, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "미배치 상태 저장 검수 실패" }) }));
  await status("중복").click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("미배치 상태 저장 검수 실패");
  await expect(status("보류")).toBeChecked();
  await expect(status("중복")).not.toBeChecked();
  await expect(status("중복")).toBeEnabled();
  expect(await item(request, id)).toEqual(held);
  expect(await (await request.get(`/api/inventory/transactions?item_id=${id}`)).json()).toEqual(logs);
  await page.unroute(endpoint);
  const retry = page.waitForResponse((response) => response.url().endsWith(`/api/items/${id}/bom-unmatched-status`) && response.request().method() === "PATCH");
  await status("중복").click();
  expect((await retry).status()).toBe(200);
  await expect(status("중복")).toBeChecked();
  expect((await item(request, id)).bom_unmatched_status).toBe("DUPLICATE");
  expect(stock(await item(request, id))).toEqual(stock(before));
});
