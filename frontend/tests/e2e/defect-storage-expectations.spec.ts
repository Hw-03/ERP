import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";
import { readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function itemFixture(request: APIRequestContext) {
  const raw = await json(request, `/api/items/${readSeed().rawItem.item_id}`);
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `보관 원건검수 ${randomUUID().slice(0, 8)}`, unit: "EA", initial_quantity: 20,
    process_type_code: raw.process_type_code, model_slots: raw.model_slots,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function records(request: APIRequestContext, itemId: string) {
  return (await json(request, "/api/defects/locations")).filter((row: { item_id: string }) => row.item_id === itemId);
}

for (const selected of [{ category: "B_GRADE", label: "B급", other: "OBSOLETE" }, { category: "OBSOLETE", label: "구형", other: "B_GRADE" }]) {
  test(`DEFECT-STORAGE-CREATE 8.10-03 ${selected.label} 실제 격리 등록은 선택 분류만 증가하고 다른 원건·위치·목록을 보존한다`, async ({ page, request, actors }) => {
    const item = await itemFixture(request);
    for (const category of ["DEFECT", selected.other]) {
      const response = await request.post("/api/defects/quarantine", { data: {
        actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 1, source: "warehouse", target_dept: "창고",
        management_category: category, reason_category: "외관 불량", reason_memo: `기존 ${category}`,
      } });
      expect(response.status(), await response.text()).toBe(200);
    }
    const before = await json(request, `/api/items/${item.item_id}`);
    const originsBefore = await records(request, item.item_id);
    await loginUi(page, actors.requester);
    await page.goto("/mes?tab=defect");
    await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
    const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
    await choices.getByRole("button", { name: /^격리 등록/ }).click();
    await choices.getByRole("button", { name: /^창고 재고/ }).click();
    const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
    await picker.getByRole("combobox").first().click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code);
    await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    await cart.getByRole("spinbutton").fill("2");
    await cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    const memo = `${selected.label} 신규원건 ${randomUUID().slice(0, 8)}`;
    await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill(memo);
    await cart.getByRole("group", { name: "보관 분류", exact: true }).getByRole("button", { name: selected.label, exact: true }).click();
    await page.getByRole("button", { name: /^격리하기 \(1건\) →$/ }).filter({ visible: true }).click();
    const confirmation = page.getByRole("dialog", { name: "불량 격리 확인" });
    await expect(confirmation).toContainText(item.item_name);
    await expect(confirmation).toContainText(selected.label);
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/defects/quarantine"));
    await confirmation.getByRole("button", { name: "격리하기", exact: true }).click();
    expect((await submitted).status()).toBe(200);
    const current = await json(request, `/api/items/${item.item_id}`);
    expect(current.warehouse_qty).toBe(before.warehouse_qty - 2);
    expect(current.production_total).toBe(before.production_total);
    expect(current.defective_total).toBe(before.defective_total + 2);
    const origins = await records(request, item.item_id);
    expect(origins).toHaveLength(originsBefore.length + 1);
    for (const origin of originsBefore) expect(origins.find((entry: { record_id: string }) => entry.record_id === origin.record_id)).toEqual(origin);
    const created = origins.find((entry: { reason_memo: string }) => entry.reason_memo === memo);
    expect(created.management_category).toBe(selected.category);
    expect(Number(created.available_quantity)).toBe(2);
    await page.getByRole("button").filter({ hasText: "B급·구형 자재", visible: true }).click();
    await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
    await page.getByRole("textbox", { name: "B급·구형 검색", exact: true }).fill(item.item_name);
    const filters = page.getByRole("group", { name: "보관 분류 필터" });
    await filters.getByRole("button", { name: /^전체 보관/ }).click();
    await expect(filters.getByRole("button", { name: /^전체 보관/ })).toContainText("2건");
    await expect(filters.getByRole("button", { name: /^B급/ })).toContainText("1건");
    await expect(filters.getByRole("button", { name: /^구형/ })).toContainText("1건");
    await filters.getByRole("button", { name: new RegExp(`^${selected.label}`) }).click();
    const rows = page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true });
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(memo);
    await expect(rows).toContainText("2개");
    await expect(rows).not.toContainText(`기존 ${selected.other}`);
  });
}

