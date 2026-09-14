import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType, readSeed } from "./_helpers";

interface StockSnapshot {
  quantity: number;
  warehouse: number;
  pending: number;
  defective: number;
  logs: number;
  operations: number;
}

function snapshot(): StockSnapshot {
  const script = `import sqlite3,json,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve()
assert p.name=='mes_e2e.db'
with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as c:
 c.execute('PRAGMA query_only=ON')
 item=sys.argv[2].replace('-','')
 q,w,r=c.execute("select quantity,warehouse_qty,pending_quantity from inventory where replace(item_id,'-','')=?",(item,)).fetchone()
 d=c.execute("select coalesce(sum(quantity),0) from inventory_locations where replace(item_id,'-','')=? and status='DEFECTIVE'",(item,)).fetchone()[0]
 logs=c.execute("select count(*) from transaction_logs where replace(item_id,'-','')=?",(item,)).fetchone()[0]
 operations=c.execute('select count(*) from inventory_operations').fetchone()[0]
 print(json.dumps(dict(quantity=q,warehouse=w,pending=r,defective=d,logs=logs,operations=operations)))
`;
  const result = spawnSync("python", ["-c", script, resolve(process.cwd(), "../backend/mes_e2e.db"), readSeed().rawItem.item_id], { encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as StockSnapshot;
}

function evidence(testInfo: TestInfo, name: string, data: unknown) {
  writeFileSync(testInfo.outputPath(`${name}.json`), JSON.stringify(data, null, 2), "utf8");
}

test.beforeAll(() => {
  // 이 파일의 실제 mutation은 runner가 생성한 합성 DB와 활성 원장에서만 수행한다.
  const script = `import os,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve()
assert p.name=='mes_e2e.db'
os.environ['DATABASE_URL']='sqlite:///'+p.as_posix()
from app.database import SessionLocal
from app.services.inventory_operation_activation import activate_inventory_operation_contract
with SessionLocal() as db:
 activate_inventory_operation_contract(db,approved_by='employee-regression-e2e',apply=True)
 db.commit()
`;
  const result = spawnSync("python", ["-c", script, resolve(process.cwd(), "../backend/mes_e2e.db")], { cwd: resolve(process.cwd(), "../backend"), encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr || result.stdout).toBe(0);
});

test.afterAll(async ({}, testInfo) => {
  const root = resolve(process.cwd(), "..");
  const result = spawnSync("python", [resolve(root, "scripts/ops/check_inventory_integrity.py"), "--db-url", `sqlite:///${resolve(root, "backend/mes_e2e.db").replaceAll("\\", "/")}`, "--json"], { cwd: root, encoding: "utf8", windowsHide: true });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const diagnostic = JSON.parse(result.stdout) as { blocking_count: number };
  evidence(testInfo, "final-integrity", diagnostic);
  expect(diagnostic.blocking_count).toBe(0);
});

async function receiveQuantity(page: Page, mobile: boolean) {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await loginAsOperator(page, { role: "warehouse" });
  await gotoWarehouseCompose(page);
  await pickWorkType(page, /원자재 입고/);
  await clickNextStep(page);
  await page.getByRole("row", { name: /E2E원자재튜브/ }).filter({ visible: true }).getByRole("button", { name: "선택", exact: true }).click();
  await advanceToQuantityStep(page);
}

async function confirmReceive(page: Page) {
  await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
  await page.getByRole("button", { name: /부서 결재 요청/ }).filter({ visible: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "결재 요청", exact: true }).click();
}

for (const mobile of [false, true]) {
  test(`입출고 결과 불명 요청은 재진입 후에도 명시적으로 확인 — ${mobile ? "모바일" : "PC"}`, async ({ page }, testInfo) => {
    await receiveQuantity(page, mobile);
    const before = snapshot();
    const requests: Record<string, unknown>[] = [];
    let releaseRecovery!: () => void;
    const recoveryGate = new Promise<void>((resolve) => { releaseRecovery = resolve; });
    await page.route("**/api/io/submit", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      const response = await route.fetch();
      if (requests.length === 1) await route.abort("connectionreset");
      else {
        await recoveryGate;
        await route.fulfill({ response });
      }
    });
    await confirmReceive(page);
    await expect(page.getByRole("dialog", { name: "처리 결과 확인 필요" })).toBeVisible();
    const afterLost = snapshot();
    await page.context().clearCookies({ name: "dexcowin_operator_session" });
    await page.reload();
    await expect(page.getByRole("combobox", { name: "직원 선택" })).toBeVisible();
    await loginAsOperator(page, { role: "warehouse" });
    await gotoWarehouseCompose(page);
    const notice = page.getByRole("region", { name: "이전 입출고 요청 확인" }).filter({ visible: true });
    await expect(notice).toContainText("E2E원자재튜브");
    expect(requests).toHaveLength(1);
    await notice.getByRole("button", { name: "이전 요청 결과 확인", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    await pickWorkType(page, /창고 입출고/);
    releaseRecovery();
    await expect(page.getByRole("dialog", { name: "이전 요청 완료" })).toBeVisible();
    expect(snapshot()).toEqual(afterLost);
    expect(requests[1]).toEqual(requests[0]);
    evidence(testInfo, "remount-recovery", { before, afterLost, requests });
  });

  test(`입출고 확정 422 후 수정된 수량으로 새 제출 — ${mobile ? "모바일" : "PC"}`, async ({ page }, testInfo) => {
    await receiveQuantity(page, mobile);
    const before = snapshot();
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/io/submit", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      if (requests.length === 1) await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "검증용 수량 오류" }) });
      else await route.continue();
    });
    await confirmReceive(page);
    const failed = page.getByRole("dialog", { name: "제출 실패" });
    await expect(failed).toBeVisible();
    expect(snapshot()).toEqual(before);
    await failed.getByRole("button", { name: "확인", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "이전 단계", exact: true }).click();
    else await page.goBack();
    const quantity = page.getByRole("spinbutton").filter({ visible: true }).first();
    await quantity.fill("9");
    await quantity.blur();
    await confirmReceive(page);
    await expect(page.getByRole("dialog", { name: "입출고 반영 완료" })).toBeVisible();
    expect(snapshot().quantity).toBe(before.quantity + 9);
    expect(requests[1].client_request_id).not.toBe(requests[0].client_request_id);
    evidence(testInfo, "validation-retry", { before, after: snapshot(), requests });
  });

  test(`입출고 응답 유실 후 수정값 보존 — ${mobile ? "모바일" : "PC"}`, async ({ page }, testInfo) => {
    await receiveQuantity(page, mobile);
    const before = snapshot();
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/io/submit", async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      const response = await route.fetch();
      if (requests.length === 1) await route.abort("connectionreset");
      else await route.fulfill({ response });
    });
    await confirmReceive(page);
    const unknown = page.getByRole("dialog", { name: "처리 결과 확인 필요" });
    await expect(unknown).toBeVisible();
    const afterLost = snapshot();
    expect(afterLost.quantity).toBe(before.quantity + 1);
    await unknown.getByRole("button", { name: "확인", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "이전 단계", exact: true }).click();
    else await page.goBack();
    const quantity = page.getByRole("spinbutton").filter({ visible: true }).first();
    await quantity.fill("9");
    await quantity.blur();
    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    await expect(page.getByRole("button", { name: /부서 결재 요청/ }).filter({ visible: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: "이전 입출고 요청 확인" }).filter({ visible: true })).toContainText("E2E원자재튜브");
    await page.getByRole("button", { name: "이전 요청 결과 확인", exact: true }).filter({ visible: true }).click();
    const done = page.getByRole("dialog", { name: "이전 요청 완료" });
    await expect(done).toContainText("현재 입력은 보존");
    const afterRetry = snapshot();
    expect(afterRetry).toEqual(afterLost);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await done.getByRole("button", { name: "확인", exact: true }).click();
    await expect(page.getByRole("button", { name: /부서 결재 요청/ }).filter({ visible: true })).toBeEnabled();
    if (mobile) await page.getByRole("button", { name: "이전 단계", exact: true }).click();
    else await page.goBack();
    await expect(page.getByRole("spinbutton").filter({ visible: true }).first()).toHaveValue("9");
    evidence(testInfo, "response-loss", { before, afterLost, afterRetry, requests });
    await page.screenshot({ path: testInfo.outputPath("preserved-quantity.png") });
  });
}

