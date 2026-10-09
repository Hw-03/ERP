/** Shipping browser contracts. Real isolated API/DB fixtures; browser execution is recorded separately. */
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { APIRequestContext, Page } from "@playwright/test";
import { test as base, expect, loginUi, changeEmployee } from "./_common-expectations";
import type { Employee } from "../../lib/api/types/employees";
import type { ShippingRequest } from "../../lib/api/types/shipping";
import type { WeeklyReportResponse } from "../../lib/api/types/weekly";

type Part = { item_id: string; item_name: string; mes_code: string };
type ShippingFixture = { af: Part; cable: Part; extra: Part; pa: Part; pf: Part; carton: Part; candidatePa: Part; candidatePf: Part };
const BACKEND = path.resolve(__dirname, "../../../backend");
const FIXTURE_DB = path.join(BACKEND, "mes_e2e.db");
const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
const actorHeaders = (actor: Employee) => ({ "X-MES-Employee-Code": actor.employee_code });

/** This helper accepts only IDs made by this test and the existing dedicated global-setup DB. */
function isolatedPython(script: string, input: unknown): any {
  if (!fs.existsSync(FIXTURE_DB) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("Shipping fixtures require isolated mes_e2e global setup");
  const result = spawnSync("python", ["-c", script], { cwd: BACKEND, windowsHide: true, encoding: "utf8", env: {
    ...process.env, DATABASE_URL: `sqlite:///${FIXTURE_DB.split(path.sep).join("/")}`,
    SHIPPING_FIXTURE: JSON.stringify(input), PYTHONIOENCODING: "utf-8",
  } });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout.trim());
}

function stockSnapshot(fixture: ShippingFixture): Record<string, { quantity: number; reserved: number; logs: number }> {
  return isolatedPython([
    "import json,os,uuid", "from app.database import SessionLocal", "from app.models import Inventory,TransactionLog",
    "db=SessionLocal()", "try:", "    result={}", "    for key,value in json.loads(os.environ['SHIPPING_FIXTURE']).items():",
    "        item_id=uuid.UUID(value['item_id'])", "        row=db.query(Inventory).filter_by(item_id=item_id).one()",
    "        result[key]={'quantity':float(row.quantity),'reserved':float(row.pending_quantity),'logs':db.query(TransactionLog).filter_by(item_id=item_id).count()}",
    "    print(json.dumps(result))", "finally:", "    db.close()",
  ].join("\n"), fixture);
}

const test = base.extend<{ shipping: ShippingFixture }>({
  shipping: async ({ request, actors }, runFixture) => {
    const suffix = randomUUID().slice(0, 8);
    const made: Record<string, Part> = {};
    for (const [key, process] of Object.entries({ af: "AF", cable: "PR", extra: "PR", pa: "PA", pf: "PF", carton: "PR", candidatePa: "PA", candidatePf: "PF" })) {
      const response = await request.post("/api/items", { headers: ADMIN, data: {
        item_name: `출하검수-${key}-${suffix}`, process_type_code: process, unit: "EA", model_slots: [1], initial_quantity: 20,
      } });
      expect(response.ok(), await response.text()).toBeTruthy(); made[key] = await response.json();
    }
    for (const [parent, child] of [["pa", "af"], ["pa", "cable"], ["pf", "pa"], ["candidatePa", "af"], ["candidatePa", "extra"], ["candidatePf", "candidatePa"]]) {
      const response = await request.post("/api/bom", { headers: ADMIN, data: { parent_item_id: made[parent].item_id, child_item_id: made[child].item_id, quantity: 1, unit: "EA" } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    isolatedPython([
      "import json,os,uuid", "from decimal import Decimal", "from app.database import SessionLocal", "from app.models import DepartmentEnum",
      "from app.services.inv_transfer import transfer_to_production", "db=SessionLocal()", "try:",
      "    for value in json.loads(os.environ['SHIPPING_FIXTURE']).values():",
      "        transfer_to_production(db,uuid.UUID(value['item_id']),Decimal('20'),DepartmentEnum.SHIPPING)",
      "    db.commit()", "    print('{}')", "finally:", "    db.close()",
    ].join("\n"), made);
    // Actors are synthetic and active; no approval role is needed for shipping-tab work.
    expect(actors.requester.warehouse_role).toBe("none");
    await runFixture(made as ShippingFixture);
  },
});

async function detail(request: APIRequestContext, actor: Employee, id: string): Promise<ShippingRequest> {
  const response = await request.get(`/api/shipping/requests/${id}`, { headers: actorHeaders(actor) });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function createFixture(request: APIRequestContext, actor: Employee, shipping: ShippingFixture, extra: Record<string, unknown> = {}): Promise<ShippingRequest> {
  const response = await request.post("/api/shipping/requests", { headers: actorHeaders(actor), data: {
    base_pf_item_id: shipping.pf.item_id, request_quantity: 2, invoice_number: `SHIP-${randomUUID().slice(0, 8)}`,
    client_request_id: randomUUID(), companion_lines: [{ item_id: shipping.carton.item_id, quantity: 3, unit: "EA" }], ...extra,
  } });
  expect(response.status(), await response.text()).toBe(201); return response.json();
}
const requestUrl = (id: string, view = "requestDetail") => `/mes?tab=shipping&shippingView=${view}&shippingRequestId=${id}`;
async function newDraft(page: Page, shipping: ShippingFixture, mobile = false): Promise<void> {
  await page.goto("/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
  if (mobile) {
    await expect(page.getByTestId("mobile-shipping-step-1")).toBeVisible();
    await page.getByRole("button", { name: /PF 선택|기준 PF 선택/ }).filter({ visible: true }).first().click();
    await page.getByRole("textbox", { name: "PF 검색", exact: true }).fill(shipping.pf.item_name);
    await page.getByRole("button", { name: `${shipping.pf.item_name} 선택`, exact: true }).click();
  } else {
    await expect(page.getByTestId("shipping-wizard-next")).toBeDisabled();
    await page.getByTestId("shipping-pf-search").fill(shipping.pf.item_name);
    await page.getByTestId(`shipping-pf-option-${shipping.pf.item_id}`).click();
  }
}
async function next(page: Page, step: number, mobile = false): Promise<void> {
  if (mobile && step === 4) await expect(page.getByTestId("mobile-shipping-step-3").getByText("기본 BOM과 일치합니다.", { exact: true })).toBeVisible();
  await (mobile ? page.getByTestId("mobile-shipping-wizard").getByRole("button", { name: "다음", exact: true }) : page.getByTestId("shipping-wizard-next")).click();
  await expect(page.getByTestId(`${mobile ? "mobile-shipping-step" : "shipping-wizard-step"}-${step}`)).toBeVisible();
}
async function finishDraft(page: Page, mobile = false): Promise<ShippingRequest> {
  const response = page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/shipping/requests" && res.status() === 201);
  await (mobile ? page.getByRole("button", { name: "출하 요청 저장", exact: true }) : page.getByTestId("shipping-submit-request")).click();
  return (await response).json();
}
async function pcConfirm(page: Page, label: string): Promise<void> {
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "확인 후 실행", exact: true }).click();
}

test("SHIP-WIZARD PC 8.4-02/04/05/06 인보이스·메모 선택, 실제 최종값 1회 생성", async ({ page, request, actors, shipping }) => {
  await loginUi(page, actors.requester); await newDraft(page, shipping);
  const quantity = page.getByTestId("shipping-request-quantity-field").getByRole("spinbutton");
  await quantity.fill("0"); await quantity.blur(); await expect(quantity).toHaveValue("1");
  await quantity.fill("2"); await next(page, 2); await next(page, 3);
  await expect(page.getByText("BOM 변경 없음", { exact: true })).toBeVisible();
  await next(page, 4); await expect(page.getByTestId("shipping-requester-summary")).toContainText(actors.requester.name);
  await expect(page.getByTestId("shipping-requester-summary").locator("input")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "요청 메모", exact: true })).toHaveValue(""); await next(page, 5);
  await expect(page.getByTestId("shipping-final-summary")).toContainText(shipping.pf.item_name);
  await expect(page.getByTestId(`shipping-final-line-pa-${shipping.af.item_id}`)).toContainText(shipping.af.item_name);
  await expect(page.getByTestId(`shipping-final-quantity-pa-${shipping.af.item_id}`)).toContainText("2");
  await expect(page.getByTestId("shipping-final-action-quantity")).toContainText("2대");
  const created = await finishDraft(page);
  expect(created).toMatchObject({ base_pf_item_id: shipping.pf.item_id, final_pf_item_id: shipping.pf.item_id, request_quantity: 2, requested_by_name: actors.requester.name, notes: null, invoice_number: null });
  expect(created.bom_lines.filter((line) => line.included).map((line) => line.child_item_id).sort()).toEqual([shipping.af.item_id, shipping.cable.item_id, shipping.pa.item_id].sort());
  const response = await request.get("/api/shipping/requests", { headers: actorHeaders(actors.requester) });
  expect((await response.json()).filter((row: ShippingRequest) => row.base_pf_item_id === shipping.pf.item_id)).toHaveLength(1);
});

test("SHIP-FULL-DRAFT 8.4-06/07 제외·추가·후보·동반품 전체 초안 유지와 최종 저장 동등", async ({ page, request, actors, shipping }) => {
  await loginUi(page, actors.requester); await newDraft(page, shipping);
  await page.getByTestId("shipping-request-quantity-field").getByRole("spinbutton").fill("2");
  await page.getByTestId("shipping-invoice-number").fill("FULL-DRAFT"); await next(page, 2);
  await page.locator(`[data-bom-line-child="${shipping.cable.item_id}"]`).getByRole("button", { name: /제외/ }).click();
  await page.getByTestId("shipping-bom-search-pa").fill(shipping.extra.item_name);
  await page.getByTestId(`shipping-bom-add-pa-${shipping.extra.item_id}`).click();
  await page.getByTestId("shipping-companion-search").fill(shipping.carton.item_name);
  await page.getByTestId(`shipping-companion-add-${shipping.carton.item_id}`).click();
  await page.getByTestId(`shipping-companion-line-${shipping.carton.item_id}`).getByRole("spinbutton").fill("3");
  await next(page, 3); await page.getByTestId(`shipping-bom-candidate-${shipping.candidatePf.item_id}`).click();
  await next(page, 4); await page.getByRole("textbox", { name: "요청 메모", exact: true }).fill("전체 구성 초안 유지"); await next(page, 5);
  const beforeSummary = await page.getByTestId("shipping-final-summary").innerText();
  for (const route of ["menu", "reload"] as const) {
    if (route === "menu") {
      await page.getByRole("button", { name: /^대시보드(?:\s|$)/ }).filter({ visible: true }).click();
      await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "계속 머무르기", exact: true }).click();
    } else {
      const beforeUnload = page.waitForEvent("dialog");
      await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
      const dialog = await beforeUnload; expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss();
    }
    await expect.poll(() => page.getByTestId("shipping-final-summary").innerText()).toBe(beforeSummary);
    await expect(page.getByTestId("shipping-final-request-summary")).toContainText(actors.requester.name);
    await expect(page.getByTestId("shipping-final-request-summary")).toContainText("전체 구성 초안 유지");
    await expect(page.getByTestId("shipping-final-action-quantity")).toContainText("2대");
  }
  await page.getByRole("button", { name: "1. 기준 PF 선택", exact: true }).click();
  await expect(page.getByTestId("shipping-invoice-number")).toHaveValue("FULL-DRAFT");
  await expect(page.getByTestId("shipping-request-quantity-field").getByRole("spinbutton")).toHaveValue("2");
  await next(page, 2);
  await expect(page.locator(`[data-bom-line-child="${shipping.cable.item_id}"]`).getByRole("button", { name: /포함/ })).toBeVisible();
  await expect(page.locator(`[data-bom-line-child="${shipping.extra.item_id}"]`).getByTestId("shipping-bom-line-controls")).toHaveValue("1");
  await expect(page.getByTestId(`shipping-companion-line-${shipping.carton.item_id}`).getByRole("spinbutton")).toHaveValue("3");
  await next(page, 3); await expect(page.getByTestId("shipping-final-pf-summary")).toContainText(shipping.candidatePf.item_name);
  await next(page, 4); await expect(page.getByRole("textbox", { name: "요청 메모", exact: true })).toHaveValue("전체 구성 초안 유지"); await next(page, 5);
  await expect.poll(() => page.getByTestId("shipping-final-summary").innerText()).toBe(beforeSummary);
  for (const part of [shipping.af, shipping.extra]) {
    await expect(page.getByTestId(`shipping-final-line-pa-${part.item_id}`)).toContainText(part.mes_code);
    await expect(page.getByTestId(`shipping-final-quantity-pa-${part.item_id}`)).toHaveText("총 2EA");
  }
  await expect(page.getByTestId(`shipping-final-quantity-linked-pa-${shipping.candidatePa.item_id}`)).toHaveText("총 2EA");
  await expect(page.getByTestId(`shipping-final-line-companion-${shipping.carton.item_id}`)).toContainText(shipping.carton.mes_code);
  await expect(page.getByTestId(`shipping-final-quantity-companion-${shipping.carton.item_id}`)).toHaveText("총 3 EA");
  const created = await finishDraft(page);
  expect(created).toMatchObject({ base_pf_item_id: shipping.pf.item_id, final_pa_item_id: shipping.candidatePa.item_id, final_pf_item_id: shipping.candidatePf.item_id,
    request_quantity: 2, invoice_number: "FULL-DRAFT", requested_by_name: actors.requester.name, notes: "전체 구성 초안 유지" });
  expect(created.bom_lines.map((line) => [line.parent_stage, line.child_item_id, line.quantity, line.unit, line.included]).sort()).toEqual([
    ["PA", shipping.af.item_id, 1, "EA", true], ["PA", shipping.cable.item_id, 1, "EA", false],
    ["PA", shipping.extra.item_id, 1, "EA", true], ["PF", shipping.candidatePa.item_id, 1, "EA", true],
  ].sort());
  expect(created.companion_lines.map((line) => [line.item_id, line.quantity, line.unit])).toEqual([[shipping.carton.item_id, 3, "EA"]]);
  const persisted = await detail(request, actors.requester, created.request_id);
  expect(persisted.bom_lines).toEqual(created.bom_lines); expect(persisted.companion_lines).toEqual(created.companion_lines);
});

