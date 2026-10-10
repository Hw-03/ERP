import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api/types/items";
import { test, expect, loginUi, changeEmployee, type CommonActors } from "./_common-expectations";
import { clickNextStep } from "./_helpers";
import { downloadedRows } from "./_admin-export-expectations";
import { formatHistoryDateTimeLong } from "../../app/mes/_components/_history_sections/historyFormat";

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

async function fillNewItem(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await page.getByPlaceholder("예: 텅스텐 필라멘트").fill(name);
  await page.getByRole("button", { name: /DX3000 \(3\)/ }).click();
  await page.getByRole("button", { name: "+ 위치 추가", exact: true }).click();
  await page.getByPlaceholder("수량", { exact: true }).fill("20");
}

async function openPicker(page: Page): Promise<void> {
  await page.goto("/mes?tab=warehouse");
  await page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).first().click();
  await clickNextStep(page);
  await expect(page.getByRole("button", { name: "순서 편집", exact: true }).filter({ visible: true })).toBeVisible();
}

async function activityCsv(page: Page, info: Parameters<typeof downloadedRows>[1]): Promise<string[][]> {
  await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "내보내기", exact: true }).click();
  await page.getByRole("button", { name: "내부 원본 로그", exact: true }).click();
  await page.getByRole("button", { name: "작업 감사 로그", exact: true }).click();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
  await page.getByRole("combobox", { name: "작업 감사 대상 월", exact: true }).click();
  const [year, number] = month.split("-");
  await page.getByRole("option", { name: `${year}년 ${Number(number)}월`, exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /작업 감사 CSV 다운로드$/ }).click();
  return (await downloadedRows(await download, info)).rows;
}

test.use({ trace: "retain-on-failure" });

