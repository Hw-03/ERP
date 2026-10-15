import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, changeEmployee, loginUi, logoutUi } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, pickWorkType, readSeed } from "./_helpers";

async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function timestamp(value: string): string {
  const instant = new Date(/[Z]|[+]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).map(part => [part.type, part.value]));
  return `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}시 ${parts.minute}분`;
}

async function fixture(request: APIRequestContext) {
  const source = await read(request, `/api/items/${readSeed().rawItem.item_id}`);
  const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
    item_name: `위치원장${randomUUID().slice(0, 8)}`, process_type_code: source.process_type_code,
    model_slots: source.model_slots, unit: "EA", initial_quantity: 34,
    initial_locations: [{ department: "튜브", quantity: 7 }, { department: "고압", quantity: 7 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function selectItem(page: Page, item: { mes_code: string; item_name: string }, button = "낱개", advance = true) {
  const filters = page.getByRole("combobox").filter({ visible: true });
  await expect(filters).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    await filters.nth(index).click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  }
  await page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true }).fill(item.mes_code);
  const preview = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/io/preview"));
  await page.getByRole("row").filter({ hasText: item.item_name, visible: true }).getByRole("button", { name: button, exact: true }).click();
  expect((await preview).status()).toBe(200);
  if (advance) await advanceToQuantityStep(page);
}

async function history(page: Page, logId: string, name: string, memo?: string) {
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(memo ?? name);
  const operationRow = page.locator('[data-history-main-row="true"]').filter({ visible: true });
  if (memo) {
    await expect(operationRow).toHaveCount(1);
    const toggle = operationRow.getByRole("button", { name: /^작업 구성 (펼치기|접기)$/ });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  }
  const row = memo ? page.locator("tr").filter({ hasText: name, visible: true }) : page.locator(`[data-log-id="${logId}"]`).filter({ visible: true }).first();
  await expect(row).toBeVisible();
  await row.click();
  const detail = page.locator(`[data-history-detail-log-id="${logId}"]`).filter({ visible: true });
  const summary = detail.getByTestId("history-key-point-summary");
  await expect(summary).toBeVisible();
  const groups = summary.getByRole("button", { name: /재고 ·/ });
  await expect.poll(async () => await groups.count() + await summary.getByLabel(/재고 .*→/).count()).toBeGreaterThan(0);
  for (const group of await groups.all()) {
    if (await group.getAttribute("aria-expanded") === "false") await group.click();
  }
  return { row, detail, summary, operationRow };
}

