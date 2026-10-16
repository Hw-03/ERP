import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";
import { gotoWarehouseCompose } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };

async function createItem(request: APIRequestContext, name: string, process: string, quantity = 0): Promise<Item> {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: name, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: quantity,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function currentItem(request: APIRequestContext, item: Item): Promise<Item> {
  const response = await request.get(`/api/items/${item.item_id}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("IO-CONVERSION-CANDIDATES 8.16-08/09 전체 원본·대상 후보와 후반부 검색·선택 유지·원본 변경 초기화", async ({ page, request, actors }) => {
  test.setTimeout(180_000);
  const family = `전환모집단${randomUUID().slice(0, 8)}`;
  const items: Item[] = [];
  for (let index = 0; index < 201; index++) {
    items.push(await createItem(request, `${family}-AF-${String(index).padStart(3, "0")}`, "AF", index === 200 ? 5 : 0));
  }
  const assemblySource = await createItem(request, `${family}-AA-원본`, "AA", 5);
  const assemblyTarget = await createItem(request, `${family}-AA-대상`, "AA");
  const raw = await createItem(request, `${family}-원자재`, "AR");
  const deleted = await createItem(request, `${family}-삭제`, "AF");
  const removed = await request.patch(`/api/items/${deleted.item_id}/soft-delete`, { headers: ADMIN });
  expect(removed.ok(), await removed.text()).toBeTruthy();
  const source = items[200];
  const target = items[199];
  const before = await Promise.all([source, target, assemblySource, assemblyTarget].map(item => currentItem(request, item)));

  await loginUi(page, actors.approver);
  await gotoWarehouseCompose(page);
  await page.getByTestId("warehouse-item-conversion-card").click();
  const sourceSearch = page.getByTestId("item-conversion-source-search");
  const sourceRows = page.getByTestId(/^item-conversion-source-option-/).filter({ hasText: family });
  await sourceSearch.fill(family);
  await expect(sourceRows).toHaveCount(203);
  expect(new Set(await sourceRows.evaluateAll(rows => rows.map(row => row.getAttribute("data-testid"))))).toEqual(new Set(
    [...items, assemblySource, assemblyTarget].map(item => `item-conversion-source-option-${item.item_id}`),
  ));
  await expect(page.getByTestId(`item-conversion-source-option-${raw.item_id}`)).toHaveCount(0);
  await expect(page.getByTestId(`item-conversion-source-option-${deleted.item_id}`)).toHaveCount(0);
  await expect(page.getByTestId("item-conversion-target-guide")).toContainText("기존 품목을 선택하세요");
  await sourceSearch.fill(source.mes_code!);
  await expect(sourceRows).toHaveCount(1);
  const selectedSource = page.getByTestId(`item-conversion-source-option-${source.item_id}`);
  await selectedSource.click();
  await expect(sourceSearch).toHaveValue("");
  await expect(sourceRows).toHaveCount(203);
  await expect(selectedSource).toHaveAttribute("aria-pressed", "true");
  await expect(selectedSource).toBeInViewport();

  const targetSearch = page.getByTestId("item-conversion-target-search");
  const targetRows = page.getByTestId(/^item-conversion-target-option-/).filter({ hasText: family });
  await expect(targetRows).toHaveCount(200);
  expect(new Set(await targetRows.evaluateAll(rows => rows.map(row => row.getAttribute("data-testid"))))).toEqual(new Set(
    items.filter(item => item.item_id !== source.item_id).map(item => `item-conversion-target-option-${item.item_id}`),
  ));
  for (const excluded of [source, assemblySource, assemblyTarget, raw, deleted]) {
    await expect(page.getByTestId(`item-conversion-target-option-${excluded.item_id}`)).toHaveCount(0);
  }
  await targetSearch.fill(target.mes_code!);
  await expect(targetRows).toHaveCount(1);
  const selectedTarget = page.getByTestId(`item-conversion-target-option-${target.item_id}`);
  await expect(selectedTarget).toContainText("0 EA");
  await selectedTarget.click();
  await expect(targetSearch).toHaveValue("");
  await expect(targetRows).toHaveCount(200);
  await expect(selectedTarget).toHaveAttribute("aria-pressed", "true");
  await expect(selectedTarget).toBeInViewport();
  await expect(page.getByTestId("item-conversion-next-button")).toBeEnabled();

  await sourceSearch.fill(assemblySource.mes_code!);
  await page.getByTestId(`item-conversion-source-option-${assemblySource.item_id}`).click();
  await expect(page.getByTestId(`item-conversion-source-option-${assemblySource.item_id}`)).toHaveAttribute("aria-pressed", "true");
  await expect(targetRows).toHaveCount(1);
  await expect(targetRows).toContainText(assemblyTarget.item_name);
  await expect(targetRows).toHaveAttribute("aria-pressed", "false");
  await expect(selectedTarget).toHaveCount(0);
  await expect(targetSearch).toHaveValue("");
  await expect(page.getByTestId("item-conversion-selection-hint")).toHaveText("대상 품목을 선택하세요");
  await expect(page.getByTestId("item-conversion-next-button")).toBeDisabled();
  expect(await Promise.all([source, target, assemblySource, assemblyTarget].map(item => currentItem(request, item)))).toEqual(before);
});
