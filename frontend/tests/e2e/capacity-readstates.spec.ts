import type { Locator, Page, Route } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { clickNextStep } from "./_helpers";
import type { BOMTreeNode } from "../../lib/api/types/catalog";
import type { ProductionCapacity } from "../../lib/api/types/production";
import { getModelLabel } from "../../lib/mes/model-labels";
import { formatQty } from "../../lib/mes/format";
import { randomUUID } from "crypto";

test.use({ trace: "retain-on-failure" });

type ReadPhase = "hold" | "error" | "empty";
type ReadScenario = {
  tab: string; matches: (url: URL) => boolean; empty: (url: URL) => unknown;
  enter: (page: Page, actors: CommonActors) => Promise<void>;
  loading: (page: Page) => Locator; emptyLabel: string; searchLabel?: string; noResultsLabel?: string;
};

/** Inject only the selected read endpoint; authentication and navigation use the actual fixture server. */
async function scriptedRead(page: Page, scenario: ReadScenario) {
  let phase: ReadPhase = "hold";
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const handler = async (route: Route): Promise<void> => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || !scenario.matches(url)) { await route.continue(); return; }
    if (phase === "hold") await gate;
    if (phase === "error") await route.fulfill({ status: 503, json: { detail: "검수용 첫 조회 실패" } });
    else await route.fulfill({ status: 200, json: scenario.empty(url) });
  };
  await page.route("**/api/**", handler);
  return {
    setPhase(next: ReadPhase): void { phase = next; release(); },
    async dispose(): Promise<void> { release(); await page.unroute("**/api/**", handler); },
  };
}

const scenarios: ReadScenario[] = [
  { tab: "dashboard", matches: (url) => url.pathname === "/api/items", empty: () => [],
    enter: async (page) => { await page.goto("/mes?tab=dashboard"); },
    loading: (page) => page.getByRole("status").filter({ hasText: "재고 데이터를 불러오는 중" }),
    emptyLabel: "아직 등록된 자재가 없습니다", searchLabel: "자재 검색", noResultsLabel: "현재 조건에 맞는 자재가 없습니다" },
  { tab: "warehouse", matches: (url) => url.pathname === "/api/stock-requests" && url.searchParams.has("requester_employee_id"), empty: () => [],
    enter: async (page) => { await page.goto("/mes?tab=warehouse"); await page.getByRole("tab", { name: "내 요청", exact: true }).click(); },
    loading: (page) => page.getByRole("status", { name: "요청 내역을 불러오고 있습니다…", exact: true }),
    emptyLabel: "아직 제출한 요청이 없습니다." },
  { tab: "shipping", matches: (url) => url.pathname.startsWith("/api/shipping/history"),
    empty: (url) => url.pathname.endsWith("/months") ? [] : { requests: [], next_cursor: null, has_more: false },
    enter: async (page) => { await page.goto("/mes?tab=shipping"); await page.locator('[data-shipping-hub-card="history"]').click({ noWaitAfter: true }); },
    loading: (page) => page.getByRole("status", { name: "출하 이력을 불러오는 중입니다", exact: true }),
    emptyLabel: "출하 이력이 없습니다", searchLabel: "출하 이력 검색", noResultsLabel: "검색 결과가 없습니다" },
  { tab: "defect", matches: (url) => url.pathname === "/api/defects/locations", empty: () => [],
    enter: async (page) => { await page.goto("/mes?tab=defect"); await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).first().click(); },
    loading: (page) => page.getByRole("status", { name: "불량 데이터 로딩 중...", exact: true }),
    emptyLabel: "격리된 불량 재고가 없습니다.", searchLabel: "불량 검색", noResultsLabel: "검색 결과가 없습니다" },
  { tab: "history", matches: (url) => url.pathname === "/api/inventory/transactions/display-groups", empty: () => ({ groups: [], next_cursor: null, has_more: false }),
    enter: async (page) => { await page.goto("/mes?tab=history"); },
    loading: (page) => page.getByRole("table", { name: "입출고 내역 불러오는 중", exact: true }),
    emptyLabel: "아직 입출고 내역이 없습니다", searchLabel: "작업 · 품명 · 코드 · 담당자 · 메모", noResultsLabel: "현재 조건에 맞는 입출고 내역이 없습니다" },
  { tab: "admin", matches: (url) => url.pathname === "/api/employees" && url.searchParams.get("active_only") === "false", empty: () => [],
    enter: async (page) => {
      await page.goto("/mes?tab=admin");
      const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
      for (let index = 0; index < 4; index += 1) await zero.click();
      await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "직원 관리", exact: true }).click();
    },
    loading: (page) => page.getByRole("status", { name: "관리자 데이터를 불러오는 중", exact: true }),
    emptyLabel: "직원이 없습니다.", searchLabel: "이름·부서·직급 검색", noResultsLabel: "검색 결과가 없습니다." },
];