test("DEFECT-STORAGE 8.6-01/02 8.7-07 8.9-01/02 PC-DELTA-DEFECT-02 보관 필터·원건별 표시·부분/전량 복귀 후 다른 원건 보존", async ({ page, request, actors }) => {
  const item = await itemFixture(request);
  const other = await itemFixture(request);
  const configurations = [
    { itemId: item.item_id, actor: actors.requester, qty: 2, category: "B_GRADE", memo: "독립 B급 원건 메모" },
    { itemId: item.item_id, actor: actors.approver, qty: 3, category: "OBSOLETE", memo: "독립 구형 원건 메모" },
    { itemId: other.item_id, actor: actors.requester, qty: 1, category: "B_GRADE", memo: "검색 범위 밖 원건" },
  ];
  for (const entry of configurations) {
    const response = await request.post("/api/defects/quarantine", { data: {
      actor_employee_id: entry.actor.employee_id, item_id: entry.itemId, qty: entry.qty,
      source: "warehouse", target_dept: "창고", management_category: entry.category,
      reason_category: "외관 불량", reason_memo: entry.memo,
    } });
    expect(response.status(), await response.text()).toBe(200);
  }
  const before = await records(request, item.item_id);
  const bGrade = before.find((row: { management_category: string }) => row.management_category === "B_GRADE");
  const obsolete = before.find((row: { management_category: string }) => row.management_category === "OBSOLETE");
  const unrelatedBefore = await records(request, other.item_id);
  const cellsBefore = await json(request, `/api/inventory/locations/${item.item_id}`);
  const itemBefore = await json(request, `/api/items/${item.item_id}`);
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "B급·구형 자재", visible: true }).click();
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("textbox", { name: "B급·구형 검색", exact: true }).fill(item.item_name);
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "창고", exact: true }).click();
  const filters = page.getByRole("group", { name: "보관 분류 필터" });
  const all = filters.getByRole("button", { name: /^전체 보관/ });
  const b = filters.getByRole("button", { name: /^B급/ });
  const o = filters.getByRole("button", { name: /^구형/ });
  await all.click();
  await expect(all).toContainText("2건");
  await expect(b).toContainText("1건");
  await expect(o).toContainText("1건");
  const rows = page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true });
  const groups = page.getByTestId("defect-item-group-summary").filter({ hasText: item.item_name, visible: true });
  await expect(groups).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  const firstRow = rows.filter({ hasText: "독립 B급 원건 메모" });
  const secondRow = rows.filter({ hasText: "독립 구형 원건 메모" });
  await expect(firstRow).toContainText(actors.requester.name);
  await expect(secondRow).toContainText(actors.approver.name);
  await expect(firstRow).toContainText("2개");
  await expect(secondRow).toContainText("3개");
  await expect(firstRow).toContainText("독립 B급 원건 메모");
  await expect(secondRow).toContainText("독립 구형 원건 메모");
  await expect(firstRow.getByTestId("defect-reason-summary")).toContainText("외관 불량");
  await expect(secondRow.getByTestId("defect-reason-summary")).toContainText("외관 불량");
  for (const [origin, row] of [[bGrade, firstRow], [obsolete, secondRow]] as const) {
    const timestamp = origin.defective_at.endsWith("Z") ? origin.defective_at : `${origin.defective_at}Z`;
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(timestamp));
    await expect(row).toContainText(date);
  }
  await b.click();
  await expect(rows).toHaveCount(1);
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toHaveCount(0);
  await expect(all).toContainText("2건");
  await expect(b).toContainText("1건");
  await expect(o).toContainText("1건");
  await all.click();
  await firstRow.getByRole("button", { name: "분류 변경", exact: true }).click();
  const category = page.getByRole("dialog", { name: "보관 분류 변경", exact: true });
  await category.getByRole("button", { name: "구형", exact: true }).click();
  await category.getByRole("textbox", { name: "분류 변경 메모", exact: true }).fill("선택 원건만 구형 이동");
  await category.getByRole("textbox", { name: "직원 PIN", exact: true }).fill("0000");
  const changed = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes(`/api/defects/records/${bGrade.record_id}/management-category`));
  await category.getByRole("button", { name: "변경 저장", exact: true }).click();
  expect((await changed).status()).toBe(200);
  await expect(all).toContainText("2건");
  await expect(b).toContainText("0건");
  await expect(o).toContainText("2건");
  await expect(groups).toHaveCount(1);
  if (await groups.getAttribute("aria-expanded") !== "true") await groups.getByRole("button", { name: /격리/ }).click();
  await expect(groups).toContainText("5개");
  expect(await json(request, `/api/inventory/locations/${item.item_id}`)).toEqual(cellsBefore);
  expect((await records(request, item.item_id)).find((row: { record_id: string }) => row.record_id === obsolete.record_id)).toEqual(obsolete);
  for (const expectedRemaining of [1, 0]) {
    await firstRow.getByRole("button", { name: "정상 복귀", exact: true }).click();
    await page.getByRole("spinbutton").filter({ visible: true }).fill("1");
    await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "검사 통과", exact: true }).click();
    await page.getByRole("button", { name: "정상 복귀 →", exact: true }).filter({ visible: true }).click();
    const restored = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/defects/unquarantine"));
    await page.getByRole("dialog", { name: "정상 복귀 확인", exact: true }).getByRole("button", { name: "즉시 복귀", exact: true }).click();
    expect((await restored).status()).toBe(200);
    await expect(page.getByRole("textbox", { name: "B급·구형 검색", exact: true })).toHaveValue(item.item_name);
    await expect(all).toContainText(`${expectedRemaining ? 2 : 1}건`);
    await expect(o).toContainText(`${expectedRemaining ? 2 : 1}건`);
    await expect(b).toContainText("0건");
    if (expectedRemaining) {
      await expect(groups).toHaveCount(1);
      if (await groups.getAttribute("aria-expanded") !== "true") await groups.getByRole("button", { name: /격리/ }).click();
      await expect(groups).toContainText("4개");
      await expect(firstRow).toContainText("1개");
    } else {
      await expect(groups).toHaveCount(0);
      await expect(firstRow).toHaveCount(0);
    }
    await expect(secondRow).toContainText("3개");
    expect((await json(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(Number(itemBefore.warehouse_qty) + 2 - expectedRemaining);
    expect((await records(request, item.item_id)).find((row: { record_id: string }) => row.record_id === obsolete.record_id)).toEqual(obsolete);
    expect(await records(request, other.item_id)).toEqual(unrelatedBefore);
  }
  await expect(rows).toHaveCount(1);
  await expect(secondRow).toContainText("3개");
  expect((await json(request, `/api/inventory/transactions?item_id=${item.item_id}&transaction_type=UNMARK_DEFECTIVE`)).length).toBe(2);
});
