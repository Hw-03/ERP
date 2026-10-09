import { randomUUID } from "crypto";
import { type APIRequestContext, type Page } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), `${url}: ${response.status()}`).toBeTruthy();
  return response.json();
}
async function openAdmin(page: Page, actors: CommonActors, section: string) {
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
async function chooseOption(page: Page, field: string, label: string) {
  const container = page.getByText(field, { exact: true }).filter({ visible: true }).locator("..");
  await container.getByRole("combobox").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function physical(request: APIRequestContext, itemId: string) {
  const item = await json(request, `/api/items/${itemId}`);
  return { quantity: item.quantity, warehouse_qty: item.warehouse_qty,
    pending_quantity: item.pending_quantity, defective_qty: item.defective_qty,
    locations: await json(request, `/api/inventory/locations/${itemId}`),
    transactions: await json(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`) };
}
async function selectItem(page: Page, itemId: string) {
  const row = page.locator(`[data-item-id="${itemId}"]`).filter({ visible: true });
  await expect(row).toBeVisible();
  await row.click();
}

async function selectDepartment(page: Page, departmentId: number) {
  const row = page.locator(`[data-admin-department-row="${departmentId}"]`);
  await expect(row).toBeVisible();
  if (await row.getAttribute("aria-selected") !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
}

test.describe("관리자 원자 기대의 실제 화면 회귀", () => {

  test("8.19-14 부서 이름·코드 검색과 상태 필터 해제는 같은 전체 모집단", async ({ page, request, actors }) => {
    const population = await json(request, "/api/departments");
    expect(population.length).toBeGreaterThan(0);
    await openAdmin(page, actors, "부서 관리");
    const rows = page.locator("[data-admin-department-row]");
    await expect(rows).toHaveCount(population.length);
    const selected = population[0];
    const search = page.getByPlaceholder("부서명 검색");
    await search.fill(`DPT-${String(selected.id).padStart(2, "0")}`);
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute("data-admin-department-row", String(selected.id));
    await search.fill(selected.display_name ?? selected.name);
    await expect(page.locator(`[data-admin-department-row="${selected.id}"]`)).toBeVisible();
    await search.fill("");
    await page.getByRole("button", { name: "사용 중", exact: true }).click();
    await expect(rows).toHaveCount(population.filter((row: { is_active: boolean }) => row.is_active).length);
    await page.getByRole("button", { name: "비활성", exact: true }).click();
    await expect(rows).toHaveCount(population.filter((row: { is_active: boolean }) => !row.is_active).length);
    await page.getByRole("button", { name: "전체", exact: true }).click();
    await expect(rows).toHaveCount(population.length);
    expect(await json(request, "/api/departments")).toEqual(population);
  });

  test("8.19-15 표시명 저장·재진입은 위치키와 전체 재고·이력·직원 연결을 보존", async ({ page, request, actors }) => {
    const itemId = readSeed().rawItem.item_id;
    const original = (await json(request, "/api/departments")).find((row: { name: string }) => row.name === "튜브");
    expect(original).toBeTruthy();
    const before = await physical(request, itemId);
    const employeesBefore = await json(request, "/api/employees");
    const label = `튜브 검수 ${randomUUID().slice(0, 6)}`;
    try {
      await openAdmin(page, actors, "부서 관리");
      await selectDepartment(page, original.id);
      await page.getByRole("textbox", { name: "부서명", exact: true }).fill(label);
      const saved = page.waitForResponse((response) => response.url().endsWith(`/api/departments/${original.id}`) && response.request().method() === "PUT");
      await page.getByRole("button", { name: "저장", exact: true }).click();
      const response = await saved;
      expect(response.status()).toBe(200);
      expect((await response.json()).name).toBe("튜브");
      await expect(page.locator(`[data-admin-department-row="${original.id}"]`)).toContainText(label);
      await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "직원 관리", exact: true }).click();
      await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "부서 관리", exact: true }).click();
      await selectDepartment(page, original.id);
      await expect(page.getByRole("textbox", { name: "부서명", exact: true })).toHaveValue(label);
      expect(await physical(request, itemId)).toEqual(before);
      expect(await json(request, "/api/employees")).toEqual(employeesBefore);
    } finally {
      const restored = await request.put(`/api/departments/${original.id}`, { headers: ADMIN, data: { pin: "0000", display_name: original.display_name ?? original.name } });
      expect(restored.ok(), await restored.text()).toBeTruthy();
    }
  });

  test("8.19-08 8.19-09 8.19-10 직원 이름·독립 역할 저장과 재진입", async ({ page, request, actors }) => {
    await openAdmin(page, actors, "직원 관리");
    const row = page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`);
    await row.click();
    await expect(page.getByRole("combobox", { name: /등급|ADMIN|MANAGER|STAFF/ })).toHaveCount(0);
    const newName = `역할 검수 ${randomUUID().slice(0, 6)}`;
    await page.getByRole("textbox", { name: "이름", exact: true }).fill(newName);
    await chooseOption(page, "창고 결재 역할", "부");
    await chooseOption(page, "부서 결재 역할", "정");
    await page.getByRole("checkbox", { name: "AS·연구 승인 권한", exact: true }).check();
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}`) && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await saved).status()).toBe(200);
    const current = (await json(request, "/api/employees")).find((employee: { employee_id: string }) => employee.employee_id === actors.requester.employee_id);
    expect({ name: current.name, warehouse_role: current.warehouse_role, department_role: current.department_role, as_research_approver: current.as_research_approver })
      .toEqual({ name: newName, warehouse_role: "deputy", department_role: "primary", as_research_approver: true });
    await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "부서 관리", exact: true }).click();
    await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "직원 관리", exact: true }).click();
    await row.click();
    await expect(page.getByRole("textbox", { name: "이름", exact: true })).toHaveValue(newName);
    await expect(page.getByRole("checkbox", { name: "AS·연구 승인 권한", exact: true })).toBeChecked();
    const login = await request.post(`/api/employees/${actors.requester.employee_id}/verify-pin`, { data: { pin: "0000" } });
    expect(login.ok()).toBeTruthy();
    expect((await login.json()).name).toBe(newName);
  });

  test("8.19-12 직원 삭제는 대기 업무 안내와 함께 차단하고 요청·예약·현재직원을 보존", async ({ page, request, actors }) => {
    const itemId = readSeed().rawItem.item_id;
    const pending = await request.post("/api/stock-requests", { data: {
      requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept",
      lines: [{ item_id: itemId, quantity: 1, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" }],
    } });
    expect(pending.ok(), await pending.text()).toBeTruthy();
    const work = await pending.json();
    expect(work.status).toBe("reserved");
    try {
      const before = await physical(request, itemId);
      await openAdmin(page, actors, "직원 관리");
      await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
      await page.getByRole("button", { name: "직원 삭제", exact: true }).click();
      const dialog = page.getByRole("dialog").filter({ hasText: "삭제" });
      await expect(dialog).toBeVisible();
      const deleted = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}`) && response.request().method() === "DELETE");
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();
      expect((await deleted).status()).toBe(409);
      await expect(page.getByRole("alert").filter({ hasText: "진행 중인 업무" })).toBeVisible();
      expect(await physical(request, itemId)).toEqual(before);
      const employees = await json(request, "/api/employees");
      expect(employees.find((employee: { employee_id: string }) => employee.employee_id === actors.requester.employee_id).is_active).toBe(true);
      expect((await json(request, `/api/stock-requests/${work.request_id}`)).status).toBe("reserved");
    } finally {
      const cancelled = await request.post(`/api/stock-requests/${work.request_id}/cancel`, { data: { actor_employee_id: actors.requester.employee_id, pin: "0000" } });
      expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
    }
  });

  test("PC-DELTA-ADMIN-03 구매 기준 실패 보존·재시도·재진입과 다른 품목/재고 무변경", async ({ page, request, actors }) => {
    const itemId = readSeed().rawItem.item_id;
    const original = await json(request, `/api/items/${itemId}`);
    const before = await physical(request, itemId);
    const otherId = (await json(request, "/api/items?limit=2000")).find((item: { item_id: string }) => item.item_id !== itemId).item_id;
    const otherBefore = await json(request, `/api/items/${otherId}`);
    const otherStockBefore = await physical(request, otherId);
    const keys = ["supplier", "supplier_item_code", "standard_purchase_price", "purchase_price_effective_date", "min_stock", "reorder_point", "procurement_lead_time_days", "minimum_order_quantity", "purchase_memo"];
    const restore = Object.fromEntries(keys.map((key) => [key, original[key]]));
    const changed = { supplier: "검수 공급사", supplier_item_code: "QA-CODE", standard_purchase_price: "125.75",
      purchase_price_effective_date: "2026-10-01", min_stock: 2, reorder_point: 6,
      procurement_lead_time_days: 3, minimum_order_quantity: 4, purchase_memo: "구매 검수 메모" };
    const fields: [string, string][] = [["주 공급사", changed.supplier], ["공급사 품번", changed.supplier_item_code],
      ["기준 매입단가", changed.standard_purchase_price], ["단가 기준일", changed.purchase_price_effective_date],
      ["안전재고", "2"], ["발주점", "6"], ["조달 리드타임", "3"], ["최소 발주수량(MOQ)", "4"], ["구매 메모", changed.purchase_memo]];
    try {
      await openAdmin(page, actors, "품목 관리");
      await selectItem(page, itemId);
      await page.getByRole("tab", { name: "재고·구매", exact: true }).click();
      for (const [label, value] of fields) {
        const field = label === "구매 메모" ? page.getByRole("textbox", { name: label, exact: true }) : page.getByLabel(label, { exact: true });
        await field.fill(value);
      }
      await page.route(`**/api/items/${itemId}`, (route) => route.request().method() === "PUT"
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "구매 저장 일시 실패" }) }) : route.continue());
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "구매 저장 일시 실패" })).toBeVisible();
      expect(await json(request, `/api/items/${itemId}`)).toEqual(original);
      expect(await physical(request, itemId)).toEqual(before);
      await page.unroute(`**/api/items/${itemId}`);
      const saved = page.waitForResponse((response) => response.url().endsWith(`/api/items/${itemId}`) && response.request().method() === "PUT");
      await page.getByRole("button", { name: "저장", exact: true }).click();
      expect((await saved).status()).toBe(200);
      const reread = await json(request, `/api/items/${itemId}`);
      for (const [key, value] of Object.entries(changed)) expect(reread[key]).toEqual(value);
      await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "모델 관리", exact: true }).click();
      await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "품목 관리", exact: true }).click();
      await selectItem(page, itemId);
      await page.getByRole("tab", { name: "재고·구매", exact: true }).click();
      for (const [label, value] of fields) {
        const field = label === "구매 메모" ? page.getByRole("textbox", { name: label, exact: true }) : page.getByLabel(label, { exact: true });
        await expect(field).toHaveValue(value);
      }
      expect(await physical(request, itemId)).toEqual(before);
      expect(await json(request, `/api/items/${otherId}`)).toEqual(otherBefore);
      expect(await physical(request, otherId)).toEqual(otherStockBefore);
    } finally {
      await page.unroute(`**/api/items/${itemId}`);
      const restored = await request.put(`/api/items/${itemId}`, { headers: ADMIN, data: restore });
      expect(restored.ok(), await restored.text()).toBeTruthy();
    }
  });

  test("8.19-02 8.19-03 PC-DELTA-CACHE02 다른 탭 모델명 변경과 통신 차단 후 온라인 복귀", async ({ page, browser, request, actors }) => {
    const itemId = readSeed().rawItem.item_id;
    const item = await json(request, `/api/items/${itemId}`);
    const model = (await json(request, "/api/models")).find((model: { slot: number }) => item.model_slots.includes(model.slot));
    expect(model?.model_name).toBeTruthy();
    const before = await physical(request, itemId);
    await openAdmin(page, actors, "모델 관리");
    const secondContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 1440, height: 900 } });
    const second = await secondContext.newPage();
    const label = `모델 검수 ${randomUUID().slice(0, 6)}`;
    const network: Array<Record<string, unknown>> = [];
    second.on("response", (response) => {
      if (/\/api\/(models|realtime\/revision)/.test(response.url())) network.push({ url: response.url(), status: response.status() });
    });
    second.on("requestfailed", (request) => {
      if (/\/api\/(models|realtime)/.test(request.url())) network.push({ url: request.url(), failure: request.failure()?.errorText });
    });
    try {
      await openAdmin(second, actors, "모델 관리");
      await second.bringToFront();
      await expect(second.getByRole("grid", { name: "모델 목록" }).getByRole("row").filter({ hasText: model.model_name })).toBeVisible();
      await secondContext.setOffline(true);
      await page.getByRole("grid", { name: "모델 목록" }).getByRole("row").filter({ hasText: model.model_name }).click();
      const name = page.getByPlaceholder("모델명 입력");
      await name.fill("");
      const invalidWrites: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith(`/api/models/${model.slot}`) && request.method() === "PUT") invalidWrites.push(request.url());
      });
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "모델명" })).toBeVisible();
      expect(invalidWrites).toEqual([]);
      expect((await json(request, "/api/models")).find((row: { slot: number }) => row.slot === model.slot).model_name).toBe(model.model_name);
      await expect(name).toHaveValue("");
      const models = await json(request, "/api/models");
      const duplicate = models.find((row: { slot: number; model_name: string }) => row.slot !== model.slot && row.model_name);
      expect(duplicate).toBeTruthy();
      await name.fill(duplicate.model_name);
      const rejected = page.waitForResponse((response) => response.url().endsWith(`/api/models/${model.slot}`) && response.request().method() === "PUT");
      await page.getByRole("button", { name: "저장", exact: true }).click();
      expect((await rejected).status()).toBe(409);
      await expect(page.getByRole("alert").filter({ hasText: "같은 이름" })).toBeVisible();
      const symbol = page.getByPlaceholder("예: A", { exact: true });
      await symbol.fill("ABCDEF");
      await expect(symbol).toHaveValue("ABCDE");
      await symbol.fill(model.symbol);
      const allItems: { model_slots: number[] }[] = [];
      for (let skip = 0; ; skip += 2000) {
        const rows = await json(request, `/api/items?skip=${skip}&limit=2000`);
        allItems.push(...rows);
        if (rows.length < 2000) break;
      }
      const linkedCount = allItems.filter((row: { model_slots: number[] }) => row.model_slots.includes(model.slot)).length;
      await expect(page.getByText("연결 품목 수", { exact: true }).locator("..")).toContainText(String(linkedCount));
      await name.fill(label);
      const saved = page.waitForResponse((response) => response.url().endsWith(`/api/models/${model.slot}`) && response.request().method() === "PUT");
      await page.getByRole("button", { name: "저장", exact: true }).click();
      expect((await saved).status()).toBe(200);
      await expect(second.getByRole("grid", { name: "모델 목록" }).getByRole("row").filter({ hasText: model.model_name })).toBeVisible();
      await second.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "직원 관리", exact: true }).click();
      await second.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "모델 관리", exact: true }).click();
      await secondContext.setOffline(false);
      await second.bringToFront();
      try {
        await expect(second.getByRole("grid", { name: "모델 목록" }).getByRole("row").filter({ hasText: label })).toBeVisible({ timeout: 30_000 });
      } finally {
        await test.info().attach("model-offline-recovery", { contentType: "application/json", body: JSON.stringify({
          state: await second.evaluate(() => ({ online: navigator.onLine, visibility: document.visibilityState, focused: document.hasFocus() })),
          network, modelSlot: model.slot, expectedName: label,
          serverModel: (await json(request, "/api/models")).find((row: { slot: number }) => row.slot === model.slot),
        }) });
      }
      const current = await json(request, `/api/items/${itemId}`);
      expect(current.mes_code).toBe(item.mes_code);
      expect(current.model_slots).toEqual(item.model_slots);
      expect(await physical(request, itemId)).toEqual(before);
    } finally {
      await secondContext.setOffline(false);
      const restored = await request.put(`/api/models/${model.slot}`, { headers: ADMIN, data: { pin: "0000", model_name: model.model_name } });
      expect(restored.ok(), await restored.text()).toBeTruthy();
      await secondContext.close();
    }
  });
});