test("불량 격리·부분 복귀 응답 유실 재시도와 완료 후 뒤로가기", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsOperator(page, { role: "warehouse" });
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  await page.getByRole("button").filter({ hasText: "격리 등록", visible: true }).click();
  await page.getByRole("button", { name: /창고 재고/ }).filter({ visible: true }).click();
  await page.getByRole("button", { name: /다음/ }).filter({ visible: true }).click();
  await page.getByRole("row", { name: /E2E원자재튜브/ }).filter({ visible: true }).getByRole("button", { name: /장바구니에 추가/ }).click();
  await page.getByPlaceholder("예: 3").fill("4");
  await page.getByRole("combobox").filter({ hasText: "카테고리 선택" }).first().click();
  await page.getByRole("option", { name: "외관 불량" }).click();
  const before = snapshot();
  const quarantineRequests: Record<string, unknown>[] = [];
  await page.route("**/api/defects/quarantine", async (route) => {
    quarantineRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    const response = await route.fetch();
    if (quarantineRequests.length === 1) await route.abort("connectionreset");
    else await route.fulfill({ response });
  });
  const quarantine = async () => {
    await page.getByRole("button", { name: /격리하기 \(1건\)/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "격리하기", exact: true }).click();
  };
  await quarantine();
  await expect(page.getByText(/연결 실패|처리 결과 확인/).filter({ visible: true }).first()).toBeVisible();
  const afterQuarantineLost = snapshot();
  expect(afterQuarantineLost.defective).toBe(before.defective + 4);
  await page.getByPlaceholder("예: 3").fill("7");
  await quarantine();
  await expect(page.getByRole("button").filter({ hasText: "불량 처리", visible: true })).toBeVisible();
  expect(snapshot()).toEqual(afterQuarantineLost);
  expect(quarantineRequests[0].client_request_id).toBeTruthy();
  expect(quarantineRequests[1]).toEqual(quarantineRequests[0]);
  await page.getByRole("button", { name: /대시보드/ }).filter({ visible: true }).first().click();
  await page.goBack();
  await expect(page.getByRole("button").filter({ hasText: "불량 처리", visible: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button").filter({ hasText: "불량 처리", visible: true })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).filter({ hasText: "격리 항목" }).click();
  await page.getByRole("button", { name: "처리", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("spinbutton").filter({ visible: true }).first().fill("1");
  await page.locator("select").filter({ hasText: "외관 불량" }).first().selectOption("외관 불량");
  const restoreRequests: Record<string, unknown>[] = [];
  await page.route("**/api/defects/unquarantine", async (route) => {
    restoreRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    const response = await route.fetch();
    if (restoreRequests.length === 1) await route.abort("connectionreset");
    else await route.fulfill({ response });
  });
  const restore = async () => {
    await page.getByRole("button", { name: "정상 복귀 →" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "즉시 복귀", exact: true }).click();
  };
  await restore();
  await expect(page.getByText(/연결 실패|처리 결과 확인/).filter({ visible: true }).first()).toBeVisible();
  const afterRestoreLost = snapshot();
  expect(afterRestoreLost.defective).toBe(afterQuarantineLost.defective - 1);
  await page.getByRole("spinbutton").filter({ visible: true }).first().fill("3");
  await restore();
  await expect(page.getByRole("button").filter({ hasText: "불량 처리", visible: true })).toBeVisible();
  expect(snapshot()).toEqual(afterRestoreLost);
  expect(restoreRequests[0].client_request_id).toBeTruthy();
  expect(restoreRequests[1]).toEqual(restoreRequests[0]);
  evidence(testInfo, "defect-response-loss", { before, afterQuarantineLost, afterRestoreLost, quarantineRequests, restoreRequests });
  const cleanup = await page.request.post("/api/defects/unquarantine", {
    data: { ...restoreRequests[0], qty: 3, client_request_id: randomUUID() },
  });
  expect(cleanup.status(), await cleanup.text()).toBe(200);
  expect(snapshot().defective).toBe(before.defective);
});
