import { randomUUID } from "crypto";
import type { APIRequestContext, Download, Page } from "@playwright/test";
import { test as commonTest, expect, loginUi, changeEmployee, type CommonActors } from "./_common-expectations";
import { businessSnapshot, deleteExportFixture, downloadedRows, rawDatabaseRows, seedExportRows, setInventoryMismatch, terminalFacts, type ExportFixture } from "./_admin-export-expectations";

const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const headers = (actors: CommonActors) => ({ "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code });
const rawHeaders = ["일시", "거래유형", "품목코드", "품목명", "수량", "변경전 재고", "변경후 재고", "참조번호", "처리자", "처리자사번", "비고", "거래ID"];
const activityHeaders = ["일시(KST)", "직원명", "사번", "단말명", "접속유형", "화면", "작업", "결과", "대상/변경 요약", "세션 ID", "요청 ID", "관련 ID"];
const sorted = (rows: string[][]): string[][] => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const csvCell = (value: unknown): string => value === null || value === undefined ? "" : String(value);

type ExportItem = { item_id: string; mes_code: string; item_name: string };
const test = commonTest.extend<{ historicalExport: { item: ExportItem; fixture: ExportFixture } }>({
  historicalExport: async ({ request, actors }, runFixture) => {
    // Test-only rows are created in mes_e2e.db and removed after each export flow.
    const response = await request.post("/api/items", { headers: headers(actors), data: {
      item_name: `QA 내보내기 ${randomUUID().slice(0, 8)} 한글, "따옴표"`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 0,
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    const item: ExportItem = await response.json();
    const fixture = seedExportRows(item.item_id, actors.approver.employee_id, actors.approver.name, today());
    try { await runFixture({ item, fixture }); }
    finally { deleteExportFixture(fixture); }
  },
});

async function openAdmin(page: Page, actors: CommonActors, section: string): Promise<void> {
  await loginUi(page, actors.approver);
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) {
    const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) await zero.click();
  }
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: section, exact: true }).click();
}

async function json(request: APIRequestContext, url: string): Promise<Record<string, unknown>[]> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function allPages(request: APIRequestContext, url: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  while (true) {
    const part = await json(request, `${url}${url.includes("?") ? "&" : "?"}skip=${rows.length}&limit=2000`);
    rows.push(...part);
    if (part.length < 2000) return rows;
  }
}

async function chooseMonth(page: Page, trigger: string, month: string): Promise<void> {
  await page.getByRole("combobox", { name: trigger, exact: true }).click();
  const [year, number] = month.split("-");
  await page.getByRole("option", { name: `${year}년 ${Number(number)}월`, exact: true }).click();
}

async function clickDownload(page: Page, name: string | RegExp): Promise<Download> {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: typeof name === "string" }).filter({ visible: true }).click();
  return downloaded;
}

