import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item, TransactionLog } from "../../lib/api";
import type { DefectLocation } from "../../lib/api/types/defects";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";

const ADMIN = { "X-Admin-Pin": "0000" };
async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function itemFixture(request: APIRequestContext, department = "튜브"): Promise<Item> {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `일괄경계${randomUUID().slice(0, 8)}`, process_type_code: department === "조립" ? "AR" : "TR", model_slots: [1], unit: "EA",
    initial_quantity: 25, initial_locations: [{ department, quantity: 5 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return read(request, `/api/items/${(await response.json()).item_id}`);
}
async function origins(request: APIRequestContext, itemId: string): Promise<DefectLocation[]> {
  return (await read<DefectLocation[]>(request, "/api/defects/locations")).filter((row) => row.item_id === itemId);
}
async function quarantine(request: APIRequestContext, actors: CommonActors, item: Item, memo: string, quantity = 2, department = "창고", managementCategory = "DEFECT"): Promise<DefectLocation> {
  const response = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: quantity,
    source: department === "창고" ? "warehouse" : "production", target_dept: department,
    source_dept: department === "창고" ? null : department,
    management_category: managementCategory, reason_category: "외관 불량", reason_memo: memo,
  } });
  expect(response.status(), await response.text()).toBe(200);
  const record = (await origins(request, item.item_id)).find((row) => row.reason_memo === memo);
  expect(record).toBeTruthy();
  return record!;
}
async function snapshot(request: APIRequestContext, itemId: string) {
  return { item: await read<Item>(request, `/api/items/${itemId}`), cells: await read(request, `/api/inventory/locations/${itemId}`),
    records: await origins(request, itemId), logs: await read<{ log_id: string; transaction_type: string; cancelled: boolean; reverses_log_id: string | null; supplier_name_snapshot: string | null }[]>(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`) };
}
async function openList(page: Page, mobile = false, storage = false, navigate = true): Promise<void> {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  if (navigate) await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: storage ? "B급·구형 자재" : "격리 목록", visible: true }).click();
  if (mobile) await page.getByRole("button", { name: "필터 펼치기", exact: true }).click();
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
}
function group(page: Page, item: Item, mobile = false) {
  return page.getByTestId(mobile ? "defect-mobile-item-summary" : "defect-item-group-summary").filter({ hasText: item.item_name, visible: true });
}
function rows(page: Page, item: Item) {
  return page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true });
}
async function selectBulk(page: Page, item: Item, memos: string[], mobile = false): Promise<void> {
  const summary = group(page, item, mobile).first();
  if (mobile && await summary.getAttribute("aria-expanded") !== "true") await summary.click();
  const many = mobile ? summary.locator("xpath=following-sibling::*[1]").getByRole("button", { name: "여러 건 선택", exact: true }) : summary.getByRole("button", { name: "여러 건 선택", exact: true });
  await many.click();
  for (const memo of memos) await rows(page, item).filter({ hasText: memo }).getByRole("checkbox").check();
  await page.getByRole("button", { name: `선택 처리 ${memos.length}건`, exact: true }).filter({ visible: true }).click();
}
async function reason(page: Page): Promise<void> {
  await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
}
async function supplier(request: APIRequestContext, actors: CommonActors) {
  const response = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name: `일괄반품업체${randomUUID().slice(0, 8)}` } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ supplier_id: string; name: string }>;
}
async function chooseReturn(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /^반품(?: |$)/ }).filter({ visible: true }).click();
  await reason(page);
  await page.getByRole("button", { name: "공급업체 선택 →", exact: true }).filter({ visible: true }).click();
  const picker = page.getByRole("region", { name: "공급업체 검색·선택" });
  await picker.getByRole("textbox", { name: "공급업체 검색" }).fill(name);
  await expect(page.getByRole("button", { name: "반품 확인", exact: true }).filter({ visible: true })).toBeDisabled();
  await picker.getByRole("button", { name, exact: true }).click();
}

test.use({ trace: "retain-on-failure" });

for (const mobile of [false, true]) {
  test(`DEFECT-BULK-BOUNDARY ${mobile ? "모바일" : "PC"} 부서·품목·필터 변경은 선택을 초기화하고 잔량 전체와 개별 부분처리를 구분한다`, async ({ page, request, actors }) => {
    const item = await itemFixture(request);
    const other = await itemFixture(request);
    await quarantine(request, actors, item, "창고 첫 원건");
    await quarantine(request, actors, item, "창고 둘째 원건", 3);
    await quarantine(request, actors, item, "부서 첫 원건", 1, "튜브");
    await quarantine(request, actors, item, "부서 둘째 원건", 1, "튜브");
    await quarantine(request, actors, other, "다른 품목 첫 원건");
    await quarantine(request, actors, other, "다른 품목 둘째 원건");
    await loginUi(page, actors.requester);
    await openList(page, mobile);
    await expect(group(page, item, mobile)).toHaveCount(2);
    await expect(group(page, other, mobile)).toHaveCount(1);
    const department = page.getByRole("group", { name: "부서 구분" });
    await department.getByRole("button", { name: "창고", exact: true }).click();
    const summary = group(page, item, mobile);
    const activate = async () => {
      if (mobile && await summary.getAttribute("aria-expanded") !== "true") await summary.click();
      await (mobile ? summary.locator("xpath=following-sibling::*[1]").getByRole("button", { name: "여러 건 선택", exact: true }) : summary.getByRole("button", { name: "여러 건 선택", exact: true })).click();
      await rows(page, item).filter({ hasText: "창고 첫 원건" }).getByRole("checkbox").check();
      await expect(page.getByRole("button", { name: "선택 처리 1건", exact: true })).toBeEnabled();
    };
    await activate();
    await page.getByRole("searchbox", { name: "불량 검색", exact: true }).fill(other.item_name);
    await expect(page.getByRole("button", { name: "선택 처리 1건", exact: true })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "불량 검색", exact: true }).fill(item.item_name);
    await activate();
    await department.getByRole("button", { name: "튜브", exact: true }).click();
    await expect(page.getByRole("button", { name: "선택 처리 1건", exact: true })).toHaveCount(0);
    await department.getByRole("button", { name: "전체", exact: true }).click();
    await department.getByRole("button", { name: "창고", exact: true }).click();
    await activate();
    await page.getByRole("button", { name: "내가 격리", exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole("button", { name: "선택 처리 1건", exact: true })).toHaveCount(0);
    await selectBulk(page, item, ["창고 첫 원건", "창고 둘째 원건"], mobile);
    await expect(page.getByRole("spinbutton").filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText("일괄 처리는 각 원건의 남은 수량 전체를 처리합니다. 일부 수량은 개별 처리에서 입력하세요.", { exact: true })).toBeVisible();
    const reviewed = page.getByRole("region", { name: "선택 원건 재확인" });
    await expect(reviewed).toContainText("잔량 전체 2개");
    await expect(reviewed).toContainText("잔량 전체 3개");
    await expect(reviewed).not.toContainText("부서 첫 원건");
  });

  test(`DEFECT-BULK-BLOCK ${mobile ? "모바일" : "PC"} 서버 응답형 대기·출처불명 원건 투영은 선택 불가이며 보관 관리분류는 분리한다`, async ({ page, request, actors }) => {
    const item = await itemFixture(request);
    const pending = await quarantine(request, actors, item, "대기 투영 원건");
    const aggregate = await quarantine(request, actors, item, "출처불명 투영 원건");
    await quarantine(request, actors, item, "선택 가능 원건");
    await quarantine(request, actors, item, "B급 첫 원건", 1, "창고", "B_GRADE");
    await quarantine(request, actors, item, "B급 둘째 원건", 1, "창고", "B_GRADE");
    await quarantine(request, actors, item, "구형 첫 원건", 1, "창고", "OBSOLETE");
    await quarantine(request, actors, item, "구형 둘째 원건", 1, "창고", "OBSOLETE");
    const before = await snapshot(request, item.item_id);
    // Only the read response is projected; the real stock/ledger fixture is not modified.
    await page.route("**/api/defects/locations", async (route) => {
      const response = await route.fetch();
      const data = await response.json() as DefectLocation[];
      await route.fulfill({ response, json: data.map((row) => row.record_id === pending.record_id ? { ...row, pending_quantity: 1, available_quantity: 1 } : row.record_id === aggregate.record_id ? { ...row, is_legacy: true, legacy_origin: "aggregate" } : row) });
    });
    await loginUi(page, actors.requester);
    await openList(page, mobile);
    const summary = group(page, item, mobile);
    if (mobile) await summary.click();
    await (mobile ? summary.locator("xpath=following-sibling::*[1]").getByRole("button", { name: "여러 건 선택", exact: true }) : summary.getByRole("button", { name: "여러 건 선택", exact: true })).click();
    await expect(rows(page, item).filter({ hasText: "대기 투영 원건" }).getByRole("checkbox")).toBeDisabled();
    await expect(rows(page, item).filter({ hasText: "출처불명 투영 원건" }).getByRole("checkbox")).toBeDisabled();
    await expect(rows(page, item).filter({ hasText: "선택 가능 원건" }).getByRole("checkbox")).toBeEnabled();
    expect(await snapshot(request, item.item_id)).toEqual(before);
    await page.unroute("**/api/defects/locations");
    await page.getByRole("button", { name: /^(?:← )?작업 선택$/, exact: true }).filter({ visible: true }).click();
    await openList(page, mobile, true, false);
    await page.getByRole("textbox", { name: "B급·구형 검색", exact: true }).fill(item.item_name);
    await expect(group(page, item, mobile)).toHaveCount(2);
    await page.getByRole("group", { name: "보관 분류 필터" }).getByRole("button", { name: /^B급/ }).click();
    await expect(group(page, item, mobile)).toHaveCount(1);
    const bGradeGroup = group(page, item, mobile);
    if (await bGradeGroup.getAttribute("aria-expanded") !== "true") await (mobile ? bGradeGroup : bGradeGroup.getByRole("button", { name: /격리/ })).click();
    await expect(rows(page, item)).toHaveCount(2);
    await expect(rows(page, item).filter({ hasText: "B급 첫 원건" })).toContainText("B급");
    await expect(rows(page, item).filter({ hasText: "구형 첫 원건" })).toHaveCount(0);
    await page.getByRole("group", { name: "보관 분류 필터" }).getByRole("button", { name: /^구형/ }).click();
    await expect(group(page, item, mobile)).toHaveCount(1);
    const obsoleteGroup = group(page, item, mobile);
    if (await obsoleteGroup.getAttribute("aria-expanded") !== "true") await (mobile ? obsoleteGroup : obsoleteGroup.getByRole("button", { name: /격리/ })).click();
    await expect(rows(page, item)).toHaveCount(2);
    await expect(rows(page, item).filter({ hasText: "구형 첫 원건" })).toContainText("구형");
    await expect(rows(page, item).filter({ hasText: "B급 첫 원건" })).toHaveCount(0);
    await rows(page, item).filter({ hasText: "구형 첫 원건" }).getByRole("button", { name: "정상 복귀", exact: true }).click();
    await expect(page.getByRole("button", { name: "정상 복귀 →", exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^반품(?: |$)|^전체 폐기/ }).filter({ visible: true })).toHaveCount(0);
  });

  test(`DEFECT-RETURN-RETRY ${mobile ? "모바일" : "PC"} 실제 반품 성공응답 유실·재시도는 동일요청과 한 거래만 유지한다`, async ({ page, request, actors }) => {
    const item = await itemFixture(request);
    const origin = await quarantine(request, actors, item, "응답 유실 반품 원건", 3);
    const vendor = await supplier(request, actors);
    const before = await snapshot(request, item.item_id);
    await loginUi(page, actors.requester);
    await openList(page, mobile);
    if (mobile) await group(page, item, mobile).click();
    const row = rows(page, item);
    await row.getByRole("button", { name: "처리", exact: true }).click();
    await page.getByRole("spinbutton").filter({ visible: true }).fill("1");
    await chooseReturn(page, vendor.name);
    const payloads: { client_request_id: string }[] = [];
    const replies: { request_id: string }[] = [];
    await page.route("**/api/stock-requests", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      payloads.push(route.request().postDataJSON());
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(201);
      replies.push(await response.json());
      if (payloads.length === 1) await route.abort("failed");
      else await route.fulfill({ response });
    });
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.getByRole("button", { name: "반품 확인", exact: true }).filter({ visible: true }).click();
        await page.getByRole("dialog", { name: "반품 확인", exact: true }).getByRole("button", { name: "즉시 반품", exact: true }).click();
        await expect.poll(() => replies.length).toBe(attempt + 1);
        if (attempt === 0) await expect(page.getByRole("button", { name: "반품 확인", exact: true }).filter({ visible: true })).toBeEnabled();
      }
      expect(payloads[0].client_request_id).toMatch(/^defect-return:/);
      expect(payloads[1]).toEqual(payloads[0]);
      expect(replies[1].request_id).toBe(replies[0].request_id);
      const after = await snapshot(request, item.item_id);
      expect(after.item.warehouse_qty).toBe(before.item.warehouse_qty);
      expect(Number(after.records.find((record) => record.record_id === origin.record_id)?.available_quantity)).toBe(2);
      expect(after.logs.filter((log) => log.transaction_type === "SUPPLIER_RETURN")).toHaveLength(1);
    } finally { await page.unroute("**/api/stock-requests"); }
  });
}

test("DEFECT-BULK-RETURN 창고 일괄반품 업체필수·숨김경합 전체불변과 조립 반품 없음", async ({ page, request, actors }) => {
  const item = await itemFixture(request, "조립");
  await quarantine(request, actors, item, "일괄 반품 첫째");
  await quarantine(request, actors, item, "일괄 반품 둘째", 3);
  await quarantine(request, actors, item, "조립 반품 금지", 1, "조립");
  const vendor = await supplier(request, actors);
  const before = await snapshot(request, item.item_id);
  await loginUi(page, actors.requester);
  await openList(page);
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "조립", exact: true }).click();
  await rows(page, item).getByRole("button", { name: "처리", exact: true }).click();
  await expect(page.getByRole("button", { name: /^반품(?: |$)/ }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole("button", { name: "목록", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "작업 선택", exact: true }).filter({ visible: true }).click();
  await openList(page, false, false, false);
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "창고", exact: true }).click();
  await selectBulk(page, item, ["일괄 반품 첫째", "일괄 반품 둘째"]);
  await chooseReturn(page, vendor.name);
  expect((await request.patch(`/api/suppliers/${vendor.supplier_id}`, { data: { requester_employee_id: actors.approver.employee_id, is_active: false } })).status()).toBe(200);
  await page.getByRole("button", { name: "반품 확인", exact: true }).click();
  const rejected = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/stock-requests"));
  await page.getByRole("dialog", { name: "반품 확인", exact: true }).getByRole("button", { name: "즉시 반품", exact: true }).click();
  expect((await rejected).status()).toBe(422);
  await expect(page.getByText(/숨김.*공급업체|활성.*공급업체/).filter({ visible: true })).toBeVisible();
  expect(await snapshot(request, item.item_id)).toEqual(before);
});

test("DEFECT-BULK-STALE 처리중 실제 두 원건 잔량변경은 모든 오류를 표시하고 일괄 변경을 남기지 않는다", async ({ page, request, actors }) => {
  const item = await itemFixture(request);
  const first = await quarantine(request, actors, item, "경합 첫째", 2);
  const second = await quarantine(request, actors, item, "경합 둘째", 3);
  await loginUi(page, actors.requester);
  await openList(page);
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "창고", exact: true }).click();
  await selectBulk(page, item, ["경합 첫째", "경합 둘째"]);
  await reason(page);
  await page.getByRole("button", { name: "정상 복귀 →", exact: true }).click();
  let release!: () => void;
  let arrived = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/defects/unquarantine/bulk", async (route) => { arrived = true; await gate; await route.continue(); });
  let changed: Awaited<ReturnType<typeof snapshot>>;
  const rejected = page.waitForResponse((response) => response.url().endsWith("/api/defects/unquarantine/bulk") && response.request().method() === "POST");
  try {
    await page.getByRole("dialog", { name: "정상 복귀 확인", exact: true }).getByRole("button", { name: "즉시 복귀", exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    for (const origin of [first, second]) {
      const changedReply = await request.post("/api/defects/unquarantine", { data: { actor_employee_id: actors.other.employee_id, record_id: origin.record_id, item_id: item.item_id, qty: 1, dept: "창고", reason_category: "검사 통과" } });
      expect(changedReply.status(), await changedReply.text()).toBe(200);
    }
    changed = await snapshot(request, item.item_id);
  } finally { release(); }
  expect((await rejected).status()).toBe(422);
  await expect(page.getByText(/선택 기록 1:/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/선택 기록 2:/).filter({ visible: true })).toBeVisible();
  expect(await snapshot(request, item.item_id)).toEqual(changed!);
  await expect(page.getByRole("heading", { name: "불량 여러 건 처리", exact: true })).toHaveCount(0);
});

test("DEFECT-BULK-MOBILE 실제 전량 복귀 제출은 원건·위치를 보존하고 복귀분만 후속 사용한다", async ({ page, request, actors }) => {
  type Cell = { department: string; status: string; quantity: number | string; pending_quantity: number | string };
  const created = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `모바일복귀사용${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [1], unit: "EA",
    initial_quantity: 15, initial_locations: [{ department: "튜브", quantity: 7 }, { department: "고압", quantity: 3 }],
  } });
  expect(created.status(), await created.text()).toBe(201);
  const item = await read<Item>(request, `/api/items/${(await created.json()).item_id}`);
  expect(item.warehouse_qty).toBe(5);
  const other = await itemFixture(request);
  const untouched = await snapshot(request, other.item_id);
  const first = await quarantine(request, actors, item, "모바일 일괄 첫 원건", 2);
  const second = await quarantine(request, actors, item, "모바일 일괄 둘째 원건", 3);
  const before = await snapshot(request, item.item_id);
  expect(before.item.warehouse_qty).toBe(0);
  const cells = (state: Awaited<ReturnType<typeof snapshot>>) => (state.cells as Cell[]).map((cell) => ({
    department: cell.department, status: cell.status, quantity: Number(cell.quantity), pending: Number(cell.pending_quantity),
  })).sort((left, right) => `${left.department}:${left.status}`.localeCompare(`${right.department}:${right.status}`));
  await loginUi(page, actors.requester);
  await openList(page, true);
  await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "창고", exact: true }).click();
  await selectBulk(page, item, ["모바일 일괄 첫 원건", "모바일 일괄 둘째 원건"], true);
  await expect(page.getByRole("spinbutton").filter({ visible: true })).toHaveCount(0);
  const reviewed = page.getByRole("region", { name: "선택 원건 재확인" });
  await expect(reviewed.getByRole("article")).toHaveCount(2);
  await expect(reviewed.locator(`[data-record-id="${first.record_id}"]`)).toContainText("잔량 전체 2개");
  await expect(reviewed.locator(`[data-record-id="${second.record_id}"]`)).toContainText("잔량 전체 3개");
  await reason(page);
  await page.getByRole("button", { name: "정상 복귀 →", exact: true }).filter({ visible: true }).click();
  const confirmation = page.getByRole("dialog", { name: "정상 복귀 확인", exact: true });
  await expect(confirmation).toContainText("5개 (2건)");
  const submitted = page.waitForResponse((response) => response.request().method() === "POST"
    && response.url().endsWith("/api/defects/unquarantine/bulk"));
  const refreshed = page.waitForResponse(async (response) => response.request().method() === "GET"
    && new URL(response.url()).pathname === "/api/defects/locations" && response.status() === 200
    && !(await response.json() as DefectLocation[]).some((row) => [first.record_id, second.record_id].includes(row.record_id)));
  await confirmation.getByRole("button", { name: "즉시 복귀", exact: true }).click();
  const response = await submitted;
  expect(response.status(), await response.text()).toBe(200);
  const result = await response.json();
  expect(result.processed_records).toBe(2);
  expect(Number(result.total_quantity)).toBe(5);
  expect(response.request().postDataJSON().lines.map((line: { record_id: string; item_id: string; department: string; quantity: number }) => ({
    record_id: line.record_id, item_id: line.item_id, department: line.department, quantity: line.quantity,
  })).sort((left: { record_id: string }, right: { record_id: string }) => left.record_id.localeCompare(right.record_id))).toEqual([
    { record_id: first.record_id, item_id: item.item_id, department: "창고", quantity: 2 },
    { record_id: second.record_id, item_id: item.item_id, department: "창고", quantity: 3 },
  ].sort((left, right) => left.record_id.localeCompare(right.record_id)));
  expect((await refreshed).status()).toBe(200);
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("region", { name: "불량 목록 필터" })).toBeVisible();
  await expect(rows(page, item)).toHaveCount(0);
  await expect(group(page, item, true)).toHaveCount(0);
  const restored = await snapshot(request, item.item_id);
  expect(restored.item.warehouse_qty).toBe(5);
  expect(restored.item.quantity).toBe(before.item.quantity);
  expect(restored.item.pending_quantity).toBe(before.item.pending_quantity);
  expect(cells(restored)).toEqual(cells(before).map((cell) => ({ ...cell,
    quantity: cell.quantity - (cell.department === "창고" && cell.status === "DEFECTIVE" ? 5 : 0),
  })));
  expect(restored.records).toHaveLength(0);
  const logs = await read<TransactionLog[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
  const restorations = logs.filter((log) => log.transaction_type === "UNMARK_DEFECTIVE");
  expect(restorations).toHaveLength(2);
  expect(restorations.map((log) => Number(log.transfer_qty)).sort()).toEqual([2, 3]);
  for (const log of restorations) {
    expect(log.department).toBe("창고");
    expect(log.quantity_change).toBe(0);
    expect(log.inventory_effect).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: "warehouse", delta: Number(log.transfer_qty) }),
      expect.objectContaining({ scope: "location", department: "창고", status: "DEFECTIVE", delta: -Number(log.transfer_qty) }),
    ]));
  }
  expect(restorations[0].operation_id).toBeTruthy();
  expect(new Set(restorations.map((log) => log.operation_id)).size).toBe(1);
  expect(await snapshot(request, other.item_id)).toEqual(untouched);
  await page.screenshot({ path: test.info().outputPath("mobile-bulk-restored.png"), fullPage: true });

  // Only the restored warehouse five are consumed; the department sentinels cannot satisfy this request.
  const context = { requester_employee_id: actors.approver.employee_id,
    work_type: "internal_use", sub_type: "internal_use_out", to_department: "AS" };
  const preview = await request.post("/api/io/preview", { data: { ...context, targets: [
    { source_kind: "manual", source_location: "warehouse", item_id: item.item_id, quantity: 5 },
  ] } });
  expect(preview.status(), await preview.text()).toBe(200);
  const usedReply = await request.post("/api/io/submit", { data: { ...context, bundles: (await preview.json()).bundles } });
  expect(usedReply.status(), await usedReply.text()).toBe(201);
  expect((await usedReply.json()).status).toBe("completed");
  const used = await snapshot(request, item.item_id);
  expect(used.item.warehouse_qty).toBe(0);
  expect(used.item.quantity).toBe(Number(restored.item.quantity) - 5);
  expect(used.item.pending_quantity).toBe(restored.item.pending_quantity);
  expect(cells(used)).toEqual(cells(restored));
  expect(used.records).toHaveLength(0);
  const useLogs = (await read<TransactionLog[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`))
    .filter((log) => log.transaction_type === "INTERNAL_USE");
  expect(useLogs).toHaveLength(1);
  expect(useLogs[0].quantity_change).toBe(-5);
  expect(useLogs[0].inventory_effect).toEqual([
    expect.objectContaining({ scope: "warehouse", delta: -5, quantity_before: 5, quantity_after: 0 }),
  ]);
  expect(await snapshot(request, other.item_id)).toEqual(untouched);
});
