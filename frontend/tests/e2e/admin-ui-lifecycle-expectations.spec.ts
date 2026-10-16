import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Employee } from "../../lib/api/types/employees";
import { test, expect, changeEmployee, loginUi, submitWarehouseRequest, type CommonActors } from "./_common-expectations";

async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), `${url}: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function openAdmin(page: Page, actors: CommonActors, section: string): Promise<void> {
  await loginUi(page, actors.approver);
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) {
    const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) await zero.click();
  }
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: section, exact: true }).click();
}

async function saveWarehouseRole(page: Page, employee: Employee, role: "없음" | "정" | "부"): Promise<void> {
  await page.locator(`[data-admin-employee-row="${employee.employee_id}"]`).click();
  await page.getByText("창고 결재 역할", { exact: true }).locator("..").getByRole("combobox").click();
  await page.getByRole("option", { name: role, exact: true }).click();
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${employee.employee_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saved).status()).toBe(200);
}

async function focus(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

test.use({ trace: "retain-on-failure" });

for (const role of ["정", "부"] as const) {
  test(`8.19-09 실제 창고 ${role} 부여·열린승인폼 회수·재부여·새로그인·정확한 한번 승인`, async ({ page, context, request, actors }) => {
    test.setTimeout(120_000);
    const target = await changeEmployee(request, actors.other, { warehouse_role: "none", department_role: "none", as_research_approver: false });
    const pending = await submitWarehouseRequest(request, actors.requester);
    const items = await read<{ item_id: string; item_name: string }[]>(request, `/api/items?search=${encodeURIComponent(pending.itemName)}`);
    const itemId = items.find((item) => item.item_name === pending.itemName)!.item_id;
    const before = await read(request, `/api/items/${itemId}`);
    const pendingBefore = await read(request, `/api/stock-requests/${pending.requestId}`);
    const targetPage = await context.newPage();
    const fresh = await context.newPage();
    try {
      await loginUi(targetPage, target);
      await targetPage.goto("/mes?tab=warehouse");
      await expect(targetPage.getByRole("tab", { name: /창고 승인함/ })).toHaveCount(0);
      await openAdmin(page, actors, "직원 관리");
      await saveWarehouseRole(page, target, role);
      await focus(targetPage);
      await expect(targetPage.getByRole("tab", { name: /창고 승인함/ })).toBeVisible();
      await targetPage.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${pending.requestId}`);
      const row = targetPage.locator(`[data-stock-request-id="${pending.requestId}"]`);
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "승인", exact: true }).click();
      await row.getByPlaceholder("0000").fill("0000");
      await saveWarehouseRole(page, target, "없음");
      await focus(targetPage);
      await expect(targetPage.getByRole("tab", { name: /창고 승인함/ })).toHaveCount(0);
      await expect(targetPage.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
      await expect(targetPage.getByRole("button", { name: "승인 확정", exact: true })).toHaveCount(0);
      expect(await read(request, `/api/items/${itemId}`)).toEqual(before);
      expect(await read(request, `/api/stock-requests/${pending.requestId}`)).toEqual(pendingBefore);
      const forbidden = await request.post(`/api/stock-requests/${pending.requestId}/approve`, { data: { actor_employee_id: target.employee_id, pin: "0000" } });
      expect(forbidden.status()).toBe(403);
      expect(await read(request, `/api/items/${itemId}`)).toEqual(before);
      await saveWarehouseRole(page, target, role);
      await focus(targetPage);
      await expect(targetPage.getByRole("tab", { name: /창고 승인함/ })).toBeVisible();
      await loginUi(fresh, target);
      await fresh.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${pending.requestId}`);
      const freshRow = fresh.locator(`[data-stock-request-id="${pending.requestId}"]`);
      await expect(fresh.getByRole("tab", { name: /창고 승인함/ })).toBeVisible();
      await expect(freshRow).toBeVisible();
      await freshRow.getByRole("button", { name: "승인", exact: true }).click();
      await freshRow.getByPlaceholder("0000").fill("0000");
      const approved = fresh.waitForResponse((response) => response.url().endsWith(`/api/stock-requests/${pending.requestId}/approve`));
      await freshRow.getByRole("button", { name: "승인 확정", exact: true }).click();
      expect((await approved).status()).toBe(200);
      await expect(freshRow).toHaveCount(0);
      const current = await read<{ warehouse_qty: number; pending_quantity: number }>(request, `/api/items/${itemId}`);
      expect(current.warehouse_qty).toBe(19);
      expect(current.pending_quantity).toBe(0);
      const logs = await read<{ transaction_type: string }[]>(request, `/api/inventory/transactions?item_id=${itemId}`);
      expect(logs.filter((log) => log.transaction_type === "TRANSFER_TO_PROD")).toHaveLength(1);
      const second = await request.post(`/api/stock-requests/${pending.requestId}/approve`, { data: { actor_employee_id: target.employee_id, pin: "0000" } });
      expect(second.status()).toBe(200);
      expect(await read(request, `/api/items/${itemId}`)).toEqual(current);
      await infoEvidence(targetPage, role);
    } finally {
      await targetPage.close();
      await fresh.close();
    }
  });
}

async function infoEvidence(page: Page, role: string): Promise<void> {
  await test.info().attach(`warehouse-role-${role}`, { body: await page.screenshot(), contentType: "image/png" });
}

test("8.19-08 실제 직원 추가는 이미 열린 로그인 후보·목록에 새 식별정보를 반영", async ({ page, context, request, actors }) => {
  await openAdmin(page, actors, "직원 관리");
  const name = `신규직원${randomUUID().slice(0, 8)}`;
  const login = await context.newPage();
  let employee: Employee | undefined;
  try {
    await login.goto("/mes?tab=dashboard");
    await login.getByRole("combobox").fill(name);
    await expect(login.getByRole("option", { name: new RegExp(name) })).toHaveCount(0);
    await page.getByRole("button", { name: "직원 추가", exact: true }).click();
    await page.locator("#emp-add-name").fill(name);
    const created = page.waitForResponse((response) => response.url().endsWith("/api/employees") && response.request().method() === "POST");
    await page.getByRole("button", { name: "직원 추가", exact: true }).last().click();
    const response = await created;
    expect(response.status()).toBe(201);
    employee = await response.json();
    // PC-DELTA-ADMIN-02: UI creation follows the omitted API menu default.
    expect(employee!.hidden_sidebar_tabs).toEqual(["admin"]);
    await expect(page.locator(`[data-admin-employee-row="${employee!.employee_id}"]`)).toContainText(name);
    await page.locator(`[data-admin-employee-row="${employee!.employee_id}"]`).click();
    await expect(page.getByRole("checkbox", { name: "관리자", exact: true })).not.toBeChecked();
    await focus(login);
    await login.getByRole("combobox").fill(employee!.employee_code);
    await expect(login.getByRole("option", { name: new RegExp(name) })).toBeVisible({ timeout: 30_000 });
    await login.getByRole("option", { name: new RegExp(name) }).click();
    await login.getByLabel("PIN 번호", { exact: true }).fill("0000");
    await login.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(login.getByRole("button", { name: new RegExp(name) }).filter({ visible: true }).first()).toBeVisible();
    const current = (await read<Employee[]>(request, "/api/employees")).find((row) => row.employee_id === employee!.employee_id)!;
    expect(current.name).toBe(name);
    expect(current.is_active).toBe(true);
    await login.getByRole("complementary").getByRole("button", { name: "설정", exact: true }).click();
    await expect(login.getByTestId("settings-admin-group")).toHaveCount(0);
    await login.goto("/mes?tab=admin");
    await expect(login.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
    await expect(login.getByRole("navigation", { name: "관리자 섹션" })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "관리자", exact: true }).check();
    const saved = page.waitForResponse((result) => result.url().endsWith(`/api/employees/${employee!.employee_id}`) && result.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await saved).status()).toBe(200);
    const enabled = (await read<Employee[]>(request, "/api/employees")).find((row) => row.employee_id === employee!.employee_id)!;
    expect(enabled.hidden_sidebar_tabs).toEqual([]);
    expect([enabled.warehouse_role, enabled.department_role, enabled.as_research_approver, enabled.pin_is_default])
      .toEqual([current.warehouse_role, current.department_role, current.as_research_approver, current.pin_is_default]);
    await login.reload();
    await login.getByRole("complementary").getByRole("button", { name: "설정", exact: true }).click();
    await expect(login.getByTestId("settings-admin-group").getByRole("button", { name: "관리", exact: true })).toBeVisible();
  } finally {
    if (employee) await changeEmployee(request, employee, { is_active: false });
    await login.close();
  }
});

test("8.19-13 저장된 담당 모델 순서는 실제 불량 격리 후보에서도 유지", async ({ page, request, actors }) => {
  const items: { item_id: string }[] = [];
  for (const slot of [1, 2]) {
    const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `불량담당순서${randomUUID().slice(0, 8)}`, process_type_code: "AR", model_slots: [slot], unit: "EA", initial_quantity: 2,
    } });
    expect(response.status()).toBe(201);
    items.push(await response.json());
  }
  await changeEmployee(request, actors.requester, { assigned_model_slots: [2, 1] });
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
  await choices.getByRole("button", { name: /^격리 등록/ }).click();
  await choices.getByRole("button", { name: /^창고 재고/ }).click();
  const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "순서 편집", exact: true }).click();
  const ordered = await picker.locator("tr[data-item-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-item-id")));
  expect(ordered.indexOf(items[0].item_id)).toBeGreaterThanOrEqual(0);
  expect(ordered.indexOf(items[1].item_id)).toBeGreaterThanOrEqual(0);
  expect(ordered.indexOf(items[1].item_id)).toBeLessThan(ordered.indexOf(items[0].item_id));
});

test("8.19-15 표시명 변경 후 같은 부서ID의 직원·공정품목 연결수와 재고 위치를 보존", async ({ page, request, actors }) => {
  const departments = await read<{ id: number; name: string; display_name: string | null }[]>(request, "/api/departments");
  const department = departments.find((department) => department.name === "튜브")!;
  const employees = await read(request, "/api/employees");
  const items = await read(request, "/api/items?limit=2000");
  await openAdmin(page, actors, "부서 관리");
  const row = page.locator(`[data-admin-department-row="${department.id}"]`);
  if (await row.getAttribute("aria-selected") !== "true") await row.click();
  const employeeCount = page.getByText("소속 직원", { exact: true }).locator("..");
  const itemCount = page.getByText("관련 품목", { exact: true }).locator("..");
  const employeeBefore = await employeeCount.textContent();
  const itemsBefore = await itemCount.textContent();
  expect(employeeBefore).toMatch(/[1-9]\d*명/);
  expect(itemsBefore).toMatch(/[1-9]\d*개/);
  const name = `튜브연결검수${randomUUID().slice(0, 8)}`;
  try {
    await page.getByRole("textbox", { name: "부서명", exact: true }).fill(name);
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/departments/${department.id}`) && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect((await response.json()).name).toBe("튜브");
    await expect(row).toContainText(name);
    await expect(employeeCount).toHaveText(employeeBefore!);
    await expect(itemCount).toHaveText(itemsBefore!);
    await expect(page.getByText(/공정 코드 매핑 없음/)).toHaveCount(0);
    expect(await read(request, "/api/employees")).toEqual(employees);
    expect(await read(request, "/api/items?limit=2000")).toEqual(items);
    const nav = page.getByRole("navigation", { name: "관리자 섹션" });
    await nav.getByRole("button", { name: "직원 관리", exact: true }).click();
    await nav.getByRole("button", { name: "부서 관리", exact: true }).click();
    if (await row.getAttribute("aria-selected") !== "true") await row.click();
    await expect(page.getByRole("textbox", { name: "부서명", exact: true })).toHaveValue(name);
    await expect(employeeCount).toHaveText(employeeBefore!);
    await expect(itemCount).toHaveText(itemsBefore!);
  } finally {
    const restored = await request.put(`/api/departments/${department.id}`, { headers: { "X-Admin-Pin": "0000" }, data: { pin: "0000", display_name: department.display_name ?? department.name } });
    expect(restored.ok(), await restored.text()).toBeTruthy();
  }
});
