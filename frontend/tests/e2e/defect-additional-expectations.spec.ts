import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function fixture(request: APIRequestContext, actors: CommonActors) {
  const seed = await json(request, `/api/items/${readSeed().rawItem.item_id}`);
  expect(seed.model_slots.length).toBeGreaterThan(0);
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `불량 추가검수 ${randomUUID().slice(0, 8)}`, unit: "EA", initial_quantity: 20,
    process_type_code: seed.process_type_code, model_slots: seed.model_slots,
  } });
  expect(response.status(), await response.text()).toBe(201);
  const item = await response.json();
  const submitted = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept",
    lines: [{ item_id: item.item_id, quantity: 8, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" }],
  } });
  expect(submitted.status(), await submitted.text()).toBe(201);
  const work = await submitted.json();
  const approved = await request.post(`/api/stock-requests/${work.request_id}/approve`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } });
  expect(approved.status(), await approved.text()).toBe(200);
  return item;
}
async function stock(request: APIRequestContext, itemId: string) {
  const item = await json(request, `/api/items/${itemId}`);
  const cells = await json(request, `/api/inventory/locations/${itemId}`);
  return { warehouse: Number(item.warehouse_qty), warehousePending: Number(item.pending_quantity ?? 0),
    cells: cells.map((cell: { department: string; status: string; quantity: number; pending_quantity: number }) => ({
      department: cell.department, status: cell.status, quantity: Number(cell.quantity), pending: Number(cell.pending_quantity ?? 0),
    })) };
}
async function records(request: APIRequestContext, itemId: string) {
  return (await json(request, "/api/defects/locations")).filter((row: { item_id: string }) => row.item_id === itemId);
}
async function quarantine(request: APIRequestContext, actors: CommonActors, itemId: string, quantity: number, memo: string, managementCategory = "DEFECT") {
  const response = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: itemId, qty: quantity, source: "warehouse", target_dept: "창고",
    reason_category: "외관 불량", reason_memo: memo, management_category: managementCategory,
  } });
  expect(response.status(), await response.text()).toBe(200);
  return (await records(request, itemId)).find((row: { reason_memo: string }) => row.reason_memo === memo);
}
async function openList(page: Page, itemName: string, storage = false) {
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: storage ? "B급·구형 자재" : "격리 목록", visible: true }).click();
  if (!storage) await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "전체", exact: true }).click();
  const summary = page.getByTestId("defect-item-group-summary").filter({ hasText: itemName, visible: true });
  const records = page.getByRole("article", { name: `${itemName} 격리 기록` }).filter({ visible: true });
  await expect.poll(async () => await summary.count() + await records.count()).toBeGreaterThan(0);
  for (const group of await summary.all()) {
    if (await group.getAttribute("aria-expanded") !== "true") await group.getByRole("button", { name: /격리/ }).click();
  }
  await expect(records.first()).toBeVisible();
  return records;
}
async function reason(page: Page, name: string) {
  await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name, exact: true }).click();
}

