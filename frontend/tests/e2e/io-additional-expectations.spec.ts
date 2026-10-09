import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, changeEmployee } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType, readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
const WORKS = ["원자재 입출고", "창고 입출고", "부서 입출고", "AS·연구 사용출고", "창고 수량 보정", "품목 전환"];
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), `${url}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
const ROLE_CASES = [
  { title: "조립 일반", department: "조립", warehouse_role: "none", department_role: "none", as_research_approver: false, works: [1, 2, 5], queues: [false, false, false] },
  { title: "창고 정", department: "조립", warehouse_role: "primary", department_role: "none", as_research_approver: false, works: [0, 1, 2, 3, 4, 5], queues: [true, false, false] },
  { title: "창고 부", department: "조립", warehouse_role: "deputy", department_role: "none", as_research_approver: false, works: [0, 1, 2, 3, 4, 5], queues: [true, false, false] },
  { title: "부서 정", department: "조립", warehouse_role: "none", department_role: "primary", as_research_approver: false, works: [1, 2, 5], queues: [false, true, false] },
  { title: "부서 부", department: "조립", warehouse_role: "none", department_role: "deputy", as_research_approver: false, works: [1, 2, 5], queues: [false, true, false] },
  { title: "AS 일반", department: "AS", warehouse_role: "none", department_role: "none", as_research_approver: false, works: [1, 2, 3], queues: [false, false, false] },
  { title: "연구 일반", department: "연구", warehouse_role: "none", department_role: "none", as_research_approver: false, works: [1, 2, 3], queues: [false, false, false] },
  { title: "AS 독립결재", department: "조립", warehouse_role: "none", department_role: "none", as_research_approver: true, works: [1, 2, 5], queues: [false, false, true] },
  { title: "출하 일반", department: "출하", warehouse_role: "none", department_role: "none", as_research_approver: false, works: [1, 2, 5], queues: [false, false, false] },
  { title: "복합 부서·AS", department: "조립", warehouse_role: "none", department_role: "primary", as_research_approver: true, works: [1, 2, 5], queues: [false, true, true] },
  { title: "복합 창고정·부서정", department: "조립", warehouse_role: "primary", department_role: "primary", as_research_approver: false, works: [0, 1, 2, 3, 4, 5], queues: [true, true, false] },
  { title: "복합 창고부·AS", department: "조립", warehouse_role: "deputy", department_role: "none", as_research_approver: true, works: [0, 1, 2, 3, 4, 5], queues: [true, false, true] },
  { title: "복합 창고부·부서부·AS", department: "조립", warehouse_role: "deputy", department_role: "deputy", as_research_approver: true, works: [0, 1, 2, 3, 4, 5], queues: [true, true, true] },
];
for (const row of ROLE_CASES) {
  test(`IO-ROLE 8.1-01/02/06 ${row.title} 독립 역할의 전체 작업·승인함과 불허 직접 URL`, async ({ page, request, actors }) => {
    const employee = await changeEmployee(request, actors.requester, {
      department: row.department, warehouse_role: row.warehouse_role,
      department_role: row.department_role, as_research_approver: row.as_research_approver,
    });
    await loginUi(page, employee);
    await gotoWarehouseCompose(page);
    for (const [index, label] of WORKS.entries()) {
      const card = page.getByRole("button", { name: new RegExp(`^${label}`) }).filter({ visible: true });
      await expect(card).toHaveCount(row.works.includes(index) ? 1 : 0);
    }
    const queues = ["창고 승인함", "부서 승인함", "AS·연구 승인함"];
    for (const [index, label] of queues.entries()) {
      await expect(page.getByRole("tab", { name: new RegExp(`^${label}`) }).filter({ visible: true })).toHaveCount(row.queues[index] ? 1 : 0);
    }
    for (const [index, section] of ["queue", "dept-queue", "as-research-queue"].entries()) {
      if (row.queues[index]) continue;
      await page.goto(`/mes?tab=warehouse&section=${section}`);
      await expect(page.getByRole("tab", { name: /^요청 작성/ }).filter({ visible: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: new RegExp(`^${queues[index]}`) }).filter({ visible: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^창고 입출고/ }).filter({ visible: true })).toBeVisible();
    }
  });
}

async function setAllFilters(page: Page) {
  const filters = page.getByRole("combobox").filter({ visible: true });
  await expect(filters).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    await filters.nth(index).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  }
}
test("IO-DRAFT 8.2-02/03/08/09 8.15-01/02 실제 낱개 preview·자동부서·저장·복원·삭제는 수량과 재고를 보존", async ({ page, request, actors }) => {
  const seed = await json(request, `/api/items/${readSeed().rawItem.item_id}`);
  expect(seed.model_slots.length).toBeGreaterThan(0);
  const created = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `입출고 초안검수 ${randomUUID().slice(0, 8)}`, process_type_code: seed.process_type_code,
    model_slots: seed.model_slots, unit: "EA", legacy_item_type: "원자재", initial_quantity: 20,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const item = await created.json();
  const before = await json(request, `/api/items/${item.item_id}`);
  const logsBefore = await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  let batchId: string | null = null;
  try {
    await loginUi(page, actors.requester);
    await gotoWarehouseCompose(page);
    await pickWorkType(page, /^창고 입출고/);
    await page.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).click();
    await clickNextStep(page);
    await setAllFilters(page);
    await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.mes_code);
    const itemRow = page.getByRole("row").filter({ hasText: item.item_name, visible: true });
    await expect(itemRow).toHaveCount(1);
    const previewed = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/io/preview"));
    await itemRow.getByRole("button", { name: "낱개", exact: true }).click();
    const preview = await previewed;
    expect(preview.status(), await preview.text()).toBe(200);
    const previewData = await preview.json();
    expect(previewData.bundles).toHaveLength(1);
    expect(previewData.bundles[0].lines).toHaveLength(1);
    expect(previewData.bundles[0].lines[0]).toMatchObject({ item_id: item.item_id, quantity: 1, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" });
    await advanceToQuantityStep(page);
    const cart = page.locator("[data-io-cart]").filter({ visible: true });
    await expect(cart.locator("[data-io-line]")).toHaveCount(1);
    await expect(cart.locator("[data-io-bundle]")).toHaveCount(0);
    await expect(cart.locator("[data-io-identity]")).toContainText(item.item_name);
    await expect(cart.locator("[data-io-identity]")).toContainText(item.mes_code);
    await expect(cart.locator("[data-io-location]")).toContainText(/창고.*튜브/);
    await expect(cart.locator("[data-io-stock]")).toContainText(/가능 재고.*20.*실행 후.*19/);
    expect(await json(request, `/api/items/${item.item_id}`)).toEqual(before);
    expect(await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(logsBefore);
    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
    await expect(confirm).toContainText(item.item_name);
    await expect(confirm).toContainText(item.mes_code);
    await expect(confirm).toContainText(/창고.*튜브/);
    await confirm.getByPlaceholder("작업 메모").fill("초안 수량1 독립메모");
    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/api/io/draft"));
    await confirm.getByRole("button", { name: "저장", exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    const draft = await savedResponse.json();
    batchId = draft.batch_id;
    expect(draft.status).toBe("draft");
    expect(draft.notes).toBe("초안 수량1 독립메모");
    expect(draft.bundles[0].lines[0].quantity).toBe(1);
    await expect(page.getByText("저장되었습니다. 나중에 이어서 진행할 수 있습니다.", { exact: true }).filter({ visible: true })).toBeVisible();
    expect(await json(request, `/api/items/${item.item_id}`)).toEqual(before);
    await page.getByRole("tab", { name: /^작성 중/ }).filter({ visible: true }).click();
    await expect(page.getByRole("tab", { name: /^작성 중/ }).filter({ visible: true })).toHaveAttribute("aria-selected", "true");
    const draftRow = page.getByRole("row").filter({ hasText: item.item_name, visible: true });
    await expect(draftRow).toContainText("1 EA");
    await expect(draftRow).toContainText("이동 1종");
    await draftRow.getByRole("button", { name: "이어서 작업", exact: true }).click();
    await expect(cart.locator("[data-io-identity]")).toContainText(item.mes_code);
    await expect(cart.locator("[data-io-stock]")).toContainText(/가능 재고.*20.*실행 후.*19/);
    await page.reload();
    await expect(cart.locator("[data-io-identity]")).toContainText(item.mes_code);
    await expect(cart.locator("[data-io-line]")).toHaveCount(1);
    await expect(cart.locator("[data-io-bundle]")).toHaveCount(0);
    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    await expect(confirm.getByPlaceholder("작업 메모")).toHaveValue("초안 수량1 독립메모");
    await page.getByRole("tab", { name: /^작성 중/ }).filter({ visible: true }).click();
    await expect(page.getByRole("tab", { name: /^작성 중/ }).filter({ visible: true })).toHaveAttribute("aria-selected", "true");
    await draftRow.getByRole("button", { name: "작업 삭제", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "작업 삭제", exact: true });
    await expect(dialog).toContainText("이 작업을 삭제하시겠습니까?");
    const removed = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes(`/api/io/draft/${batchId}`));
    await dialog.getByRole("button", { name: "삭제", exact: true }).click();
    expect((await removed).status()).toBe(204);
    await expect(draftRow).toHaveCount(0);
    expect((await json(request, `/api/io/drafts?requester_employee_id=${actors.requester.employee_id}`)).find((row: { batch_id: string }) => row.batch_id === batchId)).toBeUndefined();
    batchId = null;
    expect(await json(request, `/api/items/${item.item_id}`)).toEqual(before);
    expect(await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(logsBefore);
  } finally {
    if (batchId) await request.delete(`/api/io/draft/${batchId}?requester_employee_id=${actors.requester.employee_id}`).catch(() => {});
  }
});