test("SHIP-CANDIDATE PC 8.4-03/04 8.12-03/04/05 제외·추가 후보 PA/PF 일치와 원본 BOM 보존", async ({ page, request, actors, shipping }) => {
  const original = await (await request.get(`/api/bom/${shipping.pa.item_id}`)).json();
  await loginUi(page, actors.requester); await newDraft(page, shipping); await next(page, 2);
  const cable = page.locator(`[data-bom-line-child="${shipping.cable.item_id}"]`);
  await cable.getByRole("button", { name: /제외/ }).click();
  await page.getByTestId("shipping-bom-search-pa").fill(shipping.extra.item_name);
  await page.getByTestId(`shipping-bom-add-pa-${shipping.extra.item_id}`).click();
  await next(page, 3);
  const candidate = page.getByTestId(`shipping-bom-candidate-${shipping.candidatePf.item_id}`);
  for (const part of [shipping.af, shipping.extra]) {
    await expect(candidate).toContainText(`PA · ${part.item_name} (${part.mes_code}) · 1EA`);
  }
  await expect(candidate).toContainText(`PF · ${shipping.candidatePa.item_name} (${shipping.candidatePa.mes_code}) · 1EA`);
  await expect(candidate).not.toContainText(shipping.cable.item_name);
  await expect(candidate).toContainText(shipping.candidatePa.item_name); await candidate.click();
  await expect(page.getByTestId("shipping-bom-change-table")).toContainText(shipping.cable.item_name);
  await expect(page.getByTestId("shipping-bom-change-table")).toContainText(shipping.extra.item_name);
  await next(page, 4); await next(page, 5);
  await expect(page.getByTestId("shipping-final-summary")).toContainText(shipping.candidatePf.item_name);
  await expect(page.getByTestId("shipping-final-summary")).toContainText(shipping.candidatePa.item_name);
  await expect(page.getByTestId("shipping-final-bom-changes")).toContainText(shipping.cable.item_name);
  await expect(page.getByTestId("shipping-final-bom-changes")).toContainText(shipping.extra.item_name);
  for (const part of [shipping.af, shipping.extra]) {
    await expect(page.getByTestId(`shipping-final-line-pa-${part.item_id}`)).toContainText(part.item_name);
    await expect(page.getByTestId(`shipping-final-quantity-pa-${part.item_id}`)).toHaveText("총 1EA");
  }
  await expect(page.getByTestId(`shipping-final-quantity-linked-pa-${shipping.candidatePa.item_id}`)).toHaveText("총 1EA");
  const created = await finishDraft(page);
  expect(created.final_pf_item_id).toBe(shipping.candidatePf.item_id); expect(created.final_pa_item_id).toBe(shipping.candidatePa.item_id);
  const componentTuples = (lines: typeof created.bom_lines) => lines.filter((line) => line.included && line.parent_stage === "PA").map((line) => [line.child_item_id, line.quantity, line.unit]).sort();
  expect(componentTuples(created.bom_lines)).toEqual([[shipping.af.item_id, 1, "EA"], [shipping.extra.item_id, 1, "EA"]].sort());
  const candidatePaBom = await (await request.get(`/api/bom/${shipping.candidatePa.item_id}`)).json();
  expect(candidatePaBom.map((line: { child_item_id: string; quantity: number; unit: string }) => [line.child_item_id, line.quantity, line.unit]).sort()).toEqual(componentTuples(created.bom_lines));
  const candidatePfBom = await (await request.get(`/api/bom/${shipping.candidatePf.item_id}`)).json();
  expect(candidatePfBom.map((line: { child_item_id: string; quantity: number; unit: string }) => [line.child_item_id, line.quantity, line.unit]).sort()).toEqual(created.bom_lines.filter((line) => line.included && line.parent_stage === "PF").map((line) => [line.child_item_id, line.quantity, line.unit]).sort());
  expect(await (await request.get(`/api/bom/${shipping.pa.item_id}`)).json()).toEqual(original);
  const before = stockSnapshot(shipping);
  await page.goto(requestUrl(created.request_id));
  await expect(page.getByTestId("shipping-request-detail-header")).toContainText(shipping.candidatePf.item_name);
  await expect(page.getByTestId("shipping-request-detail-header")).toContainText(`기준 ${shipping.pf.item_name}`);
  const invoice = page.getByTestId("shipping-invoice-editor"); await invoice.getByRole("textbox").fill("CANDIDATE-PICKUP");
  await invoice.getByRole("button", { name: "인보이스 번호 저장", exact: true }).click();
  await expect(invoice.getByRole("textbox")).toHaveValue("CANDIDATE-PICKUP");
  await page.getByTestId("shipping-prepare-from-detail").click(); await page.getByRole("textbox", { name: "완제품 SN", exact: true }).fill("CANDIDATE-SN");
  await expect(page.getByText(`실제 출하품 · ${shipping.candidatePf.item_name} · 기준 PF · ${shipping.pf.item_name}`, { exact: true })).toBeVisible();
  await pcConfirm(page, "준비 완료 확인");
  await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
  const ready = await detail(request, actors.requester, created.request_id);
  expect(ready.allocations.filter((a) => a.status === "RESERVED").map((a) => [a.item_id, a.quantity])).toEqual([[shipping.candidatePf.item_id, 1]]);
  await page.getByTestId("shipping-pickup-from-detail").click(); await pcConfirm(page, "픽업 완료 확인");
  await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PICKED_UP");
  const picked = await detail(request, actors.requester, created.request_id);
  expect(picked.transactions.map((row) => [row.item_id, row.quantity_change])).toEqual([[shipping.candidatePf.item_id, -1]]);
  const after = stockSnapshot(shipping); expect(after.candidatePf.quantity).toBe(before.candidatePf.quantity - 1); expect(after.pf.quantity).toBe(before.pf.quantity);
  await page.goto(requestUrl(created.request_id, "historyWork"));
  await expect(page.getByTestId("shipping-history-detail-header")).toContainText(shipping.candidatePf.item_name);
  await expect(page.getByTestId("shipping-history-base-pf")).toContainText(shipping.pf.item_name);
  await expect(page.getByTestId("shipping-history-base-pf-code")).toHaveText(shipping.pf.mes_code);
  await page.getByTestId("shipping-pickup-cancel-from-history").click(); await pcConfirm(page, "픽업 완료 취소 확인");
  await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
  const restored = await detail(request, actors.requester, created.request_id);
  expect(restored.final_pf_item_id).toBe(shipping.candidatePf.item_id);
  expect(restored.transactions.map((log) => [log.item_id, log.mes_code, log.quantity_change]).sort()).toEqual([[shipping.candidatePf.item_id, shipping.candidatePf.mes_code, -1], [shipping.candidatePf.item_id, shipping.candidatePf.mes_code, 1]].sort());
  expect(restored.allocations.filter((allocation) => allocation.status === "RESERVED").map((allocation) => allocation.item_id)).toEqual([shipping.candidatePf.item_id]);
  await page.goto(requestUrl(created.request_id));
  for (const log of restored.transactions) await expect(page.getByTestId(`shipping-transaction-code-${log.log_id}`)).toHaveText(shipping.candidatePf.mes_code);
  expect(stockSnapshot(shipping).candidatePf.quantity).toBe(before.candidatePf.quantity);
});