for (const source of ["warehouse", "production"] as const) {
  for (const action of ["격리 등록", "즉시 폐기"] as const) {
    test(`DEFECT-SUBMIT 8.5-08/10/11 8.7-05/08/09 일반직원 ${action} ${source} 실제 위치·이력`, async ({ page, request, actors }) => {
      const item = await fixture(request, actors);
      const before = await stock(request, item.item_id);
      await loginUi(page, actors.requester);
      await page.goto("/mes?tab=defect");
      await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
      const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
      for (const label of ["격리 등록", "즉시 폐기", "즉시 재작업"]) await expect(choices.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
      await choices.getByRole("button", { name: new RegExp(`^${action}`) }).click();
      await choices.getByRole("button", { name: new RegExp(`^${source === "warehouse" ? "창고 재고" : "부서 재고"}`) }).click();
      const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
      await picker.getByRole("combobox").first().click();
      await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
      await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code);
      await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
      const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
      await expect(cart).toContainText(`자동 부서 · ${source === "warehouse" ? "창고" : "튜브"}`);
      await cart.getByRole("spinbutton").fill("2");
      await reason(page, "외관 불량");
      const memo = `실행 독립 메모 ${randomUUID().slice(0, 6)}`;
      await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill(memo);
      expect(await stock(request, item.item_id)).toEqual(before);
      const originsBeforeConfirm = await records(request, item.item_id);
      const logsBeforeConfirm = await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
      await page.getByRole("button", { name: action === "격리 등록" ? /^격리하기 \(1건\) →$/ : /^즉시 폐기 \(1건\) →$/ }).filter({ visible: true }).click();
      const dialog = page.getByRole("dialog", { name: action === "격리 등록" ? "불량 격리 확인" : "즉시 폐기 확인" });
      await expect(dialog).toContainText(item.item_name);
      await expect(dialog).toContainText(source === "warehouse" ? "창고" : "튜브");
      await expect(dialog).toContainText("2");
      await dialog.getByRole("button", { name: "취소", exact: true }).click();
      expect(await stock(request, item.item_id)).toEqual(before);
      expect(await records(request, item.item_id)).toEqual(originsBeforeConfirm);
      expect(await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)).toEqual(logsBeforeConfirm);
      await expect(cart.getByRole("spinbutton")).toHaveValue("2");
      await expect(cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단")).toHaveValue(memo);
      await page.getByRole("button", { name: action === "격리 등록" ? /^격리하기 \(1건\) →$/ : /^즉시 폐기 \(1건\) →$/ }).filter({ visible: true }).click();
      const submitted = page.waitForResponse((reply) => reply.request().method() === "POST" && reply.url().includes(action === "격리 등록" ? "/api/defects/quarantine" : "/api/stock-requests"));
      await dialog.getByRole("button", { name: action === "격리 등록" ? "격리하기" : "즉시 폐기", exact: true }).click();
      const response = await submitted;
      expect(response.ok(), await response.text()).toBeTruthy();
      if (action === "즉시 폐기") {
        const work = await response.json();
        expect(work.status).toBe("completed");
        expect(work.requires_warehouse_approval).toBe(false);
        expect(work.requires_department_approval).toBe(false);
      }
      await expect(page.getByRole("button").filter({ hasText: "격리 목록", visible: true })).toBeVisible();
      const after = await stock(request, item.item_id);
      expect(after.warehouse).toBe(before.warehouse - (source === "warehouse" ? 2 : 0));
      expect(after.warehousePending).toBe(before.warehousePending);
      for (const cell of before.cells) {
        const current = after.cells.find((row: { department: string; status: string }) => row.department === cell.department && row.status === cell.status);
        expect(current?.quantity).toBe(cell.quantity - (source === "production" && cell.department === "튜브" && cell.status === "PRODUCTION" ? 2 : 0));
        expect(current?.pending).toBe(cell.pending);
      }
      const origins = await records(request, item.item_id);
      expect(origins).toHaveLength(action === "격리 등록" ? 1 : 0);
      if (action === "격리 등록") {
        expect(origins[0]).toMatchObject({ department: source === "warehouse" ? "창고" : "튜브", reason_category: "외관 불량", reason_memo: memo });
        expect(Number(origins[0].available_quantity)).toBe(2);
      }
      const logs = await json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
      const log = logs.find((row: { transaction_type: string }) => row.transaction_type === (action === "격리 등록" ? "MARK_DEFECTIVE" : "DEFECT_SCRAP"));
      expect(log).toBeTruthy();
      expect(log.producer_employee_id).toBe(actors.requester.employee_id);
      expect(Number(log.quantity_change)).toBe(action === "격리 등록" ? 0 : -2);
      if (action === "격리 등록") expect(Number(log.transfer_qty)).toBe(2);
      await page.goto("/mes?tab=history");
      await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
      const historyRow = page.locator(`[data-log-id="${log.log_id}"]`).filter({ visible: true }).first();
      await expect(historyRow).toContainText(action === "격리 등록" ? "불량 격리" : "불량 폐기");
      const normalBefore = source === "warehouse" ? before.warehouse : before.cells.find((cell: { department: string; status: string }) => cell.department === "튜브" && cell.status === "PRODUCTION").quantity;
      await expect(historyRow).toContainText(new RegExp(`${source === "warehouse" ? "창고" : "튜브"}.*${normalBefore}.*[−-]2.*${normalBefore - 2}`));
      await historyRow.click();
      await expect(page.getByTestId("history-operation-summary")).toContainText(action === "격리 등록" ? "불량 격리" : "폐기");
      await expect(page.getByTestId("history-stock-movement-summary")).toContainText(source === "warehouse" ? "창고" : "튜브");
      await expect(page.getByText(actors.requester.name, { exact: false }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(memo, { exact: false }).filter({ visible: true }).first()).toBeVisible();
      const detail = page.locator(`[data-history-detail-log-id="${log.log_id}"]`).filter({ visible: true });
      const summary = detail.getByTestId("history-key-point-summary");
      const impactGroups = summary.getByRole("button", { name: /재고 ·/ });
      await expect.poll(async () => await impactGroups.count() + await summary.getByLabel(/재고 .*→/).count()).toBeGreaterThan(0);
      for (const group of await impactGroups.all()) {
        if (await group.getAttribute("aria-expanded") === "false") await group.click();
      }
      await expect(summary.getByLabel(`${source === "warehouse" ? "창고" : "튜브"} 재고 ${normalBefore} -2→${normalBefore - 2} EA`, { exact: true })).toBeVisible();
      if (action === "격리 등록") await expect(summary.getByLabel("불량 재고 0 +2→2 EA", { exact: true })).toBeVisible();
      else await expect(summary.getByLabel(/불량 재고 .*→/)).toHaveCount(0);
      await expect(detail.getByText("불량 사유", { exact: true }).locator("..")).toContainText("외관 불량");
      await expect(detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
      const instant = log.requested_at ?? log.created_at;
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(/[Z]|[+]\d{2}:?\d{2}$/.test(instant) ? instant : `${instant}Z`)).map(part => [part.type, part.value]));
      await expect(historyRow).toContainText(`${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`);
      await expect(summary).toContainText(`${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}시 ${parts.minute}분`);
    });
  }
}

