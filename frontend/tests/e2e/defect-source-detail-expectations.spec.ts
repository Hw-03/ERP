import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };

async function read(request: APIRequestContext, url: string): Promise<unknown> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

/** Keep warehouse, owning department and another department deliberately distinct. */
async function fixture(request: APIRequestContext): Promise<Item> {
  const family = `출처대조${randomUUID().slice(0, 8)}`;
  const parts: Item[] = [];
  for (const [index, process] of ["AA", "AR"].entries()) {
    const response = await request.post("/api/items", { headers: ADMIN, data: {
      item_name: `${family}-${index}`, process_type_code: process, model_slots: [1], unit: "EA",
      initial_quantity: index === 0 ? 24 : 0,
      initial_locations: index === 0 ? [{ department: "조립", quantity: 7 }, { department: "고압", quantity: 6 }] : [],
    } });
    expect(response.status(), await response.text()).toBe(201);
    parts.push(await response.json());
  }
  const bom = await request.post("/api/bom", { headers: ADMIN, data: {
    parent_item_id: parts[0].item_id, child_item_id: parts[1].item_id, quantity: 1,
  } });
  expect(bom.ok(), await bom.text()).toBeTruthy();
  return parts[0];
}

async function inspectDetail(page: Page, item: Item): Promise<{ visible: boolean; quantities: (string | null)[] }> {
  await page.getByRole("searchbox", { name: "자재 검색", exact: true }).or(page.getByRole("textbox", { name: "자재 검색", exact: true })).fill(item.item_name);
  await page.locator("tr[role=button]").filter({ hasText: item.item_name }).click();
  const detail = page.getByRole("dialog", { name: new RegExp(item.item_name) });
  await detail.waitFor({ state: "visible" });
  const locations = detail.locator("section").filter({ has: page.getByText("위치별 재고", { exact: true }) });
  const quantities: (string | null)[] = [];
  for (const department of ["창고", "조립", "고압"]) {
    quantities.push(await locations.getByText(department, { exact: true }).locator("..").textContent());
  }
  const visible = await detail.isVisible();
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  return { visible, quantities };
}

for (const scenario of [
  { action: "격리 등록", source: "warehouse" },
  { action: "격리 등록", source: "production" },
  { action: "즉시 폐기", source: "warehouse" },
  { action: "즉시 폐기", source: "production" },
  { action: "즉시 재작업", source: "production" },
]) {
  test(`DEFECT-SOURCE-DETAIL 8.5-03/8.7-03/8.8-01 ${scenario.action} ${scenario.source} 실제 품목 상세와 선택 표의 위치별 가용량 왕복 대조`, async ({ page, request, actors }) => {
    const item = await fixture(request);
    const before = await read(request, `/api/items/${item.item_id}`);
    const beforeLogs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
    await loginUi(page, actors.requester);
    const firstDetail = await inspectDetail(page, item);
    expect(firstDetail).toEqual({ visible: true, quantities: ["창고11", "조립7", "고압6"] });
    await page.getByRole("navigation").getByRole("button", { name: "불량 격리·폐기·반품 처리", exact: true }).click();
    await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
    const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
    await choices.getByRole("button", { name: new RegExp(`^${scenario.action}`) }).click();
    if (scenario.action !== "즉시 재작업") {
      await choices.getByRole("button", { name: new RegExp(`^${scenario.source === "warehouse" ? "창고 재고" : "부서 재고"}`) }).click();
    }
    const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
    await picker.getByRole("combobox").first().click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code!);
    await expect(picker.getByRole("columnheader", { name: scenario.source === "warehouse" ? "창고 가용" : "부서 가용", exact: true })).toBeVisible();
    const row = picker.getByTestId(`defect-picker-row-${item.item_id}`);
    await expect(row.getByRole("cell").nth(2)).toHaveText(scenario.source === "warehouse" ? "11" : "7");
    await expect(row).toContainText(item.item_name);
    await page.getByRole("navigation").getByRole("button", { name: "대시보드 현황과 안전재고 확인", exact: true }).click();
    const restoredDetail = await inspectDetail(page, item);
    expect(restoredDetail).toEqual(firstDetail);
    expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
    expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(beforeLogs);
  });
}
