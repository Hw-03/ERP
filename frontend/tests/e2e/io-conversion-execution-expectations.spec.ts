import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item, ItemConversionPreview, TransactionLog } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";
import { gotoWarehouseCompose } from "./_helpers";

const ADMIN = { "X-Admin-Pin": "0000" };

async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function create(request: APIRequestContext, name: string, process: string, warehouse: number, production: number): Promise<Item> {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: name, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: warehouse + production,
    initial_locations: [{ department: "조립", quantity: production }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test("IO-CONVERSION-EXECUTION 8.16-10/11/12/13/14 두 부족품·직접 BOM 차이·모든 위치와 내역·묶음 한 번 취소를 실제 화면에서 검증한다", async ({ page, request, actors }) => {
  const family = `전환실행${randomUUID().slice(0, 8)}`;
  const source = await create(request, `${family}-원본`, "AF", 5, 7);
  const target = await create(request, `${family}-대상`, "AF", 5, 5);
  const common = await create(request, `${family}-회수`, "AR", 0, 5);
  const addedA = await create(request, `${family}-차감A`, "AR", 0, 3);
  const addedB = await create(request, `${family}-차감B`, "AR", 0, 3);
  const leaf = await create(request, `${family}-공통하위`, "AR", 2, 6);
  const items = [source, target, common, addedA, addedB, leaf];
  for (const [parent, child, quantity] of [[source, common, 3], [target, common, 1], [target, addedA, 2], [target, addedB, 2], [common, leaf, 1], [addedA, leaf, 1]] as const) {
    const response = await request.post("/api/bom", { headers: ADMIN, data: { parent_item_id: parent.item_id, child_item_id: child.item_id, quantity, unit: "EA" } });
    expect(response.status(), await response.text()).toBe(201);
  }
  const before: Item[] = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
  const beforeLogs: TransactionLog[][] = await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)));
  const memo = `${family} 직접 차이 확인`;
  await loginUi(page, actors.approver);
  await gotoWarehouseCompose(page);
  await page.getByTestId("warehouse-item-conversion-card").click();
  await page.getByTestId("item-conversion-source-search").fill(source.mes_code!);
  await page.getByTestId(`item-conversion-source-option-${source.item_id}`).click();
  await page.getByTestId("item-conversion-target-search").fill(target.mes_code!);
  await page.getByTestId(`item-conversion-target-option-${target.item_id}`).click();
  await page.getByTestId("item-conversion-quantity").fill("2");
  let previewReply = page.waitForResponse(response => response.url().includes("/api/io/item-conversion-preview"));
  await page.getByTestId("item-conversion-next-button").click();
  const shortage: ItemConversionPreview = await (await previewReply).json();
  expect(shortage.executable).toBe(false);
  expect(shortage.lines.filter(line => line.shortage_quantity > 0).map(line => line.item_id).sort()).toEqual([addedA.item_id, addedB.item_id].sort());
  const shortages = page.getByTestId("item-conversion-shortage-row");
  await expect(shortages).toHaveCount(2);
  for (const item of [addedA, addedB]) {
    const row = shortages.filter({ hasText: item.item_name });
    await expect(row).toContainText(item.mes_code!);
    await expect(row).toContainText("조립 현재고 3 EA");
    await expect(row).toContainText("가용 3 EA · 필요 4 EA · 부족 1 EA");
  }
  await page.getByTestId("item-conversion-memo").fill(memo);
  await expect(page.getByTestId("item-conversion-execute-next-button")).toBeDisabled();
  expect(await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)))).toEqual(before);
  expect(await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)))).toEqual(beforeLogs);
  await page.getByTestId("item-conversion-step-nav-item").nth(1).click();
  await page.getByTestId("item-conversion-quantity").fill("1");
  previewReply = page.waitForResponse(response => response.url().includes("/api/io/item-conversion-preview"));
  await page.getByTestId("item-conversion-next-button").click();
  const preview: ItemConversionPreview = await (await previewReply).json();
  expect(preview.resolved_mode).toBe("BOM");
  expect(preview.executable).toBe(true);
  expect(Object.fromEntries(preview.lines.map(line => [line.item_id, line.total_delta]))).toEqual({ [common.item_id]: -2, [addedA.item_id]: 2, [addedB.item_id]: 2 });
  await expect(page.getByTestId("item-conversion-shortage-row")).toHaveCount(0);
  for (const item of [common, addedA, addedB]) await expect(page.getByTestId("item-conversion-preview")).toContainText(item.item_name);
  await page.getByTestId("item-conversion-memo").fill(memo);
  await page.getByTestId("item-conversion-execute-next-button").click();
  await page.getByTestId("item-conversion-confirm-button").click();
  const confirm = page.getByRole("dialog", { name: "품목 전환을 실행할까요?", exact: true });
  await expect(confirm).toContainText(source.item_name);
  await expect(confirm).toContainText(target.item_name);
  const executed = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/io/item-conversion"));
  await confirm.getByRole("button", { name: "전환 실행", exact: true }).click();
  const reply = await executed;
  expect(reply.status(), await reply.text()).toBe(200);
  const result = await reply.json();
  expect(result.transactions).toHaveLength(5);
  const after: Item[] = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
  const deltas = [-1, 1, 2, -2, -2, 0];
  for (let index = 0; index < items.length; index++) {
    expect(after[index].warehouse_qty).toBe(before[index].warehouse_qty);
    expect(after[index].production_total).toBe(before[index].production_total + deltas[index]);
    expect(after[index].defective_total).toBe(before[index].defective_total);
    expect(after[index].pending_quantity).toBe(before[index].pending_quantity);
  }
  expect(after[5]).toEqual(before[5]);
  const logs: TransactionLog[] = (await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)))).flat().filter((log: TransactionLog) => log.reference_no === result.reference_no);
  expect(logs).toHaveLength(5);
  expect(new Set(logs.map(log => log.operation_id)).size).toBe(1);
  expect(logs.every(log => log.operation_id != null)).toBe(true);
  for (let index = 0; index < 5; index++) {
    const log = logs.find(entry => entry.item_id === items[index].item_id)!;
    expect(Number(log.quantity_change)).toBe(deltas[index]);
    expect(log.inventory_effect).toEqual([{ scope: "location", department: "조립", status: "PRODUCTION", delta: deltas[index], quantity_before: before[index].production_total, quantity_after: after[index].production_total }]);
  }
  await expect(confirm).toHaveCount(0);
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  const searchReply = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname === "/api/inventory/transactions/display-groups"
      && url.searchParams.get("search") === memo;
  });
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(memo);
  const searched = await searchReply;
  expect(searched.status(), await searched.text()).toBe(200);
  const history = page.locator('[data-history-main-row="true"]').filter({ hasText: "품목 전환", visible: true });
  await expect(history).toHaveCount(1);
  const toggle = history.getByRole("button", { name: /^작업 구성 (펼치기|접기)$/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(history).toContainText(target.item_name);
  await expect(history).toContainText(target.mes_code!);
  for (let index = 0; index < 5; index++) {
    const row = page.locator("tr").filter({ hasText: items[index].item_name, visible: true });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(items[index].mes_code!);
    const sign = deltas[index] > 0 ? "\\+" : "[−-]";
    await expect(row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`조립 ${before[index].production_total} ${sign}${Math.abs(deltas[index])}→${after[index].production_total}`));
  }
  await history.click();
  const summary = page.getByTestId("history-key-point-summary").filter({ visible: true });
  const group = summary.getByRole("button", { name: /조립 재고 · 5품목/ });
  await expect(group).toBeVisible();
  if (await group.getAttribute("aria-expanded") !== "true") await group.click();
  for (let index = 0; index < 5; index++) {
    const impact = summary.locator("[data-history-impact-item-name]").filter({ hasText: items[index].item_name }).locator("../../..");
    await expect(impact.getByLabel(`조립 재고 ${before[index].production_total} ${deltas[index] > 0 ? "+" : "-"}${Math.abs(deltas[index])}→${after[index].production_total} EA`, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
  const cancellation = page.getByTestId("history-cancel-confirmation");
  await expect(cancellation.locator(".hc-impact-row")).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const row = cancellation.locator(".hc-impact-row").filter({ hasText: items[index].item_name });
    await expect(row).toContainText("조립");
    await expect(row.locator("b")).toHaveText(`${deltas[index] > 0 ? "+" : "-"}${Math.abs(deltas[index])} EA`);
  }
  await cancellation.getByRole("textbox", { name: "취소 사유", exact: true }).fill(`${family} 전량 원복`);
  await cancellation.getByLabel("PIN", { exact: true }).fill("0000");
  const cancelled = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/inventory/operations/${logs[0].operation_id}/cancel`));
  await cancellation.getByRole("button", { name: "취소 확정", exact: true }).click();
  expect((await cancelled).status()).toBe(200);
  const restored: Item[] = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
  for (let index = 0; index < items.length; index++) {
    expect(restored[index].warehouse_qty).toBe(before[index].warehouse_qty);
    expect(restored[index].production_total).toBe(before[index].production_total);
    expect(restored[index].locations).toEqual(before[index].locations);
  }
  const finalLogs: TransactionLog[] = (await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)))).flat();
  const inverses = finalLogs.filter(log => logs.some(original => original.log_id === log.reverses_log_id));
  expect(inverses).toHaveLength(5);
  for (const original of logs) {
    expect(finalLogs.find(log => log.log_id === original.log_id)?.cancelled).toBe(true);
    expect(Number(inverses.find(log => log.reverses_log_id === original.log_id)?.quantity_change)).toBe(-Number(original.quantity_change));
  }
  const reversalHistory = page.locator('[data-history-main-row="true"]').filter({ hasText: "품목 전환 취소", visible: true });
  await expect(reversalHistory).toHaveCount(1);
  const reversalToggle = reversalHistory.getByRole("button", { name: /^작업 구성 (펼치기|접기)$/ });
  await expect(reversalToggle).toHaveAttribute("aria-expanded", "true");
  // The target is the operation's main row; only the four remaining items are component rows.
  await expect(reversalHistory).toContainText(target.item_name);
  await expect(reversalHistory).toContainText(target.mes_code!);
  const inverseLabels = ["기존품 회수 입고", "품목 전환 취소", "회수품 차감", "추가 구성품 회수 입고", "추가 구성품 회수 입고"];
  for (let index = 0; index < 5; index++) {
    const inverse = inverses.find(log => log.item_id === items[index].item_id)!;
    const inverseRow = page.locator("tr").filter({ hasText: items[index].item_name, visible: true })
      .filter({ hasText: inverseLabels[index] });
    await expect(inverseRow).toHaveCount(1);
    await expect(inverseRow).toContainText(inverseLabels[index]);
    const inverseDelta = Number(inverse.quantity_change);
    const inverseSign = inverseDelta > 0 ? "\\+" : "[−-]";
    await expect(inverseRow.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`조립 ${after[index].production_total} ${inverseSign}${Math.abs(inverseDelta)}→${before[index].production_total}`));
  }
  const repeated = await request.post(`/api/inventory/operations/${logs[0].operation_id}/cancel`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000", reason: `${family} 중복 금지` } });
  expect(repeated.status()).toBe(422);
  expect((await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)))).flat()).toEqual(finalLogs);
});
