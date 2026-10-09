import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, identity, type CommonActors } from "./_common-expectations";
import { downloadedRows } from "./_admin-export-expectations";

const headers = (actors: CommonActors) => ({ "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code });

async function read(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), `${url}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function openAdmin(page: Page, actors: CommonActors, section: string): Promise<void> {
  await loginUi(page, actors.approver);
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) {
    for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  }
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: section, exact: true }).click();
}

async function makeItem(request: APIRequestContext, actors: CommonActors, name: string, quantity = 5) {
  const response = await request.post("/api/items", { headers: headers(actors), data: {
    item_name: name, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: quantity,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test.use({ trace: "retain-on-failure" });

test("G01 실제 PIN 로그인 세션과 직원 CSV에는 등급이 없다", async ({ page, actors }, info) => {
  await openAdmin(page, actors, "직원 관리");
  const current = await identity(page);
  expect(current.operator.employee_id).toBe(actors.approver.employee_id);
  expect(current.operator).not.toHaveProperty("level");
  expect(current.operator).not.toHaveProperty("grade");
  await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
  await expect(page.getByRole("combobox", { name: /등급|ADMIN|MANAGER|STAFF/ })).toHaveCount(0);
  await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "내보내기", exact: true }).click();
  await page.getByRole("group", { name: "데이터 범위", exact: true }).getByRole("button", { name: "직원", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "직원 CSV 다운로드", exact: true }).click();
  const file = await downloadedRows(await pending, info);
  expect(file.rows[0]).toEqual(["이름", "부서", "직급", "창고 역할", "활성"]);
  expect(file.rows[0]).not.toContain("등급");
  // Employee general export supports CSV only; do not invent a new Excel product here.
  await expect(page.getByRole("button", { name: "직원 Excel 다운로드", exact: true })).toHaveCount(0);
});

test("8.19-07 실제 이름·분류 변경은 당시 품목·현재 연결과 삭제 전체 의존 안내를 보존", async ({ page, request, actors }) => {
  const name = `당시품목${randomUUID().slice(0, 8)}`;
  const item = await makeItem(request, actors, name);
  const original = (await read(request, `/api/inventory/transactions?item_id=${item.item_id}`))[0];
  await openAdmin(page, actors, "품목 관리");
  const itemRow = page.locator(`[data-item-id="${item.item_id}"]`);
  if (await itemRow.getAttribute("aria-selected") !== "true") await itemRow.click();
  const changedName = `${name}-현재`;
  await page.getByPlaceholder("예: 텅스텐 필라멘트").fill(changedName);
  await page.getByPlaceholder("예: 텅스텐 필라멘트").locator("..").locator("..").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "HR — 고압 원자재", exact: true }).click();
  await expect(page.locator("[aria-readonly]")).toHaveText(/^3-HR-\d{4}$/);
  const currentCode = await page.locator("[aria-readonly]").innerText();
  const saving = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(itemRow).toContainText(changedName);
  const dependencyResponse = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}/deletion-dependencies`));
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  const dependencies = await (await dependencyResponse).json();
  expect(dependencies.can_delete).toBe(false);
  expect(dependencies.dependencies.length).toBeGreaterThan(0);
  for (const entry of dependencies.dependencies) {
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(`${entry.label} ${entry.count}건`);
  }
  await expect(page.getByRole("button", { name: "삭제 확인", exact: true })).toBeDisabled();
  expect((await read(request, `/api/items/${item.item_id}`)).deleted_at).toBeNull();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(name);
  const logRow = page.locator(`[data-log-id="${original.log_id}"]`).first();
  await expect(logRow).toContainText(name);
  await expect(logRow).toContainText(item.mes_code);
  await logRow.click();
  const detail = page.locator(`[data-history-detail-log-id="${original.log_id}"]`).filter({ visible: true });
  await expect(detail.getByTestId("history-item-identity")).toContainText(`거래 당시 품목: ${name} (${item.mes_code})`);
  await expect(detail.getByTestId("history-item-identity")).toContainText(`현재 품목: ${changedName} (${currentCode})`);
  const history = await read(request, `/api/inventory/transactions?log_id=${original.log_id}`);
  expect(history[0]).toMatchObject({ item_id: item.item_id, item_name: name, mes_code: item.mes_code, item_process_type_code: "TR", item_snapshot_preserved: true });
  const current = await read(request, `/api/items/${history[0].item_id}`);
  expect(current).toMatchObject({ item_name: changedName, mes_code: currentCode, process_type_code: "HR", warehouse_qty: 5 });
});