test("SHIP-MOBILE-CONFIRM 8.12-07 기준 PF와 실제 준비품·동반품 구분", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping, {
    finalization_mode: "REUSE_CANDIDATE", reuse_pf_item_id: shipping.candidatePf.item_id,
    bom_lines: [
      { parent_stage: "PA", child_item_id: shipping.af.item_id, quantity: 1, unit: "EA", included: true },
      { parent_stage: "PA", child_item_id: shipping.cable.item_id, quantity: 1, unit: "EA", included: false },
      { parent_stage: "PA", child_item_id: shipping.extra.item_id, quantity: 1, unit: "EA", included: true, origin: "CUSTOM" },
      { parent_stage: "PF", child_item_id: shipping.pa.item_id, quantity: 1, unit: "EA", included: true },
    ],
  });
  const before = stockSnapshot(shipping);
  await loginUi(page, actors.other); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(requestUrl(created.request_id));
  await page.getByRole("textbox", { name: "시리얼 번호", exact: true }).fill("MOBILE-FINAL-PF");
  await page.getByRole("button", { name: "준비 완료", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "준비 완료 확인", exact: true });
  await expect(dialog).toContainText(`실제 준비품 · ${shipping.candidatePf.item_name} · ${shipping.candidatePf.mes_code}`);
  await expect(dialog).toContainText(`기준 PF · ${shipping.pf.item_name} · ${shipping.pf.mes_code}`);
  await expect(dialog).toContainText(`동반 ${shipping.carton.item_name} · ${shipping.carton.mes_code}`);
  await expect(dialog).toContainText("2대"); await expect(dialog).toContainText("3EA");
  expect((await detail(request, actors.other, created.request_id)).status).toBe("PREPARING");
  expect(stockSnapshot(shipping)).toEqual(before);
  await dialog.getByRole("button", { name: "준비 완료", exact: true }).click();
  await expect.poll(async () => (await detail(request, actors.other, created.request_id)).status).toBe("PREPARED");
  const prepared = await detail(request, actors.other, created.request_id);
  expect(prepared.allocations.filter((line) => line.status === "RESERVED").map((line) => [line.item_id, line.quantity]).sort()).toEqual([[shipping.candidatePf.item_id, 2], [shipping.carton.item_id, 3]].sort());
  expect(stockSnapshot(shipping).pf).toEqual(before.pf);
});

