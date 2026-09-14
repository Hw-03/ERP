import { expect, test, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType, readSeed } from "./_helpers";

const FIXTURE_SUFFIX = randomUUID().slice(0, 8);
const CHILD_NAME = `E2E안전검증하위 ${FIXTURE_SUFFIX}`;
const PARENT_NAME = `E2E안전검증상위 ${FIXTURE_SUFFIX}`;
let childId = "";
let parentId = "";

interface StockState {
  quantity: number;
  warehouse: number;
  production: number;
  pending: number;
  logs: number;
}

function stock(itemId: string): StockState {
  const script = `import sqlite3,json,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve()
assert p.name=='mes_e2e.db'
with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as c:
 c.execute('PRAGMA query_only=ON')
 item=sys.argv[2].replace('-','')
 q,w,r=c.execute("select quantity,warehouse_qty,pending_quantity from inventory where replace(item_id,'-','')=?",(item,)).fetchone()
 prod,pending=c.execute("select coalesce(sum(quantity),0),coalesce(sum(pending_quantity),0) from inventory_locations where replace(item_id,'-','')=? and status='PRODUCTION'",(item,)).fetchone()
 logs=c.execute("select count(*) from transaction_logs where replace(item_id,'-','')=?",(item,)).fetchone()[0]
 print(json.dumps(dict(quantity=q,warehouse=w,production=prod,pending=r+pending,logs=logs)))
`;
  const result = spawnSync("python", ["-c", script, resolve(process.cwd(), "../backend/mes_e2e.db"), itemId], { encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as StockState;
}

function evidence(info: TestInfo, name: string, value: unknown): void {
  writeFileSync(info.outputPath(`${name}.json`), JSON.stringify(value, null, 2), "utf8");
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  const actor = await loginAsOperator(page, { role: "warehouse" });
  async function post(path: string, data: unknown) {
    const response = await page.request.post(path, { data, headers: { "X-Admin-Pin": "0000" } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const child = await post("/api/items", { item_name: CHILD_NAME, process_type_code: "AR", unit: "EA", model_slots: [1], initial_quantity: 100 });
  const parent = await post("/api/items", { item_name: PARENT_NAME, process_type_code: "AF", unit: "EA", model_slots: [1], initial_quantity: 20 });
  childId = child.item_id;
  parentId = parent.item_id;
  await post("/api/bom", { parent_item_id: parentId, child_item_id: childId, quantity: 2, unit: "EA" });
  for (const [itemId, quantity] of [[childId, 50], [parentId, 10]] as const) {
    const preview = await post("/api/io/preview", {
      requester_employee_id: actor.employee_id, work_type: "warehouse_io", sub_type: "warehouse_to_dept",
      targets: [{ source_kind: "direct_item", item_id: itemId, quantity }],
    });
    await post("/api/io/submit", {
      requester_employee_id: actor.employee_id, work_type: "warehouse_io", sub_type: "warehouse_to_dept",
      bundles: preview.bundles, client_request_id: randomUUID(), notes: "isolated io-safety fixture",
    });
  }
  const script = `import os,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve()
assert p.name=='mes_e2e.db'
os.environ['DATABASE_URL']='sqlite:///'+p.as_posix()
from app.database import SessionLocal
from app.services.inventory_operation_activation import activate_inventory_operation_contract
with SessionLocal() as db:
 activate_inventory_operation_contract(db,approved_by='io-safety-e2e',apply=True)
 db.commit()
`;
  const result = spawnSync("python", ["-c", script, resolve(process.cwd(), "../backend/mes_e2e.db")], { cwd: resolve(process.cwd(), "../backend"), encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  await page.close();
});

for (const mobile of [false, true]) {
  const surface = mobile ? "모바일" : "PC";
  test(`즉시 입고 취소 화면·원장·같은 키 재시도 일치 — ${surface}`, async ({ page }, info) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const actor = await loginAsOperator(page, { role: "warehouse" });
    const before = stock(childId);
    const preview = await page.request.post("/api/io/preview", { data: {
      requester_employee_id: actor.employee_id, work_type: "receive", sub_type: "receive_supplier",
      targets: [{ source_kind: "direct_item", item_id: childId, quantity: 3 }],
    } });
    expect(preview.ok(), await preview.text()).toBe(true);
    const payload = { requester_employee_id: actor.employee_id, work_type: "receive", sub_type: "receive_supplier",
      bundles: (await preview.json()).bundles, client_request_id: randomUUID(), notes: `io-safety cancel ${surface}` };
    const submitted = await page.request.post("/api/io/submit", { data: payload });
    expect(submitted.status(), await submitted.text()).toBe(201);
    expect(stock(childId).warehouse).toBe(before.warehouse + 3);
    await page.goto("/mes?tab=history");
    await page.getByText(CHILD_NAME, { exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: /이 내역 취소|이 작업 묶음 전체 취소/ }).filter({ visible: true }).click();
    await page.getByLabel("취소 사유", { exact: true }).filter({ visible: true }).fill("io-safety 취소 검증");
    await page.getByLabel("PIN", { exact: true }).filter({ visible: true }).fill(readSeed().operatorPin);
    const cancelling = page.waitForResponse((response) => /\/cancel$/.test(response.url()) && response.request().method() === "POST");
    await page.getByRole("button", { name: "취소 확정", exact: true }).filter({ visible: true }).click();
    const cancelled = await cancelling;
    expect(cancelled.status(), await cancelled.text()).toBe(200);
    await expect(page.getByText(/취소된 거래|취소된 작업|취소됨/).filter({ visible: true }).first()).toBeVisible();
    const after = stock(childId);
    expect(after).toEqual({ ...before, logs: before.logs + 2 });
    const retry = await page.request.post("/api/io/submit", { data: payload });
    expect(retry.status(), await retry.text()).toBe(201);
    expect((await retry.json()).status).toBe("cancelled");
    expect(stock(childId)).toEqual(after);
    evidence(info, "cancel-and-retry", { before, after, cancellation: await cancelled.json(), retry: await retry.json() });
  });

  test(`작업 미선택 재진입은 원자재 선택 화면을 열지 않는다 — ${surface}`, async ({ page }, info) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const actor = await loginAsOperator(page);
    const before = stock(childId);
    await page.goto("/mes?tab=warehouse&step=5");
    await expect(page.getByRole("button", { name: /부서 입출고/ }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^원자재 입고/ }).filter({ visible: true })).toHaveCount(0);
    await pickWorkType(page, /부서 입출고/);
    await page.getByRole("button", { name: mobile ? "입고" : "생산 입고", exact: true }).filter({ visible: true }).click();
    if (!mobile) await expect(page).toHaveURL(/step=2/);
    await clickNextStep(page);
    if (!mobile) {
      await expect(page).toHaveURL(/step=3/);
      await page.goBack();
      await expect(page.getByRole("button", { name: "생산 입고", exact: true })).toBeVisible();
      await page.goForward();
      await expect(page).toHaveURL(/step=3/);
    }
    await page.reload();
    await expect(page.getByRole("button", { name: /부서 입출고/ }).filter({ visible: true }).first()).toBeVisible();
    const denied = await page.request.post("/api/io/preview", { data: {
      requester_employee_id: actor.employee_id, work_type: "receive", sub_type: "receive_supplier",
      targets: [{ source_kind: "direct_item", item_id: childId, quantity: 1 }],
    } });
    expect(denied.status(), await denied.text()).toBe(403);
    expect(stock(childId)).toEqual(before);
    evidence(info, "selection-and-role", { actor: actor.employee_code, before, after: stock(childId), deniedStatus: denied.status() });
  });

  for (const direction of ["in", "out"] as const) {
    test(`커스텀 BOM ${direction === "in" ? "입고" : "출고"} 표시·승인·SQL 방향 일치 — ${surface}`, async ({ page, browser }, info) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      await loginAsOperator(page);
      const beforeChild = stock(childId);
      const beforeParent = stock(parentId);
      await gotoWarehouseCompose(page);
      await pickWorkType(page, /부서 입출고/);
      await page.getByRole("button", { name: mobile ? (direction === "in" ? "입고" : "출고") : (direction === "in" ? "생산 입고" : "분해 출고"), exact: true }).filter({ visible: true }).click();
      await clickNextStep(page);
      await page.getByRole("row", { name: new RegExp(PARENT_NAME) }).filter({ visible: true }).getByRole("button", { name: "BOM", exact: true }).click();
      await advanceToQuantityStep(page);
      const bundleHeader = page.getByRole("button", { name: new RegExp(`${PARENT_NAME}.*기준 수량`) }).filter({ visible: true });
      if (await bundleHeader.getAttribute("aria-expanded") === "false") {
        await bundleHeader.getByText(/BOM 자동 전개/).click();
      }
      await expect(bundleHeader).toHaveAttribute("aria-expanded", "true");
      const childRow = page.getByRole("listitem").filter({ hasText: CHILD_NAME }).filter({ visible: true });
      await childRow.getByRole("spinbutton").fill("5");
      const guide = page.getByRole("dialog", { name: "BOM 구성을 변경하면 선택한 하위 품목만 낱개로 처리합니다." });
      await expect(guide).toBeVisible();
      await guide.getByRole("button", { name: "확인", exact: true }).click();
      await expect(childRow).toContainText(direction === "in" ? "입고" : "출고");
      if (mobile) {
        await page.getByRole("navigation").getByRole("button", { name: "입출고", exact: true }).click();
        const leaveSheet = page.getByRole("dialog", { name: "작성 중 이동 확인" });
        await expect(leaveSheet).toBeVisible();
        await leaveSheet.getByRole("button", { name: "계속 작성", exact: true }).click();
        await expect(childRow.getByRole("spinbutton")).toHaveValue("5");
        await expect(childRow).toContainText(direction === "in" ? "입고" : "출고");
      } else if (direction === "out") {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
          await page.setViewportSize(viewport);
          await expect(page.getByRole("navigation").getByRole("button", {
            name: viewport.width < 768 ? "입출고" : "입출고 입고와 출고 작업 처리", exact: true,
          })).toBeVisible();
          await expect(bundleHeader).toBeVisible();
          if (await bundleHeader.getAttribute("aria-expanded") === "false") {
            await bundleHeader.getByText(/BOM 자동 전개|BOM 참고/).click();
          }
          await expect(childRow.getByRole("spinbutton")).toHaveValue("5");
          await expect(childRow).toContainText("출고");
        }
      }
      const displayed = await childRow.innerText();
      await page.screenshot({ path: info.outputPath("custom-effect.png"), fullPage: true });
      await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
      await page.getByPlaceholder(/결재 사유|작업 메모/).filter({ visible: true }).fill(`io-safety custom ${direction}`);
      await page.getByRole("button", { name: /부서 결재 요청/ }).filter({ visible: true }).click();
      const submitted = page.waitForResponse((response) => /\/api\/io\/(submit|draft\/[^/]+\/submit)$/.test(new URL(response.url()).pathname) && response.request().method() === "POST");
      await page.getByRole("dialog").getByRole("button", { name: "결재 요청", exact: true }).click();
      const response = await submitted;
      expect(response.status(), await response.text()).toBe(201);
      const result = await response.json();
      const requestPayload = response.request().postDataJSON();
      const waiting = stock(childId);
      expect(waiting.production).toBe(beforeChild.production);
      expect(waiting.pending).toBe(beforeChild.pending + (direction === "out" ? 5 : 0));
      const approvalPage = await browser.newPage();
      const approver = await loginAsOperator(approvalPage, { role: "department" });
      const requestId = result.stock_request_id ?? result.stock_requests[0].stock_request_id;
      const approved = await approvalPage.request.post(`/api/stock-requests/${requestId}/department-approve`, { data: { actor_employee_id: approver.employee_id, pin: readSeed().operatorPin } });
      expect(approved.ok(), await approved.text()).toBe(true);
      const afterChild = stock(childId);
      const afterParent = stock(parentId);
      expect(afterChild.production).toBe(beforeChild.production + (direction === "in" ? 5 : -5));
      expect(afterChild.quantity).toBe(beforeChild.quantity + (direction === "in" ? 5 : -5));
      expect(afterChild.warehouse).toBe(beforeChild.warehouse);
      expect(afterChild.pending).toBe(beforeChild.pending);
      expect(afterChild.logs).toBe(beforeChild.logs + 1);
      expect(afterParent).toEqual(beforeParent);
      evidence(info, "custom-approval-sql", { direction, displayed, requestPayload, result, beforeChild, waiting, afterChild, beforeParent, afterParent, approval: await approved.json() });
      await approvalPage.close();
    });
  }
}