for (const scenario of [
  { title: "8.24 비결재 요청과 창고 승인", automatic: false },
  { title: "8.25 창고 결재권자 낱개 자동 승인", automatic: true },
]) {
  test(`IO-LOCATION ${scenario.title} 튜브 7→8과 창고 20→19·별도 고압 7을 보존하고 이력의 양쪽 위치·참여자를 검증한다`, async ({ page, request, actors }) => {
    const item = await fixture(request);
    const requester = await changeEmployee(request, actors.requester, { warehouse_role: scenario.automatic ? "primary" : "none", department_role: "none" });
    const approver = await changeEmployee(request, actors.approver, { warehouse_role: "primary", department_role: "none" });
    const before = await read(request, `/api/items/${item.item_id}`);
    expect(before.warehouse_qty).toBe(20);
    expect(before.production_total).toBe(14);
    const beforeLogs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
    const memo = `양쪽 위치 ${randomUUID().slice(0, 8)}`;
    let requestId: string | null = null;
    try {
      await loginUi(page, requester);
      await gotoWarehouseCompose(page);
      await pickWorkType(page, /^창고 입출고/);
      await page.getByRole("button", { name: "창고 → 부서", exact: true }).filter({ visible: true }).click();
      await expect(page.getByText("대상 부서", { exact: true })).toHaveCount(0);
      await clickNextStep(page);
      await selectItem(page, item);
      const cart = page.locator("[data-io-cart]").filter({ visible: true });
      await expect(cart).toContainText("튜브");
      await expect(cart.locator("[data-io-stock]")).toContainText(/가능 재고.*20.*실행 후.*19/);
      expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
      await cart.getByRole("spinbutton").fill("21");
      await expect(page.getByRole("button", { name: /제출확인/ }).filter({ visible: true })).toBeDisabled();
      expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
      await cart.getByRole("spinbutton").fill("1");
      await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
      const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
      await expect(confirm).toContainText("낱개");
      await expect(confirm).not.toContainText("BOM");
      await expect(confirm).toContainText(scenario.automatic ? "자동 승인 후 즉시 반영" : "창고 결재 필요");
      await confirm.getByPlaceholder("작업 메모").fill(memo);
      await confirm.getByRole("button", { name: scenario.automatic ? /^자동 승인 후 즉시 반영/ : /^창고 결재 요청/ }).click();
      const submitted = page.waitForResponse(response => response.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(response.url()).pathname));
      await page.getByRole("dialog").getByRole("button", { name: scenario.automatic ? "자동 승인 후 즉시 반영" : "결재 요청", exact: true }).click();
      const reply = await submitted;
      expect(reply.status(), await reply.text()).toBe(201);
      const result = await reply.json();
      requestId = result.stock_request_id;
      expect(requestId).toBeTruthy();
      expect(result.requires_approval).toBe(!scenario.automatic);
      const done = page.getByRole("dialog", { name: scenario.automatic ? /입출고 반영 완료/ : /창고 결재 요청 완료/ });
      await expect(done).toBeVisible();
      if (scenario.automatic) await expect(done).not.toContainText(/승인 대기|결재 요청/);
      await done.getByRole("button", { name: "확인", exact: true }).click();
      if (!scenario.automatic) {
        const waiting = await read(request, `/api/items/${item.item_id}`);
        expect(waiting.warehouse_qty).toBe(20);
        expect(waiting.production_total).toBe(14);
        expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(beforeLogs);
        await logoutUi(page, requester);
        await loginUi(page, approver);
        await page.goto("/mes?tab=warehouse&section=queue");
        const queued = page.locator(`[data-stock-request-id="${requestId}"]`).filter({ visible: true });
        await expect(queued).toContainText(item.item_name);
        await expect(queued).toContainText(requester.name);
        await queued.getByRole("button", { name: "승인", exact: true }).click();
        await queued.getByPlaceholder("0000").fill("0000");
        const approval = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/stock-requests/${requestId}/approve`));
        await queued.getByRole("button", { name: "승인 확정", exact: true }).click();
        expect((await approval).status()).toBe(200);
        await expect(queued).toHaveCount(0);
      }
      const after = await read(request, `/api/items/${item.item_id}`);
      expect(after.warehouse_qty).toBe(19);
      expect(Number(after.locations.find((cell: { department: string; status: string }) => cell.department === "튜브" && cell.status === "PRODUCTION").quantity)).toBe(8);
      expect(Number(after.locations.find((cell: { department: string; status: string }) => cell.department === "고압" && cell.status === "PRODUCTION").quantity)).toBe(7);
      expect(after.defective_total).toBe(before.defective_total);
      const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
      const log = logs.find((row: { operation_batch_id: string }) => row.operation_batch_id === result.batch.batch_id);
      expect(log).toBeTruthy();
      expect(log.requester_name).toBe(requester.name);
      expect(log.approver_name).toBe(scenario.automatic ? requester.name : approver.name);
      expect(log.inventory_effect.find((effect: { scope: string }) => effect.scope === "warehouse")).toMatchObject({ quantity_before: 20, quantity_after: 19 });
      expect(log.inventory_effect.find((effect: { department: string }) => effect.department === "튜브")).toMatchObject({ quantity_before: 7, quantity_after: 8 });
      const audit = await history(page, log.log_id, item.item_name);
      await expect(audit.row).toContainText(requester.name);
      await expect(audit.row).toContainText(scenario.automatic ? requester.name : approver.name);
      await expect(audit.row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /창고 20 [−-]1→19/);
      await expect(audit.row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /튜브 7 \+1→8/);
      await expect(audit.row.getByLabel(/재고 변동:/)).not.toHaveAttribute("aria-label", /14.*15/);
      await expect(audit.summary.getByLabel("창고 재고 20 -1→19 EA", { exact: true })).toBeVisible();
      await expect(audit.summary.getByLabel("튜브 재고 7 +1→8 EA", { exact: true })).toBeVisible();
      if (scenario.automatic) {
        await expect(audit.summary.getByTestId("history-participant-row")).toHaveCount(1);
        await expect(audit.summary.getByTestId("history-participant-row")).toContainText(requester.name);
      } else {
        await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(requester.name);
        await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(approver.name);
      }
      await expect(audit.detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
      await expect(audit.summary).toContainText(timestamp(log.approved_at ?? log.created_at));
      if (!scenario.automatic) await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(timestamp(log.requested_at));
    } finally {
      if (requestId && (await read(request, `/api/stock-requests/${requestId}`)).status === "reserved") {
        await request.post(`/api/stock-requests/${requestId}/cancel`, { data: { actor_employee_id: requester.employee_id, pin: "0000" } });
      }
    }
  });
}

test("IO-DEPARTMENT-AUDIT 8.23-03/09/10 비결재 부서 입고의 대기·실제 튜브 승인·작업유형·요청자와 승인자를 분리한다", async ({ page, request, actors }) => {
  const item = await fixture(request);
  const requester = await changeEmployee(request, actors.requester, { warehouse_role: "none", department_role: "none" });
  const approver = await changeEmployee(request, actors.approver, { department: "튜브", warehouse_role: "none", department_role: "primary" });
  const before = await read(request, `/api/items/${item.item_id}`);
  const beforeLogs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  const memo = `부서 위치 ${randomUUID().slice(0, 8)}`;
  let requestId: string | null = null;
  try {
    await loginUi(page, requester);
    await gotoWarehouseCompose(page);
    await pickWorkType(page, /^부서 입출고/);
    await page.getByRole("button", { name: "생산 입고", exact: true }).filter({ visible: true }).click();
    await expect(page.getByText("대상 부서", { exact: true })).toHaveCount(0);
    await clickNextStep(page);
    await selectItem(page, item);
    const cart = page.locator("[data-io-cart]").filter({ visible: true });
    await expect(cart).toContainText("튜브");
    await expect(cart.locator("[data-io-stock]")).toContainText(/현재 재고.*7.*실행 후.*8/);
    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
    await expect(confirm).toContainText("부서 결재 필요");
    await expect(confirm).toContainText("낱개");
    await expect(confirm).not.toContainText("BOM");
    await confirm.getByRole("textbox", { name: "메모 (필수)", exact: true }).fill(memo);
    await confirm.getByRole("button", { name: /^부서 결재 요청/ }).click();
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(response.url()).pathname));
    await page.getByRole("dialog").getByRole("button", { name: "결재 요청", exact: true }).click();
    const reply = await submitted;
    expect(reply.status(), await reply.text()).toBe(201);
    const result = await reply.json();
    requestId = result.stock_request_id;
    expect(requestId).toBeTruthy();
    expect(result.requires_approval).toBe(true);
    expect(await read(request, `/api/items/${item.item_id}`)).toEqual(before);
    expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(beforeLogs);
    const done = page.getByRole("dialog", { name: /부서 결재 요청 완료/ });
    await expect(done).toBeVisible();
    await done.getByRole("button", { name: "확인", exact: true }).click();
    await logoutUi(page, requester);
    await loginUi(page, approver);
    await page.goto("/mes?tab=warehouse&section=dept-queue");
    const queued = page.locator(`[data-stock-request-id="${requestId}"]`).filter({ visible: true });
    await expect(queued).toContainText(item.item_name);
    await expect(queued).toContainText(requester.name);
    await queued.getByRole("button", { name: "승인", exact: true }).click();
    await queued.getByPlaceholder("0000").fill("0000");
    const approved = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/stock-requests/${requestId}/department-approve`));
    await queued.getByRole("button", { name: "승인 확정", exact: true }).click();
    expect((await approved).status()).toBe(200);
    await expect(queued).toHaveCount(0);
    const after = await read(request, `/api/items/${item.item_id}`);
    expect(after.warehouse_qty).toBe(20);
    expect(Number(after.locations.find((cell: { department: string; status: string }) => cell.department === "튜브" && cell.status === "PRODUCTION").quantity)).toBe(8);
    expect(Number(after.locations.find((cell: { department: string; status: string }) => cell.department === "고압" && cell.status === "PRODUCTION").quantity)).toBe(7);
    expect(after.defective_total).toBe(before.defective_total);
    const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
    const log = logs.find((row: { operation_batch_id: string }) => row.operation_batch_id === result.batch.batch_id);
    expect(log).toBeTruthy();
    expect(log.requester_name).toBe(requester.name);
    expect(log.approver_name).toBe(approver.name);
    expect(log.inventory_effect).toHaveLength(1);
    expect(log.inventory_effect[0]).toMatchObject({ scope: "location", department: "튜브", status: "PRODUCTION", quantity_before: 7, quantity_after: 8 });
    const audit = await history(page, log.log_id, item.item_name);
    await expect(audit.row).toContainText("부서 입출고");
    await expect(audit.row).toContainText(requester.name);
    await expect(audit.row).toContainText(approver.name);
    await expect(audit.row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /튜브 7 \+1→8/);
    await expect(audit.row.getByLabel(/재고 변동:/)).not.toHaveAttribute("aria-label", /14.*15|창고/);
    await expect(audit.summary).toContainText("부서 입출고");
    await expect(audit.summary.getByLabel("튜브 재고 7 +1→8 EA", { exact: true })).toBeVisible();
    await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(requester.name);
    await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(approver.name);
    await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(timestamp(log.requested_at));
    await expect(audit.summary.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(timestamp(log.approved_at));
    await expect(audit.detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
  } finally {
    if (requestId && (await read(request, `/api/stock-requests/${requestId}`)).status === "reserved") await request.post(`/api/stock-requests/${requestId}/cancel`, { data: { actor_employee_id: requester.employee_id, pin: "0000" } });
  }
});

test("IO-ADJUST-AUDIT 8.16-04/06 두 행 모두 실제 창고 20→21을 표시하고 모든 부서 불변과 각각의 이력 숫자·담당자·메모를 보존한다", async ({ page, request, actors }) => {
  const items = [await fixture(request), await fixture(request)];
  const operator = await changeEmployee(request, actors.requester, { warehouse_role: "primary", department_role: "none" });
  const before = await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)));
  const memo = `두행 창고보정 ${randomUUID().slice(0, 8)}`;
  await loginUi(page, operator);
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /^창고 수량 보정/);
  await page.getByRole("button", { name: "입고", exact: true }).filter({ visible: true }).click();
  await clickNextStep(page);
  for (const item of items) await selectItem(page, item, "선택", false);
  await advanceToQuantityStep(page);
  const cart = page.locator("[data-io-cart]").filter({ visible: true });
  await expect(cart.locator("[data-io-stock]")).toHaveCount(2);
  for (const stock of await cart.locator("[data-io-stock]").all()) await expect(stock).toContainText(/창고 수량.*20.*실행 후.*21/);
  expect(await Promise.all(items.map(item => read(request, `/api/items/${item.item_id}`)))).toEqual(before);
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  const confirm = page.locator("[data-io-confirm]").filter({ visible: true });
  await expect(confirm).toContainText("즉시 재고 반영");
  await expect(confirm.getByRole("button", { name: /결재 요청/ })).toHaveCount(0);
  await confirm.getByPlaceholder("작업 메모").fill(memo);
  await confirm.getByRole("button", { name: /^즉시 반영하기/ }).click();
  const submitted = page.waitForResponse(response => response.request().method() === "POST" && /^\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(response.url()).pathname));
  await page.getByRole("dialog", { name: /창고 보정 입고를 진행하시겠습니까/ }).getByRole("button", { name: "즉시 반영", exact: true }).click();
  const reply = await submitted;
  expect(reply.status(), await reply.text()).toBe(201);
  const result = await reply.json();
  expect(result.requires_approval).toBe(false);
  expect(result.status).toBe("completed");
  const done = page.getByRole("dialog", { name: /입출고 반영 완료/ });
  await expect(done).toBeVisible();
  await done.getByRole("button", { name: "확인", exact: true }).click();
  for (const [index, item] of items.entries()) {
    const after = await read(request, `/api/items/${item.item_id}`);
    expect(after.warehouse_qty).toBe(21);
    expect(after.locations).toEqual(before[index].locations);
    expect(after.production_total).toBe(before[index].production_total);
    expect(after.defective_total).toBe(before[index].defective_total);
    const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
    const log = logs.find((row: { operation_batch_id: string }) => row.operation_batch_id === result.batch.batch_id);
    expect(log).toBeTruthy();
    expect(log.transaction_type).toBe("ADJUST");
    expect(log.inventory_effect).toEqual([{ scope: "warehouse", delta: 1, quantity_before: 20, quantity_after: 21 }]);
    expect(log.requester_name).toBe(operator.name);
    const audit = await history(page, log.log_id, item.item_name, memo);
    await expect(audit.operationRow).toContainText("창고 수량 조정");
    await expect(audit.operationRow).toContainText(operator.name);
    await expect(audit.row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /창고 20 \+1→21/);
    await expect(audit.row.getByLabel(/재고 변동:/)).not.toHaveAttribute("aria-label", /부서|튜브|고압/);
    await expect(audit.summary.locator("[data-history-impact-item-name]").filter({ hasText: item.item_name }).locator("../../..").getByLabel("창고 재고 20 +1→21 EA", { exact: true })).toBeVisible();
    await expect(audit.summary.getByTestId("history-participant-row")).toContainText(operator.name);
    await expect(audit.detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
  }
});
