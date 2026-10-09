import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";
import type { Employee } from "../../lib/api/types/employees";

const BACKEND_DIR = path.resolve(__dirname, "../../../backend");
const E2E_DB = path.join(BACKEND_DIR, "mes_e2e.db");
const ADMIN_HEADERS = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
const preparedRequests = new Map<string, string[]>();

export async function changeEmployee(request: APIRequestContext, employee: Employee, patch: Record<string, unknown>): Promise<Employee> {
  const response = await request.put(`/api/employees/${employee.employee_id}`, { headers: ADMIN_HEADERS, data: patch });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export interface CommonActors { requester: Employee; approver: Employee; other: Employee }
export const test = base.extend<{ actors: CommonActors }>({
  actors: async ({ request }, runFixture) => {
    const employees: Employee[] = [];
    for (const [index, role] of ["none", "primary", "deputy"].entries()) {
      const suffix = randomUUID().slice(0, 8);
      const response = await request.post("/api/employees", { headers: ADMIN_HEADERS, data: {
        employee_code: `QA-COM-${suffix}`, name: `공통검수${suffix}`, role: "직원", department: "조립",
        warehouse_role: role, department_role: role, as_research_approver: index !== 0,
        // Shared actors exercise explicit menu access; omitted defaults have a dedicated scenario.
        hidden_sidebar_tabs: [],
        login_notification_popup_enabled: false,
      } });
      expect(response.ok(), await response.text()).toBeTruthy();
      employees.push(await response.json());
      const employee = employees[employees.length - 1];
      const appearance = await request.put(`/api/employees/${employee.employee_id}/appearance`, { headers: { "X-MES-Employee-Code": employee.employee_code }, data: { theme: "light", sidebar_mode: "hover" } });
      expect(appearance.ok(), await appearance.text()).toBeTruthy();
    }
    try { await runFixture({ requester: employees[0], approver: employees[1], other: employees[2] }); }
    finally {
      for (const employee of employees) {
        for (const requestId of preparedRequests.get(employee.employee_id) ?? []) {
          await request.post(`/api/stock-requests/${requestId}/cancel`, { data: { actor_employee_id: employee.employee_id, pin: "0000" } });
        }
        preparedRequests.delete(employee.employee_id);
        await changeEmployee(request, employee, { is_active: false });
      }
    }
  },
});
export { expect };

/** Actual PIN-card login. No init script or operator storage injection. */
export async function chooseEmployee(page: Page, employee: Employee): Promise<void> {
  const combo = page.getByRole("combobox");
  await expect(combo).toBeEnabled();
  await combo.fill(employee.employee_code);
  await page.getByRole("option", { name: new RegExp(employee.name) }).click();
}
export async function loginUi(page: Page, employee: Employee, pin = "0000"): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/mes?tab=dashboard");
  await chooseEmployee(page, employee);
  await page.getByLabel("PIN 번호", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: new RegExp(employee.name) }).filter({ visible: true }).first()).toBeVisible();
}
export async function identity(page: Page) {
  return page.evaluate(() => ({ operator: JSON.parse(sessionStorage.getItem("dexcowin_mes_operator") ?? "null"), audit: sessionStorage.getItem("dexcowin_mes_audit_session") }));
}
export async function logoutUi(page: Page, employee: Employee, confirm = true): Promise<void> {
  await page.getByRole("button", { name: new RegExp(employee.name) }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "로그아웃", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm ? "로그아웃" : "취소", exact: true }).click();
  if (confirm) await expect(page.getByRole("combobox")).toBeVisible();
}
export async function openNotifications(page: Page) {
  await page.getByRole("button", { name: /^알림(?: \d+건)?$/ }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "알림", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function notes(request: APIRequestContext, employee: Employee) {
  const response = await request.get(`/api/notifications?recipient_employee_id=${employee.employee_id}`, { headers: { "X-Actor-Employee-Id": employee.employee_id } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ items: { notification_id: string; related_request_id: string | null; is_read: boolean; title: string; target_section: string | null }[]; unread_count: number }>;
}

/** Seed only synthetic notifications in the global-setup mes_e2e fixture. */
export function seedNotes(employee: Employee, rows: { title: string; target_tab?: string; target_section?: string; is_read?: boolean }[]): string[] {
  if (!fs.existsSync(E2E_DB) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("common seed requires the isolated mes_e2e fixture");
  const script = ["import json,os", "from app.database import SessionLocal", "from app.models import Notification", "db=SessionLocal()", "try:", "    ids=[]", "    for row in json.loads(os.environ['COMMON_NOTES']):", "        n=Notification(recipient_employee_id=os.environ['COMMON_EMPLOYEE_ID'],type='handover_arrived',**row)", "        db.add(n)", "        db.flush()", "        ids.append(str(n.notification_id))", "    db.commit()", "    print(json.dumps(ids))", "finally:", "    db.close()"].join("\n");
  const result = spawnSync("python", ["-c", script], { cwd: BACKEND_DIR, windowsHide: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: `sqlite:///${E2E_DB.split(path.sep).join("/")}`, COMMON_EMPLOYEE_ID: employee.employee_id, COMMON_NOTES: JSON.stringify(rows) } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

/** Real preview-token submission; API is preparation, subsequent assertions use browser UI. */
export async function submitWarehouseRequest(request: APIRequestContext, requester: Employee): Promise<{ requestId: string; itemName: string }> {
  const itemName = `공통요청품${randomUUID().slice(0, 8)}`;
  const itemResponse = await request.post("/api/items", { headers: ADMIN_HEADERS, data: { item_name: itemName, process_type_code: "TR", unit: "EA", model_slots: [1], legacy_item_type: "원자재", initial_quantity: 20 } });
  expect(itemResponse.ok(), await itemResponse.text()).toBeTruthy();
  const item = await itemResponse.json();
  const payload = { requester_employee_id: requester.employee_id, work_type: "warehouse_io", sub_type: "warehouse_to_dept" };
  const preview = await request.post("/api/io/preview", { data: { ...payload, targets: [{ source_kind: "direct_item", item_id: item.item_id, quantity: 1 }] } });
  expect(preview.ok(), await preview.text()).toBeTruthy();
  const submitted = await request.post("/api/io/submit", { data: { ...payload, notes: itemName, bundles: (await preview.json()).bundles } });
  expect(submitted.ok(), await submitted.text()).toBeTruthy();
  const result = await submitted.json();
  expect(result.stock_request_id).toBeTruthy();
  preparedRequests.set(requester.employee_id, [...(preparedRequests.get(requester.employee_id) ?? []), result.stock_request_id]);
  return { requestId: result.stock_request_id, itemName };
}
