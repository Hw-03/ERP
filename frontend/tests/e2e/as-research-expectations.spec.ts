import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Employee } from "../../lib/api/types/employees";
import { test, expect, changeEmployee, loginUi, openNotifications } from "./_common-expectations";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
async function json(request: APIRequestContext, url: string, actorId?: string) {
  const response = await request.get(url, actorId ? { headers: { "X-Actor-Employee-Id": actorId } } : undefined);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function itemFixture(request: APIRequestContext) {
  const response = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `전용승인 전환검수 ${randomUUID().slice(0, 8)}`, unit: "EA", model_slots: [1],
    process_type_code: "AR", initial_quantity: 8, initial_locations: [{ department: "조립", quantity: 8 }],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function submit(request: APIRequestContext, actor: Employee, itemId: string) {
  const base = { requester_employee_id: actor.employee_id, work_type: "internal_use", sub_type: "internal_use_out", to_department: "AS" };
  const preview = await request.post("/api/io/preview", { data: { ...base, targets: [{ source_kind: "direct_item", source_location: "department", item_id: itemId, quantity: 1 }] } });
  expect(preview.status(), await preview.text()).toBe(200);
  const submitted = await request.post("/api/io/submit", { data: { ...base, notes: "전용 승인 경로 전환 원건", bundles: (await preview.json()).bundles } });
  expect(submitted.status(), await submitted.text()).toBe(201);
  const result = await submitted.json();
  expect(result.stock_requests).toHaveLength(1);
  expect(result.stock_requests[0]).toMatchObject({ approval_kind: "as_research", requires_as_research_approval: true });
  expect(result.stock_requests[0].stock_request_id).toBeTruthy();
  return { ...result, requestId: result.stock_requests[0].stock_request_id };
}

// Last-approver removal irreversibly reclassifies pending requests. Run this
// specification alone against a fresh global-setup fixture, never a live DB.
test("ASR-FALLBACK PC-DELTA-ASR-03 마지막 전용역할 해제는 알림 읽음·실행차단·부서 대기·완료 이력·재활성 큐를 보존한다", async ({ page, context, request, actors }) => {
  const roster: Employee[] = await json(request, "/api/employees?active_only=true");
  const pendingBefore = await json(request, "/api/stock-requests?limit=200");
  expect(pendingBefore.filter((row: { requires_as_research_approval: boolean; as_research_approved_at: string | null; status: string }) => row.requires_as_research_approval && !row.as_research_approved_at && ["submitted", "reserved"].includes(row.status))).toHaveLength(0);
  const originalSpecial = roster.filter((employee) => employee.as_research_approver && employee.employee_id !== actors.approver.employee_id);
  let pendingId: string | null = null;
  const departmentPage = await context.newPage();
  try {
    for (const employee of originalSpecial) await changeEmployee(request, employee, { as_research_approver: false });
    await changeEmployee(request, actors.requester, { department: "AS", warehouse_role: "none", department_role: "none", as_research_approver: false });
    await changeEmployee(request, actors.approver, { warehouse_role: "none", department_role: "none", as_research_approver: true });
    await changeEmployee(request, actors.other, { department: "AS", warehouse_role: "none", department_role: "primary", as_research_approver: false });
    const completedItem = await itemFixture(request);
    const pendingItem = await itemFixture(request);
    const completed = await submit(request, actors.requester, completedItem.item_id);
    const completion = await request.post(`/api/stock-requests/${completed.requestId}/as-research-approve`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } });
    expect(completion.status(), await completion.text()).toBe(200);
    const completedBefore = await json(request, `/api/stock-requests/${completed.requestId}`);
    expect(completedBefore.status).toBe("completed");
    const pending = await submit(request, actors.requester, pendingItem.item_id);
    pendingId = pending.requestId;
    const stockBefore = await json(request, `/api/items/${pendingItem.item_id}`);
    const notesBefore = await json(request, `/api/notifications?recipient_employee_id=${actors.approver.employee_id}`, actors.approver.employee_id);
    const oldNote = notesBefore.items.find((note: { related_request_id: string; target_section: string }) => note.related_request_id === pendingId && note.target_section === "as-research-queue");
    expect(oldNote).toBeTruthy();
    expect(oldNote.is_read).toBe(false);
    await loginUi(page, actors.approver);
    await page.goto(`/mes?tab=warehouse&section=as-research-queue&stockRequestId=${pendingId}`);
    await expect(page.locator(`[data-stock-request-id="${pendingId}"]`)).toContainText(pendingItem.item_name);
    await loginUi(departmentPage, actors.other);
    await departmentPage.bringToFront();
    await changeEmployee(request, actors.approver, { as_research_approver: false });
    await page.bringToFront();
    await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await expect(page.getByRole("tab", { name: /AS·연구 승인함/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
    const oldDialog = await openNotifications(page);
    await oldDialog.getByRole("tab", { name: "전체", exact: true }).click();
    const retiredRow = oldDialog.getByRole("button").filter({ hasText: pendingItem.item_name });
    await expect(retiredRow).toHaveCount(1);
    await expect(retiredRow).toBeDisabled();
    await expect(retiredRow).toContainText(pendingItem.item_name);
    const notesAfter = await json(request, `/api/notifications?recipient_employee_id=${actors.approver.employee_id}`, actors.approver.employee_id);
    expect(notesAfter.items.find((note: { notification_id: string }) => note.notification_id === oldNote.notification_id)).toMatchObject({ is_read: true, target_tab: null, target_section: null, related_request_id: pendingId, created_at: oldNote.created_at });
    expect(await json(request, `/api/items/${pendingItem.item_id}`)).toEqual(stockBefore);
    expect(await json(request, `/api/stock-requests/${completed.requestId}`)).toEqual(completedBefore);
    await oldDialog.getByRole("button", { name: "알림 닫기", exact: true }).click();
    await departmentPage.bringToFront();
    const departmentDialog = await openNotifications(departmentPage);
    const newRow = departmentDialog.getByRole("button").filter({ hasText: pendingItem.item_name });
    await expect(newRow).toHaveCount(1);
    await expect(newRow).toBeEnabled();
    await newRow.click();
    await expect(departmentPage).toHaveURL(new RegExp(`section=dept-queue.*stockRequestId=${pendingId}`));
    const queued = departmentPage.locator(`[data-stock-request-id="${pendingId}"]`);
    await expect(queued).toContainText(pendingItem.item_name);
    await expect(queued.getByRole("button", { name: "승인", exact: true })).toBeEnabled();
    await changeEmployee(request, actors.approver, { as_research_approver: true });
    await page.bringToFront();
    await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await expect(page.getByRole("tab", { name: /AS·연구 승인함/ })).toBeVisible();
    await page.getByRole("tab", { name: /AS·연구 승인함/ }).click();
    await expect(page.getByText("AS·연구 승인 대기 요청이 없습니다.", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.locator(`[data-stock-request-id="${pendingId}"]`)).toHaveCount(0);
    await expect(queued).toContainText(pendingItem.item_name);
    expect(await json(request, `/api/stock-requests/${completed.requestId}`)).toEqual(completedBefore);
    expect(await json(request, `/api/items/${pendingItem.item_id}`)).toEqual(stockBefore);
  } finally {
    if (pendingId) await request.post(`/api/stock-requests/${pendingId}/cancel`, { data: { actor_employee_id: actors.requester.employee_id, pin: "0000" } }).catch(() => {});
    for (const employee of originalSpecial) await changeEmployee(request, employee, { as_research_approver: true });
    await departmentPage.close();
  }
});