for (const scenario of scenarios) {
  test(`STATE01 ${scenario.tab} 실제 탭의 최초 로딩·첫 오류·재시도·빈 성공과 검색0을 구별`, async ({ page, actors }, info) => {
    info.annotations.push({ type: "dataMode", description: "selected read response injection; actual login and rendered tab" });
    await loginUi(page, actors.requester);
    const read = await scriptedRead(page, scenario);
    try {
      await test.step(`${scenario.tab}: 실제 화면 진입`, () => scenario.enter(page, actors));
      await test.step(`${scenario.tab}: 최초 조회 로딩`, async () => { await expect(scenario.loading(page)).toBeVisible(); });
      await expect(page.getByText(scenario.emptyLabel, { exact: true })).toHaveCount(0);
      read.setPhase("error");
      const failure = page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: "검수용 첫 조회 실패", has: page.getByRole("button", { name: "다시 시도", exact: true }) }).first();
      await expect(failure).toBeVisible();
      await expect(page.getByText(scenario.emptyLabel, { exact: true })).toHaveCount(0);
      await expect(failure.getByRole("button", { name: "다시 시도", exact: true })).toBeEnabled();
      read.setPhase("empty");
      await failure.getByRole("button", { name: "다시 시도", exact: true }).click();
      await expect(page.getByText(scenario.emptyLabel, { exact: true })).toBeVisible();
      await expect(failure).toHaveCount(0);
      if (scenario.searchLabel) {
        const input = scenario.tab === "history" || scenario.tab === "admin" ? page.getByPlaceholder(scenario.searchLabel) : page.getByRole(scenario.tab === "shipping" || scenario.tab === "defect" ? "searchbox" : "textbox", { name: scenario.searchLabel, exact: true });
        await input.fill("QA-존재하지않는검색-0");
        if (scenario.tab === "shipping") await input.press("Enter");
        await expect(page.getByText(scenario.noResultsLabel!, { exact: true })).toBeVisible();
        await expect(page.getByText(scenario.emptyLabel, { exact: true })).toHaveCount(0);
        await input.fill("");
        if (scenario.tab === "shipping") await input.press("Enter");
        await expect(page.getByText(scenario.emptyLabel, { exact: true })).toBeVisible();
      }
      await info.attach(`${scenario.tab}-read-states`, { body: await page.screenshot(), contentType: "image/png" });
    } finally { await read.dispose(); }
  });
}

test("STATE01 warehouse 실제 품목선택 검색0은 빈 요청 목록과 별도 안내", async ({ page, actors }) => {
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=warehouse");
  await page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).first().click();
  await clickNextStep(page);
  const search = page.getByPlaceholder("품목명 · 품목 코드").filter({ visible: true });
  await expect(search).toBeEnabled();
  await search.fill("QA-존재하지않는검색-0");
  await expect(page.getByText("필터에 맞는 품목 없음", { exact: true })).toBeVisible();
  await expect(page.getByText("아직 제출한 요청이 없습니다.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "필터 해제", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("필터에 맞는 품목 없음", { exact: true })).toHaveCount(0);
});

test("STATE01 reports 실제 빈 작성자와 최초 로딩·실패·PC 재시도를 구별", async ({ page, request, actors }, info) => {
  await loginUi(page, actors.requester);
  const scenario: ReadScenario = { tab: "reports", matches: (url) => url.pathname === "/api/daily-work-reports", empty: () => [], enter: async () => {}, loading: (target) => target.getByRole("status", { name: "작성자 목록 불러오는 중" }), emptyLabel: "작성된 일보가 없습니다." };
  const read = await scriptedRead(page, scenario);
  try {
    await page.goto("/mes?tab=dailyReport");
    await page.getByRole("tab", { name: "전체 일보", exact: true }).click();
    await expect(scenario.loading(page)).toBeVisible();
    await expect(page.getByText("작성된 일보가 없습니다.", { exact: true })).toHaveCount(0);
    read.setPhase("error");
    const failure = page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: "작성자 목록을 불러오지 못했습니다." });
    await expect(failure).toBeVisible();
    await expect(page.getByText("0명", { exact: true })).toHaveCount(0);
    read.setPhase("empty");
    await failure.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByText("작성된 일보가 없습니다.", { exact: true })).toBeVisible();
    await expect(failure).toHaveCount(0);
    await info.attach("reports-read-response-injection", { body: await page.screenshot(), contentType: "image/png" });
  } finally { await read.dispose(); }
  // This QA employee has no persisted report: verify the actual GET result and actual blank editor separately.
  await page.getByRole("tab", { name: "내 일보", exact: true }).click();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const response = await request.get(`/api/daily-work-reports/${actors.requester.employee_id}/${date}`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toBeNull();
  await expect(page.getByRole("textbox", { name: "작업 내역", exact: true })).toHaveValue("");
});