test("SHIP-BOM-SNAPSHOT 8.19-20 관리자 BOM 변경 전후 출하 구성·실행·원복 보존", async ({ page, request, actors, shipping }) => {
  test.setTimeout(120_000);
  await loginUi(page, actors.requester);
  const before = stockSnapshot(shipping);
  const createFromWizard = async (componentQuantity: number): Promise<ShippingRequest> => {
    await newDraft(page, shipping);
    await page.getByRole("textbox", { name: "인보이스 번호", exact: true }).fill(`SNAPSHOT-${randomUUID().slice(0, 8)}`);
    await next(page, 2);
    await expect(page.locator(`[data-bom-line-child="${shipping.af.item_id}"]`).getByTestId("shipping-bom-line-controls")).toHaveValue(String(componentQuantity));
    await next(page, 3); await next(page, 4); await next(page, 5);
    await expect(page.getByTestId(`shipping-final-quantity-pa-${shipping.af.item_id}`)).toHaveText(`총 ${componentQuantity}EA`);
    const created = await finishDraft(page);
    expect(created.bom_lines.find((line) => line.child_item_id === shipping.af.item_id)).toMatchObject({ parent_stage: "PA", quantity: componentQuantity, unit: "EA" });
    return created;
  };
  const oldRequest = await createFromWizard(1);
  const endpoint = `/api/bom/${shipping.pa.item_id}`;
  const original = await (await request.get(endpoint)).json();
  const changed = original.map((line: { child_item_id: string; quantity: number }) => ({ ...line, quantity: line.child_item_id === shipping.af.item_id ? 2 : line.quantity }));
  const saved = await request.put(endpoint, { headers: ADMIN, data: { expected_rows: original, rows: changed } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect((await detail(request, actors.requester, oldRequest.request_id)).bom_lines).toEqual(oldRequest.bom_lines);
  const newRequest = await createFromWizard(2);
  for (const [created, componentQuantity] of [[oldRequest, 1], [newRequest, 2]] as const) {
    await page.goto(requestUrl(created.request_id));
    const component = created.bom_lines.find((line) => line.child_item_id === shipping.af.item_id)!;
    await expect(page.getByTestId(`shipping-summary-quantity-${component.line_id}-PA`)).toHaveText(`${componentQuantity}EA`);
    await page.getByTestId("shipping-prepare-from-detail").click();
    await expect(page.getByText(`PA · ${shipping.af.item_name} · 1대 ${componentQuantity}EA / 총 ${componentQuantity}EA`, { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "완제품 SN", exact: true }).fill(`BOM-SNAPSHOT-${componentQuantity}`);
    await pcConfirm(page, "준비 완료 확인");
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
    expect((await detail(request, actors.requester, created.request_id)).bom_lines).toEqual(created.bom_lines);
    await expect(page.getByTestId(`shipping-summary-quantity-${component.line_id}-PA`)).toHaveText(`${componentQuantity}EA`);
    await page.getByTestId("shipping-pickup-from-detail").click(); await pcConfirm(page, "픽업 완료 확인");
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PICKED_UP");
    const picked = await detail(request, actors.requester, created.request_id);
    expect(picked.bom_lines).toEqual(created.bom_lines);
    expect(picked.transactions.map((line) => [line.item_id, line.quantity_change])).toEqual([[shipping.pf.item_id, -1]]);
    expect(stockSnapshot(shipping).af.quantity).toBe(before.af.quantity);
    await page.goto(requestUrl(created.request_id, "historyWork"));
    await expect(page.getByTestId(`shipping-summary-quantity-${component.line_id}-PA`)).toHaveText(`${componentQuantity}EA`);
    await page.getByTestId("shipping-pickup-cancel-from-history").click(); await pcConfirm(page, "픽업 완료 취소 확인");
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
    await page.goto(requestUrl(created.request_id));
    await page.getByTestId("shipping-prepare-cancel-from-detail").click(); await pcConfirm(page, "준비 완료 취소 확인");
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARING");
  }
  const restored = await request.put(endpoint, { headers: ADMIN, data: { expected_rows: await saved.json(), rows: original } });
  expect(restored.ok(), await restored.text()).toBeTruthy();
  for (const [created, componentQuantity] of [[oldRequest, 1], [newRequest, 2]] as const) {
    await page.goto(requestUrl(created.request_id));
    const component = created.bom_lines.find((line) => line.child_item_id === shipping.af.item_id)!;
    await expect(page.getByTestId(`shipping-summary-quantity-${component.line_id}-PA`)).toHaveText(`${componentQuantity}EA`);
    const preserved = await detail(request, actors.requester, created.request_id);
    expect(preserved.bom_lines).toEqual(created.bom_lines);
    expect(preserved.transactions.map((line) => [line.item_id, line.quantity_change]).sort()).toEqual([[shipping.pf.item_id, -1], [shipping.pf.item_id, 1]].sort());
    await page.getByTestId("shipping-delete-request").click(); await pcConfirm(page, "요청 취소 확인");
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("CANCELLED");
    const cancelled = await detail(request, actors.requester, created.request_id);
    expect(cancelled.transactions).toEqual(preserved.transactions);
    expect(cancelled.allocations.filter((line) => line.status === "RESERVED")).toHaveLength(0);
  }
  const after = stockSnapshot(shipping);
  for (const key of Object.keys(before)) {
    expect(after[key].quantity).toBe(before[key].quantity);
    expect(after[key].reserved).toBe(before[key].reserved);
  }
});

test("SHIP-RETRY PC 8.4-06 PC-DELTA-SHIPPING-06 응답 유실 뒤 초안·키 유지 및 서버 1건", async ({ page, request, actors, shipping }) => {
  await loginUi(page, actors.requester); await newDraft(page, shipping); await next(page, 2); await next(page, 3); await next(page, 4);
  await page.getByRole("textbox", { name: "요청 메모", exact: true }).fill("응답 유실 보존"); await next(page, 5);
  const keys: string[] = []; let loseResponse = true;
  await page.route("**/api/shipping/requests", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().client_request_id);
    const response = await route.fetch();
    if (loseResponse) { loseResponse = false; await route.abort("failed"); } else await route.fulfill({ response });
  });
  await page.getByTestId("shipping-submit-request").click();
  await expect(page.getByText("응답 유실 보존", { exact: true })).toBeVisible();
  await expect(page.getByTestId("shipping-submit-request")).toBeEnabled();
  const retried = await finishDraft(page); expect(retried.notes).toBe("응답 유실 보존");
  expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
  const rows: ShippingRequest[] = await (await request.get("/api/shipping/requests", { headers: actorHeaders(actors.requester) })).json();
  expect(rows.filter((row) => row.base_pf_item_id === shipping.pf.item_id)).toHaveLength(1);
});

test("SHIP-LOADING PC 8.12-02 편집 품목 응답 보류 시 로딩 표시와 진행 차단", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping);
  await loginUi(page, actors.requester);
  let release!: () => void; const paused = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/items?**", async (route) => { await paused; await route.continue(); });
  try {
    await page.goto(requestUrl(created.request_id, "requestWork"));
    await expect(page.getByText(/불러오는 중/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByTestId("shipping-wizard-next")).toBeDisabled();
  } finally { release(); }
  await expect(page.getByTestId("shipping-wizard-next")).toBeEnabled();
});

