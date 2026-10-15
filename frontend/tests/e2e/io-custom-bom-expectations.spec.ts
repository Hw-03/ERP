import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function item(request: APIRequestContext, name: string, process: string, department: string): Promise<Item> {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: name, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: 17,
    initial_locations: [{ department, quantity: 7 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

for (const authorized of [true, false]) {
  test(`IO-CUSTOM-BOM 8.22-02/07/08/09/10/11 ${authorized ? "자동 승인" : "승인 대기"} 포함 하위6·상위 제외·모든 건수와 실제 효과`, async ({ page, request, actors }) => {
    test.setTimeout(120_000);
    const family = `커스텀검수${randomUUID().slice(0, 8)}`;
    const parent = await item(request, `${family}-상위`, "AF", "조립");
    const children: { item: Item; department: string }[] = [];
    for (const [index, process] of ["TR", "TA", "TF", "HR", "HA", "HF", "AR"].entries()) {
      const department = index < 3 ? "튜브" : index < 6 ? "고압" : "조립";
      const child = await item(request, `${family}-하위${index}`, process, department);
      const added = await request.post("/api/bom", { headers: ADMIN, data: { parent_item_id: parent.item_id, child_item_id: child.item_id, quantity: 1 } });
      expect(added.ok(), await added.text()).toBeTruthy();
      children.push({ item: child, department });
    }
    const allItems = [parent, ...children.map(child => child.item)];
    const before = await Promise.all(allItems.map(entry => read(request, `/api/items/${entry.item_id}`)));
    const oldLogs = await Promise.all(allItems.map(entry => read(request, `/api/inventory/transactions?item_id=${entry.item_id}&limit=1000`)));
    const initialIds = new Set<string>(oldLogs.flat().map(log => log.log_id));
    const actor = authorized ? actors.approver : actors.requester;
    const requestIds: string[] = [];
    try {
      await loginUi(page, actor); await gotoWarehouseCompose(page); await pickWorkType(page, /^부서 입출고/);
      await page.getByRole("button", { name: "생산 입고", exact: true }).filter({ visible: true }).click();
      await clickNextStep(page);
      for (let index = 0; index < 3; index++) {
        await page.getByRole("combobox").filter({ visible: true }).nth(index).click();
        await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
      }
      await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(parent.item_name);
      await page.getByRole("row").filter({ hasText: parent.item_name, visible: true }).getByRole("button", { name: "BOM", exact: true }).click();
      await advanceToQuantityStep(page);
      const cart = page.locator("[data-io-cart]").filter({ visible: true });
      const bundle = cart.locator("[data-io-bundle]");
      const header = bundle.locator("[data-io-bundle-header]");
      if (await header.getAttribute("aria-expanded") !== "true") await header.locator("[data-io-identity]").click({ position: { x: 4, y: 4 } });
      const childRow = (index: number) => bundle.locator("li").filter({ hasText: children[index].item.item_name });
      const quantity = childRow(0).getByRole("spinbutton", { name: "수량", exact: true });
      await quantity.fill("2"); await quantity.blur();
      const guide = page.getByRole("dialog", { name: "BOM 구성을 변경하면 선택한 하위 품목만 낱개로 처리합니다.", exact: true });
      await expect(guide).toContainText("상위 품목"); await expect(guide).toContainText("재고 변동 없음");
      await expect(guide).toContainText("낱개 입고");
      await guide.getByRole("button", { name: "확인", exact: true }).click();
      await childRow(6).getByRole("button", { name: "재고 반영 변경", exact: true }).click();
      await expect(childRow(6).getByRole("button", { name: "재고 반영 변경", exact: true })).toHaveAttribute("aria-pressed", "false");
      await expect(header).toContainText("반영 6개"); await expect(header).toContainText("제외 1개");
      await expect(header).toContainText("BOM 참고 입고 · 상위 미반영");
      for (let index = 0; index < 6; index++) {
        await expect(childRow(index).locator("[data-io-stock]")).toContainText(new RegExp(`현재 재고.*7.*실행 후.*${index === 0 ? 9 : 8}`));
        await expect(childRow(index).locator("[data-io-location]")).toContainText(children[index].department);
      }
      await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
      const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
      await expect(confirm).toContainText("커스텀 BOM");
      await expect(confirm).toContainText("반영 6건"); await expect(confirm).toContainText("반영 6개");
      await expect(confirm).toContainText("상위 미반영");
      const submit = confirm.getByRole("button", { name: authorized ? "자동 승인 후 즉시 반영 6건" : "부서 결재 요청 6건", exact: true });
      await submit.click();
      await expect(confirm).toContainText("메모를 입력해야 작업을 진행할 수 있습니다.");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await confirm.getByRole("textbox", { name: /^메모 \(필수\)/ }).fill(`${family} 선택한 하위만 반영`);
      await expect(submit).toBeEnabled();
      if (authorized) await expect(confirm.getByRole("button", { name: /결재 요청/ })).toHaveCount(0);
      else await expect(confirm).toContainText("부서 결재 필요");
      await submit.click();
      const dialog = page.getByRole("dialog");
      const submitted = page.waitForResponse(response => response.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(response.url()).pathname));
      await dialog.getByRole("button", { name: authorized ? "자동 승인 후 즉시 반영" : "결재 요청", exact: true }).click();
      const response = await submitted;
      expect(response.status(), await response.text()).toBe(201);
      const result = await response.json();
      expect(result.requires_approval).toBe(!authorized);
      if (result.stock_request_id) requestIds.push(result.stock_request_id);
      requestIds.push(...(result.stock_requests ?? []).map((entry: { stock_request_id: string }) => entry.stock_request_id));
      const done = page.getByRole("dialog");
      if (authorized) {
        expect(result.status).toBe("completed");
        await expect(done).toContainText("자동 승인되어 입출고가 반영되었습니다");
        await expect(done).not.toContainText(/결재 요청|승인 대기/);
      } else {
        await expect(done).toContainText(/결재 요청|승인 대기/);
      }
      const after = await Promise.all(allItems.map(entry => read(request, `/api/items/${entry.item_id}`)));
      expect(after[0]).toEqual(before[0]); expect(after[7]).toEqual(before[7]);
      for (let index = 0; index < 6; index++) {
        const stock = after[index + 1];
        expect(stock.warehouse_qty).toBe(before[index + 1].warehouse_qty);
        expect(stock.production_total).toBe(7 + (authorized ? index === 0 ? 2 : 1 : 0));
      }
      const allLogs = await Promise.all(allItems.map(entry => read(request, `/api/inventory/transactions?item_id=${entry.item_id}&limit=1000`)));
      const logs = allLogs.flat().filter(log => !initialIds.has(log.log_id));
      expect(logs).toHaveLength(authorized ? 6 : 0);
      expect(allLogs[0]).toEqual(oldLogs[0]); expect(allLogs[7]).toEqual(oldLogs[7]);
      if (!authorized) return;
      expect(new Set(logs.map(log => log.operation_id)).size).toBe(1);
      expect(new Set(logs.map(log => log.item_id))).toEqual(new Set(children.slice(0, 6).map(child => child.item.item_id)));
      await done.getByRole("button", { name: "확인", exact: true }).click();
      await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
      await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(`${family} 선택한 하위만 반영`);
      const history = page.locator('[data-history-main-row="true"]').filter({ hasText: /생산|부서/, visible: true });
      await expect(history).toHaveCount(1);
      const expand = history.getByRole("button", { name: /^작업 구성 (펼치기|접기)$/ });
      if (await expand.getAttribute("aria-expanded") !== "true") await expand.click();
      for (let index = 0; index < 6; index++) {
        const line = page.locator("tr").filter({ hasText: children[index].item.item_name, visible: true });
        await expect(line).toHaveCount(1);
        await expect(line).toContainText(children[index].item.mes_code!);
        await expect(line.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`7 \\+${index === 0 ? 2 : 1}→${index === 0 ? 9 : 8}`));
      }
      await history.click();
      const summary = page.getByTestId("history-key-point-summary").filter({ visible: true });
      await expect(summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(actor.name);
      await expect(summary.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(actor.name);
      for (const department of ["튜브", "고압"]) {
        const group = summary.getByRole("button", { name: new RegExp(`${department} 재고 · 3품목`) });
        await expect(group).toBeVisible();
        if (await group.getAttribute("aria-expanded") !== "true") await group.click();
      }
      for (let index = 0; index < 6; index++) {
        const impact = summary.locator("[data-history-impact-item-name]").filter({ hasText: children[index].item.item_name }).locator("../../..");
        await expect(impact.getByLabel(new RegExp(`7 \\+${index === 0 ? 2 : 1}→${index === 0 ? 9 : 8} EA`))).toBeVisible();
      }
      await expect(summary).not.toContainText(parent.item_name);
      await expect(summary).not.toContainText(children[6].item.item_name);
      await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
      const cancel = page.getByTestId("history-cancel-confirmation");
      await expect(cancel).toContainText("취소할 내역 6건");
      await expect(cancel).toContainText("아래 재고 변동을 원래 상태로 되돌립니다.");
      await expect(cancel).toContainText("되돌릴 재고 변동");
      await expect(cancel.locator(".hc-impact-row")).toHaveCount(6);
      for (let index = 0; index < 6; index++) {
        const effect = cancel.locator(".hc-impact-row").filter({ hasText: children[index].item.item_name });
        await expect(effect).toContainText(children[index].department);
        await expect(effect.locator("b")).toHaveText(`+${index === 0 ? 2 : 1} EA`);
      }
      await expect(cancel).not.toContainText(parent.item_name); await expect(cancel).not.toContainText(children[6].item.item_name);
      await cancel.getByRole("textbox", { name: "취소 사유", exact: true }).fill(`${family} 원복`);
      await cancel.getByLabel("PIN", { exact: true }).fill("0000");
      const cancelled = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/inventory/operations/${logs[0].operation_id}/cancel`));
      await cancel.getByRole("button", { name: "취소 확정", exact: true }).click();
      expect((await cancelled).status()).toBe(200);
      const restored = await Promise.all(allItems.map(entry => read(request, `/api/items/${entry.item_id}`)));
      for (let index = 0; index < restored.length; index++) {
        expect(restored[index].warehouse_qty).toBe(before[index].warehouse_qty);
        expect(restored[index].production_total).toBe(before[index].production_total);
        expect(restored[index].pending_quantity).toBe(before[index].pending_quantity);
      }
      const finalLogs = (await Promise.all(allItems.map(entry => read(request, `/api/inventory/transactions?item_id=${entry.item_id}&limit=1000`)))).flat();
      expect(finalLogs.filter(log => logs.some(original => original.log_id === log.reverses_log_id))).toHaveLength(6);
      for (const original of logs) {
        const inverse = finalLogs.find(log => log.reverses_log_id === original.log_id);
        expect(inverse.quantity_change).toBe(-original.quantity_change);
        expect(inverse.item_id).toBe(original.item_id);
      }
    } finally {
      for (const id of new Set(requestIds)) await request.post(`/api/stock-requests/${id}/cancel`, { data: { actor_employee_id: actor.employee_id, pin: "0000" } });
    }
  });
}
