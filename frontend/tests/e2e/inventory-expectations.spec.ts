import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi, logoutUi } from "./_common-expectations";

const admin = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };

async function createItem(request: APIRequestContext, process = "TR", quantity = 13): Promise<Item> {
  const response = await request.post("/api/items", { headers: admin, data: {
    item_name: `재고검수${randomUUID().slice(0, 8)}`, process_type_code: process, unit: "EA",
    model_slots: [1], initial_quantity: quantity,
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function search(page: Page) {
  return page.locator('input[aria-label="자재 검색"]:not(:disabled),input[placeholder="품명 · 코드 · 위치 · 공급처"]:not(:disabled)').filter({ visible: true });
}
function row(page: Page, name: string) { return page.locator("tr[role=button]").filter({ hasText: name }); }
function detail(page: Page, name: string) { return page.getByRole("dialog", { name: new RegExp(name) }); }
async function revealInventoryRows(page: Page, count: number): Promise<void> {
  await expect.poll(async () => {
    const sentinel = page.getByTestId("inventory-list-card").locator('table + div[aria-hidden="true"]');
    // 다음 묶음이 렌더되면 사라지는 표식은 조회와 스크롤을 같은 DOM 작업에서 처리한다.
    await sentinel.evaluateAll(elements => elements[0]?.scrollIntoView({ block: "end" }));
    return page.locator("tr[role=button]").count();
  }).toBe(count);
}
async function openItem(page: Page, item: Item): Promise<void> {
  await search(page).fill(item.item_name);
  await expect(row(page, item.item_name)).toHaveCount(1);
  await row(page, item.item_name).click();
  await expect(detail(page, item.item_name)).toBeVisible();
  await expect(detail(page, item.item_name).getByRole("button", { name: "출고", exact: true })).toBeEnabled();
}

test("ITEM01 실제 PC·모바일 새로고침은 검색·품목·열림과 닫힘을 서버 재조회로 복원", async ({ page, request, actors }) => {
  const item = await createItem(request);
  await loginUi(page, actors.requester);
  await openItem(page, item);
  let reads = 0;
  page.on("request", (response) => { if (new URL(response.url()).pathname === `/api/items/${item.item_id}`) reads += 1; });
  await page.reload();
  await expect(search(page)).toHaveValue(item.item_name);
  await expect(detail(page, item.item_name)).toBeVisible();
  await expect(detail(page, item.item_name).getByRole("button", { name: "출고", exact: true })).toBeEnabled();
  expect(reads).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(search(page)).toHaveValue(item.item_name);
  await expect(detail(page, item.item_name)).toBeVisible();
  await detail(page, item.item_name).getByRole("tab", { name: "최근 내역", exact: true }).click();
  await expect(detail(page, item.item_name).getByRole("tabpanel", { name: "최근 내역", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail(page, item.item_name)).toBeHidden();
  await page.reload();
  await expect(search(page)).toHaveValue(item.item_name);
  await expect(detail(page, item.item_name)).toBeHidden();
  await expect(row(page, item.item_name)).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(search(page)).toHaveValue(item.item_name);
  await expect(detail(page, item.item_name)).toBeHidden();
});

test("ITEM01 다른 직원 로그인은 앞 직원의 검색·선택 상세를 노출하지 않음", async ({ page, request, actors }) => {
  const item = await createItem(request);
  await loginUi(page, actors.requester);
  await openItem(page, item);
  await page.keyboard.press("Escape");
  await logoutUi(page, actors.requester);
  await loginUi(page, actors.other);
  await expect(search(page)).toHaveValue("");
  await expect(detail(page, item.item_name)).toBeHidden();
  const current = await page.evaluate(() => JSON.parse(sessionStorage.getItem("dexcowin_mes_operator") ?? "null"));
  expect(current.employee_id).toBe(actors.other.employee_id);
});

test("ITEM02 미사용 품목의 실제 삭제 SSE는 상세·이력 조회를 유지하고 작업만 차단", async ({ page, request, actors }) => {
  const item = await createItem(request, "TR", 0);
  const before = await (await request.get(`/api/items/${item.item_id}`)).json();
  await loginUi(page, actors.requester);
  await openItem(page, item);
  const deleted = await request.patch(`/api/items/${item.item_id}/soft-delete`, { headers: admin });
  expect(deleted.ok(), await deleted.text()).toBeTruthy();
  await expect(detail(page, item.item_name)).toBeVisible();
  await expect(detail(page, item.item_name)).toContainText("삭제된 품목입니다. 입출고 작업을 할 수 없습니다.");
  await expect(detail(page, item.item_name).getByRole("button", { name: "입고", exact: true })).toBeDisabled();
  await expect(detail(page, item.item_name).getByRole("button", { name: "출고", exact: true })).toBeDisabled();
  await expect(row(page, item.item_name)).toHaveCount(0);
  await detail(page, item.item_name).getByRole("tab", { name: "최근 내역", exact: true }).click();
  const history = detail(page, item.item_name).getByRole("tabpanel", { name: "최근 내역", exact: true });
  await expect(history).toContainText("최근 입출고 내역이 없습니다.");
  const response = await request.get(`/api/items/${item.item_id}`);
  const after = await response.json();
  expect(after.deleted_at).toBeTruthy();
  expect(after.warehouse_qty).toBe(before.warehouse_qty);
});

test("ITEM02 과거 삭제 품목의 기존 거래는 서버·최근 내역에서 보존되고 신규 요청은 거부", async ({ page, request, actors }) => {
  const item = await createItem(request);
  const historyUrl = `/api/inventory/transactions?item_id=${item.item_id}`;
  const before = await (await request.get(historyUrl)).json();
  expect(before).toHaveLength(1);
  await loginUi(page, actors.requester); await openItem(page, item);
  // An old imported deleted item can retain history; today's admin delete guard
  // intentionally forbids creating that state through a new deletion request.
  const backend = path.resolve(__dirname, "../../../backend");
  const database = path.join(backend, "mes_e2e.db");
  if (!fs.existsSync(database) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) throw new Error("isolated fixture required");
  const seeded = spawnSync("python", ["-c", "import os,sqlite3;from datetime import datetime;db=sqlite3.connect(os.environ['LEGACY_DATABASE']);cursor=db.execute('UPDATE items SET deleted_at=? WHERE item_id=?',(datetime.utcnow().isoformat(),os.environ['LEGACY_ITEM'].replace('-','')));assert cursor.rowcount==1;db.commit();db.close()"], {
    cwd: backend, windowsHide: true, encoding: "utf8", env: { ...process.env, LEGACY_DATABASE: database, LEGACY_ITEM: item.item_id },
  });
  expect(seeded.status, seeded.stderr).toBe(0);
  expect((await (await request.get(`/api/items/${item.item_id}`)).json()).deleted_at).toBeTruthy();
  await page.reload();
  const panel = detail(page, item.item_name);
  await expect(panel).toContainText("삭제된 품목입니다.");
  await panel.getByRole("tab", { name: "최근 내역", exact: true }).click();
  await expect(panel.getByRole("tabpanel", { name: "최근 내역", exact: true })).toContainText("원자재 입고");
  expect(await (await request.get(historyUrl)).json()).toEqual(before);
  const rejected = await request.post("/api/io/preview", { data: {
    requester_employee_id: actors.requester.employee_id, work_type: "warehouse_io", sub_type: "warehouse_to_dept",
    targets: [{ source_kind: "direct_item", item_id: item.item_id, quantity: 1 }],
  } });
  expect(rejected.status()).toBe(422);
  expect(await rejected.text()).toContain("삭제");
  expect(await (await request.get(historyUrl)).json()).toEqual(before);
});

test("DASHBOARD02 최근 작업은 한국어로 표시하며 사진과 부분 조회 실패를 닫아도 검색·선택 유지", async ({ page, request, actors }) => {
  const item = await createItem(request);
  const manifest = await (await request.get("/images/items/manifest.json")).json();
  const filename = Object.values(manifest)[0];
  expect(typeof filename).toBe("string");
  // Only image selection is projected; the file and item/history APIs remain real.
  await page.route("**/images/items/manifest.json", (route) => route.fulfill({ json: { [item.mes_code!]: filename } }));
  await loginUi(page, actors.requester);
  await openItem(page, item);
  const panel = detail(page, item.item_name);
  await panel.getByRole("button", { name: `${item.item_name} 이미지 확대`, exact: true }).click();
  const lightbox = page.getByRole("dialog", { name: "이미지 확대 보기", exact: true });
  await expect(lightbox).toBeVisible();
  await expect.poll(() => lightbox.locator("img").evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await lightbox.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(search(page)).toHaveValue(item.item_name);
  await page.route("**/api/inventory/operations?**", (route) => route.fulfill({ status: 503, json: { detail: "QA recent history failure" } }));
  await panel.getByRole("tab", { name: "최근 내역", exact: true }).click();
  await expect(panel.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
  await expect(panel).toContainText(item.item_name);
  await page.unroute("**/api/inventory/operations?**");
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  const history = panel.getByRole("tabpanel", { name: "최근 내역", exact: true });
  await expect(history).toContainText("원자재 입고");
  await expect(history).not.toContainText("INITIAL_STOCK");
  await expect(history).not.toContainText("RECEIVE");
  await panel.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await expect(search(page)).toHaveValue(item.item_name);
  await expect(row(page, item.item_name)).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/tab=dashboard/);
});

test("ITEM02 404·권한·통신 오류 주입은 삭제와 구분하고 같은 품목 재시도로 복구", async ({ page, request, actors }) => {
  const item = await createItem(request);
  await loginUi(page, actors.requester);
  await openItem(page, item);
  for (const [status, message] of [[404, "품목을 찾을 수 없습니다."], [403, "품목 조회 권한을 확인하지 못했습니다."], [503, "품목 상세를 불러오지 못했습니다."]] as const) {
    await page.route(`**/api/items/${item.item_id}`, (route) => route.fulfill({ status, json: { detail: "QA isolated read failure" } }));
    await page.reload();
    await expect(detail(page, item.item_name)).toBeVisible();
    await expect(detail(page, item.item_name)).toContainText(message);
    await expect(detail(page, item.item_name)).not.toContainText("삭제된 품목입니다");
    await expect(detail(page, item.item_name).getByRole("button", { name: "출고", exact: true })).toBeDisabled();
    await page.unroute(`**/api/items/${item.item_id}`);
    await detail(page, item.item_name).getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(detail(page, item.item_name).getByRole("button", { name: "출고", exact: true })).toBeEnabled();
    await expect(detail(page, item.item_name)).not.toContainText(message);
  }
});

test("DASHBOARD01 실제 KPI·목록은 PA·PF 제외 동일 모집단이며 검색0·초기화가 일치", async ({ page, request, actors }) => {
  const item = await createItem(request);
  const pf = await createItem(request, "PF");
  await loginUi(page, actors.requester);
  await search(page).fill(item.item_name);
  await expect(row(page, item.item_name)).toHaveCount(1);
  await expect(page.getByRole("button", { name: /전체 1 전체 .*PA·PF 제외/ })).toBeVisible();
  await search(page).fill(pf.item_name);
  await expect(row(page, pf.item_name)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /전체 0 전체 .*PA·PF 제외/ })).toBeVisible();
  await expect(page.getByText("현재 조건에 맞는 자재가 없습니다", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /전체 0 전체 .*PA·PF 제외/ }).click();
  await expect(search(page)).toHaveValue("");
  await expect(page.locator("tr[role=button]")).not.toHaveCount(0);
});

test("CACHE01 실제 목록은 배경503 중 유지하고 재시도 후 새 재고를 반영", async ({ page, request, actors }) => {
  const item = await createItem(request);
  await loginUi(page, actors.requester);
  await search(page).fill(item.item_name);
  await expect(row(page, item.item_name)).toContainText("13");
  await page.route(/\/api\/items(?:\?|$)/, (route) => route.fulfill({ status: 503, json: { detail: "QA background failure" } }));
  const changed = await request.put(`/api/items/${item.item_id}`, { headers: admin, data: { min_stock: 14 } });
  expect(changed.ok(), await changed.text()).toBeTruthy();
  await expect(page.getByText(/최신 정보를 불러오지 못했습니다. 기존 내용을 표시합니다/)).toBeVisible();
  await expect(row(page, item.item_name)).toContainText("13");
  await expect(page.getByTestId("inventory-skeleton-row")).toHaveCount(0);
  await page.unroute(/\/api\/items(?:\?|$)/);
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(row(page, item.item_name)).toContainText("부족");
  await expect(page.getByText(/최신 정보를 불러오지 못했습니다. 기존 내용을 표시합니다/)).toBeHidden();
});

test("DASHBOARD01 부서·모델·공정 AND/OR와 실제 더 보기는 같은 품목 집합", async ({ page, request, actors }) => {
  test.setTimeout(120_000);
  const prefix = `필터검수${randomUUID().slice(0, 8)}`;
  const names: string[] = [];
  for (let index = 0; index < 101; index++) {
    const name = `${prefix}-${String(index).padStart(3, "0")}`;
    const response = await request.post("/api/items", { headers: admin, data: {
      item_name: name, process_type_code: index === 100 ? "AR" : "TR", unit: "EA", model_slots: [1], initial_quantity: 0,
    } });
    expect(response.ok(), await response.text()).toBeTruthy(); names.push(name);
  }
  await loginUi(page, actors.requester);
  await search(page).fill(prefix);
  const rows = page.locator("tr[role=button]");
  await revealInventoryRows(page, 100);
  const initial = await rows.allTextContents();
  await page.getByRole("button", { name: /100개 더 보기/ }).click();
  await revealInventoryRows(page, 101);
  const expanded = await rows.allTextContents();
  expect(expanded.slice(0, 100)).toEqual(initial);
  const actualNames = expanded.map(text => text.match(new RegExp(`${prefix}-\\d{3}`))?.[0]);
  expect(new Set(actualNames)).toEqual(new Set(names));
  expect(actualNames).toHaveLength(new Set(actualNames).size);
  await expect(page.getByRole("button", { name: /전체 101 전체/ })).toBeVisible();
  await page.locator('button[aria-controls="inventory-filter-panel"]').click();
  const filters = page.locator("#inventory-filter-panel");
  await filters.getByRole("button", { name: "튜브", exact: true }).click();
  await revealInventoryRows(page, 100);
  await expect(page.getByRole("button", { name: /전체 100 전체/ })).toBeVisible();
  await filters.getByRole("button", { name: "조립", exact: true }).click();
  await page.getByRole("button", { name: "AND", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole("button", { name: /전체 0 전체/ })).toBeVisible();
  await page.getByRole("button", { name: "OR", exact: true }).click();
  await expect(page.getByRole("button", { name: /전체 101 전체/ })).toBeVisible();
  await filters.getByRole("button", { name: "공정완료", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await filters.getByRole("button", { name: "원자재", exact: true }).click();
  await expect(page.getByRole("button", { name: /전체 101 전체/ })).toBeVisible();
  const models = await (await request.get("/api/models")).json();
  const first = models.find((model: { slot: number }) => model.slot === 1);
  const other = models.find((model: { slot: number; model_name: string }) => model.slot !== 1 && model.model_name);
  expect(other).toBeTruthy();
  await filters.getByRole("button", { name: other.model_name, exact: true }).click();
  await expect(rows).toHaveCount(0);
  await filters.getByRole("button", { name: first.model_name, exact: true }).click();
  await expect(page.getByRole("button", { name: /전체 101 전체/ })).toBeVisible();
  await expect(search(page)).toHaveValue(prefix);
});

test("DASHBOARD02 CACHE01 실제 격리품 이동·내역 탭 왕복은 검색·선택·받은 내역을 보존", async ({ page, request, actors }) => {
  const item = await createItem(request);
  const quarantine = await request.post("/api/defects/quarantine", { data: {
    actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 1,
    source: "warehouse", target_dept: "창고", reason_category: "외관 불량", reason_memo: "대시보드 복귀 검수",
  } });
  expect(quarantine.ok(), await quarantine.text()).toBeTruthy();
  await loginUi(page, actors.requester); await openItem(page, item);
  await detail(page, item.item_name).getByRole("button", { name: "창고 불량 1 — 불량 탭으로 이동", exact: true }).click();
  await expect(page).toHaveURL(/tab=defect/);
  await page.getByRole("complementary").getByRole("button", { name: /^대시보드(?:\s|$)/ }).click();
  await expect(search(page)).toHaveValue(item.item_name);
  await expect(detail(page, item.item_name)).toBeVisible();
  await expect(row(page, item.item_name)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("complementary").getByRole("button", { name: /^입출고 내역(?:\s|$)/ }).click();
  const historySearch = page.locator('input[placeholder="작업 · 품명 · 코드 · 담당자 · 메모"]:not(:disabled)');
  await historySearch.fill(item.item_name);
  const historyRows = page.locator('[data-history-main-row="true"]');
  await expect(historyRows).toHaveCount(2);
  const before = await historyRows.allTextContents();
  await page.getByRole("complementary").getByRole("button", { name: /^대시보드(?:\s|$)/ }).click();
  await page.getByRole("complementary").getByRole("button", { name: /^입출고 내역(?:\s|$)/ }).click();
  await expect(historySearch).toHaveValue(item.item_name);
  await expect(page.getByTestId("desktop-loading-cover")).toHaveCount(0);
  await expect(historyRows).toHaveCount(2);
  expect(await historyRows.allTextContents()).toEqual(before);
});