test("8.19-26 관리자 PIN 길이·확인 불일치 차단과 실제 저장 중 중복 제출 방지", async ({ page, request, actors }) => {
  await openAdmin(page, actors, "보안");
  const current = page.getByLabel("현재 PIN", { exact: true });
  const next = page.getByLabel("새 PIN", { exact: true });
  const confirm = page.getByLabel("새 PIN 확인", { exact: true });
  const save = page.getByRole("button", { name: "PIN 변경", exact: true });
  const writes: string[] = [];
  page.on("request", (value) => { if (value.url().endsWith("/api/settings/admin-pin") && value.method() === "PUT") writes.push(value.url()); });
  await current.fill("0000"); await next.fill("12"); await confirm.fill("12");
  await expect(save).toBeDisabled();
  await next.fill("5678"); await confirm.fill("1234");
  await expect(save).toBeDisabled();
  await expect(page.getByText("새 PIN과 일치하지 않습니다.", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await confirm.fill("5678");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/settings/admin-pin", async (route) => { await gate; await route.continue(); });
  let changed = false;
  try {
    const response = page.waitForResponse((value) => value.url().endsWith("/api/settings/admin-pin") && value.request().method() === "PUT");
    await save.click();
    await expect(page.getByRole("button", { name: "변경 중...", exact: true })).toBeDisabled();
    await expect(current).toBeDisabled(); await expect(next).toBeDisabled(); await expect(confirm).toBeDisabled();
    expect(writes).toHaveLength(1);
    release();
    expect((await response).status()).toBe(200); changed = true;
    await expect(current).toHaveValue(""); await expect(next).toHaveValue(""); await expect(confirm).toHaveValue("");
    expect((await request.post("/api/settings/verify-pin", { data: { pin: "5678" } })).ok()).toBe(true);
    expect(writes).toHaveLength(1);
  } finally {
    release(); await page.unroute("**/api/settings/admin-pin");
    if (changed) {
      const restored = await request.put("/api/settings/admin-pin", { data: { current_pin: "5678", new_pin: "0000" } });
      expect(restored.ok(), await restored.text()).toBe(true);
    }
  }
});

test("8.19-04 전체 페이지의 고유 품목과 화면 총수·처음·마지막 상세가 일치", async ({ page, request, actors }) => {
  const population: Item[] = [];
  for (let skip = 0; ; skip += 100) {
    const batch = await read<Item[]>(request, `/api/items?skip=${skip}&limit=100`);
    population.push(...batch);
    if (batch.length < 100) break;
  }
  expect(population.length).toBeGreaterThan(0);
  expect(new Set(population.map((item) => item.item_id)).size).toBe(population.length);
  await openAdmin(page, actors, "품목 관리");
  const rows = page.getByRole("grid", { name: "품목 목록" }).locator("[data-item-id]");
  await expect(rows).toHaveCount(population.length);
  const displayedIds = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-item-id")));
  expect(new Set(displayedIds).size).toBe(population.length);
  expect([...displayedIds].sort()).toEqual(population.map((item) => item.item_id).sort());
  const total = page.getByText("전체 품목", { exact: true }).locator("..");
  await expect(total).toContainText(String(population.length));
  for (const item of [population[0], population[population.length - 1]]) {
    await page.getByPlaceholder("품목명, 코드 검색").fill(item.mes_code ?? item.item_name);
    const row = page.locator(`[data-item-id="${item.item_id}"]`);
    await expect(row).toBeVisible();
    if (await row.getAttribute("aria-selected") !== "true") await row.click();
    await expect(page.getByPlaceholder("예: 텅스텐 필라멘트")).toHaveValue(item.item_name);
    await expect(page.locator("[aria-readonly]")).toHaveText(item.mes_code!);
  }
  await page.getByPlaceholder("품목명, 코드 검색").fill("");
  await expect(rows).toHaveCount(population.length);
});

test("8.19-14 상태 필터의 실제 빈 결과는 정상 안내이며 해제하면 전체 부서 복원", async ({ page, request, actors }) => {
  const population = await read<{ id: number; name: string; is_active: boolean }[]>(request, "/api/departments");
  expect(population.length).toBeGreaterThan(0);
  await openAdmin(page, actors, "부서 관리");
  const rows = page.locator("[data-admin-department-row]");
  const search = page.getByPlaceholder("부서명 검색");
  const selected = population[0];
  await search.fill(`DPT-${String(selected.id).padStart(2, "0")}`);
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: selected.is_active ? "비활성" : "사용 중", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("검색 결과가 없습니다.", { exact: true })).toBeVisible();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  await search.fill("");
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(rows).toHaveCount(population.length);
  expect(await read(request, "/api/departments")).toEqual(population);
});

test("8.19-10 관리자 표시탭 저장 뒤 새 로그인 메뉴와 직접 URL 접근이 일치", async ({ page, context, request, actors }) => {
  await openAdmin(page, actors, "직원 관리");
  await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
  await page.getByRole("checkbox", { name: "출하", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "창고 지도", exact: true }).uncheck();
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saved).status()).toBe(200);
  const persisted = (await read<typeof actors.requester[]>(request, "/api/employees")).find((employee) => employee.employee_id === actors.requester.employee_id)!;
  expect(persisted.hidden_sidebar_tabs).toEqual(expect.arrayContaining(["shipping", "warehouseMap"]));
  const employeePage = await context.newPage();
  try {
    await loginUi(employeePage, actors.requester);
    await expect(employeePage.getByRole("button", { name: "출하", exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(employeePage.getByRole("button", { name: "창고 지도", exact: true }).filter({ visible: true })).toHaveCount(0);
    for (const tab of ["shipping", "warehouseMap"]) {
      await employeePage.goto(`/mes?tab=${tab}`);
      await expect(employeePage).toHaveURL(/tab=dashboard/);
      await expect(employeePage.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
    }
  } finally { await employeePage.close(); }
});

test("8.19-08 이미 열린 로그인 후보는 실제 직원 이름 변경·비활성화를 갱신", async ({ page, context, request, actors }) => {
  await openAdmin(page, actors, "직원 관리");
  const login = await context.newPage();
  try {
    await login.goto("/mes?tab=dashboard");
    const candidate = login.getByRole("combobox");
    await candidate.fill(actors.requester.employee_code);
    await expect(login.getByRole("option", { name: new RegExp(actors.requester.name) })).toBeVisible();
    const name = `직원갱신${randomUUID().slice(0, 8)}`;
    await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
    await page.getByRole("textbox", { name: "이름", exact: true }).fill(name);
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}`) && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`)).toContainText(name);
    await login.bringToFront();
    await login.evaluate(() => window.dispatchEvent(new Event("focus")));
    await candidate.fill(actors.requester.employee_code);
    await expect(login.getByRole("option", { name: new RegExp(name) })).toBeVisible({ timeout: 30_000 });
    await expect(login.getByRole("option", { name: new RegExp(actors.requester.name) })).toHaveCount(0);
    await changeEmployee(request, actors.requester, { is_active: false });
    await login.evaluate(() => window.dispatchEvent(new Event("focus")));
    await candidate.fill("");
    await candidate.fill(actors.requester.employee_code);
    await expect(login.getByRole("option", { name: new RegExp(name) })).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await changeEmployee(request, actors.requester, { name: actors.requester.name, is_active: true });
    await login.close();
  }
});

