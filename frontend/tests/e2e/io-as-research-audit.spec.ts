import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Employee, Item } from "../../lib/api";
import { test, expect, changeEmployee, loginUi, logoutUi } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType } from "./_helpers";

const admin = { "X-Admin-Pin": "0000" };

async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function makeItem(request: APIRequestContext, label: string, process: string, department: string): Promise<Item> {
  const response = await request.post("/api/items", { headers: admin, data: {
    item_name: `사용감사${randomUUID().slice(0, 8)}-${label}`, process_type_code: process,
    model_slots: [1], unit: "EA", initial_quantity: 17, initial_locations: [{ department, quantity: 7 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

function location(item: { locations: { department: string; status: string; quantity: number | string }[] }, department: string): number {
  return Number(item.locations.find(cell => cell.department === department && cell.status === "PRODUCTION")?.quantity ?? 0);
}

async function begin(page: Page, actor: Employee, destination: "AS" | "연구"): Promise<boolean> {
  await loginUi(page, actor);
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /AS·연구 사용출고/);
  const missingDestination = page.getByRole("button", { name: "사용 부서를 선택하세요", exact: true }).filter({ visible: true });
  await expect(missingDestination).toBeDisabled();
  const blockedWithoutDestination = await missingDestination.isDisabled();
  await page.getByRole("button", { name: new RegExp(`^${destination === "AS" ? "연구" : "AS"}(?: |$)`) }).filter({ visible: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${destination}(?: |$)`) }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: "다음 단계로 →", exact: true }).filter({ visible: true })).toBeEnabled();
  await clickNextStep(page);
  const filters = page.getByRole("combobox").filter({ visible: true });
  await expect(filters).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    await filters.nth(index).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  }
  return blockedWithoutDestination;
}

async function pick(page: Page, item: Item, department: string, mode: "BOM" | "낱개") {
  await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.mes_code!);
  const row = page.getByRole("row").filter({ hasText: item.item_name, visible: true });
  await row.getByRole("button", { name: new RegExp(`^${department} 수량`) }).click();
  const bom = row.getByRole("button", { name: "부서 BOM", exact: true });
  if (mode === "낱개") await expect(bom).toBeDisabled();
  else await expect(bom).toBeEnabled();
  await expect(row.getByRole("button", { name: "부서 낱개", exact: true })).toBeEnabled();
  const choices = { bomEnabled: await bom.isEnabled(), singleEnabled: await row.getByRole("button", { name: "부서 낱개", exact: true }).isEnabled() };
  const preview = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith("/api/io/preview"));
  await row.getByRole("button", { name: `부서 ${mode}`, exact: true }).click();
  expect((await preview).status()).toBe(200);
  return choices;
}

async function submitUi(page: Page, memo: string, destination: "AS" | "연구", mode?: string) {
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
  await expect(confirm).toContainText(destination);
  if (mode) await expect(confirm).toContainText(mode);
  await confirm.getByPlaceholder("작업 메모").fill(memo);
  await confirm.getByRole("button", { name: /결재 요청/ }).click();
  const submitted = page.waitForResponse(reply => reply.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(reply.url()).pathname));
  await page.getByRole("dialog").getByRole("button", { name: "결재 요청", exact: true }).click();
  const response = await submitted;
  expect(response.status(), await response.text()).toBe(201);
  const result = await response.json();
  const done = page.getByRole("dialog", { name: /요청 완료/ });
  await expect(done).toBeVisible();
  await done.getByRole("button", { name: "확인", exact: true }).click();
  return result;
}

async function approveUi(page: Page, id: string, kind: string): Promise<void> {
  const special = kind === "as_research";
  await page.goto(`/mes?tab=warehouse&section=${special ? "as-research-queue" : "dept-queue"}`);
  const row = page.locator(`[data-stock-request-id="${id}"]`).filter({ visible: true });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "승인", exact: true }).click();
  await row.getByPlaceholder("0000").fill("0000");
  const approval = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith(`/api/stock-requests/${id}/${special ? "as-research-approve" : "department-approve"}`));
  await row.getByRole("button", { name: "승인 확정", exact: true }).click();
  const response = await approval;
  expect(response.status(), await response.text()).toBe(200);
  await expect(row).toHaveCount(0);
}

async function cleanup(request: APIRequestContext, actor: Employee, ids: string[]): Promise<void> {
  for (const id of ids) {
    const current = await read(request, `/api/stock-requests/${id}`);
    if (!["submitted", "reserved"].includes(current.status)) continue;
    const response = await request.post(`/api/stock-requests/${id}/cancel`, { data: { actor_employee_id: actor.employee_id, pin: "0000" } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

async function openHistory(page: Page, request: APIRequestContext, item: Item, operationId: string, stockLabel: RegExp) {
  expect(operationId).toBeTruthy();
  const logs: { log_id: string; operation_id: string }[] = await read(request, `/api/inventory/transactions?operation_id=${operationId}&limit=1000`);
  expect(logs.length).toBeGreaterThan(0);
  for (const log of logs) expect(log.operation_id).toBe(operationId);
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  // Item creation also leaves inventory history. Match the approved operation's
  // IDs, and include both role=button main rows and ordinary child rows.
  const operation = page.locator(logs.map(log => `[data-log-id="${log.log_id}"]`).join(",")).filter({ visible: true });
  await expect(operation).toHaveCount(1);
  if (await operation.getAttribute("aria-pressed") !== "true") await operation.click();
  const row = page.locator("tr").filter({ has: page.getByText(item.mes_code!, { exact: true }), visible: true }).filter({ has: page.getByLabel(stockLabel) });
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  const detail = page.locator("[data-history-detail-log-id]").filter({ visible: true });
  await expect(detail).toHaveAttribute("data-history-detail-log-id", (await operation.getAttribute("data-log-id"))!);
  const summary = detail.getByTestId("history-key-point-summary");
  await expect(summary).toBeVisible();
  await expect(summary.locator("[data-history-impact-item-name]").or(summary.getByRole("button", { name: /재고 ·/ })).first()).toBeVisible();
  for (const group of await summary.getByRole("button", { name: /재고 ·/ }).all()) {
    if (await group.getAttribute("aria-expanded") === "false") await group.click();
  }
  return { row, operation, detail, summary };
}

test("IO-AS-AUDIT 8.15-01/03/07/08/09 목적지 미선택·두 부서 부족 모두 차단하고 최종 승인 후 실제 부서→AS·참여자·전후값을 보존한다", async ({ page, request, actors }) => {
  test.setTimeout(120_000);
  const requester = await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none" });
  const approver = await changeEmployee(request, actors.approver, { department: "튜브", warehouse_role: "none", department_role: "primary", as_research_approver: true });
  const items = [await makeItem(request, "튜브", "TR", "튜브"), await makeItem(request, "조립", "AR", "조립")];
  const departments = ["튜브", "조립"];
  const before = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
  const beforeLogs = await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)));
  const ids: string[] = [];
  const memo = `AS 실제 위치 ${randomUUID().slice(0, 8)}`;
  try {
    expect(await begin(page, requester, "AS")).toBe(true);
    for (const [index, item] of items.entries()) expect(await pick(page, item, departments[index], "낱개")).toEqual({ bomEnabled: false, singleEnabled: true });
    await advanceToQuantityStep(page);
    const cart = page.locator("[data-io-cart]").filter({ visible: true });
    for (const [index, item] of items.entries()) {
      const line = cart.locator("[data-io-line]").filter({ hasText: item.item_name });
      await expect(line).toContainText(departments[index]);
      await line.getByRole("spinbutton").fill("8");
      await expect(line.locator("[data-io-stock]")).toContainText(/가능 재고.*7.*실행 후.*-1.*재고 부족/);
    }
    await expect(cart.getByText("재고 부족", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeDisabled();
    const payload = { requester_employee_id: requester.employee_id, work_type: "internal_use", sub_type: "internal_use_out", to_department: "AS" };
    const preview = await request.post("/api/io/preview", { data: { ...payload, targets: items.map(item => ({ source_kind: "manual", source_location: "department", item_id: item.item_id, quantity: 8 })) } });
    expect(preview.status(), await preview.text()).toBe(200);
    const rejected = await request.post("/api/io/submit", { data: { ...payload, bundles: (await preview.json()).bundles } });
    expect(rejected.status()).toBe(422);
    expect(await rejected.text()).toContain("재고 부족");
    expect(await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)))).toEqual(before);
    expect(await Promise.all(items.map(item => read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)))).toEqual(beforeLogs);
    for (const item of items) await cart.locator("[data-io-line]").filter({ hasText: item.item_name }).getByRole("spinbutton").fill("1");
    const result = await submitUi(page, memo, "AS");
    expect(result.stock_requests).toHaveLength(2);
    ids.push(...result.stock_requests.map((entry: { stock_request_id: string }) => entry.stock_request_id));
    for (const id of ids) {
      const submittedRequest = await read(request, `/api/stock-requests/${id}`);
      expect(submittedRequest.lines.length).toBeGreaterThan(0);
      for (const line of submittedRequest.lines) expect(line).toMatchObject({ to_bucket: "none", to_department: "AS" });
    }
    for (const [index, item] of items.entries()) expect(location(await read(request, `/api/items/${item.item_id}`), departments[index])).toBe(7);
    await logoutUi(page, requester); await loginUi(page, approver);
    for (const entry of [...result.stock_requests].sort((a, b) => Number(b.approval_kind === "as_research") - Number(a.approval_kind === "as_research"))) await approveUi(page, entry.stock_request_id, entry.approval_kind);
    for (const [index, item] of items.entries()) {
      const after = await read(request, `/api/items/${item.item_id}`);
      expect(location(after, departments[index])).toBe(6);
      expect(after.warehouse_qty).toBe(before[index].warehouse_qty);
      expect(after.defective_total).toBe(before[index].defective_total);
      const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
      const log = logs.find((entry: { operation_batch_id: string }) => entry.operation_batch_id === result.batch.batch_id);
      expect(log).toMatchObject({ requester_name: requester.name, approver_name: approver.name, department: "AS", history_batch: { to_department: "AS" } });
      expect(log.inventory_effect).toEqual([expect.objectContaining({ scope: "location", department: departments[index], quantity_before: 7, quantity_after: 6 })]);
      const audit = await openHistory(page, request, item, log.operation_id, new RegExp(`${departments[index]} 7 [−-]1→6`));
      await expect(audit.operation).toContainText(requester.name);
      await expect(audit.operation).toContainText(approver.name);
      await expect(audit.operation).toContainText("AS");
      await expect(audit.row).toContainText(item.item_name);
      await expect(audit.row.getByLabel(new RegExp(`^${departments[index]} 7 [−-]1→6$`))).toBeVisible();
      // The detail is a whole operation: its flow heading names the representative
      // source, while the exact per-department changes are asserted below.
      await expect(audit.summary.getByTestId("history-stock-movement-summary")).toContainText(/튜브|조립/);
      await expect(audit.summary.getByTestId("history-stock-movement-summary")).toContainText("AS");
      await expect(audit.summary.getByTestId("history-stock-movement-summary")).not.toContainText("창고");
      await expect(audit.summary.getByLabel(`${departments[index]} 재고 7 -1→6 EA`, { exact: true })).toBeVisible();
      await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(requester.name);
      await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(approver.name);
      await expect(audit.detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
    }
  } finally { await cleanup(request, requester, ids); }
});

for (const mode of ["상·하위 차감", "하위만 차감"] as const) {
  test(`IO-RESEARCH-BOM 8.15-01/03 ${mode} 허용 방식·제외 하위·혼합 낱개와 실제 연구 목적지 재고를 일치시킨다`, async ({ page, request, actors }) => {
    test.setTimeout(120_000);
    const requester = await changeEmployee(request, actors.requester, { department: "연구", warehouse_role: "none", department_role: "none" });
    const parent = await makeItem(request, "상위", "AA", "조립");
    const child = await makeItem(request, "선택하위", "AR", "조립");
    const omitted = await makeItem(request, "제외하위", "AR", "조립");
    const manual = await makeItem(request, "낱개", "AR", "조립");
    for (const item of [child, omitted]) {
      const response = await request.post("/api/bom", { headers: admin, data: { parent_item_id: parent.item_id, child_item_id: item.item_id, quantity: 2 } });
      expect(response.status(), await response.text()).toBe(201);
    }
    const items = [parent, child, omitted, manual];
    const before = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
    const ids: string[] = [];
    try {
      expect(await begin(page, requester, "연구")).toBe(true);
      expect(await pick(page, parent, "조립", "BOM")).toEqual({ bomEnabled: true, singleEnabled: true });
      if (mode === "상·하위 차감") expect(await pick(page, manual, "조립", "낱개")).toEqual({ bomEnabled: false, singleEnabled: true });
      await advanceToQuantityStep(page);
      const cart = page.locator("[data-io-cart]").filter({ visible: true });
      const bundle = cart.locator("[data-io-bundle]").filter({ hasText: parent.item_name });
      await expect(bundle.getByRole("button", { name: "상·하위 차감", exact: true })).toBeEnabled();
      await expect(bundle.getByRole("button", { name: "하위만 차감", exact: true })).toBeEnabled();
      await bundle.getByRole("button", { name: mode, exact: true }).click();
      await expect(bundle.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
      const header = bundle.locator("[data-io-bundle-header]");
      if (await header.getAttribute("aria-expanded") === "false") await header.click();
      const selected = bundle.locator("[data-io-line]").filter({ hasText: child.item_name });
      const excluded = bundle.locator("[data-io-line]").filter({ hasText: omitted.item_name });
      await expect(selected.getByRole("textbox", { name: "수량", exact: true })).toHaveAttribute("aria-readonly", "true");
      await expect(selected.getByRole("textbox", { name: "수량", exact: true })).toHaveText("2");
      await excluded.getByRole("button", { name: "재고 반영 변경", exact: true }).click();
      if (mode === "하위만 차감") {
        await selected.getByRole("button", { name: "재고 반영 변경", exact: true }).click();
        await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeDisabled();
        await expect(excluded.locator("[data-io-stock]")).toContainText(/실행 후.*7/);
        await selected.getByRole("button", { name: "재고 반영 변경", exact: true }).click();
      } else await expect(excluded).toContainText("소속 부서 재입고");
      await expect(bundle.getByRole("group", { name: "상위 자재 재고", exact: true })).toContainText(new RegExp(`가능 재고.*7.*실행 후.*${mode === "상·하위 차감" ? 6 : 7}`));
      await expect(selected.locator("[data-io-stock]")).toContainText(/가능 재고.*7.*실행 후.*5/);
      await expect(excluded.locator("[data-io-stock]")).toContainText(new RegExp(`실행 후.*${mode === "상·하위 차감" ? 9 : 7}`));
      expect(await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)))).toEqual(before);
      const result = await submitUi(page, `연구 ${mode}`, "연구", mode);
      ids.push(...result.stock_requests.map((entry: { stock_request_id: string }) => entry.stock_request_id));
      const routes: { item_id: string; quantity: number; from_bucket: string; from_department: string | null; to_bucket: string; to_department: string | null }[] = [];
      for (const id of ids) {
        const submittedRequest = await read(request, `/api/stock-requests/${id}`);
        expect(submittedRequest.lines.length).toBeGreaterThan(0);
        for (const line of submittedRequest.lines) routes.push({ item_id: line.item_id, quantity: Number(line.quantity), from_bucket: line.from_bucket, from_department: line.from_department, to_bucket: line.to_bucket, to_department: line.to_department });
      }
      const outgoing = (item: Item, quantity: number) => ({ item_id: item.item_id, quantity, from_bucket: "production", from_department: "조립", to_bucket: "none", to_department: "연구" });
      const expectedRoutes = mode === "상·하위 차감" ? [outgoing(parent, 1), outgoing(child, 2), outgoing(manual, 1), { item_id: omitted.item_id, quantity: 2, from_bucket: "none", from_department: null, to_bucket: "production", to_department: "조립" }] : [outgoing(child, 2)];
      expect(routes.sort((a, b) => a.item_id.localeCompare(b.item_id))).toEqual(expectedRoutes.sort((a, b) => a.item_id.localeCompare(b.item_id)));
      await logoutUi(page, requester); await loginUi(page, actors.approver);
      for (const entry of result.stock_requests) await approveUi(page, entry.stock_request_id, entry.approval_kind);
      const after = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
      expect(after.map(item => location(item, "조립"))).toEqual(mode === "상·하위 차감" ? [6, 5, 9, 6] : [7, 5, 7, 7]);
      expect(after.map(item => item.warehouse_qty)).toEqual(before.map(item => item.warehouse_qty));
      expect(after.map(item => item.defective_total)).toEqual(before.map(item => item.defective_total));
      const logs = await read(request, `/api/inventory/transactions?item_id=${child.item_id}&limit=1000`);
      const log = logs.find((entry: { operation_batch_id: string }) => entry.operation_batch_id === result.batch.batch_id);
      expect(log).toMatchObject({ department: "연구", history_batch: { to_department: "연구" }, requester_name: requester.name, approver_name: actors.approver.name });
      expect(log.inventory_effect).toEqual([expect.objectContaining({ scope: "location", department: "조립", quantity_before: 7, quantity_after: 5 })]);
      const audit = await openHistory(page, request, child, log.operation_id, /조립 7 [−-]2→5/);
      await expect(audit.operation).toContainText("연구");
      await expect(audit.row.getByLabel(/^조립 7 [−-]2→5$/)).toBeVisible();
      await expect(audit.summary.getByTestId("history-stock-movement-summary")).toContainText("조립");
      await expect(audit.summary.getByTestId("history-stock-movement-summary")).toContainText("연구");
      await expect(audit.summary.getByTestId("history-stock-movement-summary")).not.toContainText("창고");
      await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(requester.name);
      await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(actors.approver.name);
    } finally { await cleanup(request, requester, ids); }
  });
}