for (const source of ["warehouse", "production"] as const) {
  test(`DEFECT-SCRAP-ERRORS 8.7-04 8.10-05 ${source} 모든 행의 수량·가용·사유 오류를 표시하고 확인·처리·재고 변경을 막는다`, async ({ page, request, actors }) => {
    const items = [await fixture(request, actors), await fixture(request, actors)];
    const before = await Promise.all(items.map(item => stock(request, item.item_id)));
    const beforeOrigins = await Promise.all(items.map(item => records(request, item.item_id)));
    const beforeLogs = await Promise.all(items.map(item => json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)));
    await loginUi(page, actors.requester);
    await page.goto("/mes?tab=defect");
    await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
    const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
    await choices.getByRole("button", { name: /^즉시 폐기/ }).click();
    await choices.getByRole("button", { name: new RegExp(`^${source === "warehouse" ? "창고 재고" : "부서 재고"}`) }).click();
    const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
    await picker.getByRole("combobox").first().click();
    await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
    for (const item of items) {
      await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code);
      await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
    }
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    const submit = page.getByRole("button", { name: /^즉시 폐기 \(2건\) →$/ }).filter({ visible: true });
    const calls: string[] = [];
    page.on("request", call => {
      if (call.method() === "POST" && /\/api\/(stock-requests|defects\/)/.test(new URL(call.url()).pathname)) calls.push(call.url());
    });
    for (let index = 0; index < 2; index++) await cart.getByRole("spinbutton").nth(index).fill("0");
    await expect(cart.getByText("수량은 1개 이상 입력하세요.", { exact: true })).toHaveCount(2);
    await expect(cart.getByText("사유 카테고리를 선택하세요.", { exact: true })).toHaveCount(2);
    await expect(submit).toBeDisabled();
    for (let index = 0; index < 2; index++) {
      const available = source === "warehouse" ? before[index].warehouse : before[index].cells.find((cell: { department: string; status: string }) => cell.department === "튜브" && cell.status === "PRODUCTION").quantity;
      await cart.getByRole("spinbutton").nth(index).fill(String(available + 1));
    }
    await expect(cart.getByText(new RegExp(`${source === "warehouse" ? "창고" : "튜브"} 가용 .*개보다 1개 많습니다\\.`))).toHaveCount(2);
    await expect(cart.getByText("사유 카테고리를 선택하세요.", { exact: true })).toHaveCount(2);
    await expect(submit).toBeDisabled();
    for (let index = 0; index < 2; index++) {
      await cart.getByRole("spinbutton").nth(index).fill("1");
      await cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).nth(index).click();
      await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "기타", exact: true }).click();
    }
    for (let index = 0; index < 2; index++) await expect(cart.getByRole("spinbutton").nth(index).locator("../..")).toContainText("기타를 선택하면 메모를 입력하세요.");
    await expect(submit).toBeDisabled();
    await expect(page.getByRole("dialog", { name: "즉시 폐기 확인" })).toHaveCount(0);
    expect(calls).toEqual([]);
    expect(await Promise.all(items.map(item => stock(request, item.item_id)))).toEqual(before);
    expect(await Promise.all(items.map(item => records(request, item.item_id)))).toEqual(beforeOrigins);
    expect(await Promise.all(items.map(item => json(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`)))).toEqual(beforeLogs);
  });
}

test("DEFECT-RESTORE-BUSY 8.6-06 지연 응답 중 버튼잠금·정상복귀 API/수량/거래 한 번", async ({ page, request, actors }) => {
  const item = await fixture(request, actors);
  const origin = await quarantine(request, actors, item.item_id, 3, "지연 정상복귀 원건");
  const before = await stock(request, item.item_id);
  const logsBefore = await json(request, `/api/inventory/transactions?item_id=${item.item_id}&transaction_type=UNMARK_DEFECTIVE`);
  await loginUi(page, actors.requester);
  const rows = await openList(page, item.item_name);
  await rows.getByRole("button", { name: "처리", exact: true }).click();
  await page.getByRole("spinbutton").filter({ visible: true }).fill("1");
  await reason(page, "검사 통과");
  await page.getByRole("button", { name: "정상 복귀 →", exact: true }).filter({ visible: true }).click();
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/defects/unquarantine", async (route) => { calls++; await held; await route.continue(); });
  try {
    await page.getByRole("dialog", { name: "정상 복귀 확인" }).getByRole("button", { name: "즉시 복귀", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    const busy = page.getByRole("button", { name: "처리 중...", exact: true }).filter({ visible: true });
    await expect(busy).toBeDisabled();
    await busy.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    expect(calls).toBe(1);
    expect(await stock(request, item.item_id)).toEqual(before);
  } finally { release(); }
  await expect.poll(async () => (await stock(request, item.item_id)).warehouse).toBe(before.warehouse + 1);
  await expect.poll(async () => (await json(request, `/api/inventory/transactions?item_id=${item.item_id}&transaction_type=UNMARK_DEFECTIVE`)).length).toBe(logsBefore.length + 1);
  expect(Number((await records(request, item.item_id)).find((row: { record_id: string }) => row.record_id === origin.record_id).available_quantity)).toBe(2);
  expect(calls).toBe(1);
});

test("DEFECT-ORIGINS 8.6-02/09 8.9-03/04 원건 사유/메모 분리·PIN실패보존·분류/메모 이력", async ({ page, request, actors }) => {
  const item = await fixture(request, actors);
  const first = await quarantine(request, actors, item.item_id, 3, "첫 독립메모", "B_GRADE");
  await quarantine(request, actors, item.item_id, 4, "둘째 독립메모", "OBSOLETE");
  await loginUi(page, actors.requester);
  const rows = await openList(page, item.item_name, true);
  await expect(rows).toHaveCount(2);
  const firstRowIndex = (await rows.allTextContents()).findIndex((text) => text.includes("첫 독립메모"));
  expect(firstRowIndex).toBeGreaterThanOrEqual(0);
  const row = rows.nth(firstRowIndex);
  await expect(row.getByTestId("defect-reason-summary").getByText("격리 사유", { exact: true })).toBeVisible();
  await expect(row.getByTestId("defect-reason-summary").getByText("외관 불량", { exact: true })).toBeVisible();
  await expect(row.getByTestId("defect-reason-summary")).not.toContainText("첫 독립메모");
  await expect(row.getByText("첫 독립메모", { exact: true })).toHaveCount(1);
  await row.getByRole("button", { name: "메모 수정", exact: true }).click();
  await row.getByRole("textbox", { name: "격리 메모", exact: true }).fill("수정된 독립메모");
  await row.getByRole("textbox", { name: "직원 PIN", exact: true }).fill("1111");
  await row.getByRole("button", { name: "저장", exact: true }).click();
  await expect(row).toContainText(/PIN/);
  expect((await records(request, item.item_id)).find((record: { record_id: string }) => record.record_id === first.record_id).reason_memo).toBe("첫 독립메모");
  await row.getByRole("textbox", { name: "직원 PIN", exact: true }).fill("0000");
  await row.getByRole("button", { name: "저장", exact: true }).click();
  const updatedRow = rows.filter({ hasText: "수정된 독립메모" });
  await expect(updatedRow).toBeVisible();
  await updatedRow.getByRole("button", { name: "분류 변경", exact: true }).click();
  const category = page.getByRole("dialog", { name: "보관 분류 변경", exact: true });
  await category.getByRole("button", { name: "구형", exact: true }).click();
  await category.getByRole("textbox", { name: "분류 변경 메모", exact: true }).fill("검사 후 구형 판정");
  await category.getByRole("textbox", { name: "직원 PIN", exact: true }).fill("0000");
  const changed = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes(`/api/defects/records/${first.record_id}/management-category`));
  await category.getByRole("button", { name: "변경 저장", exact: true }).click();
  expect((await changed).ok()).toBeTruthy();
  const mergedGroups = page.getByTestId("defect-item-group-summary").filter({ hasText: item.item_name, visible: true });
  await expect(mergedGroups).toHaveCount(1);
  if (await mergedGroups.getAttribute("aria-expanded") !== "true") await mergedGroups.getByRole("button", { name: /격리/ }).click();
  await expect(updatedRow).toContainText("구형");
  await updatedRow.getByRole("button", { name: "이력 보기", exact: true }).click();
  const history = updatedRow.getByTestId("defect-record-history");
  await expect(history).toContainText("변경 전: 첫 독립메모");
  await expect(history).toContainText("변경 후: 수정된 독립메모");
  await expect(history).toContainText("분류 변경 · B급 → 구형");
  await expect(history).toContainText("메모: 검사 후 구형 판정");
  await expect(history).toContainText(actors.requester.name);
  const revisions = await json(request, `/api/defects/records/${first.record_id}/management-category-history`);
  const last = revisions.find((revision: { previous_category: string }) => revision.previous_category === "B_GRADE");
  expect(last.edited_by_employee_id).toBe(actors.requester.employee_id);
  expect(Date.parse(last.edited_at)).not.toBeNaN();
  await expect(history).toContainText(new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(last.edited_at.endsWith("Z") ? last.edited_at : `${last.edited_at}Z`)));
  expect(Number((await records(request, item.item_id)).find((record: { record_id: string }) => record.record_id === first.record_id).available_quantity)).toBe(3);
});
