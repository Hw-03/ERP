import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Employee, Item } from "../../lib/api";
import { test, expect, changeEmployee, loginUi, openNotifications, type CommonActors } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

const queuePattern = /\/api\/stock-requests\/as-research-queue\?/;
const alerts = '[role="alert"]:not(#__next-route-announcer__)';
async function read<T>(request: APIRequestContext, url: string, actorId?: string): Promise<T> {
  const response = await request.get(url, actorId ? { headers: { "X-Actor-Employee-Id": actorId } } : undefined);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function fixture(request: APIRequestContext, actors: CommonActors, code = "AR"): Promise<Item> {
  const department = code === "TR" ? "튜브" : "조립";
  const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code }, data: {
    item_name: `승인UI${randomUUID().slice(0, 8)}`, process_type_code: code, model_slots: [1], unit: "EA",
    initial_quantity: 8, initial_locations: [{ department, quantity: 8 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return read(request, `/api/items/${(await response.json()).item_id}`);
}
async function submit(request: APIRequestContext, employee: Employee, item: Item): Promise<string> {
  const payload = { requester_employee_id: employee.employee_id, work_type: "internal_use", sub_type: "internal_use_out", to_department: "AS" };
  const preview = await request.post("/api/io/preview", { data: { ...payload, targets: [{ source_kind: "manual", source_location: "department", item_id: item.item_id, quantity: 1 }] } });
  expect(preview.status(), await preview.text()).toBe(200);
  const result = await request.post("/api/io/submit", { data: { ...payload, bundles: (await preview.json()).bundles } });
  expect(result.status(), await result.text()).toBe(201);
  return (await result.json()).stock_requests[0].stock_request_id;
}
async function cleanup(request: APIRequestContext, requester: Employee, ids: string[]): Promise<void> {
  for (const id of ids) {
    const current = await read<{ status: string }>(request, `/api/stock-requests/${id}`);
    if (!["submitted", "reserved"].includes(current.status)) continue;
    const response = await request.post(`/api/stock-requests/${id}/cancel`, { data: { actor_employee_id: requester.employee_id, pin: "0000" } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
}
async function prepareUi(page: Page, actor: Employee, items: Item[], mobile: boolean): Promise<void> {
  await loginUi(page, actor);
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /AS·연구 사용출고/);
  await page.getByRole("button", { name: /^AS(?: |$)/ }).filter({ visible: true }).first().click();
  await clickNextStep(page);
  const filters = page.getByRole("combobox").filter({ visible: true });
  for (let index = 0; index < 3; index++) {
    await filters.nth(index).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  }
  for (const item of items) {
    await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.item_name);
    const row = page.getByRole("row").filter({ hasText: item.item_name, visible: true });
    await row.getByRole("button", { name: new RegExp(`^${mobile ? "모바일 " : ""}${item.process_type_code === "TR" ? "튜브" : "조립"} 수량`) }).click();
    const preview = page.waitForResponse((response) => response.url().endsWith("/api/io/preview") && response.request().method() === "POST");
    await row.getByRole("button", { name: new RegExp(`^${mobile ? "모바일 (?:튜브|조립)" : "부서"} 낱개`) }).click();
    expect((await preview).status()).toBe(200);
  }
  await advanceToQuantityStep(page);
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).first().click();
}

test.use({ trace: "retain-on-failure" });

test("ASR04 최초 로딩·오류·재시도 빈 성공과 기존 비어있지 않은 승인 목록의 재조회 실패를 구분한다", async ({ page, request, actors }) => {
  await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none" });
  await loginUi(page, actors.approver);
  const initial = await read<unknown[]>(request, `/api/stock-requests/as-research-queue?actor_employee_id=${actors.approver.employee_id}`);
  expect(initial).toEqual([]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(queuePattern, async (route) => {
    await gate;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "승인함 최초 조회 검수 실패" }) });
  });
  try {
    await page.goto("/mes?tab=warehouse&section=as-research-queue");
    await expect(page.getByRole("status", { name: "결재 요청을 불러오고 있습니다…", exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("AS·연구 승인 대기 요청이 없습니다.", { exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator(alerts).filter({ visible: true })).toContainText("승인함 최초 조회 검수 실패");
  await expect(page.locator(alerts).filter({ visible: true })).not.toContainText("기존 내용을 표시합니다");
  await page.unroute(queuePattern);
  await page.getByRole("button", { name: "다시 시도", exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("AS·연구 승인 대기 요청이 없습니다.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.route(queuePattern, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "빈 승인함 재조회 검수 실패" }) }));
  await page.getByRole("tab", { name: /내 요청/ }).click();
  await page.getByRole("tab", { name: /AS·연구 승인함/ }).click();
  await expect(page.locator(alerts).filter({ visible: true })).toContainText("기존 내용을 표시합니다");
  await expect(page.getByText("AS·연구 승인 대기 요청이 없습니다.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.unroute(queuePattern);
  await page.getByRole("button", { name: "다시 시도", exact: true }).filter({ visible: true }).click();
  await expect(page.locator(alerts).filter({ visible: true })).toHaveCount(0);
  const item = await fixture(request, actors);
  const id = await submit(request, actors.requester, item);
  try {
    await page.getByRole("tab", { name: /내 요청/ }).click();
    await page.getByRole("tab", { name: /AS·연구 승인함/ }).click();
    const row = page.locator(`[data-stock-request-id="${id}"]`).filter({ visible: true });
    await expect(row).toContainText(item.item_name);
    const before = await read(request, `/api/stock-requests/${id}`);
    await page.route(queuePattern, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "승인함 재조회 검수 실패" }) }));
    await page.getByRole("tab", { name: /내 요청/ }).click();
    await page.getByRole("tab", { name: /AS·연구 승인함/ }).click();
    await expect(page.locator(alerts).filter({ visible: true })).toContainText("기존 내용을 표시합니다");
    await expect(row).toContainText(item.item_name);
    await expect(row.getByRole("button", { name: "승인", exact: true })).toBeEnabled();
    expect(await read(request, `/api/stock-requests/${id}`)).toEqual(before);
    await page.unroute(queuePattern);
    await page.getByRole("button", { name: "다시 시도", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(alerts).filter({ visible: true })).toHaveCount(0);
    await expect(row).toContainText(item.item_name);
  } finally { await page.unroute(queuePattern); await cleanup(request, actors.requester, [id]); }
});

test("ASR04 실제 중복 승인409는 안내·재시도 후 재고 불변이며 사라진 딥링크 강조를 해제한다", async ({ page, request, actors }) => {
  await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none" });
  const item = await fixture(request, actors);
  const secondItem = await fixture(request, actors);
  const first = await submit(request, actors.requester, item);
  const second = await submit(request, actors.requester, secondItem);
  try {
    await loginUi(page, actors.approver);
    await page.goto(`/mes?tab=warehouse&section=as-research-queue&stockRequestId=${first}`);
    const firstRow = page.locator(`[data-stock-request-id="${first}"]`).filter({ visible: true });
    await expect(firstRow).toHaveClass(/\bring-2\b/);
    const snapshot = await read(request, `/api/stock-requests/as-research-queue?actor_employee_id=${actors.approver.employee_id}`);
    // Retain the real earlier GET snapshot to deterministically exercise a stale form.
    // Both decisions below reach the real API; no 409 response is fabricated.
    await page.route(queuePattern, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
    const approved = await request.post(`/api/stock-requests/${first}/as-research-approve`, { data: { actor_employee_id: actors.other.employee_id, pin: "0000" } });
    expect(approved.status(), await approved.text()).toBe(200);
    const after = await read(request, `/api/items/${item.item_id}`);
    const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}`);
    await firstRow.getByRole("button", { name: "승인", exact: true }).click();
    await firstRow.getByPlaceholder("0000").fill("0000");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = page.waitForResponse((reply) => reply.url().endsWith(`/api/stock-requests/${first}/as-research-approve`) && reply.request().method() === "POST");
      await firstRow.getByRole("button", { name: "승인 확정", exact: true }).click();
      expect((await response).status()).toBe(409);
      await expect(firstRow).toContainText("이미 처리된 요청입니다.");
      await expect(firstRow.getByRole("button", { name: "승인 확정", exact: true })).toBeEnabled();
      expect(await read(request, `/api/items/${item.item_id}`)).toEqual(after);
      expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(logs);
    }
    await page.unroute(queuePattern);
    await page.goto(`/mes?tab=warehouse&section=as-research-queue&stockRequestId=${first}`);
    await expect(page.locator(`[data-stock-request-id="${first}"]`)).toHaveCount(0);
    const other = page.locator(`[data-stock-request-id="${second}"]`).filter({ visible: true });
    await expect(other).toContainText(secondItem.item_name);
    await expect(other).not.toHaveClass(/\bring-2\b/);
  } finally { await page.unroute(queuePattern); await cleanup(request, actors.requester, [first, second]); }
});

for (const mobile of [false, true]) {
  test(`ASR01 ASR06 ${mobile ? "모바일" : "PC"} 실제 세 승인 단계는 즉시 큐에서 사라지고 마지막 승인에서만 재고를 반영한다`, async ({ page, request, actors }) => {
    await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none" });
    const approver = await changeEmployee(request, actors.approver, { department: "튜브", warehouse_role: "primary", department_role: "primary", as_research_approver: true });
    const special = await fixture(request, actors, "AR");
    const tube = await fixture(request, actors, "TR");
    const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `승인창고${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 8,
    } });
    expect(created.status(), await created.text()).toBe(201);
    const warehouse = await created.json() as Item;
    const items = [special, tube, warehouse];
    const payload = { requester_employee_id: actors.requester.employee_id, work_type: "internal_use", sub_type: "internal_use_out", to_department: "AS" };
    const preview = await request.post("/api/io/preview", { data: { ...payload, targets: items.map((item, index) => ({ source_kind: "manual", source_location: index === 2 ? "warehouse" : "department", item_id: item.item_id, quantity: 1 })) } });
    expect(preview.status(), await preview.text()).toBe(200);
    const submitted = await request.post("/api/io/submit", { data: { ...payload, bundles: (await preview.json()).bundles } });
    expect(submitted.status(), await submitted.text()).toBe(201);
    const requests = (await submitted.json()).stock_requests as { stock_request_id: string; approval_kind: string }[];
    expect(requests.map((row) => row.approval_kind).sort()).toEqual(["as_research", "department", "warehouse"]);
    const ids = requests.map((row) => row.stock_request_id);
    const physical = async () => Promise.all(items.map(async (item) => {
      const current = await read<Item>(request, `/api/items/${item.item_id}`);
      return { quantity: current.quantity, warehouse: current.warehouse_qty, production: current.production_total, locations: current.locations.map((row) => ({ department: row.department, quantity: row.quantity, status: row.status })) };
    }));
    const before = await physical();
    try {
      await loginUi(page, approver);
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const stages = [
        { kind: "as_research", section: "as-research-queue", action: "as-research-approve" },
        { kind: "department", section: "dept-queue", action: "department-approve" },
        { kind: "warehouse", section: "queue", action: "approve" },
      ];
      for (const [index, stage] of stages.entries()) {
        const id = requests.find((row) => row.approval_kind === stage.kind)!.stock_request_id;
        await page.goto(`/mes?tab=warehouse&section=${stage.section}`);
        if (mobile) {
          await page.getByRole("tab", { name: "승인함", exact: true }).click();
          const label = stage.kind === "as_research" ? "AS·연구 승인함" : stage.kind === "department" ? "부서 승인함" : "창고 승인함";
          await page.getByLabel("승인함 목록", { exact: true }).getByRole("button", { name: new RegExp(label) }).click();
        }
        const row = page.locator(`[data-stock-request-id="${id}"]`).filter({ visible: true });
        await expect(row.getByRole("button", { name: "승인", exact: true })).toBeEnabled();
        await row.getByRole("button", { name: "승인", exact: true }).click();
        await row.getByPlaceholder("0000").fill("0000");
        const response = page.waitForResponse((reply) => reply.url().endsWith(`/api/stock-requests/${id}/${stage.action}`) && reply.request().method() === "POST");
        await row.getByRole("button", { name: "승인 확정", exact: true }).click();
        expect((await response).status()).toBe(200);
        await expect(row).toHaveCount(0);
        expect((await read<{ status: string }>(request, `/api/stock-requests/${id}`)).status).toBe(index < 2 ? "reserved" : "completed");
        if (index < 2) expect(await physical()).toEqual(before);
      }
      const after = await physical();
      expect(after.map((row) => row.quantity)).toEqual([7, 7, 7]);
      expect(after.map((row) => row.warehouse)).toEqual([0, 0, 7]);
      expect(after.map((row) => row.production)).toEqual([7, 7, 0]);
      for (const id of ids) expect((await read<{ status: string }>(request, `/api/stock-requests/${id}`)).status).toBe("completed");
    } finally { await cleanup(request, actors.requester, ids); }
  });

  test(`ASR05 ${mobile ? "모바일" : "PC"} 혼합 최종 확인은 실제 서버 AS·연구 2건·일반 부서1건 승인 경로를 구분한다`, async ({ page, request, actors }) => {
    await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none" });
    const items: Item[] = [];
    for (const code of ["AR", "AA", "TR"]) items.push(await fixture(request, actors, code));
    await prepareUi(page, actors.requester, items, mobile);
    const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
    await expect(confirm.getByTestId("io-approval-routes")).toContainText("AS·연구 전용 결재 2건");
    await expect(confirm.getByTestId("io-approval-routes")).toContainText("부서 결재 1건");
    await expect(confirm.getByTestId("io-approval-routes")).not.toContainText("창고 결재");
    await expect(confirm.getByRole("button", { name: "위치별 결재 요청", exact: true })).toBeEnabled();
  });

  test(`ASR02 ${mobile ? "모바일" : "PC"} 전용 승인자0 최종 확인·실제 제출은 부서 결재와 유효 수신자만 사용한다`, async ({ page, context, request, actors }) => {
    const roster = await read<Employee[]>(request, "/api/employees?active_only=true");
    const special = roster.filter((employee) => employee.as_research_approver);
    const pending = await read<{ requires_as_research_approval: boolean; status: string }[]>(request, "/api/stock-requests?limit=200");
    expect(pending.filter((row) => row.requires_as_research_approval && ["submitted", "reserved"].includes(row.status))).toHaveLength(0);
    const ids: string[] = [];
    const approverPage = await context.newPage();
    try {
      for (const employee of special) await changeEmployee(request, employee, { as_research_approver: false });
      await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none" });
      await changeEmployee(request, actors.approver, { warehouse_role: "none", department_role: "primary" });
      await changeEmployee(request, actors.other, { warehouse_role: "none", department_role: "none" });
      const item = await fixture(request, actors);
      await prepareUi(page, actors.requester, [item], mobile);
      const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
      await expect(confirm).toContainText("부서 결재 필요");
      await expect(confirm.getByTestId("io-approval-routes")).toContainText("부서 결재 1건");
      await expect(confirm.getByTestId("io-approval-routes")).not.toContainText("AS·연구 전용 결재");
      await confirm.getByRole("button", { name: /^부서 결재 요청 1건$/ }).click();
      const submitted = page.waitForResponse((response) => /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(response.url()).pathname) && response.request().method() === "POST");
      await page.getByRole("dialog").getByRole("button", { name: "결재 요청", exact: true }).click();
      const response = await submitted;
      expect(response.status(), await response.text()).toBe(201);
      const result = await response.json();
      expect(result.stock_requests).toHaveLength(1);
      expect(result.stock_requests[0]).toMatchObject({ approval_kind: "department", requires_as_research_approval: false, requires_department_approval: true });
      ids.push(result.stock_requests[0].stock_request_id);
      await loginUi(approverPage, actors.approver);
      const notifications = await openNotifications(approverPage);
      const note = notifications.getByRole("button").filter({ hasText: item.item_name });
      await expect(note).toHaveCount(1);
      await note.click();
      await expect(approverPage).toHaveURL(new RegExp(`section=dept-queue.*stockRequestId=${ids[0]}`));
      await expect(approverPage.locator(`[data-stock-request-id="${ids[0]}"]`).filter({ visible: true })).toContainText(item.item_name);
      await expect(approverPage.getByRole("tab", { name: /AS·연구 승인함/ })).toHaveCount(0);
      const unrelated = await read<{ items: { related_request_id: string }[] }>(request, `/api/notifications?recipient_employee_id=${actors.other.employee_id}`, actors.other.employee_id);
      expect(unrelated.items.filter((entry) => entry.related_request_id === ids[0])).toHaveLength(0);
    } finally {
      await cleanup(request, actors.requester, ids);
      for (const employee of special) await changeEmployee(request, employee, { as_research_approver: true });
      await approverPage.close();
    }
  });
}
