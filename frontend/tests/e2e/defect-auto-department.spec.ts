import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, changeEmployee, loginUi } from "./_common-expectations";

async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("8.5-02 불량 격리는 튜브·고압·조립 공정의 실제 부서를 자동 표시하고 수동 처리부서 선택 없이 같은 위치에 반영한다", async ({ page, request, actors }) => {
  const actor = await changeEmployee(request, actors.requester, { department: "AS" });
  const parts: { item: Item; department: string }[] = [];
  for (const [process, department] of [["TR", "튜브"], ["HA", "고압"], ["AF", "조립"]]) {
    const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `자동부서${randomUUID().slice(0, 8)}-${process}`, process_type_code: process, model_slots: [1], unit: "EA",
      initial_quantity: 20, initial_locations: [{ department, quantity: 7 }, { department: "진공", quantity: 3 }],
    } });
    expect(response.status(), await response.text()).toBe(201);
    parts.push({ item: await response.json(), department });
  }
  const before = await Promise.all(parts.map(({ item }) => read(request, `/api/items/${item.item_id}`)));
  await loginUi(page, actor);
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
  await choices.getByRole("button", { name: /^격리 등록/ }).click();
  await choices.getByRole("button", { name: /^부서 재고/ }).click();
  const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
  await picker.getByRole("combobox").first().click();
  await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
  for (const { item, department } of parts) {
    await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code!);
    await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
    const line = cart.locator(":scope > div > div").filter({ hasText: item.item_name });
    await expect(line).toHaveCount(1);
    await expect(line).toContainText(`자동 부서 · ${department}`);
    await expect(line).not.toContainText("자동 부서 · AS");
    await expect(line).not.toContainText("자동 부서 · 진공");
    await expect(line.getByRole("combobox")).toHaveCount(0);
    await expect(line.getByRole("button", { name: /처리 부서|대상 부서|부서 선택/ })).toHaveCount(0);
    await expect(picker.getByTestId(`defect-picker-row-${item.item_id}`).getByRole("cell").nth(2)).toHaveText("7");
    await line.getByRole("button", { name: "사유 카테고리 선택", exact: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    await expect(line.getByRole("spinbutton")).toHaveValue("1");
  }
  await expect(cart.locator("select")).toHaveCount(0);
  expect(await Promise.all(parts.map(({ item }) => read(request, `/api/items/${item.item_id}`)))).toEqual(before);
  await page.getByRole("button", { name: "격리하기 (3건) →", exact: true }).filter({ visible: true }).click();
  const confirmation = page.getByRole("dialog", { name: "불량 격리 확인", exact: true });
  for (const { item, department } of parts) {
    const line = confirmation.getByTestId("defect-confirm-line").filter({ hasText: item.item_name });
    await expect(line).toContainText(department);
    await expect(line).toContainText("1 EA");
    await expect(line.getByRole("combobox")).toHaveCount(0);
  }
  const submitted = page.waitForResponse(reply => reply.request().method() === "POST" && new URL(reply.url()).pathname === "/api/defects/quarantine/bulk");
  await confirmation.getByRole("button", { name: "격리하기", exact: true }).click();
  const response = await submitted;
  expect(response.status(), await response.text()).toBe(200);
  const payload = response.request().postDataJSON();
  expect(payload.lines.map((line: { item_id: string; source_dept: string; target_dept: string }) => [line.item_id, line.source_dept, line.target_dept]).sort()).toEqual(parts.map(({ item, department }) => [item.item_id, department, department]).sort());
  for (const [index, { item, department }] of parts.entries()) {
    const after = await read(request, `/api/items/${item.item_id}`);
    expect(after.warehouse_qty).toBe(before[index].warehouse_qty);
    const locations = await read(request, `/api/inventory/locations/${item.item_id}`);
    expect(Number(locations.find((cell: { department: string; status: string }) => cell.department === department && cell.status === "PRODUCTION").quantity)).toBe(6);
    expect(Number(locations.find((cell: { department: string; status: string }) => cell.department === department && cell.status === "DEFECTIVE").quantity)).toBe(1);
    expect(Number(locations.find((cell: { department: string; status: string }) => cell.department === "진공" && cell.status === "PRODUCTION").quantity)).toBe(3);
    const records = (await read(request, "/api/defects/locations")).filter((record: { item_id: string }) => record.item_id === item.item_id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ department });
    expect(Number(records[0].available_quantity)).toBe(1);
  }
});
