import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";

type RawHistoryRows = { itemIds: string[]; logIds: string[]; locationIds: string[] };
const rawHistoryRows: RawHistoryRows[] = [];

test.afterEach(() => {
  if (rawHistoryRows.length === 0) return;
  const backend = path.resolve(__dirname, "../../../backend");
  const database = path.join(backend, "mes_e2e.db");
  if (!fs.existsSync(database) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("isolated fixture required for cleanup");
  const script = [
    "import json,os,uuid", "from sqlalchemy import text", "from app.database import SessionLocal",
    "from app.models import Item,TransactionLog,InventoryLocation", "db=SessionLocal()", "try:",
    "    for fixture in json.loads(os.environ['HISTORY_RAW_ROWS']):",
    "        item_ids={uuid.UUID(value) for value in fixture['itemIds']}",
    "        items=db.query(Item).filter(Item.item_id.in_(item_ids)).all()",
    "        assert len(items)==len(item_ids) and all(item.item_name.startswith(('내역검수','결과검수')) for item in items)",
    "        log_ids={uuid.UUID(value) for value in fixture['logIds']}",
    "        logs=db.query(TransactionLog).filter(TransactionLog.log_id.in_(log_ids)).all()",
    "        assert len(logs)==len(log_ids) and all(row.item_id in item_ids and row.operation_id is None for row in logs)",
    "        location_ids={uuid.UUID(value) for value in fixture['locationIds']}",
    "        locations=db.query(InventoryLocation).filter(InventoryLocation.location_id.in_(location_ids)).all() if location_ids else []",
    "        assert len(locations)==len(location_ids) and all(row.item_id in item_ids for row in locations)",
    "        for row in logs: db.delete(row)",
    "        for row in locations: db.delete(row)",
    "    db.flush()", "    assert not db.execute(text('PRAGMA foreign_key_check')).fetchall()", "    db.commit()",
    "finally:", "    db.close()",
  ].join("\n");
  const result = spawnSync("python", ["-c", script], { cwd: backend, windowsHide: true, encoding: "utf8", env: {
    ...process.env, DATABASE_URL: `sqlite:///${database.split(path.sep).join("/")}`, HISTORY_RAW_ROWS: JSON.stringify(rawHistoryRows), PYTHONIOENCODING: "utf-8",
  } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  rawHistoryRows.length = 0;
});

/** Read-only history fixture: synthetic legacy rows stay inside the E2E database. */
async function seedHistory(request: APIRequestContext): Promise<{ name: string; ids: string[] }> {
  const name = `내역검수${randomUUID().slice(0, 8)}`;
  const response = await request.post("/api/items", {
    headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" },
    data: { item_name: name, process_type_code: "AR", unit: "EA", model_slots: [1], initial_quantity: 0 },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const item = await response.json();
  const backend = path.resolve(__dirname, "../../../backend");
  const database = path.join(backend, "mes_e2e.db");
  if (!fs.existsSync(database) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("isolated fixture required");
  const script = [
    "import json,os", "from datetime import datetime,timedelta,timezone",
    "from app.database import SessionLocal", "from app.models import TransactionLog,TransactionTypeEnum",
    "kst=timezone(timedelta(hours=9))", "now=datetime.now(kst)",
    "today=now.replace(hour=12,minute=0,second=0,microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)",
    "previous=now.replace(day=1,hour=0,minute=0,second=0,microsecond=0)-timedelta(days=1)",
    "departments=json.loads(os.environ['HISTORY_DEPARTMENTS'])", "db=SessionLocal()", "try:", "    ids=[]",
    "    for i in range(121):",
    "        kind=TransactionTypeEnum.PRODUCE if i<90 else TransactionTypeEnum.MARK_DEFECTIVE if i<100 else TransactionTypeEnum.ADJUST",
    "        department=departments[0] if i<70 or 90<=i<100 else departments[1] if i<90 else departments[2]",
    "        instant=today-timedelta(seconds=i) if i<120 else previous.astimezone(timezone.utc).replace(tzinfo=None)",
    "        row=TransactionLog(item_id=os.environ['HISTORY_ITEM'],transaction_type=kind,department=department,quantity_change=1,quantity_before=10,quantity_after=11,notes=f'QA-HISTORY-{i:03d}',created_at=instant)",
    "        db.add(row)", "        db.flush()", "        ids.append(str(row.log_id))", "    db.commit()", "    print(json.dumps(ids))", "finally:", "    db.close()",
  ].join("\n");
  const result = spawnSync("python", ["-c", script], { cwd: backend, windowsHide: true, encoding: "utf8", env: {
    ...process.env, DATABASE_URL: `sqlite:///${database.split(path.sep).join("/")}`,
    HISTORY_ITEM: item.item_id, HISTORY_DEPARTMENTS: JSON.stringify(["조립", "고압", "창고"]),
  } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const ids: string[] = JSON.parse(result.stdout.trim());
  rawHistoryRows.push({ itemIds: [item.item_id], logIds: ids, locationIds: [] });
  return { name, ids };
}

function rows(page: Page) { return page.locator('[data-history-main-row="true"]'); }
function stats(page: Page) { return page.getByTestId("history-scroll-surface").locator("section").first(); }

/** Restored legacy histories are read fixtures, never live production transactions. */
async function seedReworkHistory(request: APIRequestContext): Promise<{ names: string[]; ids: string[]; search: string }> {
  const prefix = `결과검수${randomUUID().slice(0, 8)}`;
  const items = [];
  for (const suffix of ["모품목", "정상", "불량", "폐기"]) {
    const response = await request.post("/api/items", { headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" }, data: {
      item_name: `${prefix}-${suffix}`, process_type_code: "TR", unit: "EA", model_slots: [1], initial_quantity: 0,
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    items.push(await response.json());
  }
  const backend = path.resolve(__dirname, "../../../backend");
  const database = path.join(backend, "mes_e2e.db");
  if (!fs.existsSync(database) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("isolated fixture required");
  const script = [
    "import json,os", "from datetime import datetime,timedelta", "from app.database import SessionLocal",
    "from app.models import TransactionLog,TransactionTypeEnum,InventoryLocation,LocationStatusEnum", "items=json.loads(os.environ['HISTORY_ITEMS'])",
    "db=SessionLocal()", "try:", "    ids=[]", "    now=datetime.utcnow()",
    "    specs=[('DISASSEMBLE',-2,'DEFECTIVE'),('RECEIVE',2,'PRODUCTION'),('MARK_DEFECTIVE',1,'DEFECTIVE'),('DEFECT_SCRAP',-1,'DEFECTIVE')]",
    "    locations=[InventoryLocation(item_id=items[1]['item_id'],department='조립',status=LocationStatusEnum.PRODUCTION,quantity=202),InventoryLocation(item_id=items[2]['item_id'],department='조립',status=LocationStatusEnum.DEFECTIVE,quantity=101)]",
    "    db.add_all(locations)", "    db.flush()", "    location_ids=[str(row.location_id) for row in locations]",
    "    for group in range(101):",
    "        for index,(kind,delta,status) in enumerate(specs):",
    "            before=[2*(group+1),2*(100-group),100-group,group+1][index];after=before+delta",
    "            row=TransactionLog(item_id=items[index]['item_id'],transaction_type=TransactionTypeEnum(kind),quantity_change=delta,quantity_before=before,quantity_after=after,warehouse_qty_before=0,warehouse_qty_after=0,department_qty_before=before if index==1 else 0,department_qty_after=after if index==1 else 0,transfer_qty=abs(delta),department='조립',reference_no=f'defect-disassemble:{items[0][\"item_id\"]}:{group}',inventory_effect=[{'scope':'location','department':'조립','status':status,'delta':delta,'quantity_before':before,'quantity_after':after}],created_at=now-timedelta(seconds=group))",
    "            db.add(row)", "            db.flush()", "            ids.append(str(row.log_id))",
    "    db.commit()", "    print(json.dumps({'ids':ids,'locationIds':location_ids}))", "finally:", "    db.close()",
  ].join("\n");
  const seeded = spawnSync("python", ["-c", script], { cwd: backend, windowsHide: true, encoding: "utf8", env: {
    ...process.env, DATABASE_URL: `sqlite:///${database.split(path.sep).join("/")}`, HISTORY_ITEMS: JSON.stringify(items),
  } });
  if (seeded.status !== 0) throw new Error(seeded.stderr || seeded.stdout);
  const seededRows: { ids: string[]; locationIds: string[] } = JSON.parse(seeded.stdout.trim());
  rawHistoryRows.push({ itemIds: items.map(item => item.item_id), logIds: seededRows.ids, locationIds: seededRows.locationIds });
  return { names: items.map(item => item.item_name), ids: seededRows.ids, search: "재작업" };
}
async function openHistory(page: Page, name: string): Promise<void> {
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(name);
  await expect(rows(page)).toHaveCount(100);
}

test("HISTORY 8.3-01~05 실제 기간·부서OR·업무OR·그룹AND와 요약 일치", async ({ page, request, actors }) => {
  const fixture = await seedHistory(request);
  await loginUi(page, actors.requester);
  await openHistory(page, fixture.name);
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  await expect(stats(page)).toContainText("120건");
  await page.getByRole("button", { name: /^필터/ }).click();
  const department = page.getByText("부서 구분", { exact: true }).locator("..").locator("..");
  const operation = page.getByText("작업 종류", { exact: true }).locator("..").locator("..");
  for (const label of ["창고 입출고", "부서 입출고", "불량", "품목 전환", "출하"]) {
    await expect(operation.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await department.getByRole("button", { name: "조립", exact: true }).click();
  await expect(rows(page)).toHaveCount(80);
  await expect(stats(page)).toContainText("80건");
  await department.getByRole("button", { name: "고압", exact: true }).click();
  await expect(rows(page)).toHaveCount(100);
  await expect(stats(page)).toContainText("100건");
  await operation.getByRole("button", { name: "부서 입출고", exact: true }).click();
  await expect(rows(page)).toHaveCount(90);
  await expect(stats(page)).toContainText("90건");
  await operation.getByRole("button", { name: "불량", exact: true }).click();
  await expect(rows(page)).toHaveCount(100);
  await expect(stats(page)).toContainText("100건");
  await operation.getByRole("button", { name: "부서 입출고", exact: true }).click();
  await expect(rows(page)).toHaveCount(10);
  await expect(stats(page)).toContainText("10건");
  await expect(rows(page).first()).toContainText("불량");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(`${fixture.name}-없음`);
  await expect(rows(page)).toHaveCount(0);
  await expect(stats(page)).toContainText("0건");
  await expect(page.getByText("현재 조건에 맞는 입출고 내역이 없습니다", { exact: true })).toBeVisible();
});

test("HISTORY01 실제 cursor 추가조회 실패·반복클릭·필터 보존·정확한 append", async ({ page, request, actors }) => {
  const fixture = await seedHistory(request);
  await loginUi(page, actors.requester);
  await openHistory(page, fixture.name);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(stats(page)).toContainText("121건");
  await expect(rows(page)).toHaveCount(100);
  const initial = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id")));
  let fail = true; let pageRequests = 0; let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/inventory/transactions/display-groups?**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("cursor")) { await route.continue(); return; }
    pageRequests++;
    expect(url.searchParams.get("search")).toBe(fixture.name);
    if (fail) await route.fulfill({ status: 503, json: { detail: "검수용 추가 조회 실패" } });
    else { await waiting; await route.continue(); }
  });
  await page.getByRole("button", { name: "다음 100건 불러오기", exact: true }).click();
  await expect(page.getByText("다음 내역을 불러오지 못했습니다", { exact: false })).toBeVisible();
  expect(await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id")))).toEqual(initial);
  fail = false;
  const beforeRetry = pageRequests;
  await page.getByRole("button", { name: "다시 시도", exact: true }).dblclick();
  await expect.poll(() => pageRequests).toBe(beforeRetry + 1);
  await expect(rows(page)).toHaveCount(100);
  release();
  await expect(rows(page)).toHaveCount(121);
  const ids = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id")));
  expect(ids.slice(0, 100)).toEqual(initial);
  expect(new Set(ids).size).toBe(121);
  expect(new Set(ids)).toEqual(new Set(fixture.ids));
  await expect(page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모")).toHaveValue(fixture.name);
  await expect(page.getByRole("button", { name: "다음 100건 불러오기", exact: true })).toHaveCount(0);
});

test("HISTORY04 요청자 본인 실제 상세·PIN취소는 역할 보존하고 재고를 한 번만 원복", async ({ page, request, actors }) => {
  const itemName = `내역취소검수${randomUUID().slice(0, 8)}`;
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" }, data: {
    item_name: itemName, process_type_code: "AR", unit: "EA", model_slots: [1], initial_quantity: 20,
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const item = await created.json();
  const submitted = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept", notes: "내역 취소 이동 근거",
    lines: [{ item_id: item.item_id, quantity: 3, from_bucket: "warehouse", to_bucket: "production", to_department: "조립" }],
  } });
  expect(submitted.status(), await submitted.text()).toBe(201);
  const work = await submitted.json();
  const approved = await request.post(`/api/stock-requests/${work.request_id}/approve`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } });
  expect(approved.status(), await approved.text()).toBe(200);
  const history = await request.get(`/api/inventory/transactions?item_id=${item.item_id}`);
  expect(history.ok()).toBeTruthy();
  const original = (await history.json()).find((row: { transaction_type: string }) => row.transaction_type === "TRANSFER_TO_PROD");
  expect(original.operation_id).toBeTruthy();
  expect(original).toMatchObject({ requester_name: actors.requester.name, approver_name: actors.approver.name, executor_name: actors.approver.name });
  expect((await (await request.get(`/api/items/${item.item_id}`)).json()).warehouse_qty).toBe(17);
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(itemName);
  const row = page.locator(`[data-log-id="${original.log_id}"]`);
  await row.first().click();
  await expect(page.getByText(actors.requester.name, { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(actors.approver.name, { exact: false }).filter({ visible: true }).first()).toBeVisible();
  const participants = page.getByTestId("history-participant-row");
  await expect(participants.filter({ hasText: "요청자" })).toContainText(actors.requester.name);
  await expect(participants.filter({ hasText: "승인자" })).toContainText(actors.approver.name);
  const movement = page.getByTestId("history-stock-movement-summary");
  await expect(movement).toContainText(/창고.*조립/);
  await expect(movement).toContainText(/20\s*17/);
  await expect(movement).toContainText(/0\s*3/);
  await expect(page.getByText("내역 취소 이동 근거", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "이 내역 취소", exact: true }).click();
  await page.getByRole("textbox", { name: "취소 사유", exact: true }).fill("요청자 원복 검수");
  await page.getByLabel("PIN", { exact: true }).fill("1111");
  await page.getByRole("button", { name: "취소 확정", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/PIN/);
  expect((await (await request.get(`/api/items/${item.item_id}`)).json()).warehouse_qty).toBe(17);
  await page.getByLabel("PIN", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`/api/items/${item.item_id}`)).json()).warehouse_qty).toBe(20);
  const result = await (await request.get(`/api/inventory/transactions?item_id=${item.item_id}`)).json();
  const cancelled = result.find((entry: { log_id: string }) => entry.log_id === original.log_id);
  expect(cancelled).toMatchObject({ cancelled: true, requester_name: actors.requester.name, approver_name: actors.approver.name, cancelled_by: actors.requester.employee_id });
  expect(result.filter((entry: { reverses_log_id: string }) => entry.reverses_log_id === original.log_id)).toHaveLength(1);
  await expect(page.getByRole("button", { name: "이 내역 취소", exact: true })).toHaveCount(0);
});

test("HISTORY02 실제 서버 변경은 받은 두 페이지와 끝 행을 보존하며 새 행을 반영", async ({ page, request, actors }) => {
  const fixture = await seedHistory(request);
  await loginUi(page, actors.requester);
  await openHistory(page, fixture.name);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "다음 100건 불러오기", exact: true }).click();
  await expect(rows(page)).toHaveCount(121);
  const before = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id")));
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const refreshing = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/inventory/transactions/display-groups?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("search") === fixture.name && !url.searchParams.has("cursor")) {
      started(); await held;
    }
    await route.continue();
  });
  try {
    const created = await request.post("/api/items", { headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" }, data: {
      item_name: `${fixture.name}-새작업`, process_type_code: "AR", unit: "EA", model_slots: [1], initial_quantity: 1,
    } });
    expect(created.status(), await created.text()).toBe(201);
    const item = await created.json();
    await refreshing;
    expect(await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id")))).toEqual(before);
    release();
    await expect(rows(page)).toHaveCount(122);
    const after = await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id")));
    const newLogs = await (await request.get(`/api/inventory/transactions?item_id=${item.item_id}`)).json();
    expect(newLogs).toHaveLength(1);
    expect(new Set(after)).toEqual(new Set([...before, newLogs[0].log_id]));
    expect(new Set(after).size).toBe(after.length);
    expect(after.at(-1)).toBe(before.at(-1));
    await expect(page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모")).toHaveValue(fixture.name);
  } finally { release(); }
});

test("HISTORY03 늦은 이전 검색 응답은 최신 목록과 마지막 선택 상세를 덮지 않음", async ({ page, request, actors }) => {
  const older = await seedHistory(request);
  const latest = await seedHistory(request);
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=history");
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/inventory/transactions/display-groups?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") === older.name) {
      const response = await route.fetch(); started(); await held; await route.fulfill({ response });
    } else await route.continue();
  });
  const search = page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모");
  try {
    await search.fill(older.name);
    await waiting;
    await search.fill(latest.name);
    await expect(rows(page)).toHaveCount(100);
    await expect(rows(page).first()).toContainText(latest.name);
    const first = page.locator(`[data-log-id="${latest.ids[0]}"]`);
    const second = page.locator(`[data-log-id="${latest.ids[1]}"]`);
    await first.first().click();
    await second.first().click();
    await expect(second.first()).toHaveAttribute("aria-pressed", "true");
    const arrived = page.waitForResponse((response) => response.url().includes("/display-groups?") && new URL(response.url()).searchParams.get("search") === older.name);
    release(); await arrived;
    await expect(search).toHaveValue(latest.name);
    expect(new Set(await rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-log-id"))))).toEqual(new Set(latest.ids.slice(0, 100)));
    await expect(second.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("QA-HISTORY-001", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("QA-HISTORY-000", { exact: true }).filter({ visible: true })).toHaveCount(0);
  } finally { release(); }
});

test("HISTORY05 HISTORY06 복원 재작업의 모품목·정상·불량·폐기 결과는 검색·추가조회·상세가 일치", async ({ page, request, actors }) => {
  const fixture = await seedReworkHistory(request);
  const matchingLogs = await (await request.get(`/api/inventory/transactions?search=${encodeURIComponent(fixture.search)}&limit=1000`)).json();
  const expectedSummary = await (await request.get(`/api/inventory/transactions/summary?search=${encodeURIComponent(fixture.search)}`)).json();
  expect(expectedSummary.total).toBeGreaterThanOrEqual(101);
  let expectedGroupCount = 0;
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ search: fixture.search });
    if (cursor) params.set("cursor", cursor);
    const response = await request.get(`/api/inventory/transactions/display-groups?${params}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const result = await response.json();
    expectedGroupCount += result.groups.length;
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  await loginUi(page, actors.requester);
  await openHistory(page, fixture.search);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(stats(page)).toContainText(`${expectedSummary.total}건`);
  const header = rows(page).filter({ hasText: fixture.names[0] }).first();
  await expect(header).toContainText(fixture.names[0]);
  await expect(header).toContainText(/불량.*2.*[−-]2.*0/);
  await page.getByRole("button", { name: "다음 100건 불러오기", exact: true }).click();
  await expect(rows(page)).toHaveCount(expectedGroupCount);
  await expect(page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모")).toHaveValue(fixture.search);
  await expect(stats(page)).toContainText(`${expectedSummary.total}건`);
  const toggle = header.getByRole("button", { name: /^묶음 (펼치기|접기)$/ });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const detailId = await toggle.getAttribute("aria-controls");
  expect(detailId).toBeTruthy();
  const result = page.locator(`[id="${detailId}"]`);
  await expect(result).toBeVisible();
  // Search exposes all component rows in the matched group, including nonmatching children.
  await expect(page.getByText(fixture.names[1], { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const table = page.getByTestId("history-table-surface");
  for (const [name, delta] of [[fixture.names[1], "+2"], [fixture.names[2], "+1"], [fixture.names[3], "-1"]]) {
    const child = table.locator("tr").filter({ hasText: name }).last();
    await expect(child).toContainText(delta.startsWith("-") ? new RegExp(`[−-]${delta.slice(1)}`) : delta);
  }
  await header.click();
  const summary = page.getByTestId("history-key-point-summary");
  await expect(summary).toContainText("재작업");
  await expect(summary.getByRole("button", { name: /불량 재고 · 3품목/ })).toBeVisible();
  await summary.getByRole("button", { name: /불량 재고 · 3품목/ }).click();
  await summary.getByRole("button", { name: /조립 재고 · 1품목/ }).click();
  for (const [name, delta] of [[fixture.names[0], "-2"], [fixture.names[1], "+2"], [fixture.names[2], "+1"], [fixture.names[3], "-1"]]) {
    const impact = summary.locator("[data-history-impact-item-name]").filter({ hasText: name }).locator("../../..");
    await expect(impact).toContainText(delta.startsWith("-") ? new RegExp(`[−-]${delta.slice(1)}`) : delta);
  }
  const logs = await (await request.get(`/api/inventory/transactions?search=${encodeURIComponent(fixture.search)}&limit=1000`)).json();
  expect(new Set(logs.map((row: { log_id: string }) => row.log_id))).toEqual(new Set(matchingLogs.map((row: { log_id: string }) => row.log_id)));
  expect(fixture.ids.every((id) => logs.some((row: { log_id: string }) => row.log_id === id))).toBe(true);
});