for (const mobile of [false, true]) {
  test(`SHIP-CYCLE ${mobile ? "mobile" : "PC"} 8.4-01 8.12-07~16 준비·픽업·역순 취소의 같은 원건`, async ({ page, request, actors, shipping }) => {
    const created = await createFixture(request, actors.requester, shipping);
    const before = stockSnapshot(shipping);
    await loginUi(page, actors.other); if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(requestUrl(created.request_id));
    if (mobile) {
      await expect(page.getByRole("button", { name: "준비 완료", exact: true })).toBeDisabled();
      await page.getByRole("textbox", { name: "시리얼 번호", exact: true }).fill("SN 자유형식\n중복 SN SN");
      await page.getByRole("button", { name: "준비 완료", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "준비 완료 확인", exact: true });
      await expect(dialog).toContainText(shipping.pf.mes_code); await expect(dialog).toContainText(shipping.carton.item_name);
      await dialog.getByRole("button", { name: "준비 완료", exact: true }).click();
    } else {
      await page.getByTestId("shipping-prepare-from-detail").click();
      await expect(page.getByRole("button", { name: "확인 후 실행", exact: true })).toBeDisabled();
      await page.getByRole("textbox", { name: "완제품 SN", exact: true }).fill("SN 자유형식\n중복 SN SN");
      await expect(page.getByText(`실제 출하품 · ${shipping.pf.item_name} · 기준 PF · ${shipping.pf.item_name}`, { exact: true })).toBeVisible();
      await expect(page.getByText(`실제 준비품 · ${created.final_pf_item_name} · ${created.final_pf_mes_code} · ${created.request_quantity}대`, { exact: true })).toBeVisible();
      for (const line of created.companion_lines) await expect(page.getByText(`동반 · ${line.item_name} · ${line.mes_code} · ${line.quantity} ${line.unit}`, { exact: true })).toBeVisible();
      for (const line of created.bom_lines.filter((line) => line.included)) await expect(page.getByText(`${line.parent_stage} · ${line.item_name} · 1대 ${line.quantity}${line.unit} / 총 ${line.quantity * created.request_quantity}${line.unit}`, { exact: true })).toBeVisible();
      await pcConfirm(page, "준비 완료 확인");
    }
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
    let prepared = await detail(request, actors.requester, created.request_id);
    expect(prepared.serial_numbers).toBe("SN 자유형식\n중복 SN SN"); expect(prepared.transactions).toHaveLength(0);
    expect(prepared.allocations.filter((a) => a.status === "RESERVED").map((a) => [a.item_id, a.quantity]).sort()).toEqual([[shipping.pf.item_id, 2], [shipping.carton.item_id, 3]].sort());
    const readyStock = stockSnapshot(shipping);
    for (const key of Object.keys(before)) { expect(readyStock[key].quantity).toBe(before[key].quantity); expect(readyStock[key].logs).toBe(before[key].logs); }
    if (mobile) {
      await page.getByRole("button", { name: "픽업 완료", exact: true }).click();
      await page.getByRole("dialog", { name: "픽업 완료 확인", exact: true }).getByRole("button", { name: "픽업 완료", exact: true }).click();
    } else { await page.getByTestId("shipping-pickup-from-detail").click(); await pcConfirm(page, "픽업 완료 확인"); }
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PICKED_UP");
    const picked = await detail(request, actors.requester, created.request_id);
    expect(picked.transactions.map((log) => [log.item_id, log.quantity_change]).sort()).toEqual([[shipping.pf.item_id, -2], [shipping.carton.item_id, -3]].sort());
    expect(picked.requested_by_name).toBe(actors.requester.name);
    expect(picked.transactions.every((log) => log.produced_by === actors.other.name)).toBe(true);
    const shippedStock = stockSnapshot(shipping); expect(shippedStock.pf.quantity).toBe(before.pf.quantity - 2); expect(shippedStock.carton.quantity).toBe(before.carton.quantity - 3); expect(shippedStock.af.quantity).toBe(before.af.quantity);
    for (const key of Object.keys(before).filter((key) => key !== "pf" && key !== "carton")) expect(shippedStock[key].quantity).toBe(before[key].quantity);
    await page.goto(requestUrl(created.request_id, "historyWork"));
    const historyDetail = page.getByTestId(mobile ? "mobile-shipping-detail" : "shipping-history-detail");
    await expect(historyDetail).toContainText(actors.requester.name);
    if (mobile) await page.getByRole("button", { name: /메모·이력/ }).click();
    for (const log of picked.transactions) await expect(page.getByTestId(`shipping-transaction-actor-${log.log_id}`)).toHaveText(`처리자 ${actors.other.name}`);
    if (mobile) {
      await page.getByRole("button", { name: "추가 작업", exact: true }).click(); await page.getByRole("button", { name: "픽업 취소", exact: true }).click();
      await page.getByRole("dialog", { name: "픽업 취소 확인", exact: true }).getByRole("button", { name: "픽업 취소", exact: true }).click();
    } else { await page.getByRole("button", { name: "픽업 완료 취소", exact: true }).click(); await pcConfirm(page, "픽업 완료 취소 확인"); }
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
    prepared = await detail(request, actors.requester, created.request_id); expect(prepared.transactions).toHaveLength(4);
    expect(prepared.transactions.filter((log) => log.quantity_change < 0).map((log) => log.log_id).sort()).toEqual(picked.transactions.map((log) => log.log_id).sort());
    expect(prepared.transactions.filter((log) => log.quantity_change > 0).map((log) => [log.item_id, log.quantity_change]).sort()).toEqual([[shipping.pf.item_id, 2], [shipping.carton.item_id, 3]].sort());
    await page.goto(requestUrl(created.request_id));
    if (mobile) {
      await page.getByRole("button", { name: /메모·이력/ }).click();
      for (const log of prepared.transactions) {
        const transaction = page.getByTestId(`shipping-transaction-actor-${log.log_id}`).locator("..");
        await expect(transaction).toContainText(log.item_name!);
        await expect(transaction).toContainText(String(log.quantity_change));
      }
      await page.getByRole("button", { name: "추가 작업", exact: true }).click(); await page.getByRole("button", { name: "준비 완료 취소", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "준비 완료 취소 확인", exact: true }); await expect(dialog).toContainText(shipping.pf.mes_code); await expect(dialog).toContainText("3EA");
      for (const allocation of prepared.allocations.filter((line) => line.status === "RESERVED")) {
        const isFinal = allocation.item_id === prepared.final_pf_item_id;
        const reservationRow = dialog.getByText(`${isFinal ? "" : "동반 "}${allocation.item_name} · ${allocation.mes_code}`, { exact: true }).locator("..");
        await expect(reservationRow).toContainText(`${allocation.quantity}${isFinal ? "대" : allocation.unit}`);
      }
      await dialog.getByRole("button", { name: "준비 완료 취소", exact: true }).click();
    } else {
      for (const log of prepared.transactions) await expect(page.getByTestId(`shipping-transaction-code-${log.log_id}`)).toHaveText(shipping[log.item_id === shipping.pf.item_id ? "pf" : "carton"].mes_code);
      await page.getByTestId("shipping-prepare-cancel-from-detail").click();
      for (const allocation of prepared.allocations.filter((line) => line.status === "RESERVED")) await expect(page.getByText(`${allocation.item_name} · ${allocation.mes_code} · ${allocation.quantity} ${allocation.unit}${allocation.department ? ` · ${allocation.department}` : ""}`, { exact: true })).toBeVisible();
      await pcConfirm(page, "준비 완료 취소 확인");
    }
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARING");
    expect((await detail(request, actors.requester, created.request_id)).allocations.filter((a) => a.status === "RESERVED")).toHaveLength(0);
    if (mobile) {
      await page.getByRole("button", { name: "추가 작업", exact: true }).click(); await page.getByRole("button", { name: "요청 취소", exact: true }).click();
      await page.getByRole("dialog", { name: "요청 취소 확인", exact: true }).getByRole("button", { name: "요청 취소", exact: true }).click();
    } else { await page.getByTestId("shipping-delete-request").click(); await pcConfirm(page, "요청 취소 확인"); }
    await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("CANCELLED");
    const cancelled = await detail(request, actors.requester, created.request_id); expect(cancelled.transactions).toHaveLength(4); expect(cancelled.request_id).toBe(created.request_id);
    const ready = await request.get("http://127.0.0.1:8021/health/ready");
    expect(ready.status(), await ready.text()).toBe(200);
    expect((await ready.json()).checks).toEqual({ database: true, schema: true, inventory: true, ledger: true });
    const after = stockSnapshot(shipping); for (const key of Object.keys(before)) expect(after[key].quantity).toBe(before[key].quantity);
    await page.goto(requestUrl(created.request_id, "historyWork")); await expect(page.getByText("요청 취소", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });
}

for (const mobile of [false, true]) {
  test(`SHIP-LIST ${mobile ? "mobile" : "PC"} 8.4-01 각 단계 목록의 같은 요청 1건`, async ({ page, request, actors, shipping }) => {
    const created = await createFixture(request, actors.requester, shipping);
    await loginUi(page, actors.requester);
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    for (const status of ["PREPARING", "PREPARED", "PICKED_UP"] as const) {
      if (status !== "PREPARING") {
        const action = status === "PREPARED" ? "prepare-complete" : "pickup-complete";
        const response = await request.post(`/api/shipping/requests/${created.request_id}/${action}`, { headers: actorHeaders(actors.requester), data: status === "PREPARED" ? { serial_numbers: "LIST-SN" } : {} });
        expect(response.ok(), await response.text()).toBeTruthy();
      }
      const rows: ShippingRequest[] = await (await request.get("/api/shipping/requests", { headers: actorHeaders(actors.requester) })).json();
      expect(rows.filter((row) => row.base_pf_item_id === shipping.pf.item_id).map((row) => [row.request_id, row.status])).toEqual([[created.request_id, status]]);
      const history = status === "PICKED_UP";
      await page.goto(`/mes?tab=shipping&shippingView=${history ? "historyList" : "requestList"}&shippingManagementStatus=${status === "PREPARED" ? "PREPARED" : "PREPARING"}`);
      if (history) {
        const search = page.getByRole(mobile ? "textbox" : "searchbox", { name: mobile ? "인보이스 또는 PF 검색" : "출하 이력 검색", exact: true });
        await search.fill(created.invoice_number!);
        if (!mobile) await search.press("Enter");
      }
      const card = mobile
        ? history ? page.locator("article").filter({ hasText: created.invoice_number! }) : page.getByRole("button", { name: "요청 상세", exact: true }).locator("..").filter({ hasText: created.invoice_number! })
        : page.locator(`[data-shipping-request-id="${created.request_id}"]`).filter({ visible: true });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(shipping.pf.mes_code);
      await (mobile ? card.getByRole("button", { name: history ? `${shipping.pf.item_name} 이력 상세` : "요청 상세", exact: true }) : card).click();
      await expect(page).toHaveURL(new RegExp(`shippingRequestId=${created.request_id}`));
      await expect(page.getByTestId(mobile ? "mobile-shipping-detail" : history ? "shipping-history-detail" : "shipping-request-detail")).toContainText(shipping.pf.item_name);
    }
  });
}

test("SHIP-REVISION-ALL 8.12-06 PC-DELTA-SHIPPING-03 전체 수정 전후·준비 유지/해제·새 예약 일치", async ({ page, request, actors, shipping }) => {
  const candidateBom = await (await request.get(`/api/bom/${shipping.candidatePa.item_id}`)).json();
  const altered = await request.put(`/api/bom/${shipping.candidatePa.item_id}`, { headers: ADMIN, data: {
    expected_rows: candidateBom, rows: candidateBom.map((line: { child_item_id: string; quantity: number }) => ({ ...line, quantity: line.child_item_id === shipping.af.item_id ? 2 : line.quantity })),
  } });
  expect(altered.ok(), await altered.text()).toBeTruthy();
  const created = await createFixture(request, actors.requester, shipping, { invoice_number: "REV-INITIAL", notes: "수정 전 메모" });
  const prepare = await request.post(`/api/shipping/requests/${created.request_id}/prepare-complete`, { headers: actorHeaders(actors.requester), data: { serial_numbers: "REV-SN" } });
  expect(prepare.ok(), await prepare.text()).toBeTruthy();
  const prepared = await detail(request, actors.requester, created.request_id);
  const physicalBefore = stockSnapshot(shipping);
  await loginUi(page, actors.other); await page.goto(requestUrl(created.request_id));
  const invoice = page.getByTestId("shipping-invoice-editor"); await invoice.getByRole("textbox").fill("REV-KEEP");
  const invoiceSaved = page.waitForResponse((reply) => new URL(reply.url()).pathname === `/api/shipping/requests/${created.request_id}/invoice` && reply.request().method() === "PATCH");
  await invoice.getByRole("button", { name: "인보이스 번호 저장", exact: true }).click();
  expect((await invoiceSaved).ok()).toBeTruthy();
  await expect(invoice.getByRole("textbox")).toHaveValue("REV-KEEP");
  const retained = await detail(request, actors.other, created.request_id);
  expect(retained.status).toBe("PREPARED"); expect(retained.allocations).toEqual(prepared.allocations);
  const invoiceRevisionReply = await request.get(`/api/shipping/requests/${created.request_id}/revisions`, { headers: actorHeaders(actors.other) });
  expect(invoiceRevisionReply.status(), await invoiceRevisionReply.text()).toBe(200);
  const invoiceRevisions = await invoiceRevisionReply.json();
  expect(invoiceRevisions).toHaveLength(1);
  expect(invoiceRevisions[0]).toMatchObject({ affects_preparation: false, changes: [{ field: "invoice_number", before: "REV-INITIAL", after: "REV-KEEP" }] });
  const invoiceRevision = page.getByRole("button", { name: `인보이스 번호 수정 · ${actors.other.name}`, exact: true });
  await expect(invoiceRevision).not.toContainText("준비 영향");
  await page.getByTestId("shipping-prepare-cancel-from-detail").click(); await pcConfirm(page, "준비 완료 취소 확인");
  await expect.poll(async () => (await detail(request, actors.other, created.request_id)).status).toBe("PREPARING");
  const before = await detail(request, actors.other, created.request_id);
  expect(before.allocations.filter((line) => line.status === "RESERVED")).toHaveLength(0);
  await page.getByTestId("shipping-edit-request").click();
  await page.getByRole("button", { name: "1. 기준 PF 선택", exact: true }).click();
  await page.getByTestId("shipping-request-quantity-field").getByRole("spinbutton").fill("3");
  await page.getByTestId("shipping-invoice-number").fill("REV-FINAL"); await next(page, 2);
  await page.locator(`[data-bom-line-child="${shipping.af.item_id}"]`).getByTestId("shipping-bom-line-controls").fill("2");
  await page.locator(`[data-bom-line-child="${shipping.cable.item_id}"]`).getByRole("button", { name: /제외/ }).click();
  await page.getByTestId("shipping-bom-search-pa").fill(shipping.extra.item_name); await page.getByTestId(`shipping-bom-add-pa-${shipping.extra.item_id}`).click();
  await page.getByTestId(`shipping-companion-line-${shipping.carton.item_id}`).getByRole("spinbutton").fill("4");
  await next(page, 3); await page.getByTestId(`shipping-bom-candidate-${shipping.candidatePf.item_id}`).click();
  await next(page, 4); await page.getByRole("textbox", { name: "요청 메모", exact: true }).fill("수정 후 메모"); await next(page, 5);
  await expect(page.getByTestId(`shipping-final-quantity-pa-${shipping.af.item_id}`)).toHaveText("총 6EA");
  await expect(page.getByTestId(`shipping-final-quantity-companion-${shipping.carton.item_id}`)).toHaveText("총 4 EA");
  const updated = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/shipping/requests/${created.request_id}` && response.request().method() === "PATCH");
  await page.getByTestId("shipping-update-request").click(); expect((await updated).ok()).toBeTruthy();
  const after = await detail(request, actors.other, created.request_id);
  expect(after).toMatchObject({ status: "PREPARING", request_quantity: 3, invoice_number: "REV-FINAL", notes: "수정 후 메모", final_pa_item_id: shipping.candidatePa.item_id, final_pf_item_id: shipping.candidatePf.item_id });
  expect(after.allocations.filter((line) => line.status === "RESERVED")).toHaveLength(0);
  const revisionReply = await request.get(`/api/shipping/requests/${created.request_id}/revisions`, { headers: actorHeaders(actors.other) });
  expect(revisionReply.status(), await revisionReply.text()).toBe(200);
  const revisions = await revisionReply.json();
  expect(revisions).toHaveLength(2);
  const revision = revisions[0];
  expect(revision).toMatchObject({ edited_by_employee_id: actors.other.employee_id, affects_preparation: true });
  const snapshot = (row: ShippingRequest) => ({
    request_quantity: row.request_quantity, requested_by_name: row.requested_by_name, custom_pa_name: row.custom_pa_name,
    custom_pf_name: row.custom_pf_name, notes: row.notes, invoice_number: row.invoice_number,
    bom_lines: row.bom_lines.map(({ parent_stage, child_item_id, item_name, mes_code, quantity, unit, included, origin }) => ({ parent_stage, child_item_id, item_name, mes_code, quantity, unit, included, origin })).sort((a, b) => `${a.parent_stage}:${a.child_item_id}`.localeCompare(`${b.parent_stage}:${b.child_item_id}`)),
    companion_lines: row.companion_lines.map(({ item_id, item_name, mes_code, quantity, unit }) => ({ item_id, item_name, mes_code, quantity, unit })).sort((a, b) => a.item_id.localeCompare(b.item_id)),
  });
  const beforeSnapshot = snapshot(before); const afterSnapshot = snapshot(after);
  expect(revision.changes).toEqual(Object.keys(beforeSnapshot).filter((key) => JSON.stringify(beforeSnapshot[key as keyof typeof beforeSnapshot]) !== JSON.stringify(afterSnapshot[key as keyof typeof afterSnapshot])).map((key) => ({ field: key, before: beforeSnapshot[key as keyof typeof beforeSnapshot], after: afterSnapshot[key as keyof typeof afterSnapshot] })));
  await page.goto(requestUrl(created.request_id));
  const revisionButton = page.getByTestId("shipping-revision-history").getByRole("button").first();
  await expect(revisionButton).toContainText("준비 영향"); await expect(revisionButton).toContainText(actors.other.name);
  const createdKst = await page.evaluate((at: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(at)), revision.created_at);
  await expect(revisionButton).toContainText(createdKst); await revisionButton.click();
  const revisionPanel = revisionButton.locator("..");
  await expect(revisionPanel).toContainText("2 → 3"); await expect(revisionPanel).toContainText("수정 전 메모 → 수정 후 메모"); await expect(revisionPanel).toContainText("REV-KEEP → REV-FINAL");
  for (const [side, stage, part, quantity] of [
    ["before", "pa", shipping.af, 1], ["after", "pa", shipping.af, 2], ["before", "pa", shipping.cable, 1], ["after", "pa", shipping.extra, 1],
    ["before", "pf", shipping.pa, 1], ["after", "pf", shipping.candidatePa, 1],
  ] as const) {
    const group = page.getByTestId(`shipping-revision-array-${side}-bom_lines-${stage}`);
    const row = group.locator(":scope > div").filter({ hasText: part.mes_code });
    await expect(row).toContainText(part.item_name); await expect(row).toContainText(`${quantity}EA`);
  }
  for (const [side, quantity] of [["before", 3], ["after", 4]] as const) {
    const group = page.getByTestId(`shipping-revision-array-${side}-companion_lines-companion`);
    await expect(group).toContainText(shipping.carton.mes_code); await expect(group).toContainText(`${quantity}EA`);
  }
  await page.getByTestId("shipping-prepare-from-detail").click();
  await page.getByRole("textbox", { name: "완제품 SN", exact: true }).fill("REV-UPDATED-SN"); await pcConfirm(page, "준비 완료 확인");
  await expect.poll(async () => (await detail(request, actors.other, created.request_id)).status).toBe("PREPARED");
  const rePrepared = await detail(request, actors.other, created.request_id);
  expect(rePrepared.allocations.filter((line) => line.status === "RESERVED").map((line) => [line.item_id, line.quantity]).sort()).toEqual([[shipping.candidatePf.item_id, 3], [shipping.carton.item_id, 4]].sort());
  const physicalAfter = stockSnapshot(shipping); for (const key of Object.keys(physicalBefore)) expect(physicalAfter[key].quantity).toBe(physicalBefore[key].quantity);
});

test("SHIP-INVOICE PC-DELTA-SHIPPING-01/03 실제 인보이스 수정 전후·작업자·시각·펼침", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping, { invoice_number: null });
  await loginUi(page, actors.other); await page.goto(requestUrl(created.request_id));
  const editor = page.getByTestId("shipping-invoice-editor"); await editor.getByRole("textbox").fill("  inv-new  ");
  await editor.getByRole("button", { name: "인보이스 번호 저장", exact: true }).click(); await expect(editor.getByRole("textbox")).toHaveValue("INV-NEW");
  const revisionButton = page.getByRole("button", { name: `인보이스 번호 수정 · ${actors.other.name}`, exact: true });
  await revisionButton.click(); await expect(revisionButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/없음.*INV-NEW/)).toBeVisible();
  const revisions = await (await request.get(`/api/shipping/requests/${created.request_id}/revisions`, { headers: actorHeaders(actors.other) })).json();
  expect(revisions).toHaveLength(1); expect(revisions[0]).toMatchObject({ edited_by_employee_id: actors.other.employee_id, affects_preparation: false }); expect(Date.parse(revisions[0].created_at)).not.toBeNaN();
  const revisionKst = await page.evaluate((createdAt: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(createdAt)), revisions[0].created_at);
  await expect(revisionButton).toContainText(`${actors.other.name} · ${revisionKst}`);
  await revisionButton.click(); await expect(revisionButton).toHaveAttribute("aria-expanded", "false");
  await editor.getByRole("textbox").fill(""); await editor.getByRole("button", { name: "인보이스 번호 저장", exact: true }).click();
  await expect(page.getByTestId("shipping-prepare-from-detail")).toBeDisabled(); expect((await detail(request, actors.other, created.request_id)).invoice_number).toBeNull();
});

test("SHIP-MOBILE-WIZARD 8.4-02/05/06 모바일 실제 5단계·전체 BOM·요청자·메모", async ({ page, actors, shipping }) => {
  await loginUi(page, actors.requester); await page.setViewportSize({ width: 390, height: 844 }); await newDraft(page, shipping, true);
  for (const invalid of ["0", "-1"]) {
    await page.getByRole("spinbutton", { name: "출하 수량", exact: true }).fill(invalid);
    await page.getByTestId("mobile-shipping-wizard").getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("mobile-shipping-step-1")).toBeVisible();
    await expect(page.getByText("출하 수량은 1 이상의 정수여야 합니다.", { exact: true })).toBeVisible();
  }
  await page.getByRole("spinbutton", { name: "출하 수량", exact: true }).fill("2"); await next(page, 2, true); await next(page, 3, true); await next(page, 4, true);
  await expect(page.getByTestId("mobile-shipping-step-4")).toContainText(actors.requester.name);
  await page.getByRole("textbox", { name: "요청 메모", exact: true }).fill("모바일 입력 보존"); await next(page, 5, true);
  await expect(page.getByTestId("mobile-shipping-step-5")).toContainText(shipping.pf.item_name);
  await expect(page.getByTestId("mobile-shipping-step-5")).toContainText("× 2");
  await page.getByRole("button", { name: /전체 BOM/ }).click(); await expect(page.getByTestId("mobile-shipping-step-5")).toContainText(shipping.af.item_name);
  const created = await finishDraft(page, true); expect(created).toMatchObject({ request_quantity: 2, requested_by_name: actors.requester.name, notes: "모바일 입력 보존", invoice_number: null });
  await expect(page.getByTestId("mobile-shipping-detail")).toContainText(shipping.pf.mes_code);
});

test("SHIP-ACCESS PC-DELTA-SHIPPING-04 탭 회수 뒤 직접 URL·직접 요청 차단", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping);
  await changeEmployee(request, actors.requester, { hidden_sidebar_tabs: ["shipping"] }); await loginUi(page, actors.requester);
  await page.goto(requestUrl(created.request_id)); await expect(page).toHaveURL(/tab=dashboard/);
  await expect(page.getByRole("button", { name: "출하", exact: true }).filter({ visible: true })).toHaveCount(0);
  for (const endpoint of ["/api/shipping/requests", `/api/shipping/requests/${created.request_id}/prepare-complete`, `/api/shipping/requests/${created.request_id}/pickup-complete`]) {
    const response = await request.post(endpoint, { headers: actorHeaders(actors.requester), data: { base_pf_item_id: shipping.pf.item_id, serial_numbers: "SN" } }); expect(response.status()).toBe(403);
  }
  expect((await detail(request, actors.other, created.request_id)).status).toBe("PREPARING");
});

test("SHIP-NOOP 8.12-06 변경 없음 안내와 수정 이력 불변", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping);
  await loginUi(page, actors.requester); await page.goto(`${requestUrl(created.request_id, "requestWork")}&shippingStep=1`);
  await next(page, 2); await next(page, 3); await expect(page.getByText("BOM 변경 없음", { exact: true })).toBeVisible();
  await next(page, 4); await next(page, 5);
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/shipping/requests/${created.request_id}`) && response.request().method() === "PATCH" && response.ok());
  await page.getByTestId("shipping-update-request").click(); await saved;
  expect(await (await request.get(`/api/shipping/requests/${created.request_id}/revisions`, { headers: actorHeaders(actors.requester) })).json()).toEqual([]);
  expect((await detail(request, actors.requester, created.request_id)).request_id).toBe(created.request_id);
});

