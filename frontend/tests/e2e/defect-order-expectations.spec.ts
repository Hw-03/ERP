import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";
import { readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function picker(page: Page, family: string) {
  await page.getByRole("navigation").getByRole("button", { name: "불량 격리·폐기·반품 처리", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
  await choices.getByRole("button", { name: /^격리 등록/ }).click();
  await choices.getByRole("button", { name: /^창고 재고/ }).click();
  const pane = page.getByTestId("defect-picker-pane").filter({ visible: true });
  await pane.getByRole("combobox").first().click();
  await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  await pane.getByPlaceholder("품목명 · 품목 코드").fill(family);
  return pane;
}

test("DEFECT-ORDER PC-DELTA-DEFECTORDER-01 실제 포인터 드래그 저장·재진입·새로고침·초기화는 본인 순서만 바꾸고 격리·다른 직원은 보존한다", async ({ page, context, request, actors }) => {
  const family = `개인불량순서${randomUUID().slice(0, 8)}`;
  const source = await json(request, `/api/items/${readSeed().rawItem.item_id}`);
  const items = [];
  for (const suffix of ["A", "B"]) {
    const created = await request.post("/api/items", { headers: ADMIN, data: { item_name: `${family}${suffix}`, unit: "EA", process_type_code: source.process_type_code, model_slots: source.model_slots, initial_quantity: 20 } });
    expect(created.status(), await created.text()).toBe(201);
    items.push(await created.json());
  }
  const otherOrder = await json(request, `/api/items/my-order?employee_id=${actors.other.employee_id}`);
  const stocksBefore = await Promise.all(items.map((item) => json(request, `/api/items/${item.item_id}`)));
  const originsBefore = await json(request, "/api/defects/locations");
  const other = await context.newPage();
  try {
    await loginUi(other, actors.other);
    const otherPane = await picker(other, family);
    const otherRows = otherPane.locator('tr[data-testid^="defect-picker-row-"]');
    await expect(otherRows).toHaveCount(2);
    const defaultOrder = await otherRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")));
    const prepared = await request.put("/api/items/my-order", { headers: { "X-MES-Employee-Code": actors.requester.employee_code }, data: { employee_id: actors.requester.employee_id, items: items.map((item, display_order) => ({ item_id: item.item_id, display_order })) } });
    expect(prepared.ok(), await prepared.text()).toBeTruthy();
    await loginUi(page, actors.requester);
    const pane = await picker(page, family);
    await expect(pane.locator('tr[data-testid^="defect-picker-row-"]').first()).toHaveAttribute("data-testid", `defect-picker-row-${items[0].item_id}`);
    await pane.getByRole("button", { name: "순서 편집", exact: true }).click();
    const first = pane.locator(`[data-item-id="${items[0].item_id}"]`);
    const second = pane.locator(`[data-item-id="${items[1].item_id}"]`);
    const from = await first.getByLabel("드래그 핸들").boundingBox();
    const to = await second.boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + 20, to!.y + to!.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(pane.locator("tr[data-item-id]").first()).toHaveAttribute("data-item-id", items[1].item_id);
    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/api/items/my-order"));
    await pane.getByRole("button", { name: "저장", exact: true }).click();
    expect((await saved).status()).toBe(200);
    const savedOrder = await json(request, `/api/items/my-order?employee_id=${actors.requester.employee_id}`);
    expect(savedOrder.find((row: { item_id: string; display_order: number }) => row.item_id === items[1].item_id).display_order).toBe(0);
    expect(savedOrder.find((row: { item_id: string; display_order: number }) => row.item_id === items[0].item_id).display_order).toBe(1);
    await expect(pane.locator('tr[data-testid^="defect-picker-row-"]').first()).toHaveAttribute("data-testid", `defect-picker-row-${items[1].item_id}`);
    const crossActor = await request.put("/api/items/my-order", { headers: { "X-MES-Employee-Code": actors.other.employee_code }, data: { employee_id: actors.requester.employee_id, items: [{ item_id: items[0].item_id, display_order: 0 }] } });
    expect(crossActor.status()).toBe(403);
    expect(await json(request, `/api/items/my-order?employee_id=${actors.requester.employee_id}`)).toEqual(savedOrder);
    expect(await json(request, `/api/items/my-order?employee_id=${actors.other.employee_id}`)).toEqual(otherOrder);
    await picker(page, family);
    await expect(pane.locator('tr[data-testid^="defect-picker-row-"]').first()).toHaveAttribute("data-testid", `defect-picker-row-${items[1].item_id}`);
    await pane.getByRole("button", { name: `${items[1].item_name} 장바구니에 추가`, exact: true }).click();
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    await expect(cart).toContainText(items[1].item_name);
    await expect(cart).not.toContainText(items[0].item_name);
    await cart.getByRole("spinbutton").fill("1");
    await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    await page.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").filter({ visible: true }).fill("개인순서 변경 뒤 정확한 B 품목 격리");
    await page.getByRole("button", { name: /^격리하기 \(1건\) →$/ }).filter({ visible: true }).click();
    const quarantined = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/defects/quarantine"));
    await page.getByRole("dialog", { name: "불량 격리 확인" }).getByRole("button", { name: "격리하기", exact: true }).click();
    expect((await quarantined).status()).toBe(200);
    expect(await json(request, `/api/items/${items[0].item_id}`)).toEqual(stocksBefore[0]);
    expect((await json(request, `/api/items/${items[1].item_id}`)).warehouse_qty).toBe(Number(stocksBefore[1].warehouse_qty) - 1);
    const selectedOrigins = (await json(request, "/api/defects/locations")).filter((row: { item_id: string }) => row.item_id === items[1].item_id);
    expect(selectedOrigins).toHaveLength(1);
    expect(selectedOrigins[0].department).toBe("창고");
    expect(Number(selectedOrigins[0].available_quantity)).toBe(1);
    expect(Number(selectedOrigins[0].original_quantity)).toBe(1);
    expect((await json(request, "/api/defects/locations")).filter((row: { item_id: string }) => row.item_id !== items[1].item_id)).toEqual(originsBefore);
    await picker(other, family);
    await expect(otherPane.getByTestId(`defect-picker-row-${items[1].item_id}`).getByRole("cell").nth(2)).toHaveText("19");
    expect(await otherRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")))).toEqual(defaultOrder);
    const logs = await json(request, `/api/inventory/transactions?item_id=${items[1].item_id}&transaction_type=MARK_DEFECTIVE`);
    expect(logs).toHaveLength(1);
    const cancelled = await request.post(`/api/inventory/transactions/${logs[0].log_id}/cancel`, { data: { employee_code: actors.requester.employee_code, pin: "0000", reason: "개인순서 업무 원복" } });
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    await picker(page, family);
    await page.reload();
    await picker(page, family);
    await expect(pane.locator('tr[data-testid^="defect-picker-row-"]').first()).toHaveAttribute("data-testid", `defect-picker-row-${items[1].item_id}`);
    await pane.getByRole("button", { name: "순서 편집", exact: true }).click();
    const reset = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/api/items/my-order?"));
    await pane.getByRole("button", { name: "기본 순서로 초기화", exact: true }).click();
    expect((await reset).status()).toBe(200);
    expect(await json(request, `/api/items/my-order?employee_id=${actors.requester.employee_id}`)).toEqual([]);
    await expect(pane.locator('tr[data-testid^="defect-picker-row-"]')).toHaveCount(2);
    expect(await pane.locator('tr[data-testid^="defect-picker-row-"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")))).toEqual(defaultOrder);
    expect(await json(request, `/api/items/my-order?employee_id=${actors.other.employee_id}`)).toEqual(otherOrder);
    await picker(other, family);
    expect(await otherRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")))).toEqual(defaultOrder);
    expect(await Promise.all(items.map((item) => json(request, `/api/items/${item.item_id}`)))).toEqual(stocksBefore);
    expect(await json(request, "/api/defects/locations")).toEqual(originsBefore);
  } finally {
    await request.delete(`/api/items/my-order?employee_id=${actors.requester.employee_id}`, { headers: { "X-MES-Employee-Code": actors.requester.employee_code } }).catch(() => {});
    await other.close();
  }
});
