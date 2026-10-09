/** Remaining shipping atoms. Fixtures only target the dedicated mes_e2e database. */
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { APIRequestContext, Page } from "@playwright/test";
import { test as base, expect, loginUi, changeEmployee } from "./_common-expectations";
import type { Employee } from "../../lib/api/types/employees";
import type { ShippingRequest } from "../../lib/api/types/shipping";

type Part = { item_id: string; item_name: string; mes_code: string };
type RawHistoryFixture = { requestId: string; logIds: string[] };
type Parts = { af: Part; pa: Part; pf: Part; variantPa: Part; variant: Part; variantOther: Part; rawHistory: RawHistoryFixture[] };
const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
const actorHeaders = (actor: Employee) => ({ "X-MES-Employee-Code": actor.employee_code });

function fixturePython(script: string, parts: Parts): any {
  const backend = path.resolve(__dirname, "../../../backend");
  const database = path.join(backend, "mes_e2e.db");
  if (!fs.existsSync(database) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("isolated shipping fixture required");
  const result = spawnSync("python", ["-c", script], { cwd: backend, windowsHide: true, encoding: "utf8", env: {
    ...process.env, DATABASE_URL: `sqlite:///${database.split(path.sep).join("/")}`, SHIPPING_ATOMS: JSON.stringify(parts), PYTHONIOENCODING: "utf-8",
  } });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout.trim());
}