test("SHIP-PREPARED-INVOICE PC-DELTA-SHIPPING-01 준비 이력 뒤 필수 인보이스 삭제 차단", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping);
  const prepared = await request.post(`/api/shipping/requests/${created.request_id}/prepare-complete`, { headers: actorHeaders(actors.requester), data: { serial_numbers: "SN" } }); expect(prepared.ok(), await prepared.text()).toBeTruthy();
  const cancelled = await request.post(`/api/shipping/requests/${created.request_id}/prepare-cancel`, { headers: actorHeaders(actors.requester), data: {} }); expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  await loginUi(page, actors.requester); await page.goto(requestUrl(created.request_id));
  const editor = page.getByTestId("shipping-invoice-editor"); await editor.getByRole("textbox").fill("");
  await expect(editor.getByRole("button", { name: "인보이스 번호 저장", exact: true })).toBeDisabled();
  await expect(page.getByTestId("shipping-invoice-field-message")).toContainText("준비 완료 이력이 있어");
  expect((await detail(request, actors.requester, created.request_id)).invoice_number).toBe(created.invoice_number);
});

test("SHIP-BOM-INVALID 8.4-03 정수가 아닌 구성품 수량은 다음 차단", async ({ page, actors, shipping }) => {
  // Stock availability is checked against the final PF and companions at preparation.
  await loginUi(page, actors.requester); await newDraft(page, shipping); await next(page, 2);
  await page.locator(`[data-bom-line-child="${shipping.cable.item_id}"]`).getByTestId("shipping-bom-line-controls").fill("1.5");
  await expect(page.getByTestId("shipping-wizard-next")).toBeDisabled();
  await expect(page.getByTestId("shipping-wizard-step-2")).toBeVisible();
});

