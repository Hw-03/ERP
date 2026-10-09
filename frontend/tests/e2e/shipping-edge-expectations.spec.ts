import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";
import type { ShippingRequest } from "../../lib/api/types/shipping";

const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
const BACKEND = path.resolve(__dirname, "../../../backend");
const E2E_DB = path.join(BACKEND, "mes_e2e.db");
type Part = { item_id: string; item_name: string; mes_code: string; model_symbol: string; serial_no: number };

async function fixture(request: APIRequestContext): Promise<{ af: Part; pa: Part; pf: Part }> {
  const parts: Record<string, Part> = {};
  const suffix = randomUUID();
  for (const process of ["AF", "PA", "PF"]) {
    const response = await request.post("/api/items", { headers: ADMIN, data: {
      item_name: `QA-SHIPPING-EDGE-${process}-${suffix}`, process_type_code: process, unit: "EA", model_slots: [1],
      initial_quantity: 3, initial_locations: [{ department: "출하", quantity: 3 }],
    } });
    expect(response.ok(), await response.text()).toBeTruthy(); parts[process] = await response.json();
  }
  for (const [parent, child] of [["PF", "PA"], ["PA", "AF"]]) {
    const response = await request.post("/api/bom", { headers: ADMIN, data: { parent_item_id: parts[parent].item_id, child_item_id: parts[child].item_id, quantity: 1, unit: "EA" } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  return { af: parts.AF, pa: parts.PA, pf: parts.PF };
}

/** Adversarial catalog state is restricted to this test's new PF and restored in finally. */
function setFixturePfState(pf: Part, state: "deleted" | "not_pf" | "restore"): void {
  if (!fs.existsSync(E2E_DB) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("Dedicated shipping edge fixture DB is required");
  const result = spawnSync("python", ["-c", [
    "import json,os,uuid", "from datetime import datetime", "from app.database import SessionLocal", "from app.models import Item", "from app.utils.mes_code import next_serial_no", "db=SessionLocal()", "try:",
    "    data=json.loads(os.environ['SHIPPING_EDGE'])", "    row=db.get(Item,uuid.UUID(data['item']['item_id']))",
    "    assert row.item_name==data['item']['item_name'] and row.item_name.startswith('QA-SHIPPING-EDGE-PF-')",
    "    assert row.model_symbol==data['item']['model_symbol']",
    "    if data['state']=='restore':", "        row.deleted_at=None", "        row.process_type_code='PF'", "        row.serial_no=data['item']['serial_no']",
    "    else:", "        assert row.deleted_at is None and row.process_type_code=='PF'",
    "        if data['state']=='deleted': row.deleted_at=datetime.utcnow()", "        else:", "            row.serial_no=next_serial_no(row.model_symbol,'PA',db)", "            row.process_type_code='PA'",
    "    db.commit()", "    db.refresh(row)", "    if data['state']=='restore': assert row.mes_code==data['item']['mes_code']", "finally:", "    db.close()",
  ].join("\n")], { cwd: BACKEND, windowsHide: true, encoding: "utf8", env: { ...process.env,
    DATABASE_URL: `sqlite:///${E2E_DB.split(path.sep).join("/")}`, SHIPPING_EDGE: JSON.stringify({ item: pf, state }), PYTHONIOENCODING: "utf-8",
  } });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

for (const state of ["deleted", "not_pf"] as const) {
  test(`SHIP-INVALID-PF ${state} 8.4-02 선택 뒤 무효화된 PF의 실제 제출 거부·무저장`, async ({ page, request, actors }) => {
    const { pf } = await fixture(request);
    const headers = { "X-MES-Employee-Code": actors.requester.employee_code };
    const physical = await (await request.get(`/api/items/${pf.item_id}`)).json();
    const logsBefore = await (await request.get(`/api/inventory/transactions?item_id=${pf.item_id}&limit=1000`)).json();
    await loginUi(page, actors.requester); await page.goto("/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
    await page.getByTestId("shipping-pf-search").fill(pf.item_name);
    const initiallyMatched = page.waitForResponse((reply) => reply.url().endsWith("/api/shipping/bom-match") && reply.ok());
    await page.getByTestId(`shipping-pf-option-${pf.item_id}`).click();
    expect((await (await initiallyMatched).json()).base_pf_matches).toBe(true);
    for (const step of [2, 3, 4, 5]) {
      if (step === 4) await expect(page.getByText("BOM 변경 없음", { exact: true })).toBeVisible();
      await page.getByTestId("shipping-wizard-next").click(); await expect(page.getByTestId(`shipping-wizard-step-${step}`)).toBeVisible();
    }
    try {
      setFixturePfState(pf, state);
      const rechecked = page.waitForResponse((response) => response.url().endsWith("/api/shipping/bom-match") && response.request().method() === "POST");
      await page.getByTestId("shipping-submit-request").click();
      expect((await rechecked).status()).toBe(200);
      await expect(page.getByTestId("shipping-root-panel").getByText("기준 PF의 BOM이 변경되었습니다. 구성을 확인한 뒤 다시 선택하세요.", { exact: true })).toBeVisible();
      await expect(page.getByTestId("shipping-wizard-next")).toBeDisabled();
      const rows: ShippingRequest[] = await (await request.get("/api/shipping/requests", { headers })).json();
      expect(rows.filter((row) => row.base_pf_item_id === pf.item_id)).toEqual([]);
    } finally { setFixturePfState(pf, "restore"); }
    const after = await (await request.get(`/api/items/${pf.item_id}`)).json();
    expect([after.quantity, after.pending_quantity]).toEqual([physical.quantity, physical.pending_quantity]);
    expect(await (await request.get(`/api/inventory/transactions?item_id=${pf.item_id}&limit=1000`)).json()).toEqual(logsBefore);
  });
}

test("SHIP-CANCEL-INTEGRITY PC-DELTA-SHIPPING-07 취소 원건 정역거래와 실제 관리자 정합성 무오판", async ({ page, request, actors }) => {
  const { pf } = await fixture(request);
  const headers = { "X-MES-Employee-Code": actors.requester.employee_code };
  const before = await (await request.get(`/api/items/${pf.item_id}`)).json();
  const response = await request.post("/api/shipping/requests", { headers, data: { base_pf_item_id: pf.item_id, request_quantity: 1, invoice_number: `CANCEL-${randomUUID()}` } });
  expect(response.status(), await response.text()).toBe(201); const created: ShippingRequest = await response.json();
  for (const action of ["prepare-complete", "pickup-complete", "pickup-cancel", "prepare-cancel"]) {
    const result = await request.post(`/api/shipping/requests/${created.request_id}/${action}`, { headers, data: action === "prepare-complete" ? { serial_numbers: "EDGE-SN" } : {} });
    expect(result.ok(), await result.text()).toBeTruthy();
  }
  expect((await request.delete(`/api/shipping/requests/${created.request_id}`, { headers })).status()).toBe(204);
  const cancelled: ShippingRequest = await (await request.get(`/api/shipping/requests/${created.request_id}`, { headers })).json();
  expect(cancelled.status).toBe("CANCELLED"); expect(cancelled.transactions.map((log) => log.quantity_change).sort()).toEqual([-1, 1]);
  expect(cancelled.allocations.filter((line) => line.status === "RESERVED")).toHaveLength(0);
  const after = await (await request.get(`/api/items/${pf.item_id}`)).json();
  expect([after.quantity, after.pending_quantity]).toEqual([before.quantity, before.pending_quantity]);
  await loginUi(page, actors.approver); await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) for (let digit = 0; digit < 4; digit++) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  const diagnosis = page.waitForResponse((reply) => reply.url().endsWith("/api/admin/inventory-integrity") && reply.ok());
  await navigation.getByRole("button", { name: "정합성", exact: true }).click();
  const result = await (await diagnosis).json();
  const samples = result.checks.flatMap((check: { samples: unknown[] }) => check.samples);
  expect(samples.filter((sample: unknown) => JSON.stringify(sample).includes(created.request_id))).toEqual([]);
  await expect(page.locator(".admin-integrity-summary")).toContainText(`발견 문제 ${result.blocking_count + result.warning_count}건`);
  await expect(page.locator(".admin-integrity-results li").filter({ hasText: created.request_id })).toHaveCount(0);
  expect(await (await request.get(`/api/shipping/requests/${created.request_id}`, { headers })).json()).toEqual(cancelled);
  const ready = await request.get("http://127.0.0.1:8021/health/ready"); expect(ready.status()).toBe(200);
  expect((await ready.json()).checks).toEqual({ database: true, schema: true, inventory: true, ledger: true });
});