test("8.19-05 두 직원 탭의 동시 생성은 고유 코드·정확한 초기재고를 만들고 실패 폼을 보존", async ({ page, context, request, actors }) => {
  const suffix = randomUUID().slice(0, 8);
  const second = await context.newPage();
  const names = [`품목동시${suffix}-정`, `품목동시${suffix}-부`];
  const original = await read<Item[]>(request, "/api/items?limit=2000");
  try {
    await openAdmin(page, actors, "품목 관리");
    await openAdmin(second, { ...actors, approver: actors.other }, "품목 관리");
    await fillNewItem(page, names[0]);
    await fillNewItem(second, names[1]);
    const previewCodes = [];
    for (const tab of [page, second]) {
      await expect(tab.locator("[aria-readonly]")).toHaveText(/^\d+-TR-\d{4}$/);
      previewCodes.push(await tab.locator("[aria-readonly]").innerText());
    }
    expect(previewCodes[0]).toBe(previewCodes[1]);
    await page.route("**/api/items", (route) => route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { detail: "품목 생성 검수 실패" } }) : route.continue());
    await page.getByRole("button", { name: "추가", exact: true }).last().click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("품목 생성 검수 실패");
    await expect(page.getByPlaceholder("예: 텅스텐 필라멘트")).toHaveValue(names[0]);
    await expect(page.getByPlaceholder("수량", { exact: true })).toHaveValue("20");
    expect(await read<Item[]>(request, "/api/items?limit=2000")).toEqual(original);
    await page.unroute("**/api/items");
    const writes = [page, second].map((tab) => tab.waitForResponse((response) => response.url().endsWith("/api/items") && response.request().method() === "POST"));
    await Promise.all([page, second].map((tab) => tab.getByRole("button", { name: "추가", exact: true }).last().click()));
    const responses = await Promise.all(writes);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const conflicted = responses.findIndex((response) => response.status() === 409);
    const conflictPage = [page, second][conflicted];
    await expect(conflictPage.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("품목 코드가 변경됐습니다.");
    await expect(conflictPage.getByPlaceholder("예: 텅스텐 필라멘트")).toHaveValue(names[conflicted]);
    await expect(conflictPage.getByPlaceholder("수량", { exact: true })).toHaveValue("20");
    await expect(conflictPage.locator("[aria-readonly]")).toHaveText(/^\d+-TR-\d{4}$/);
    await expect(conflictPage.locator("[aria-readonly]")).not.toHaveText(previewCodes[conflicted]);
    previewCodes[conflicted] = await conflictPage.locator("[aria-readonly]").innerText();
    const retryWrite = conflictPage.waitForResponse((response) => response.url().endsWith("/api/items") && response.request().method() === "POST");
    await conflictPage.getByRole("button", { name: "추가", exact: true }).last().click();
    const retried = await retryWrite;
    expect(retried.status()).toBe(201);
    const created: Item[] = await Promise.all(responses.map((response, index) => index === conflicted ? retried.json() : response.json()));
    expect(new Set(created.map((item) => item.mes_code)).size).toBe(2);
    expect(new Set(created.map((item) => item.item_id)).size).toBe(2);
    for (const [index, item] of created.entries()) {
      expect(item.item_name).toBe(names[index]);
      expect(item.mes_code).toBe(previewCodes[index]);
      const current = await read<Item>(request, `/api/items/${item.item_id}`);
      expect(current.warehouse_qty).toBe(20);
      const logs = await read<{ quantity_change: number; warehouse_qty_before: number; warehouse_qty_after: number }[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=100`);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ quantity_change: 20, warehouse_qty_before: 0, warehouse_qty_after: 20 });
      await expect([page, second][index].locator(`[data-item-id="${item.item_id}"]`)).toContainText(item.mes_code!);
    }
    const after = await read<Item[]>(request, "/api/items?limit=2000");
    const existing = after.filter((item) => !created.some((newItem) => newItem.item_id === item.item_id));
    expect(existing.map((item) => item.item_id)).toEqual(original.map((item) => item.item_id));
    expect(created.every((item) => item.process_type_code === "TR")).toBe(true);
    const insertAt = original.findLastIndex((item) => item.process_type_code === "TR") + 1;
    const inserted = after.filter((item) => created.some((newItem) => newItem.item_id === item.item_id));
    expect(after.map((item) => item.item_id)).toEqual([
      ...original.slice(0, insertAt).map((item) => item.item_id),
      ...inserted.map((item) => item.item_id),
      ...original.slice(insertAt).map((item) => item.item_id),
    ]);
    for (const [index, item] of existing.entries()) {
      // insert_item_at_process_end reindexes later rows; Item.onupdate records that order change.
      const { updated_at: beforeTime, ...beforeContent } = original[index];
      const { updated_at: afterTime, ...afterContent } = item;
      expect(afterContent).toEqual(beforeContent);
      if (index < insertAt) expect(afterTime).toBe(beforeTime);
      else expect(new Date(afterTime).getTime()).toBeGreaterThan(new Date(beforeTime).getTime());
    }
  } finally {
    await page.unroute("**/api/items");
    await second.close();
  }
});

test("8.19-13 실제 담당 모델 순서 저장·재진입·새 로그인은 조립 업무 후보에 같은 우선순위", async ({ page, context, request, actors }) => {
  const models = await read<{ slot: number; model_name: string }[]>(request, "/api/models");
  const chosen = [models.find((model) => model.slot === 1)!, models.find((model) => model.slot === 2)!];
  const items: Item[] = [];
  for (const model of chosen) {
    const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code }, data: {
      item_name: `담당순서${randomUUID().slice(0, 8)}`, process_type_code: "AR", unit: "EA", model_slots: [model.slot], initial_quantity: 2,
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    items.push(await response.json());
  }
  await openAdmin(page, actors, "직원 관리");
  await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
  for (const model of chosen) await page.getByRole("button", { name: `+ ${model.model_name}`, exact: true }).click();
  await page.getByRole("button", { name: "우선순위 올리기", exact: true }).nth(1).click();
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saved).status()).toBe(200);
  const persisted = (await read<typeof actors.requester[]>(request, "/api/employees")).find((employee) => employee.employee_id === actors.requester.employee_id)!;
  expect(persisted.assigned_model_slots).toEqual([2, 1]);
  const nav = page.getByRole("navigation", { name: "관리자 섹션" });
  await nav.getByRole("button", { name: "부서 관리", exact: true }).click();
  await nav.getByRole("button", { name: "직원 관리", exact: true }).click();
  await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
  const priorities = page.getByRole("button", { name: "우선순위 올리기", exact: true }).locator("..");
  await expect(priorities.nth(0)).toContainText(chosen[1].model_name);
  await expect(priorities.nth(1)).toContainText(chosen[0].model_name);
  const employeePage = await context.newPage();
  try {
    await loginUi(employeePage, actors.requester);
    await openPicker(employeePage);
    await employeePage.getByRole("button", { name: "순서 편집", exact: true }).filter({ visible: true }).click();
    const order = await employeePage.locator("tr[data-item-id]").filter({ visible: true }).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-item-id")));
    expect(order.indexOf(items[0].item_id)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(items[1].item_id)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(items[1].item_id)).toBeLessThan(order.indexOf(items[0].item_id));
  } finally { await employeePage.close(); }
});

test("PC-DELTA-IOORDER-01 실제 드래그 저장·재진입·새로고침·초기화는 다른 직원 탭 순서를 보존", async ({ page, context, request, actors }) => {
  const other = await context.newPage();
  async function editOrder(tab: Page): Promise<void> {
    await openPicker(tab);
    await tab.getByRole("button", { name: "순서 편집", exact: true }).filter({ visible: true }).click();
    await expect(tab.locator("tr[data-item-id]").first()).toBeVisible();
  }
  async function ids(tab: Page): Promise<string[]> {
    return tab.locator("tr[data-item-id]").filter({ visible: true }).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-item-id")!));
  }
  try {
    await loginUi(page, actors.requester);
    await loginUi(other, actors.other);
    await editOrder(page);
    await editOrder(other);
    const baseline = await ids(page);
    const otherBaseline = await ids(other);
    expect(baseline.length).toBeGreaterThan(1);
    const source = page.locator(`tr[data-item-id="${baseline[0]}"] [aria-label="드래그 핸들"]`);
    const destination = page.locator(`tr[data-item-id="${baseline[1]}"]`);
    await source.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    const destinationBox = await destination.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(destinationBox).not.toBeNull();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(destinationBox!.x + 40, destinationBox!.y + destinationBox!.height / 2, { steps: 6 });
    await page.mouse.up();
    const expected = [baseline[1], baseline[0], ...baseline.slice(2)];
    expect(await ids(page)).toEqual(expected);
    const saved = page.waitForResponse((response) => response.url().includes("/api/items/my-order") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "저장", exact: true }).filter({ visible: true }).click();
    expect((await saved).status()).toBe(200);
    const persisted = await read<{ item_id: string; display_order: number }[]>(request, `/api/items/my-order?employee_id=${actors.requester.employee_id}`);
    expect([...persisted].sort((left, right) => left.display_order - right.display_order).map((row) => row.item_id)).toEqual(expected);
    await editOrder(page);
    expect(await ids(page)).toEqual(expected);
    await page.reload();
    await editOrder(page);
    expect(await ids(page)).toEqual(expected);
    expect(await ids(other)).toEqual(otherBaseline);
    expect(await read(request, `/api/items/my-order?employee_id=${actors.other.employee_id}`)).toEqual([]);
    const reset = page.waitForResponse((response) => response.url().includes("/api/items/my-order") && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "기본 순서로 초기화", exact: true }).click();
    expect((await reset).status()).toBe(200);
    await page.getByRole("button", { name: "순서 편집", exact: true }).filter({ visible: true }).click();
    await expect.poll(() => ids(page)).toEqual(baseline);
    expect(await read(request, `/api/items/my-order?employee_id=${actors.requester.employee_id}`)).toEqual([]);
    expect(await ids(other)).toEqual(otherBaseline);
  } finally {
    const reset = await request.delete(`/api/items/my-order?employee_id=${actors.requester.employee_id}`, { headers: { "X-MES-Employee-Code": actors.requester.employee_code } });
    expect(reset.ok(), await reset.text()).toBeTruthy();
    await other.close();
  }
});

test("PC-DELTA-ADMIN-04 PC-DELTA-ADMIN-05 실제 품목 생성·수정 감사 사번과 초기20개 거래 상세", async ({ page, request, actors }, info) => {
  const name = `초기재고감사${randomUUID().slice(0, 8)}`;
  await openAdmin(page, actors, "품목 관리");
  await fillNewItem(page, name);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/items") && response.request().method() === "POST");
  await page.getByRole("button", { name: "추가", exact: true }).last().click();
  const createResponse = await created;
  expect(createResponse.status()).toBe(201);
  const item: Item = await createResponse.json();
  const createRequestId = createResponse.headers()["x-request-id"];
  expect(createRequestId).toBeTruthy();
  const row = page.locator(`[data-item-id="${item.item_id}"]`);
  await expect(row).toBeVisible();
  if (await row.getAttribute("aria-selected") !== "true") await row.click();
  await page.getByPlaceholder("예: 텅스텐 필라멘트").fill(`${name}-수정`);
  const updated = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const updateResponse = await updated;
  expect(updateResponse.status()).toBe(200);
  const updateRequestId = updateResponse.headers()["x-request-id"];
  expect(updateRequestId).toBeTruthy();
  const csv = await activityCsv(page, info);
  const actions = [createRequestId, updateRequestId].map((id) => csv.filter((record) => record[10] === id));
  expect(actions.map((records) => records.length)).toEqual([1, 1]);
  for (const records of actions) {
    expect(records[0][1]).toBe(actors.approver.name);
    expect(records[0][2]).toBe(actors.approver.employee_code);
    expect(records[0][7]).toBe("성공");
    expect(records[0][0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  }
  expect(actions.map((records) => records[0][6])).toEqual(["POST /api/items", "PUT /api/items/:id"]);
  expect(actions[1][0][11]).toBe(item.item_id);
  const logs = await read<{ log_id: string; created_at: string; warehouse_qty_before: number; warehouse_qty_after: number; produced_by: string }[]>(request, `/api/inventory/transactions?item_id=${item.item_id}`);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ warehouse_qty_before: 0, warehouse_qty_after: 20, produced_by: actors.approver.name });
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(`${name}-수정`);
  await page.locator(`[data-log-id="${logs[0].log_id}"]`).first().click();
  const detail = page.locator(`[data-history-detail-log-id="${logs[0].log_id}"]`);
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("history-stock-movement-summary")).toContainText(/창고.*0\s*20/);
  await expect(detail.getByTestId("history-participant-row")).toContainText(actors.approver.name);
  await expect(detail.getByTestId("history-participant-row")).toContainText(formatHistoryDateTimeLong(logs[0].created_at));
  expect((await read<Item>(request, `/api/items/${item.item_id}`)).warehouse_qty).toBe(20);
});

test("8.19-11 지정 직원 PIN 초기화 상세·시각·감사 변경자·이전PIN 거부를 실제 확인", async ({ page, request, actors }, info) => {
  const changed = await request.post(`/api/employees/${actors.requester.employee_id}/change-pin`, { data: { current_pin: "0000", new_pin: "1234" } });
  expect(changed.status()).toBe(204);
  await openAdmin(page, actors, "직원 관리");
  await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
  await expect(page.getByText("직원 설정 PIN", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PIN 초기화 (0000)", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: `${actors.requester.name}' 직원의 PIN` });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("0000").fill("0000");
  const reset = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}/reset-pin`) && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "초기화", exact: true }).click();
  const response = await reset;
  expect(response.status()).toBe(204);
  await expect(page.getByText("기본 PIN (0000)", { exact: true })).toBeVisible();
  const employees = await read<typeof actors.requester[]>(request, "/api/employees");
  const employee = employees.find((employee) => employee.employee_id === actors.requester.employee_id)!;
  expect(employee.pin_last_changed).toBeTruthy();
  await expect(page.getByText(/마지막 변경:/)).toContainText(new Date(employee.pin_last_changed!).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }));
  const oldPin = await request.post(`/api/employees/${employee.employee_id}/verify-pin`, { data: { pin: "1234" } });
  expect(oldPin.status()).toBe(403);
  const currentPin = await request.post(`/api/employees/${employee.employee_id}/verify-pin`, { data: { pin: "0000" } });
  expect(currentPin.status()).toBe(200);
  const csv = await activityCsv(page, info);
  const audit = csv.filter((record) => record[10] === response.headers()["x-request-id"]);
  expect(audit).toHaveLength(1);
  expect(audit[0][1]).toBe(actors.approver.name);
  expect(audit[0][2]).toBe(actors.approver.employee_code);
  expect(audit[0][11]).toBe(actors.requester.employee_id);
  expect(audit[0][0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(audit[0][7]).toBe("성공");
});