test("SHIP-STOCK-POLICY 8.4-03 BOM 무재고 허용과 PF·동반품 부족 준비 차단", async ({ page, request, actors, shipping }) => {
  isolatedPython([
    "import json,os,uuid", "from decimal import Decimal", "from app.database import SessionLocal", "from app.models import DepartmentEnum",
    "from app.services.inv_transfer import consume_from_department", "db=SessionLocal()", "try:",
    "    values=json.loads(os.environ['SHIPPING_FIXTURE'])",
    "    for key in ['af','cable','pa']:",
    "        consume_from_department(db,uuid.UUID(values[key]['item_id']),Decimal('20'),DepartmentEnum.SHIPPING)",
    "    db.commit();print('{}')", "finally:", "    db.close()",
  ].join("\n"), shipping);
  const before = stockSnapshot(shipping);
  for (const key of ["af", "cable", "pa"]) expect(before[key].quantity).toBe(0);
  const created = await createFixture(request, actors.requester, shipping);
  expect(created.stock_shortages).toEqual([]);
  await loginUi(page, actors.requester);
  await page.goto(requestUrl(created.request_id));
  await page.getByTestId("shipping-prepare-from-detail").click();
  await page.getByRole("textbox", { name: "완제품 SN", exact: true }).fill("QA-STOCK-POLICY");
  await pcConfirm(page, "준비 완료 확인");
  await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
  const prepared = await detail(request, actors.requester, created.request_id);
  expect(prepared.allocations.filter((row) => row.status === "RESERVED").map((row) => [row.item_id, row.quantity]).sort())
    .toEqual([[shipping.pf.item_id, 2], [shipping.carton.item_id, 3]].sort());
  for (const key of ["af", "cable", "pa"]) expect(stockSnapshot(shipping)[key]).toEqual(before[key]);
  const short = await createFixture(request, actors.requester, shipping, { request_quantity: 20, companion_lines: [{ item_id: shipping.carton.item_id, quantity: 20, unit: "EA" }] });
  expect(short.stock_shortages.map((row) => [row.item_id, row.shortage_quantity]).sort())
    .toEqual([[shipping.pf.item_id, 2], [shipping.carton.item_id, 3]].sort());
  await page.goto(requestUrl(short.request_id, "prepWork"));
  await expect(page.getByTestId(`shipping-shortage-summary-${shipping.pf.item_id}`)).toContainText("2개 부족");
  await expect(page.getByTestId(`shipping-shortage-summary-${shipping.carton.item_id}`)).toContainText("3개 부족");
  const reserved = stockSnapshot(shipping);
  const rejected = await request.post(`/api/shipping/requests/${short.request_id}/prepare-complete`, { headers: actorHeaders(actors.requester), data: { serial_numbers: "QA-BLOCKED" } });
  expect(rejected.status()).toBe(422);
  expect((await detail(request, actors.requester, short.request_id)).status).toBe("PREPARING");
  expect((await detail(request, actors.requester, short.request_id)).allocations).toEqual([]);
  expect(stockSnapshot(shipping)).toEqual(reserved);
  const cancelled = await request.post(`/api/shipping/requests/${created.request_id}/prepare-cancel`, { headers: actorHeaders(actors.requester), data: {} });
  expect(cancelled.ok(), await cancelled.text()).toBe(true);
  expect(stockSnapshot(shipping)).toEqual(before);
});

