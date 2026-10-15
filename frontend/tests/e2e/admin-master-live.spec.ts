import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { DepartmentMaster, Item } from "../../lib/api";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { clickNextStep } from "./_helpers";

const headers = (actors: CommonActors) => ({ "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code });
async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function openAdmin(page: Page, actors: CommonActors, section: string): Promise<void> {
  await loginUi(page, actors.approver);
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: section, exact: true }).click();
}

test.use({ trace: "retain-on-failure" });

test("PC-DELTA-ADMIN-01 품목 수정은 다른 직원의 열린 입출고 후보에 새 이름·코드를 반영한다", async ({ page, context, request, actors }) => {
  const familyName = `열린품목${randomUUID().slice(0, 8)}`;
  const created = await request.post("/api/items", { headers: headers(actors), data: {
    item_name: familyName, process_type_code: "TR", model_slots: [1], initial_quantity: 5,
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).item_id;
  const before = await read<Item>(request, `/api/items/${id}`);
  const observer = await context.newPage();
  try {
    await loginUi(observer, actors.other);
    await observer.goto("/mes?tab=warehouse");
    await observer.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().click();
    await observer.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).first().click();
    await clickNextStep(observer);
    const filters = observer.getByRole("combobox").filter({ visible: true });
    for (let index = 0; index < await filters.count(); index++) {
      await filters.nth(index).click();
      await observer.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    }
    await observer.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(familyName);
    const candidate = observer.getByRole("row").filter({ hasText: familyName, visible: true });
    await expect(candidate).toContainText(before.mes_code!.replaceAll("-", "\u2011"));
    await openAdmin(page, actors, "품목 관리");
    const row = page.locator(`[data-item-id="${id}"]`);
    if (await row.getAttribute("aria-selected") !== "true") await row.click();
    const name = `${before.item_name}-새이름`;
    await page.getByPlaceholder("예: 텅스텐 필라멘트").fill(name);
    await page.getByPlaceholder("예: 텅스텐 필라멘트").locator("..").locator("..").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "HR — 고압 원자재", exact: true }).click();
    await expect(page.locator("[aria-readonly]")).toHaveText(/^3-HR-\d{4}$/);
    const code = await page.locator("[aria-readonly]").innerText();
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/items/${id}`) && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(candidate).toContainText(name, { timeout: 30_000 });
    await expect(candidate).toContainText(code.replaceAll("-", "\u2011"));
    await expect(candidate).not.toContainText(before.mes_code!.replaceAll("-", "\u2011"));
    const after = await read<Item>(request, `/api/items/${id}`);
    expect(after.warehouse_qty).toBe(before.warehouse_qty);
    expect(after.item_id).toBe(before.item_id);
    expect(after.item_name).toBe(name);
    expect(after.mes_code).toBe(code);
  } finally { await observer.close(); }
});

test("PC-DELTA-ADMIN-01 부서 표시명 수정은 다른 열린 직원 후보를 갱신하고 미저장 이름을 보존한다", async ({ page, context, request, actors }) => {
  const originalName = `QA부서${randomUUID().slice(0, 8)}`;
  const created = await request.post("/api/departments", { headers: headers(actors), data: { name: originalName, pin: "0000" } });
  expect(created.status(), await created.text()).toBe(201);
  const department: DepartmentMaster = await created.json();
  const employees = await read(request, "/api/employees");
  const observer = await context.newPage();
  try {
    await openAdmin(observer, actors, "직원 관리");
    await observer.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
    const draftName = `${actors.requester.name}-미저장`;
    await observer.locator("#emp-edit-name").fill(draftName);
    const departmentChoice = observer.locator("#emp-edit-name").locator("..").locator("..").getByRole("combobox").nth(1);
    await departmentChoice.click();
    await expect(observer.getByRole("option", { name: originalName, exact: true })).toBeVisible();
    await openAdmin(page, actors, "부서 관리");
    const row = page.locator(`[data-admin-department-row="${department.id}"]`);
    if (await row.getAttribute("aria-selected") !== "true") await row.click();
    const name = `${originalName}-새표시`;
    await page.getByRole("textbox", { name: "부서명", exact: true }).fill(name);
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/departments/${department.id}`) && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(observer.getByRole("option", { name, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(observer.getByRole("option", { name: originalName, exact: true })).toHaveCount(0);
    await expect(observer.locator("#emp-edit-name")).toHaveValue(draftName);
    expect(await read(request, "/api/employees")).toEqual(employees);
    const current = (await read<DepartmentMaster[]>(request, "/api/departments")).find((entry) => entry.id === department.id)!;
    expect(current.name).toBe(originalName);
    expect(current.display_name).toBe(name);
  } finally { await observer.close(); }
});
