import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, changeEmployee, loginUi } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

async function read(request: APIRequestContext, url: string): Promise<unknown> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function item(request: APIRequestContext, name: string, process: string, department: string): Promise<Item> {
  const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: name, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: 27,
    initial_locations: [{ department, quantity: 7 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

for (const automatic of [false, true]) for (const reverse of [false, true]) {
  test(`IO-MULTI-ERROR 8.2-03/8.25-03 자동승인=${automatic} 부서반납=${reverse} 모든 행 오류·단일 잔여 오류는 전체 진행을 막고 위치별 미리보기는 무변경이다`, async ({ page, request, actors }) => {
    const prefix = `복수오류${randomUUID().slice(0, 8)}`;
    const items = [await item(request, `${prefix}튜브`, "TR", "튜브"), await item(request, `${prefix}고압`, "HR", "고압")];
    const requester = await changeEmployee(request, actors.requester, { warehouse_role: automatic ? "primary" : "none", department_role: "none" });
    const before = await Promise.all(items.map(row => read(request, `/api/items/${row.item_id}`)));
    const logs = await Promise.all(items.map(row => read(request, `/api/inventory/transactions?item_id=${row.item_id}&limit=1000`)));
    const executions: string[] = [];
    page.on("request", call => {
      if (call.method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(call.url()).pathname)) executions.push(call.url());
    });
    await loginUi(page, requester);
    await gotoWarehouseCompose(page);
    await pickWorkType(page, /^창고 입출고/);
    await page.getByRole("button", { name: reverse ? "부서 → 창고" : "창고 → 부서", exact: true }).filter({ visible: true }).click();
    await clickNextStep(page);
    for (let index = 0; index < 3; index++) {
      await page.getByRole("combobox").filter({ visible: true }).nth(index).click();
      await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    }
    for (const row of items) {
      await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(row.mes_code!);
      const preview = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith("/api/io/preview"));
      await page.getByRole("row").filter({ hasText: row.item_name, visible: true }).getByRole("button", { name: "낱개", exact: true }).click();
      expect((await preview).status()).toBe(200);
    }
    await advanceToQuantityStep(page);
    const cart = page.locator("[data-io-cart]").filter({ visible: true });
    const rows = items.map(row => cart.locator("[data-io-line]").filter({ hasText: row.item_name }));
    await expect(cart.locator("[data-io-line]")).toHaveCount(2);
    const available = reverse ? 7 : 20;
    for (const [index, row] of rows.entries()) {
      const department = index === 0 ? "튜브" : "고압";
      await expect(row.locator("[data-io-location]")).toContainText(reverse ? new RegExp(`${department}.*창고`) : new RegExp(`창고.*${department}`));
      await expect(row.locator("[data-io-stock]")).toContainText(new RegExp(`가능 재고.*${available}.*실행 후.*${available - 1}`));
    }
    const next = page.getByRole("button", { name: /제출확인/ }).filter({ visible: true });
    await rows[0].getByRole("spinbutton", { name: "수량", exact: true }).fill(String(available + 1));
    await rows[1].getByRole("spinbutton", { name: "수량", exact: true }).fill(String(available + 2));
    await expect(rows[0]).toContainText("재고 부족");
    await expect(rows[1]).toContainText("재고 부족");
    await expect(next).toBeDisabled();
    await expect(page.locator("[data-io-confirm]").filter({ visible: true })).toHaveCount(0);
    await rows[0].getByRole("spinbutton", { name: "수량", exact: true }).fill("1");
    await expect(rows[0]).not.toContainText("재고 부족");
    await expect(rows[1]).toContainText("재고 부족");
    await expect(next).toBeDisabled();
    await rows[1].getByRole("spinbutton", { name: "수량", exact: true }).fill("1");
    await expect(next).toBeEnabled();
    expect(executions).toEqual([]);
    expect(await Promise.all(items.map(row => read(request, `/api/items/${row.item_id}`)))).toEqual(before);
    expect(await Promise.all(items.map(row => read(request, `/api/inventory/transactions?item_id=${row.item_id}&limit=1000`)))).toEqual(logs);
  });
}