test("SHIP-REMATCH 8.12-05 변경 뒤 재검증 전 다음·제출 차단", async ({ page, actors, shipping }) => {
  await loginUi(page, actors.requester); await newDraft(page, shipping); await next(page, 2); await next(page, 3);
  await page.getByTestId("shipping-wizard-action-bar").getByRole("button", { name: "이전", exact: true }).click();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/shipping/bom-match", async (route) => { await gate; await route.continue(); });
  try {
    await page.locator(`[data-bom-line-child="${shipping.cable.item_id}"]`).getByTestId("shipping-bom-line-controls").fill("2"); await next(page, 3);
    await expect(page.getByText("변경된 BOM을 다시 확인 중입니다", { exact: true })).toBeVisible();
    await expect(page.getByTestId("shipping-wizard-next")).toBeDisabled(); await expect(page.getByTestId("shipping-submit-request")).toHaveCount(0);
  } finally { release(); }
});

test("SHIP-SHORTAGE PC-DELTA-SHIPPING-02 부족 품목·7개·출하 부서 보존과 원건 불변", async ({ page, request, actors, shipping }) => {
  const created = await createFixture(request, actors.requester, shipping, { request_quantity: 27, companion_lines: [] });
  const before = await detail(request, actors.requester, created.request_id);
  expect(before.stock_shortages.find((row) => row.item_id === shipping.pf.item_id)?.shortage_quantity).toBe(7);
  await loginUi(page, actors.requester); await page.goto(requestUrl(created.request_id, "prepWork"));
  await expect(page.getByTestId(`shipping-shortage-summary-${shipping.pf.item_id}`)).toContainText("7개 부족");
  await page.getByTestId(`shipping-shortage-pull-${shipping.pf.item_id}`).click();
  await expect(page).toHaveURL(/tab=warehouse/); await expect(page.getByText(shipping.pf.item_name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // A forced manual preselect advances directly to quantity; the current step
  // navigation button is intentionally disabled, so inspect the actual input.
  await expect(page.getByRole("spinbutton").filter({ visible: true }).first()).toHaveValue("7");
  await expect(page.getByText(/출하/).filter({ visible: true }).first()).toBeVisible();
  const after = await detail(request, actors.requester, created.request_id); expect(after).toEqual(before);
});

test("SHIP-F705 PC-DELTA-PF-01/03 실제 픽업의 주간 PF·다운로드 일자/모델/월합계 증분", async ({ page, request, actors, shipping }, testInfo) => {
  const created = await createFixture(request, actors.requester, shipping);
  const model = isolatedPython([
    "import json,os,uuid", "from app.database import SessionLocal", "from app.models import Item,ProductSymbol", "db=SessionLocal()", "try:",
    "    item=db.get(Item,uuid.UUID(json.loads(os.environ['SHIPPING_FIXTURE'])['item_id']))",
    "    print(json.dumps(db.query(ProductSymbol).filter_by(symbol=item.model_symbol).one().model_name))", "finally:", "    db.close()",
  ].join("\n"), shipping.pf) as string;
  await loginUi(page, actors.requester);
  const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [year, month, day] = kstDate.split("-").map(Number);
  const monday = new Date(`${kstDate}T00:00:00Z`); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6);
  async function reportAndDownload(label: string) {
    await page.goto("/mes?tab=weekly");
    // Login prefetch can finish across the document navigation; its CDP response
    // body then expires. Read the same real week explicitly and compare visible cells.
    const reportResponse = await request.get(`/api/inventory/weekly-report?week_start=${monday.toISOString().slice(0, 10)}&week_end=${sunday.toISOString().slice(0, 10)}`);
    expect(reportResponse.ok(), await reportResponse.text()).toBeTruthy();
    const report = await reportResponse.json() as WeeklyReportResponse;
    const row = report.production_matrix.find((entry) => entry.model_label === model); expect(row, `Model ${model} must be in the real matrix`).toBeTruthy();
    const matrix = page.getByRole("region", { name: "모델별 공정 생산 매트릭스", exact: true });
    const matrixIsEmpty = report.production_matrix.every((entry) => [entry.tf_qty, entry.hf_qty, entry.vf_qty, entry.nf_qty, entry.af_qty, entry.pf_qty].every((value) => value === 0));
    if (report.summary.total_produce_qty <= 0 && matrixIsEmpty) {
      await expect(page.getByText("이번 주 생산 실적 없음 · 모델별 공정 생산 기록이 없습니다.", { exact: true })).toBeVisible();
      await expect(matrix).toHaveCount(0);
    } else {
      const browserRow = matrix.getByRole("row", { name: new RegExp(model) }).filter({ visible: true });
      // Preserve downstream workbook/physical evidence even when the frozen
      // PF-only visibility defect fails this separate UI assertion.
      await expect.soft(browserRow.getByRole("cell").last()).toHaveText(row!.pf_qty === 0 ? "—" : row!.pf_qty.toLocaleString());
    }
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "F705-02 생산일지 다운로드", exact: true }).filter({ visible: true }).click();
    const download = await downloaded; expect(download.suggestedFilename()).toContain(`${year} 생산일지.xlsx`);
    const file = testInfo.outputPath(`${label}.xlsx`); await download.saveAs(file);
    const parsed = spawnSync("python", ["-c", "import json,sys;from openpyxl import load_workbook;w=load_workbook(sys.argv[1],data_only=True);f=load_workbook(sys.argv[1],data_only=False);row=27+['DX3000','ADX4000W','ADX6000FB','COCOON','SOLO'].index(sys.argv[2]);s=w.worksheets[int(sys.argv[3])-1];print(json.dumps({'day':s.cell(row,3+int(sys.argv[4])).value or 0,'month':s.cell(row,35).value or 0,'row':row,'formula':f.worksheets[int(sys.argv[3])-1].cell(row,35).value}))", file, model, String(month), String(day)], { encoding: "utf8", windowsHide: true });
    expect(parsed.status, parsed.stderr).toBe(0); await testInfo.attach(label, { path: file, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const workbook = JSON.parse(parsed.stdout) as { day: number; month: number; row: number; formula: string };
    expect(workbook.formula).toBe(`=SUM(D${workbook.row}:AH${workbook.row})`);
    return { pf: row!.pf_qty, workbook };
  }
  const before = await reportAndDownload("before-pickup");
  const stockBefore = stockSnapshot(shipping);
  await page.goto(requestUrl(created.request_id)); await page.getByTestId("shipping-prepare-from-detail").click();
  await page.getByRole("textbox", { name: "완제품 SN", exact: true }).fill("PF-CROSSCHECK"); await pcConfirm(page, "준비 완료 확인");
  await page.getByTestId("shipping-pickup-from-detail").click(); await pcConfirm(page, "픽업 완료 확인");
  await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PICKED_UP");
  const after = await reportAndDownload("after-pickup"); expect(after.pf - before.pf).toBe(2); expect(after.workbook.day - before.workbook.day).toBe(2); expect(after.workbook.month - before.workbook.month).toBe(2);
  const stockAfter = stockSnapshot(shipping);
  for (const key of Object.keys(stockBefore)) expect(stockAfter[key].quantity).toBe(stockBefore[key].quantity - (key === "pf" ? 2 : key === "carton" ? 3 : 0));
  await page.goto(requestUrl(created.request_id, "historyWork"));
  await page.getByTestId("shipping-pickup-cancel-from-history").click(); await pcConfirm(page, "픽업 완료 취소 확인");
  await expect.poll(async () => (await detail(request, actors.requester, created.request_id)).status).toBe("PREPARED");
  const restored = await reportAndDownload("after-pickup-cancel");
  expect(restored.pf).toBe(before.pf); expect(restored.workbook).toEqual(before.workbook);
  const restoredStock = stockSnapshot(shipping); for (const key of Object.keys(stockBefore)) expect(restoredStock[key].quantity).toBe(stockBefore[key].quantity);
});

test("SHIP-DOWNLOAD-FAIL PC-DELTA-PF-03 중복 클릭 1회·실패 안내·다시 다운로드", async ({ page, actors }) => {
  await loginUi(page, actors.requester); await page.goto("/mes?tab=weekly");
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let calls = 0; let first = true;
  await page.route("**/api/**/production-log/f705-02.xlsx?**", async (route) => {
    calls += 1;
    if (first) { first = false; await gate; await route.fulfill({ status: 503, json: { detail: "다운로드 검수 실패" } }); } else await route.continue();
  });
  const button = page.getByRole("button", { name: "F705-02 생산일지 다운로드", exact: true }).filter({ visible: true });
  try { await button.click(); await expect(page.getByRole("button", { name: "생산일지 생성 중...", exact: true }).filter({ visible: true })).toBeDisabled(); await expect.poll(() => calls).toBe(1); } finally { release(); }
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ visible: true })).toContainText(/다운로드|실패/); await expect(button).toBeEnabled();
  const downloaded = page.waitForEvent("download"); await button.click(); expect((await downloaded).suggestedFilename()).toMatch(/생산일지\.xlsx$/); expect(calls).toBe(2);
});