test("DASHBOARD04 실제 API·요약·모델·AF·PF·BOM의 수량과 구성품 소요량 일치", async ({ page, request, actors }, info) => {
  info.annotations.push({ type: "dataMode", description: "actual mes_e2e API and browser UI; no response injection" });
  const ids: Record<string, string> = {};
  const headers = { "X-Admin-Pin": "0000" };
  const suffix = randomUUID().slice(0, 8);
  for (const process of ["TR", "AF", "PA", "PF"]) {
    const created = await request.post("/api/items", { headers, data: { item_name: `생산가능검수-${suffix}-${process}`, process_type_code: process, model_slots: [1], unit: "EA", initial_quantity: 20, initial_locations: [{ department: "출하", quantity: 20 }] } });
    expect(created.ok(), await created.text()).toBe(true);
    ids[process] = (await created.json()).item_id;
  }
  for (const [parent, child, quantity] of [["AF", "TR", 3], ["PA", "AF", 2], ["PF", "PA", 1]] as const) {
    const created = await request.post("/api/bom", { headers, data: { parent_item_id: ids[parent], child_item_id: ids[child], quantity, unit: "EA" } });
    expect(created.ok(), await created.text()).toBe(true);
  }
  await loginUi(page, actors.requester);
  const response = await page.request.get("/api/production/capacity");
  expect(response.ok()).toBe(true);
  const capacity: ProductionCapacity = await response.json();
  expect(capacity.af?.auto_representatives.length).toBeGreaterThan(0);
  const af = capacity.af!;
  const representative = af.auto_representatives.find((variant) => variant.af_item_id === ids.AF)!;
  expect(representative).toBeDefined();
  const model = getModelLabel(representative.model_symbol, af.items.find((item) => item.af_item_id === representative.af_item_id)?.af_name);
  const summary = page.getByRole("button", { name: /생산 가능.*자세히 보기/ }).filter({ visible: true });
  const chip = summary.locator("span.inline-flex").filter({ has: page.getByText(model, { exact: true }) }).last();
  await expect(chip).toContainText(`${formatQty(representative.ship_ready)}/${formatQty(representative.fast_production)}/${formatQty(representative.total_production)}`);
  await summary.click();
  const models = page.getByRole("region", { name: "모델별 생산 가능수량", exact: true });
  const modelRow = models.getByRole("button").filter({ has: page.getByText(model, { exact: true }) }).first();
  await expect(modelRow.locator(":scope > span").nth(4)).toHaveText(formatQty(representative.ship_ready));
  await expect(modelRow.locator(":scope > span").nth(5)).toHaveText(formatQty(representative.fast_production));
  await expect(modelRow.locator(":scope > span").nth(6)).toHaveText(formatQty(representative.total_production));
  if (await modelRow.getAttribute("aria-expanded") === "false") await modelRow.click();
  const assembly = af.items.find((item) => item.af_item_id === representative.af_item_id)!;
  const afRow = models.getByRole("button").filter({ has: page.getByText(assembly.af_name, { exact: true }) }).first();
  await expect(afRow).toContainText(assembly.af_name);
  await expect(afRow.locator(":scope > span").nth(2)).toHaveText(formatQty(assembly.ship_ready));
  await expect(afRow.locator(":scope > span").nth(3)).toHaveText(formatQty(assembly.fast_production));
  await expect(afRow.locator(":scope > span").nth(4)).toHaveText(formatQty(assembly.total_production));
  if (await afRow.getAttribute("aria-expanded") === "false") await afRow.click();
  const bom = models.getByRole("button", { name: `${representative.pf_name || representative.pf_code} BOM 확인`, exact: true });
  await expect(bom).toBeEnabled();
  await bom.click();
  const workspace = page.getByRole("region", { name: "선택한 출하 완제품 BOM", exact: true });
  await expect(workspace).toContainText(representative.pf_name);
  for (const [label, quantity] of [["출하 대기", representative.ship_ready], ["빠른 생산", representative.fast_production], ["총생산", representative.total_production]] as const) {
    await expect(workspace.getByText(label, { exact: true }).locator("..")).toContainText(formatQty(quantity));
  }
  const treeResponse = await page.request.get(`/api/bom/${representative.pf_item_id}/tree?department_order=desc`);
  expect(treeResponse.ok()).toBe(true);
  const tree: BOMTreeNode = await treeResponse.json();
  expect(tree.children.length).toBeGreaterThan(0);
  for (const child of tree.children) {
    const row = workspace.locator('[data-testid="bom-modal-row"][data-depth="0"]').filter({ hasText: child.item_name }).first();
    const columns = row.locator(":scope > .bom-modal-grid > span");
    await expect(columns.nth(3)).toHaveText(`${formatQty(child.required_quantity, { maximumFractionDigits: 2, trimTrailingZeros: true })} ${child.unit}`);
    await expect(columns.nth(4)).toHaveText(child.warehouse_stock == null ? "—" : `${formatQty(child.warehouse_stock)} ${child.unit}`);
    await expect(columns.nth(5)).toHaveText(child.department_stock == null ? "—" : `${formatQty(child.department_stock)} ${child.unit}`);
    await expect(columns.nth(6)).toHaveText(`${formatQty(child.current_stock)} ${child.unit}`);
  }
  await info.attach("capacity-actual-api", { body: JSON.stringify({ capacity, tree }), contentType: "application/json" });
  await info.attach("capacity-pf-bom", { body: await page.screenshot(), contentType: "image/png" });
  await workspace.getByRole("button", { name: "생산 가능수량으로 돌아가기", exact: true }).click();
  await expect(models).toBeVisible();
});
