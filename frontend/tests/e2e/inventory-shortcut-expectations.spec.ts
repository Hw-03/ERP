import { randomUUID } from "crypto";
import { test, expect, loginUi, logoutUi } from "./_common-expectations";

test("DASHBOARD03 실제 빠른 작업은 직원 권한·선택 품목·창고 방향과 부족 수량 차단을 보존", async ({ page, request, actors }) => {
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: `바로가기검수${randomUUID().slice(0, 8)}`, process_type_code: "TR", unit: "EA", model_slots: [1], initial_quantity: 13,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const item = await created.json();
  const before = await (await request.get(`/api/items/${item.item_id}`)).json();
  const historyUrl = `/api/inventory/transactions?item_id=${item.item_id}`;
  const logsBefore = await (await request.get(historyUrl)).json();
  for (const [employee, canReceive] of [[actors.approver, true], [actors.requester, false]] as const) {
    await loginUi(page, employee);
    await page.getByRole("textbox", { name: "자재 검색", exact: true }).fill(item.item_name);
    await page.locator("tr[role=button]").filter({ hasText: item.item_name }).click();
    const panel = page.getByRole("dialog", { name: item.item_name, exact: true });
    await panel.getByRole("button", { name: "입고", exact: true }).click();
    await expect(panel.getByRole("button", { name: /^원자재 수령/ })).toHaveCount(canReceive ? 1 : 0);
    if (canReceive) {
      await page.keyboard.press("Escape");
      await logoutUi(page, employee);
    }
  }
  const panel = page.getByRole("dialog", { name: item.item_name, exact: true });
  await panel.getByRole("button", { name: "출고", exact: true }).click();
  const previewed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/io/preview"));
  await panel.getByRole("button", { name: /^창고 반출/ }).click();
  const preview = await previewed;
  expect(preview.status(), await preview.text()).toBe(200);
  const payload = preview.request().postDataJSON();
  expect(payload).toMatchObject({ requester_employee_id: actors.requester.employee_id, work_type: "warehouse_io", sub_type: "warehouse_to_dept" });
  expect(payload.targets).toEqual([expect.objectContaining({ item_id: item.item_id, quantity: 1 })]);
  await expect(page).toHaveURL(/tab=warehouse/);
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await expect(cart.locator("[data-io-identity]")).toContainText(item.item_name);
  await expect(cart.locator("[data-io-location]")).toContainText(/창고.*튜브/);
  const quantity = cart.getByRole("spinbutton", { name: "수량", exact: true });
  await quantity.fill("14");
  await quantity.blur();
  await expect(cart).toContainText("재고가 부족한 항목이 있습니다");
  await expect(cart.getByRole("button", { name: /제출확인/ })).toBeDisabled();
  expect(await (await request.get(`/api/items/${item.item_id}`)).json()).toEqual(before);
  expect(await (await request.get(historyUrl)).json()).toEqual(logsBefore);
});