const test = base.extend<{ parts: Parts }>({
  parts: async ({ request }, runFixture) => {
    const suffix = randomUUID().slice(0, 8);
    const made: Record<string, Part> = {};
    // Country/color/customer are product-name variants; ItemCreate has no such dedicated fields.
    for (const [key, process, label] of [["af", "AF", "조립"], ["pa", "PA", "기본 PA"], ["pf", "PF", "기준 PF"], ["variantPa", "PA", "후보 PA"], ["variant", "PF", "미국 파랑 판매처B"], ["variantOther", "PF", "한국 흰색 판매처A"]]) {
      const response = await request.post("/api/items", { headers: ADMIN, data: {
        item_name: `출하원자-${suffix}-${label}`, process_type_code: process, unit: "EA", model_slots: [1], initial_quantity: 20,
        initial_locations: [{ department: "출하", quantity: 20 }],
      } });
      expect(response.ok(), await response.text()).toBeTruthy(); made[key] = await response.json();
    }
    for (const [parent, child, quantity] of [["pa", "af", 1], ["pf", "pa", 1], ["variantPa", "af", 2], ["variant", "variantPa", 1], ["variantOther", "variantPa", 1]] as const) {
      const response = await request.post("/api/bom", { headers: ADMIN, data: { parent_item_id: made[parent].item_id, child_item_id: made[child].item_id, quantity, unit: "EA" } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    const parts = { ...made, rawHistory: [] } as Parts;
    try {
      await runFixture(parts);
    } finally {
      if (parts.rawHistory.length) fixturePython([
        "import json,os,uuid", "from app.database import SessionLocal", "from app.models import ShippingRequest,TransactionLog", "db=SessionLocal()", "try:",
        "    parts=json.loads(os.environ['SHIPPING_ATOMS'])",
        "    allowed={uuid.UUID(parts[key]['item_id']) for key in ('pf','variant')}",
        "    for fixture in parts['rawHistory']:",
        "        request_id=uuid.UUID(fixture['requestId'])",
        "        ids={uuid.UUID(value) for value in fixture['logIds']}",
        "        logs=db.query(TransactionLog).filter(TransactionLog.log_id.in_(ids)).all()",
        "        assert {log.log_id for log in logs}==ids, 'raw fixture log ownership changed'",
        "        assert all(log.item_id in allowed and log.operation_id is None and log.shipping_request_id in (None,request_id) for log in logs), 'refuse non-fixture operation cleanup'",
        "        for log in logs: db.delete(log)",
        "        db.flush()",
        "        assert not db.query(TransactionLog).filter(TransactionLog.shipping_request_id==request_id).count(), 'unexpected request history remains'",
        "        row=db.get(ShippingRequest,request_id)",
        "        assert row is not None and row.base_pf_item_id==uuid.UUID(parts['pf']['item_id']), 'raw fixture request ownership changed'",
        "        db.delete(row)",
        "    db.commit()", "    print('{}')", "finally:", "    db.close()",
      ].join("\n"), parts);
    }
  },
});

async function allRequests(request: APIRequestContext, actor: Employee, parts: Parts): Promise<ShippingRequest[]> {
  const response = await request.get("/api/shipping/requests", { headers: actorHeaders(actor) });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).filter((row: ShippingRequest) => row.base_pf_item_id === parts.pf.item_id);
}
async function detail(request: APIRequestContext, actor: Employee, id: string): Promise<ShippingRequest> {
  const response = await request.get(`/api/shipping/requests/${id}`, { headers: actorHeaders(actor) });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function action(request: APIRequestContext, actor: Employee, id: string, name: string): Promise<void> {
  const response = await request.post(`/api/shipping/requests/${id}/${name}`, { headers: actorHeaders(actor), data: { serial_numbers: "ATOM-SN" } });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function create(request: APIRequestContext, actor: Employee, parts: Parts): Promise<ShippingRequest> {
  const response = await request.post("/api/shipping/requests", { headers: actorHeaders(actor), data: {
    base_pf_item_id: parts.pf.item_id, request_quantity: 2, invoice_number: `ATOM-${randomUUID()}`, client_request_id: randomUUID(),
  } });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function draft(page: Page, parts: Parts): Promise<void> {
  await page.goto("/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
  await page.getByTestId("shipping-pf-search").fill(parts.pf.item_name);
  await page.getByTestId(`shipping-pf-option-${parts.pf.item_id}`).click();
}
async function step(page: Page, number: number): Promise<void> {
  await page.getByTestId("shipping-wizard-next").click();
  await expect(page.getByTestId(`shipping-wizard-step-${number}`)).toBeVisible();
}
function stock(parts: Parts): unknown {
  return fixturePython([
    "import json,os,uuid", "from app.database import SessionLocal", "from app.models import Inventory,TransactionLog", "db=SessionLocal()", "try:", "    result={}",
    "    for key,value in json.loads(os.environ['SHIPPING_ATOMS']).items():", "        if key=='rawHistory': continue", "        item_id=uuid.UUID(value['item_id'])", "        row=db.query(Inventory).filter_by(item_id=item_id).one()",
    "        result[key]={'quantity':float(row.quantity),'pending':float(row.pending_quantity),'logs':db.query(TransactionLog).filter_by(item_id=item_id).count()}",
    "    print(json.dumps(result))", "finally:", "    db.close()",
  ].join("\n"), parts);
}

test("SHIP-DOUBLE 8.4-06 실제 최종 버튼 연타는 생성 호출·원건 각각 1회", async ({ page, request, actors, parts }) => {
  await loginUi(page, actors.requester); await draft(page, parts);
  for (const number of [2, 3, 4, 5]) await step(page, number);
  let calls = 0; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/shipping/requests", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls += 1; await gate; await route.continue();
  });
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/shipping/requests" && response.request().method() === "POST" && response.ok());
  try {
    await page.getByTestId("shipping-submit-request").dblclick();
    await expect(page.getByTestId("shipping-submit-request")).toBeDisabled();
    await expect.poll(() => calls).toBe(1);
  } finally { release(); }
  const created = await (await saved).json();
  expect((await allRequests(request, actors.requester, parts)).map((row) => row.request_id)).toEqual([created.request_id]);
  expect(calls).toBe(1);
});

test("SHIP-DISCARD 8.4-07 새로고침 경고·머무르기 전체 입력·폐기 서버 무효과", async ({ page, request, actors, parts }) => {
  const before = stock(parts); const initial = await allRequests(request, actors.requester, parts);
  await loginUi(page, actors.requester); await draft(page, parts);
  await page.getByTestId("shipping-request-quantity-field").getByRole("spinbutton").fill("3");
  await page.getByTestId("shipping-invoice-number").fill("DRAFT-ALL");
  await step(page, 2); await step(page, 3); await step(page, 4);
  await page.getByRole("textbox", { name: "요청 메모", exact: true }).fill("폐기 전 모든 입력"); await step(page, 5);
  const final = page.getByTestId("shipping-final-summary"); const beforeSummary = await final.innerText();
  await page.getByRole("button", { name: /^대시보드(?:\s|$)/ }).filter({ visible: true }).click();
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "계속 머무르기", exact: true }).click();
  await expect.poll(() => final.innerText()).toBe(beforeSummary);
  await expect(page.getByText("폐기 전 모든 입력", { exact: true })).toBeVisible();
  await expect(page.getByTestId("shipping-final-action-quantity")).toContainText("3대");
  const documentStartedAt = await page.evaluate(() => performance.timeOrigin);
  const beforeUnload = page.waitForEvent("dialog");
  // A dismissed navigation never reaches page.reload's load completion. Trigger
  // native reload without waiting for a load event that must not happen.
  await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
  const dialog = await beforeUnload; expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStartedAt);
  await expect.poll(() => final.innerText()).toBe(beforeSummary);
  await page.getByRole("button", { name: /^대시보드(?:\s|$)/ }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
  expect(await allRequests(request, actors.requester, parts)).toEqual(initial);
  expect(stock(parts)).toEqual(before);
});

test("SHIP-VARIANT 8.12-01/03 동일 BOM 국가·색상·판매처 이름 후보와 목록 실제 품목", async ({ page, request, actors, parts }) => {
  const original = await (await request.get(`/api/bom/${parts.pa.item_id}`)).json();
  await loginUi(page, actors.requester); await draft(page, parts); await step(page, 2);
  await page.locator(`[data-bom-line-child="${parts.af.item_id}"]`).getByTestId("shipping-bom-line-controls").fill("2"); await step(page, 3);
  const candidate = page.getByTestId(`shipping-bom-candidate-${parts.variant.item_id}`);
  await expect(page.getByTestId(`shipping-bom-candidate-${parts.variantOther.item_id}`)).toContainText("한국 흰색 판매처A");
  await expect(candidate).toContainText("미국 파랑 판매처B"); await candidate.click();
  await step(page, 4); await step(page, 5);
  await expect(page.getByTestId("shipping-final-summary")).toContainText(parts.variant.item_name);
  await expect(page.getByTestId("shipping-final-summary")).toContainText(parts.variantPa.item_name);
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/shipping/requests" && response.request().method() === "POST" && response.ok());
  await page.getByTestId("shipping-submit-request").click(); const created = await (await saved).json() as ShippingRequest;
  expect(created.final_pf_item_id).toBe(parts.variant.item_id); expect(created.final_pa_item_id).toBe(parts.variantPa.item_id);
  expect(created.bom_lines.find((line) => line.child_item_id === parts.af.item_id)?.quantity).toBe(2);
  expect(await (await request.get(`/api/bom/${parts.pa.item_id}`)).json()).toEqual(original);
  await page.goto("/mes?tab=shipping&shippingView=requestList");
  const card = page.locator(`[data-shipping-request-id="${created.request_id}"]`).filter({ visible: true });
  await expect(card).toHaveCount(1); await expect(card).toContainText(parts.variant.item_name);
  await expect(card.getByTestId(`shipping-request-code-${created.request_id}`)).toHaveText(parts.variant.mes_code);
  expect((await detail(request, actors.requester, created.request_id)).base_pf_item_id).toBe(parts.pf.item_id);
});

test("SHIP-CANDIDATE-DRIFT 8.12-03/05 선택 이후 실제 후보 BOM 변경은 설명·제출 거부·초안 보존", async ({ page, request, actors, parts }) => {
  await loginUi(page, actors.requester); await draft(page, parts); await step(page, 2);
  await page.locator(`[data-bom-line-child="${parts.af.item_id}"]`).getByTestId("shipping-bom-line-controls").fill("2");
  await step(page, 3); await page.getByTestId(`shipping-bom-candidate-${parts.variant.item_id}`).click();
  await step(page, 4); await page.getByRole("textbox", { name: "요청 메모", exact: true }).fill("후보 변경 후에도 초안 보존"); await step(page, 5);
  const beforeStock = stock(parts);
  const endpoint = `/api/bom/${parts.variantPa.item_id}`;
  const original = await (await request.get(endpoint)).json();
  const changed = original.map((line: { quantity: number }) => ({ ...line, quantity: line.quantity + 1 }));
  const saved = await request.put(endpoint, { headers: ADMIN, data: { expected_rows: original, rows: changed } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  let createCalls = 0;
  page.on("request", (outgoing) => { if (new URL(outgoing.url()).pathname === "/api/shipping/requests" && outgoing.method() === "POST") createCalls += 1; });
  const rechecked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/shipping/bom-match" && response.request().method() === "POST");
  await page.getByTestId("shipping-submit-request").click();
  expect((await rechecked).status()).toBe(200);
  await expect(page.getByText("재사용할 기존 PF 후보를 다시 선택하세요.", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(createCalls).toBe(0);
  await expect(page.getByTestId("shipping-wizard-step-3")).toBeVisible();
  await expect(page.getByTestId("shipping-bom-drift")).toContainText(`PA · ${parts.af.item_name} (${parts.af.mes_code}): 초안 2EA → 현재 3EA`);
  await expect(page.getByTestId("shipping-wizard-next")).toBeDisabled();
  await expect(page.getByRole("button", { name: "4. 요청 정보", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "5. 출하 요청 확인", exact: true })).toBeDisabled();
  await expect(page.getByTestId("shipping-submit-request")).toHaveCount(0);
  await page.getByRole("button", { name: "2. BOM 구성 조정", exact: true }).click();
  await expect(page.locator(`[data-bom-line-child="${parts.af.item_id}"]`).getByTestId("shipping-bom-line-controls")).toHaveValue("2");
  const changedRows = await (await request.get(endpoint)).json();
  const restored = await request.put(endpoint, { headers: ADMIN, data: { expected_rows: changedRows, rows: original } });
  expect(restored.ok(), await restored.text()).toBeTruthy();
  await step(page, 3);
  const restoredCandidate = page.getByTestId(`shipping-bom-candidate-${parts.variant.item_id}`);
  await expect(restoredCandidate).toBeVisible(); await restoredCandidate.scrollIntoViewIfNeeded();
  const candidateBox = await restoredCandidate.boundingBox(); const quantityBox = await page.getByTestId("shipping-match-quantity").boundingBox();
  expect(candidateBox).not.toBeNull(); expect(quantityBox).not.toBeNull();
  expect(candidateBox!.y + candidateBox!.height).toBeLessThanOrEqual(quantityBox!.y);
  await restoredCandidate.click(); await step(page, 4);
  await expect(page.getByRole("textbox", { name: "요청 메모", exact: true })).toHaveValue("후보 변경 후에도 초안 보존");
  expect(await allRequests(request, actors.requester, parts)).toEqual([]);
  expect(stock(parts)).toEqual(beforeStock);
});

test("SHIP-GENERATED-ROLES 8.12-12 기준 PF와 새 PA·PF 역할·실제 저장 식별값 구분", async ({ page, request, actors, parts }) => {
  await loginUi(page, actors.requester); await draft(page, parts); await step(page, 2);
  await page.locator(`[data-bom-line-child="${parts.af.item_id}"]`).getByTestId("shipping-bom-line-controls").fill("3"); await step(page, 3);
  const changedComponent = page.getByTestId("shipping-bom-change-table").getByTestId("shipping-final-bom-change-row").filter({ hasText: parts.af.item_name });
  await expect(changedComponent).toContainText(parts.af.mes_code!);
  await expect(changedComponent).toContainText("총 3EA");
  const paName = `새 PA-${randomUUID().slice(0, 8)}`; const pfName = `새 PF-${randomUUID().slice(0, 8)}`;
  await expect(page.getByTestId("shipping-final-pa-summary")).toContainText("새 PA 생성 예정");
  await expect(page.getByTestId("shipping-final-pf-summary")).toContainText("새 PF 생성 예정");
  await page.getByRole("textbox", { name: "새 PA 이름", exact: true }).fill(paName);
  await page.getByRole("textbox", { name: "새 PF 이름", exact: true }).fill(pfName);
  await expect(page.getByTestId("shipping-final-pa-summary")).toContainText(paName);
  await expect(page.getByTestId("shipping-final-pf-summary")).toContainText(pfName);
  await step(page, 4); await step(page, 5);
  await expect(page.getByTestId("shipping-final-summary")).toContainText(pfName);
  await expect(page.getByTestId("shipping-final-group-pf")).toContainText(paName);
  const finalChangedComponent = page.getByTestId("shipping-final-bom-changes").getByTestId("shipping-final-bom-change-row").filter({ hasText: parts.af.item_name });
  await expect(finalChangedComponent).toContainText(parts.af.mes_code!);
  await expect(finalChangedComponent).toContainText("총 3EA");
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/shipping/requests" && response.request().method() === "POST" && response.ok());
  await page.getByTestId("shipping-submit-request").click(); const created = await (await saved).json() as ShippingRequest;
  expect(created.base_pf_item_id).toBe(parts.pf.item_id);
  expect(created.final_pa_item_id).not.toBe(parts.pa.item_id); expect(created.final_pf_item_id).not.toBe(parts.pf.item_id);
  expect(created.final_pa_item_name).toBe(paName); expect(created.final_pf_item_name).toBe(pfName);
  await page.goto(`/mes?tab=shipping&shippingView=requestDetail&shippingRequestId=${created.request_id}`);
  await expect(page.getByTestId("shipping-request-detail")).toContainText(pfName);
  await expect(page.getByTestId("shipping-request-detail")).toContainText(created.final_pf_mes_code!);
  expect((await detail(request, actors.requester, created.request_id)).base_pf_item_id).toBe(parts.pf.item_id);
});

test("SHIP-INACTIVE PC-DELTA-SHIPPING-04 세션 중 비활성화 뒤 화면·직접 생성·준비·픽업 차단", async ({ page, request, actors, parts }) => {
  const created = await create(request, actors.requester, parts);
  await loginUi(page, actors.requester); await page.goto(`/mes?tab=shipping&shippingView=requestDetail&shippingRequestId=${created.request_id}`);
  await changeEmployee(request, actors.requester, { is_active: false }); await page.reload();
  await expect(page.getByRole("combobox")).toBeVisible();
  await expect(page.getByTestId("shipping-prepare-from-detail")).toHaveCount(0);
  for (const endpoint of ["/api/shipping/requests", `/api/shipping/requests/${created.request_id}/prepare-complete`, `/api/shipping/requests/${created.request_id}/pickup-complete`]) {
    const response = await request.post(endpoint, { headers: actorHeaders(actors.requester), data: { base_pf_item_id: parts.pf.item_id, serial_numbers: "SN" } });
    expect(response.status()).toBe(403);
  }
  expect((await detail(request, actors.other, created.request_id)).status).toBe("PREPARING");
});

test("SHIP-HISTORY-COUNT 8.12-15 G09 실제 출하 원작업1+취소1 보존·필터·합계", async ({ page, request, actors, parts }) => {
  const created = await create(request, actors.requester, parts);
  await action(request, actors.requester, created.request_id, "prepare-complete");
  await action(request, actors.requester, created.request_id, "pickup-complete");
  const picked = await detail(request, actors.requester, created.request_id); expect(picked.transactions).toHaveLength(1);
  await action(request, actors.requester, created.request_id, "pickup-cancel");
  const cancelled = await detail(request, actors.requester, created.request_id); expect(cancelled.transactions).toHaveLength(2);
  expect(cancelled.transactions.map((log) => log.quantity_change).sort()).toEqual([-2, 2]);
  await loginUi(page, actors.requester); await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(parts.pf.item_name);
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  const rows = page.locator('[data-history-main-row="true"]');
  await page.getByRole("button", { name: /^필터/ }).click();
  const operation = page.getByText("작업 종류", { exact: true }).locator("..").locator("..");
  await operation.getByRole("button", { name: "출하", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId("history-scroll-surface").locator("section").first()).toContainText("2건");
  await expect(page.locator(`[data-log-id="${picked.transactions[0].log_id}"]`).first()).toContainText("취소");
});

test("SHIP-HISTORY-LINK 8.12-15 원출하·취소 역거래 상세 양방향 이동", async ({ page, request, actors, parts }) => {
  const created = await create(request, actors.requester, parts);
  for (const name of ["prepare-complete", "pickup-complete", "pickup-cancel"]) await action(request, actors.requester, created.request_id, name);
  const result = await detail(request, actors.requester, created.request_id);
  const original = result.transactions.find((log) => log.quantity_change < 0)!;
  const reverse = result.transactions.find((log) => log.quantity_change > 0)!;
  expect(original).toBeTruthy(); expect(reverse).toBeTruthy();
  await loginUi(page, actors.requester); await page.goto("/mes?tab=history");
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(parts.pf.item_name);
  await page.locator(`[data-log-id="${original.log_id}"]`).first().click();
  // These semantic links are a required contract, currently a source-read gap candidate.
  const panel = page.locator('[data-history-detail-log-id]');
  await expect(panel).toHaveAttribute("data-history-detail-log-id", original.log_id);
  const reverseLink = page.getByRole("button", { name: "취소 작업 보기", exact: true });
  await expect(reverseLink).toBeVisible(); await reverseLink.click();
  await expect(panel).toHaveAttribute("data-history-detail-log-id", reverse.log_id);
  const originalLink = page.getByRole("button", { name: "원래 작업 보기", exact: true });
  await expect(originalLink).toBeVisible(); await originalLink.click();
  await expect(panel).toHaveAttribute("data-history-detail-log-id", original.log_id);
  await expect(reverseLink).toBeVisible();
});

test("SHIP-WEEK-BOUNDARY PC-DELTA-PF-02 실제 과거주 화면의 KST 경계·동반 제외·주내 취소·마감 보존", async ({ page, request, actors, parts }, testInfo) => {
  // Legacy historical fixture is explicit: this does not claim current operation cancellation coverage.
  const url = "/api/inventory/weekly-report?week_start=2026-05-04&week_end=2026-05-10";
  const baselineResponse = await request.get(url); expect(baselineResponse.ok(), await baselineResponse.text()).toBeTruthy();
  const baseline = await baselineResponse.json();
  const baselinePf = Number(baseline.production_matrix.find((row: { model_key: string }) => row.model_key === "DX3000")?.pf_qty ?? 0);
  const fixture = fixturePython([
    "import json,os,uuid", "from datetime import datetime", "from app.database import SessionLocal",
    "from app.models import ShippingRequest,TransactionLog,TransactionTypeEnum,Item", "db=SessionLocal()", "try:",
    "    parts=json.loads(os.environ['SHIPPING_ATOMS'])", "    pf=uuid.UUID(parts['pf']['item_id'])", "    companion=uuid.UUID(parts['variant']['item_id'])",
    "    assert db.get(Item,pf).model_symbol=='3', 'fixture must use DX3000 model slot'",
    "    req=ShippingRequest(base_pf_item_id=pf,final_pf_item_id=pf,request_quantity=1)", "    db.add(req)", "    db.flush()",
    "    kept=None", "    log_ids=[]",
    "    for qty,at in [(11,datetime(2026,5,3,14,59,59)),(2,datetime(2026,5,3,15)),(5,datetime(2026,5,10,14,59,59,999999)),(7,datetime(2026,5,10,15)),(4,datetime(2026,5,6,3))]:",
    "        log=TransactionLog(item_id=pf,transaction_type=TransactionTypeEnum.SHIP,quantity_change=-qty,quantity_before=20,quantity_after=20-qty,shipping_phase='PICKUP',shipping_request_id=req.request_id,created_at=at)",
    "        db.add(log)", "        db.flush()", "        log_ids.append(str(log.log_id))", "        if qty==4: kept=str(log.log_id)",
    "    for item,kind,qty,linked,cancelled in [(companion,TransactionTypeEnum.SHIP,-13,True,False),(pf,TransactionTypeEnum.PRODUCE,19,False,False),(pf,TransactionTypeEnum.SHIP,-17,False,False),(pf,TransactionTypeEnum.SHIP,-3,True,True)]:",
    "        log=TransactionLog(item_id=item,transaction_type=kind,quantity_change=qty,quantity_before=20,quantity_after=20+qty,shipping_phase='PICKUP' if kind==TransactionTypeEnum.SHIP else None,shipping_request_id=req.request_id if linked else None,created_at=datetime(2026,5,6,3),cancelled=cancelled,cancelled_at=datetime(2026,5,7,3) if cancelled else None)",
    "        db.add(log)", "        db.flush()", "        log_ids.append(str(log.log_id))",
    "    db.commit()", "    print(json.dumps({'kept':kept,'requestId':str(req.request_id),'logIds':log_ids}))", "finally:", "    db.close()",
  ].join("\n"), parts) as RawHistoryFixture & { kept: string };
  parts.rawHistory.push(fixture);
  async function openMayWeek(): Promise<void> {
    await page.goto("/mes?tab=weekly");
    await page.getByRole("button", { name: /2026년 .*주차/ }).filter({ visible: true }).click();
    const month = page.getByText(/^2026년 \d+월$/, { exact: true }).filter({ visible: true });
    for (let count = 0; await month.innerText() !== "2026년 5월"; count += 1) {
      expect(count).toBeLessThan(12);
      await month.locator("..").getByRole("button").first().click();
    }
    await page.getByRole("button", { name: /^3\s+4\s+5\s+6\s+7\s+8\s+9$/, exact: true }).click();
    await expect(page.getByRole("button", { name: /2026년 5월 1주차/ }).filter({ visible: true })).toBeVisible();
    const modelRow = page.getByRole("region", { name: "모델별 공정 생산 매트릭스", exact: true }).getByRole("row", { name: /DX3000/ }).filter({ visible: true });
    await expect(modelRow.getByRole("cell").nth(6)).toHaveText((baselinePf + 11).toLocaleString());
  }
  const after = await (await request.get(url)).json();
  expect(Number(after.production_matrix.find((row: { model_key: string }) => row.model_key === "DX3000").pf_qty) - baselinePf).toBe(11);
  await loginUi(page, actors.requester); await openMayWeek();
  await testInfo.attach("kst-week-before-later-cancel", { body: await page.screenshot(), contentType: "image/png" });
  fixturePython([
    "import json,uuid", "from datetime import datetime", "from app.database import SessionLocal", "from app.models import TransactionLog", "db=SessionLocal()", "try:",
    `    log=db.get(TransactionLog,uuid.UUID('${fixture.kept}'))`, "    log.cancelled=True", "    log.cancelled_at=datetime(2026,5,10,15)",
    "    db.commit()", "    print('{}')", "finally:", "    db.close()",
  ].join("\n"), parts);
  const closed = await (await request.get(url)).json();
  expect(closed.production_matrix).toEqual(after.production_matrix);
  await openMayWeek();
  await testInfo.attach("kst-week-after-later-cancel-preserved", { body: await page.screenshot(), contentType: "image/png" });
});