test("8.19-12 퇴직 직원의 실제 완료 요청과 내역 처리자는 삭제 뒤에도 남는다", async ({ page, request, actors }) => {
  const item = await makeItem(request, actors, `퇴직이력${randomUUID().slice(0, 8)}`);
  const submitted = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept",
    lines: [{ item_id: item.item_id, quantity: 2, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" }],
  } });
  expect(submitted.status(), await submitted.text()).toBe(201);
  const work = await submitted.json();
  const approved = await request.post(`/api/stock-requests/${work.request_id}/approve`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } });
  expect(approved.status(), await approved.text()).toBe(200);
  const before = await read(request, `/api/stock-requests/${work.request_id}`);
  const logs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}`);
  const log = logs.find((entry: { transaction_type: string }) => entry.transaction_type === "TRANSFER_TO_PROD");
  await openAdmin(page, actors, "직원 관리");
  await page.locator(`[data-admin-employee-row="${actors.requester.employee_id}"]`).click();
  await page.getByRole("button", { name: "직원 삭제", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "삭제" });
  const deleted = page.waitForResponse((response) => response.url().endsWith(`/api/employees/${actors.requester.employee_id}`) && response.request().method() === "DELETE");
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  expect((await deleted).status()).toBe(200);
  const employees = await read(request, "/api/employees?active_only=false");
  expect(employees.find((entry: { employee_id: string }) => entry.employee_id === actors.requester.employee_id).is_active).toBe(false);
  expect(await read(request, `/api/stock-requests/${work.request_id}`)).toEqual(before);
  expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(logs);
  await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(item.item_name);
  await page.locator(`[data-log-id="${log.log_id}"]`).first().click();
  await expect(page.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(actors.requester.name);
  await expect(page.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(actors.approver.name);
});

test("8.19-16 부서 영구 삭제 차단은 서버의 모든 의존 사유를 화면에 표시하고 기록을 보존", async ({ page, request, actors }) => {
  const item = await makeItem(request, actors, `부서삭제근거${randomUUID().slice(0, 8)}`);
  const workResponse = await request.post("/api/stock-requests", { data: {
    requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept",
    lines: [{ item_id: item.item_id, quantity: 1, from_bucket: "warehouse", to_bucket: "production", to_department: "튜브" }],
  } });
  expect(workResponse.status(), await workResponse.text()).toBe(201);
  const work = await workResponse.json();
  try {
    const departments = await read(request, "/api/departments");
    const department = departments.find((entry: { name: string }) => entry.name === "튜브");
    const beforeItem = await read(request, `/api/items/${item.item_id}`);
    const beforeLogs = await read(request, `/api/inventory/transactions?item_id=${item.item_id}`);
    const beforeWork = await read(request, `/api/stock-requests/${work.request_id}`);
    await openAdmin(page, actors, "부서 관리");
    const row = page.locator(`[data-admin-department-row="${department.id}"]`);
    if (await row.getAttribute("aria-selected") !== "true") await row.click();
    await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const rejected = page.waitForResponse((response) => response.url().endsWith(`/api/departments/${department.id}`) && response.request().method() === "DELETE");
    await dialog.getByRole("button", { name: "삭제", exact: true }).click();
    const response = await rejected;
    expect(response.status()).toBe(409);
    const result = await response.json();
    expect(result.detail.extra.dependencies.length).toBeGreaterThan(0);
    for (const entry of result.detail.extra.dependencies) {
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(`${entry.label} ${entry.count}건`);
    }
    expect(await read(request, "/api/departments")).toEqual(departments);
    expect(await read(request, `/api/items/${item.item_id}`)).toEqual(beforeItem);
    expect(await read(request, `/api/inventory/transactions?item_id=${item.item_id}`)).toEqual(beforeLogs);
    expect(await read(request, `/api/stock-requests/${work.request_id}`)).toEqual(beforeWork);
  } finally {
    await request.post(`/api/stock-requests/${work.request_id}/cancel`, { data: { actor_employee_id: actors.requester.employee_id, pin: "0000" } });
  }
});