test.describe("관리자 내보내기·진단의 최종 파일과 읽기 전용 계약", () => {

  test("8.19-21 공식·일반 구분과 전체 CSV4종·비활성 직원·한글 특수문자 최종파일", async ({ page, request, actors, historicalExport }, info) => {
    await changeEmployee(request, actors.other, { is_active: false });
    await openAdmin(page, actors, "내보내기");
    await expect(page.getByRole("group", { name: "공식 서식 내보내기", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "데이터 내보내기", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "전체 데이터 CSV 4개 다운로드", exact: true })).toBeVisible();
    await expect(page.getByTestId("export-format-settings")).toHaveCount(0);
    const downloads: Download[] = [];
    const listener = (download: Download): void => { downloads.push(download); };
    page.on("download", listener);
    try {
      await page.getByRole("button", { name: "전체 데이터 CSV 4개 다운로드", exact: true }).click();
      await expect.poll(() => downloads.length).toBe(4);
    } finally { page.off("download", listener); }
    expect(downloads.map((file) => file.suggestedFilename().split("_")[0]).sort()).toEqual(["bom", "employees", "items", "transactions"]);
    const parsed = new Map<string, string[][]>();
    for (const file of downloads) parsed.set(file.suggestedFilename().split("_")[0], (await downloadedRows(file, info)).rows);
    const items = await allPages(request, "/api/items");
    expect(parsed.get("items")![0]).toEqual(["품목 코드", "품명", "단위", "현재고", "안전재고", "부서", "공급처"]);
    expect(sorted(parsed.get("items")!.slice(1))).toEqual(sorted(items.map((item) => [item.mes_code, item.item_name, item.unit, item.quantity, item.min_stock, item.department ?? "", item.supplier ?? ""].map(csvCell))));
    expect(parsed.get("items")!.filter((row) => row[0] === historicalExport.item.mes_code)).toHaveLength(1);
    expect(parsed.get("items")!.find((row) => row[0] === historicalExport.item.mes_code)?.[1]).toBe(historicalExport.item.item_name);
    const employees = await json(request, "/api/employees?active_only=true");
    expect(parsed.get("employees")![0]).toEqual(["이름", "부서", "직급", "창고 역할", "활성"]);
    expect(sorted(parsed.get("employees")!.slice(1))).toEqual(sorted(employees.map((row) => [row.name, row.department, row.role ?? "", row.warehouse_role, row.is_active ? "Y" : "N"].map(csvCell))));
    expect(parsed.get("employees")!.some((row) => row[0] === actors.other.name)).toBe(false);
    const bom = await json(request, "/api/bom");
    expect(parsed.get("bom")![0]).toEqual(["부모 코드", "부모명", "자식 코드", "자식명", "수량", "단위"]);
    expect(sorted(parsed.get("bom")!.slice(1))).toEqual(sorted(bom.map((row) => [row.parent_mes_code ?? "", row.parent_item_name, row.child_mes_code ?? "", row.child_item_name, row.quantity, row.unit].map(csvCell))));
    expect(parsed.get("transactions")![0]).toEqual(["거래일시", "구분", "품목명", "수량변화", "단위", "메모", "품목 정보 기준", "현재 품목명", "현재 품목 코드"]);
    const end = today(); const start = new Date(new Date(`${end}T00:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const transactions = await allPages(request, "/api/inventory/transactions");
    const inRange = transactions.filter((row) => {
      const value = String(row.created_at);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`));
      return date >= start && date <= end;
    });
    expect(sorted(parsed.get("transactions")!.slice(1))).toEqual(sorted(inRange.map((row) => [row.created_at, row.transaction_type, row.item_name, row.quantity_change, row.item_unit, row.notes ?? "", row.item_snapshot_preserved ? "거래 당시" : "현재 품목 (당시 정보 미보존)", row.current_item_name ?? row.item_name, row.current_mes_code ?? row.mes_code ?? ""].map(csvCell))));
    await page.getByRole("group", { name: "데이터 범위", exact: true }).getByRole("button", { name: "직원", exact: true }).click();
    await page.getByRole("checkbox", { name: "비활성 데이터 포함", exact: true }).check();
    const inactive = await downloadedRows(await clickDownload(page, "직원 CSV 다운로드"), info);
    const allEmployees = await json(request, "/api/employees?active_only=false");
    expect(sorted(inactive.rows.slice(1))).toEqual(sorted(allEmployees.map((row) => [row.name, row.department, row.role ?? "", row.warehouse_role, row.is_active ? "Y" : "N"].map(csvCell))));
    expect(inactive.rows.find((row) => row[0] === actors.other.name)?.[4]).toBe("N");
  });

  test("8.19-21 KST 오늘 양쪽 자정 CSV·Excel 최종파일과 업무DB 불변", async ({ page, actors, historicalExport }, info) => {
    const before = businessSnapshot();
    await openAdmin(page, actors, "내보내기");
    await page.getByRole("group", { name: "데이터 범위", exact: true }).getByRole("button", { name: "입출고", exact: true }).click();
    await page.getByRole("button", { name: "오늘", exact: true }).click();
    await expect(page.getByTestId("export-period-settings")).toContainText(`${today()} ~ ${today()}`);
    const csv = await downloadedRows(await clickDownload(page, "입출고 CSV 다운로드"), info);
    const fixtureRows = csv.rows.slice(1).filter((row) => row[2] === historicalExport.item.item_name);
    expect(fixtureRows.map((row) => row[5]).sort()).toEqual(historicalExport.fixture.notes.slice(1, 3).sort());
    expect(fixtureRows.map((row) => new Date(row[0]).toISOString()).sort()).toEqual(historicalExport.fixture.dates.slice(1, 3).map((value) => new Date(`${value}Z`).toISOString()).sort());
    await page.getByRole("group", { name: "파일 형식", exact: true }).getByRole("button", { name: "Excel", exact: true }).click();
    const xlsx = await downloadedRows(await clickDownload(page, "입출고 Excel 다운로드"), info);
    const excelRows = xlsx.rows.filter((row) => row.includes(historicalExport.item.mes_code));
    expect(excelRows).toHaveLength(2);
    for (const note of historicalExport.fixture.notes.slice(1, 3)) expect(excelRows.some((row) => row.includes(note))).toBe(true);
    for (const note of [historicalExport.fixture.notes[0], historicalExport.fixture.notes[3]]) expect(excelRows.some((row) => row.includes(note))).toBe(false);
    expect(businessSnapshot()).toEqual(before);
  });

  test("8.19-22 F704 실제 창고 증감·요청자·취소역전·서식과 F705 최종파일", async ({ page, actors, historicalExport }, info) => {
    await openAdmin(page, actors, "내보내기");
    await page.getByRole("spinbutton", { name: "F704-02 연도", exact: true }).fill(String(historicalExport.fixture.year));
    const ledger = await downloadedRows(await clickDownload(page, "F704-02 대장 다운로드"), info);
    expect(ledger.sheets).toContain("양식");
    const selected = ledger.rows.filter((row) => row[3] === historicalExport.item.mes_code);
    expect(selected).toHaveLength(4);
    expect(selected.map((row) => row[4])).toEqual(Array(4).fill(historicalExport.item.item_name));
    expect(selected.map((row) => row[5])).toEqual(["3", "2", "1", "1"]);
    expect(selected.map((row) => row[6])).toEqual(["입고", "출고", "입고", "출고"]);
    expect(selected.map((row) => row[7])).toEqual(["검수 공급사", "AS", "검수 공급사", "검수 공급사"]);
    expect(selected.map((row) => row[8])).toEqual(Array(4).fill(actors.approver.name));
    expect(selected.map((row) => row[10])).toEqual(historicalExport.fixture.notes.map((note) => note.replace(/[\r\n]/g, " ")));
    expect(selected.map((row) => row[1].slice(0, 10))).toEqual(historicalExport.fixture.dates.map((value) => new Date(new Date(`${value}Z`).getTime() + 9 * 3_600_000).toISOString().slice(0, 10)));
    await page.getByRole("spinbutton", { name: "F705-02 연도", exact: true }).fill(String(historicalExport.fixture.year));
    const production = await downloadedRows(await clickDownload(page, "F705-02 생산일지 다운로드"), info);
    expect(production.sheets).toHaveLength(12);
    expect(production.sheets).toContain(`${String(historicalExport.fixture.year).slice(2)}.01`);
    // Numerical production/pickup/cancellation reconciliation is the separate real PF report flow.
  });

  test("8.19-23 원본 CSV·Excel 동일12열·전건ID·시각·정역거래와 실제 인증gate", async ({ page, request, actors, historicalExport }, info) => {
    const backfill = await request.post("/api/admin/audit-csv/backfill", { headers: headers(actors) });
    expect(backfill.ok(), await backfill.text()).toBeTruthy();
    const expectedRows = rawDatabaseRows(historicalExport.fixture.month);
    await openAdmin(page, actors, "내보내기");
    await page.getByRole("button", { name: "내부 원본 로그", exact: true }).click();
    await chooseMonth(page, "대상 월", historicalExport.fixture.month);
    const csv = await downloadedRows(await clickDownload(page, /년 .*월 CSV 다운로드$/), info);
    expect(csv.rows[0]).toEqual(rawHeaders);
    expect(sorted(csv.rows.slice(1))).toEqual(sorted(expectedRows));
    expect(new Set(csv.rows.slice(1).map((row) => row[11])).size).toBe(expectedRows.length);
    await page.getByRole("group", { name: "원본 로그 파일 형식", exact: true }).getByRole("button", { name: "Excel", exact: true }).click();
    const xlsx = await downloadedRows(await clickDownload(page, /년 .*월 Excel 다운로드$/), info);
    expect(xlsx.rows).toEqual(csv.rows);
    for (const [index, logId] of historicalExport.fixture.logIds.entries()) {
      const row = csv.rows.find((value) => value[11] === logId);
      expect(row?.[0]).toBe(historicalExport.fixture.dates[index].replace("T", " "));
      const fetched = await request.get(`/api/inventory/transactions?log_id=${logId}&include_archived=true`);
      expect(fetched.ok()).toBe(true);
      const log = (await fetched.json())[0];
      expect(log.log_id).toBe(logId);
      if (index === 3) expect(log.reverses_log_id).toBe(historicalExport.fixture.logIds[2]);
    }
    const employeePage = await page.context().newPage();
    try {
      await loginUi(employeePage, actors.requester); await employeePage.goto("/mes?tab=admin");
      await expect(employeePage.getByText("관리자 인증", { exact: true })).toBeVisible();
      await expect(employeePage.getByTestId("admin-export-section")).toHaveCount(0);
      const denied = await employeePage.request.get(`/api/admin/audit-csv/${historicalExport.fixture.month}.csv`, { headers: { "X-MES-Employee-Code": actors.requester.employee_code } });
      expect(denied.status()).toBe(400);
      const deniedExcel = await employeePage.request.get(`/api/admin/audit-csv/${historicalExport.fixture.month}.xlsx`, { headers: { "X-MES-Employee-Code": actors.requester.employee_code } });
      expect(deniedExcel.status()).toBe(400);
    } finally { await employeePage.close(); }
  });

  test("8.19-24 8.19-25 실제 엔진전용7문제 전건원인·현재기대·안정ID·재검사DB불변·수동검토", async ({ page, request, actors }, info) => {
    const ids: string[] = [];
    try {
      for (let index = 0; index < 7; index += 1) {
        const created = await request.post("/api/items", { headers: headers(actors), data: { item_name: `QA 진단 ${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 0 } });
        expect(created.ok(), await created.text()).toBeTruthy(); ids.push((await created.json()).item_id);
      }
      setInventoryMismatch(ids, true);
      const before = businessSnapshot();
      const loaded = page.waitForResponse((response) => response.url().endsWith("/api/admin/inventory-integrity") && response.ok());
      await openAdmin(page, actors, "정합성");
      const result = await (await loaded).json();
      const check = result.checks.find((value: { check_id: string }) => value.check_id === "INVENTORY_TOTAL_MISMATCH");
      expect(check.samples.filter((sample: { item_id: string }) => ids.includes(sample.item_id))).toHaveLength(7);
      const issues = page.locator(".admin-integrity-results li");
      for (const itemId of ids) {
        const issue = issues.filter({ hasText: itemId });
        await expect(issue).toHaveCount(1);
        await expect(issue.getByRole("heading", { name: "전체 재고 합계 불일치", exact: true })).toBeVisible();
        await expect(issue).toContainText("현재 전체 재고 1");
        await expect(issue).toContainText("계산된 전체 재고 0");
        await expect(issue).toContainText("수동 검토 필요");
        await expect(issue).toContainText("이 화면에서는 복구하지 않습니다.");
      }
      await expect(page.locator(".admin-integrity-summary")).toContainText(`발견 문제 ${result.blocking_count + result.warning_count}건`);
      await expect(page.locator(".admin-integrity-summary")).toContainText(`차단 ${result.blocking_count}건 · 경고 ${result.warning_count}건`);
      await expect(page.getByText("발견된 정합성 문제가 없습니다.", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /복구|적용/ })).toHaveCount(0);
      const identities = await issues.locator(".admin-integrity-issue-meta span:nth-child(2)").allTextContents();
      const reloaded = page.waitForResponse((response) => response.url().endsWith("/api/admin/inventory-integrity") && response.ok());
      await page.getByRole("button", { name: "다시 검사", exact: true }).click(); await reloaded;
      await expect.poll(() => issues.locator(".admin-integrity-issue-meta span:nth-child(2)").allTextContents()).toEqual(identities);
      expect(businessSnapshot()).toEqual(before);
      await info.attach("actual-engine-seven-problems", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    } finally { if (ids.length) setInventoryMismatch(ids, false); }
  });

  test("PC-DELTA-ADMINAUDIT-01 현재단말 동일UUID 이름변경과 변경당시 감사 CSV·Excel 실제파일", async ({ page, actors }, info) => {
    await openAdmin(page, actors, "내보내기");
    await page.getByRole("button", { name: "내부 원본 로그", exact: true }).click();
    await page.getByRole("button", { name: "작업 감사 로그", exact: true }).click();
    const controls = page.getByTestId("activity-audit-controls");
    const name = controls.getByRole("textbox", { name: "현재 단말명", exact: true });
    const save = controls.getByRole("button", { name: "단말명 등록", exact: true });
    await name.fill("   "); await expect(save).toBeDisabled();
    const terminalId = await page.evaluate(() => localStorage.getItem("dexcowin_mes_audit_terminal"));
    expect(terminalId).toMatch(/^[0-9a-f-]{36}$/);
    const names = [`검수 PC, "이전" ${randomUUID().slice(0, 4)}`, `검수 PC, "현재" ${randomUUID().slice(0, 4)}`];
    for (const terminalName of names) {
      const saved = page.waitForResponse((response) => response.url().endsWith("/activity-audit/terminals/current") && response.request().method() === "PUT");
      await name.fill(` ${terminalName} `); await save.click();
      expect((await saved).status()).toBe(200);
      await expect(controls.getByRole("status")).toHaveText(`현재 단말명을 ${terminalName}로 등록했습니다.`);
      await expect(name).toHaveValue(terminalName);
    }
    expect(await page.evaluate(() => localStorage.getItem("dexcowin_mes_audit_terminal"))).toBe(terminalId);
    await expect.poll(() => terminalFacts(terminalId!).rows.length).toBe(2);
    const facts = terminalFacts(terminalId!);
    expect(facts.terminals).toEqual([{ id: terminalId, name: names[1] }]);
    expect(facts.rows.map((row) => row.terminalName)).toEqual(names);
    expect(facts.rows.map((row) => row.employeeCode)).toEqual(Array(2).fill(actors.approver.employee_code));
    const month = today().slice(0, 7);
    await chooseMonth(page, "작업 감사 대상 월", month);
    const csv = await downloadedRows(await clickDownload(page, /작업 감사 CSV 다운로드$/), info);
    expect(csv.rows[0]).toEqual(activityHeaders);
    const target = csv.rows.filter((row) => row[11] === terminalId && row[6] === "감사 단말 등록/변경");
    expect(target).toHaveLength(2);
    expect(target.map((row) => row[3])).toEqual(names);
    expect(target.map((row) => row[2])).toEqual(Array(2).fill(actors.approver.employee_code));
    expect(target.map((row) => row[4])).toEqual(["데스크톱", "데스크톱"]);
    expect(target.map((row) => row[7])).toEqual(["성공", "성공"]);
    for (const row of target) { expect(row[5]).not.toBe(""); expect(row[9]).not.toBe(""); expect(row[10]).not.toBe(""); }
    await controls.getByRole("group", { name: "작업 감사 파일 형식", exact: true }).getByRole("button", { name: "Excel", exact: true }).click();
    const xlsx = await downloadedRows(await clickDownload(page, /작업 감사 Excel 다운로드$/), info);
    expect(xlsx.rows[0]).toEqual(activityHeaders);
    expect(xlsx.rows.filter((row) => row[11] === terminalId && row[6] === "감사 단말 등록/변경")).toEqual(target);
  });

  test("PC-DELTA-ADMINAUDIT-01 주입 서버오류는 등록·다운로드 성공을 표시하지 않음", async ({ page, actors }) => {
    await openAdmin(page, actors, "내보내기");
    await page.getByRole("button", { name: "내부 원본 로그", exact: true }).click();
    await page.getByRole("button", { name: "작업 감사 로그", exact: true }).click();
    await page.route("**/api/admin/activity-audit/terminals/current", (route) => route.fulfill({ status: 500, json: { detail: "단말 등록에 실패했습니다. 다시 시도해 주세요." } }));
    const controls = page.getByTestId("activity-audit-controls");
    await controls.getByRole("textbox", { name: "현재 단말명", exact: true }).fill("실패 검수 단말");
    await controls.getByRole("button", { name: "단말명 등록", exact: true }).click();
    await expect(controls.getByRole("alert")).toContainText("다시 시도");
    await expect(controls.getByRole("status")).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "단말명 등록", exact: true })).toBeEnabled();
    // Injected error branch is separate from the real API/file tests above.
  });

  test("PC-DELTA-ADMINAUDIT-01 실제 오래된단말 형식 자동복구는 직원·감사세션을 보존", async ({ page, actors }) => {
    await openAdmin(page, actors, "내보내기");
    await page.getByRole("button", { name: "내부 원본 로그", exact: true }).click();
    await page.getByRole("button", { name: "작업 감사 로그", exact: true }).click();
    const before = await page.evaluate(() => {
      localStorage.setItem("dexcowin_mes_audit_terminal", "legacy-terminal-2025");
      return { operator: sessionStorage.getItem("dexcowin_mes_operator"), session: sessionStorage.getItem("dexcowin_mes_audit_session") };
    });
    const name = `이전 단말 복구 ${randomUUID().slice(0, 5)}`;
    const saved = page.waitForResponse((response) => response.url().endsWith("/activity-audit/terminals/current") && response.request().method() === "PUT");
    const controls = page.getByTestId("activity-audit-controls");
    await controls.getByRole("textbox", { name: "현재 단말명", exact: true }).fill(name);
    await controls.getByRole("button", { name: "단말명 등록", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(controls.getByRole("status")).toHaveText(`현재 단말명을 ${name}로 등록했습니다.`);
    const after = await page.evaluate(() => ({ terminal: localStorage.getItem("dexcowin_mes_audit_terminal"), operator: sessionStorage.getItem("dexcowin_mes_operator"), session: sessionStorage.getItem("dexcowin_mes_audit_session") }));
    expect(after.terminal).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect({ operator: after.operator, session: after.session }).toEqual(before);
    expect(terminalFacts(after.terminal!).terminals).toEqual([{ id: after.terminal, name }]);
    expect(terminalFacts("legacy-terminal-2025").terminals).toHaveLength(0);
  });
});
