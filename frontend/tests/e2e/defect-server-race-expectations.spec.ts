import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

async function read(request: APIRequestContext, url: string): Promise<unknown> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function evidence(request: APIRequestContext, itemId: string): Promise<unknown[]> {
  return Promise.all([
    read(request, `/api/items/${itemId}`),
    read(request, `/api/inventory/locations/${itemId}`),
    read(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`),
  ]);
}

for (const source of ["warehouse", "production"] as const) {
  test(`DEFECT-SERVER-RACE 8.10-02/06 ${source} 실제 동시작업의 두 재고부족을 모두 표시하고 유효한 셋째 행까지 전체 미반영한다`, async ({ page, request, actors }) => {
    const prefix = `격리경합${randomUUID().slice(0, 8)}`;
    const items: Item[] = [];
    for (let index = 0; index < 3; index++) {
      const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
        item_name: `${prefix}-${index}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 4,
        initial_locations: [{ department: "튜브", quantity: 2 }],
      } });
      expect(created.status(), await created.text()).toBe(201);
      items.push(await created.json());
    }
    await loginUi(page, actors.requester);
    await page.goto("/mes?tab=defect");
    await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
    const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
    await choices.getByRole("button", { name: /^격리 등록/ }).click();
    await choices.getByRole("button", { name: source === "warehouse" ? /^창고 재고/ : /^부서 재고/ }).click();
    const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
    await picker.getByRole("combobox").nth(0).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    for (const item of items) {
      await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code!);
      await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
    }
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    for (let index = 0; index < 3; index++) {
      await cart.getByRole("spinbutton").nth(index).fill("1");
      await cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).nth(index).click();
      await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    }
    const submit = page.getByRole("button", { name: /^격리하기 \(3건\) →$/ }).filter({ visible: true });
    const before = await Promise.all(items.map(item => evidence(request, item.item_id)));
    await cart.getByRole("spinbutton").first().fill("3");
    await expect(cart).toContainText(/부족|가용/);
    await expect(submit).toBeDisabled();
    expect(await Promise.all(items.map(item => evidence(request, item.item_id)))).toEqual(before);
    await cart.getByRole("spinbutton").first().fill("1");
    await expect(submit).toBeEnabled();
    let afterConcurrent: unknown[][] = [];
    let concurrentOrigins: unknown = null;
    let requests = 0;
    await page.route("**/api/defects/quarantine/bulk", async route => {
      requests += 1;
      const payload = route.request().postDataJSON();
      expect(payload.lines.map((line: { item_id: string }) => line.item_id)).toEqual(items.map(item => item.item_id));
      for (const item of items.slice(0, 2)) {
        const consumed = await request.post("/api/defects/quarantine", { data: {
          actor_employee_id: actors.approver.employee_id, item_id: item.item_id, qty: 2, source,
          source_dept: source === "warehouse" ? undefined : "튜브",
          target_dept: source === "warehouse" ? "창고" : "튜브",
          reason_category: "외관 불량", reason_memo: `${prefix} 다른 직원 선행 작업`,
        } });
        expect(consumed.status(), await consumed.text()).toBe(200);
      }
      afterConcurrent = await Promise.all(items.map(item => evidence(request, item.item_id)));
      concurrentOrigins = await read(request, "/api/defects/locations");
      // The browser's unchanged request reaches the real server after another
      // actor consumes stock. No validation response is fabricated here.
      await route.continue();
    }, { times: 1 });
    await submit.click();
    const failed = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith("/api/defects/quarantine/bulk"));
    await page.getByRole("dialog", { name: "불량 격리 확인" }).getByRole("button", { name: "격리하기", exact: true }).click();
    const response = await failed;
    expect(response.status()).toBe(422);
    const body = await response.json();
    for (const item of items.slice(0, 2)) {
      expect(body.detail.message).toContain(`${item.item_name}: 가용 재고 부족`);
      await expect(cart).toContainText(`${item.item_name}: 가용 재고 부족`);
    }
    expect(body.detail.message).not.toContain(items[2].item_name);
    for (let index = 0; index < 3; index++) {
      await expect(cart.getByRole("spinbutton").nth(index)).toHaveValue("1");
      await expect(cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).nth(index)).toContainText("외관 불량");
    }
    expect(requests).toBe(1);
    expect(afterConcurrent[2]).toEqual(before[2]);
    expect(await Promise.all(items.map(item => evidence(request, item.item_id)))).toEqual(afterConcurrent);
    expect(await read(request, "/api/defects/locations")).toEqual(concurrentOrigins);
  });
}
