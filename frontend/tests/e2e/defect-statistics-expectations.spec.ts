import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { readSeed } from "./_helpers";

const ADMIN = { "X-Admin-Pin": "0000" };
async function json(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function fixture(request: APIRequestContext, actors: CommonActors) {
  const name = `통계 검수 ${randomUUID().slice(0, 7)}`;
  const reasonResponse = await request.post("/api/defects/reason-categories", { data: {
    requester_employee_id: actors.requester.employee_id, name,
  } });
  expect(reasonResponse.status()).toBe(201);
  const reason = await reasonResponse.json();
  const seed = await json(request, `/api/items/${readSeed().rawItem.item_id}`);
  const models = await json(request, "/api/models");
  const model = models.find((row: { slot: number }) => seed.model_slots.includes(row.slot));
  const otherModel = models.find((row: { slot: number; model_name: string }) => row.slot !== model.slot && row.model_name);
  expect(otherModel).toBeTruthy();
  const items = [];
  for (const [index, department] of ["튜브", "조립"].entries()) {
    const response = await request.post("/api/items", { headers: ADMIN, data: {
      item_name: `${name}-${index}`, process_type_code: index ? "AR" : "TR", unit: "EA", initial_quantity: 20,
      model_slots: [index ? otherModel.slot : model.slot],
    } });
    expect(response.status()).toBe(201);
    const item = await response.json(); items.push(item);
    const submitted = await request.post("/api/stock-requests", { data: {
      requester_employee_id: actors.requester.employee_id, request_type: "warehouse_to_dept",
      lines: [{ item_id: item.item_id, quantity: 15, from_bucket: "warehouse", to_bucket: "production", to_department: department }],
    } });
    expect(submitted.status()).toBe(201);
    const work = await submitted.json();
    expect((await request.post(`/api/stock-requests/${work.request_id}/approve`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } })).status()).toBe(200);
    for (const [category, quantity] of [["DEFECT", 2], ["B_GRADE", 3], ["OBSOLETE", 4]] as const) {
      const quarantined = await request.post("/api/defects/quarantine", { data: {
        actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: quantity,
        source: "production", source_dept: department, target_dept: department,
        management_category: category, reason_category_id: reason.category_id, reason_memo: `${name}-${category}`,
      } });
      expect(quarantined.status(), await quarantined.text()).toBe(200);
    }
  }
  const records = (await json(request, "/api/defects/locations")).filter((row: { item_id: string }) => items.some(item => item.item_id === row.item_id));
  return { items, model, reason, records };
}

async function reportAfter(page: Page, action: () => Promise<unknown>, filters: Record<string, string | null>) {
  const pending = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === "/api/defects/statistics/report" && request.method() === "GET"
      && Object.entries(filters).every(([key, value]) => url.searchParams.get(key) === value);
  });
  await action();
  const response = await (await pending).response();
  expect(response).not.toBeNull();
  expect(response!.ok(), await response!.text()).toBeTruthy();
  return response!.json();
}

test("DEFECT-STATS 8.11-01/03/04/05/06/07 최초 세분류·카드 차트 순위·필터 유지·분류변경과 부분전량 복귀", async ({ page, request, actors }) => {
  const data = await fixture(request, actors);
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 통계", visible: true }).click();
  await expect(page.getByRole("heading", { name: "불량 통계", exact: true })).toBeVisible();
  const selectedReason = page.getByRole("button", { name: `사유 ${data.reason.name} 선택`, exact: true });
  const filters: Record<string, string | null> = { period: "month", reason_category_id: data.reason.category_id, department: null, model: null, process_step: null };
  const report = (action: () => Promise<unknown>) => reportAfter(page, action, filters);
  const original = await report(() => selectedReason.click());
  expect(original.summary).toMatchObject({ quantity: 18, record_count: 6 });
  expect(original.items.map((row: { item_id: string; quantity: number; record_count: number }) => ({ id: row.item_id, qty: row.quantity, count: row.record_count })))
    .toEqual(data.items.map(item => ({ id: item.item_id, qty: 9, count: 3 })));
  const categories = page.getByRole("table", { name: "최초 발생 분류별 집계", exact: true });
  await expect(categories.getByRole("row")).toHaveText([
    "최초 분류발생 수량발생 건수이전 수량이전 건수", "불량4개2건0개0건", "B급6개2건0개0건", "구형8개2건0개0건",
  ]);
  const card = page.getByRole("article").filter({ has: page.getByText("전체 발생 수량", { exact: true }) });
  await expect(card).toContainText("18개"); await expect(card).toContainText("6건 등록");
  await expect(page.getByText(/발생 시각의 원래 수량과 최초 발생 분류/)).toBeVisible();
  for (const collection of [original.categories, original.items, original.reasons, original.departments, original.timeline]) {
    expect(collection.reduce((total: number, row: { quantity: number }) => total + row.quantity, 0)).toBe(18);
    expect(collection.reduce((total: number, row: { record_count: number }) => total + row.record_count, 0)).toBe(6);
  }
  await expect(page.getByRole("list", { name: "부서별 집계 목록" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "사유별 집계 목록" }).getByRole("listitem")).toHaveCount(1);
  for (const department of ["튜브", "조립"]) await expect(page.getByRole("button", { name: `부서 ${department} 선택`, exact: true })).toContainText("9개 · 50% · 3건");
  await expect(selectedReason).toContainText("18개 · 100% · 6건");
  const ranked = page.getByRole("region", { name: "품목 비교 스크롤 영역" }).getByRole("row").filter({ has: page.getByRole("button") });
  expect(await ranked.getByRole("button").allTextContents()).toEqual(original.items.map((row: { label: string; mes_code: string }) => row.label + row.mes_code));
  for (const row of await ranked.all()) {
    await expect(row.getByRole("cell").nth(1)).toHaveText("9개");
    await expect(row.getByRole("cell").nth(2)).toHaveText("3건");
  }
  await page.getByRole("button", { name: "선택 기간 상세", exact: true }).click();
  const bars = page.locator(".recharts-bar-rectangle path");
  await expect(bars).toHaveCount(1);
  await bars.hover();
  await expect(page.locator(".recharts-tooltip-wrapper")).toContainText("18");
  const repeated = await report(() => page.getByRole("button", { name: "새로고침", exact: true }).click());
  expect(repeated.items).toEqual(original.items);
  await page.getByRole("button", { name: "분류 조건 펼치기", exact: true }).click();
  filters.department = "튜브";
  let filtered = await report(() => page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "튜브", exact: true }).click());
  filters.model = data.model.model_name;
  filtered = await report(() => page.getByRole("group", { name: "모델 구분" }).getByRole("button", { name: data.model.model_name, exact: true }).click());
  filters.process_step = "R";
  filtered = await report(() => page.getByRole("group", { name: "공정 구분" }).getByRole("button", { name: "원자재", exact: true }).click());
  expect(filtered.summary).toMatchObject({ quantity: 9, record_count: 3 });
  expect(filtered.items.map((row: { item_id: string }) => row.item_id)).toEqual([data.items[0].item_id]);
  for (const collection of [filtered.categories, filtered.items, filtered.reasons, filtered.departments, filtered.timeline]) {
    expect(collection.reduce((total: number, row: { quantity: number }) => total + row.quantity, 0)).toBe(9);
    expect(collection.reduce((total: number, row: { record_count: number }) => total + row.record_count, 0)).toBe(3);
  }
  await expect(card).toContainText("9개"); await expect(card).toContainText("3건 등록");
  await expect(page.getByRole("list", { name: "부서별 집계 목록" }).getByRole("listitem")).toHaveCount(1);
  await expect(selectedReason).toContainText("9개 · 100% · 3건");
  await expect(ranked).toHaveCount(1);
  await expect(ranked.getByRole("cell").nth(1)).toHaveText("9개");
  await expect(ranked.getByRole("cell").nth(2)).toHaveText("3건");
  await expect(bars).toHaveCount(1);
  await bars.hover();
  await expect(page.locator(".recharts-tooltip-wrapper")).toContainText("9");
  for (const label of ["주간", "연간", "월간"]) {
    filters.period = ({ 주간: "week", 연간: "year", 월간: "month" } as Record<string, string>)[label];
    const result = await report(() => page.getByRole("group", { name: "조회 기간" }).getByRole("button", { name: label, exact: true }).click());
    expect(result.summary).toMatchObject({ quantity: 9, record_count: 3 });
    expect(result.departments.map((row: { label: string }) => row.label)).toEqual(["튜브"]);
    await expect(page.getByRole("button", { name: "부서 튜브 ×", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `모델 ${data.model.model_name} ×`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "공정 원자재 ×", exact: true })).toBeVisible();
    await expect(card).toContainText("9개");
  }
  const origin = data.records.find((row: { item_id: string; management_category: string }) => row.item_id === data.items[0].item_id && row.management_category === "B_GRADE");
  expect((await request.put(`/api/defects/records/${origin.record_id}/management-category`, { data: {
    actor_employee_id: actors.requester.employee_id, pin: "0000", management_category: "OBSOLETE", expected_management_category: "B_GRADE", memo: "통계 최초분류 보존 확인",
  } })).status()).toBe(200);
  for (const quantity of [1, 2]) {
    const restored = await request.post("/api/defects/unquarantine", { data: {
      actor_employee_id: actors.requester.employee_id, record_id: origin.record_id, item_id: data.items[0].item_id,
      qty: quantity, dept: "튜브", reason_category: "검사 통과", reason_memo: "발생 통계 불변 검수",
    } });
    expect(restored.status(), await restored.text()).toBe(200);
    const unchanged = await report(() => page.getByRole("button", { name: "새로고침", exact: true }).click());
    expect(unchanged.summary).toEqual(filtered.summary);
    expect(unchanged.categories).toEqual(filtered.categories);
    expect(unchanged.items).toEqual(filtered.items);
    await expect(categories.getByRole("row")).toHaveText([
      "최초 분류발생 수량발생 건수이전 수량이전 건수", "불량2개1건0개0건", "B급3개1건0개0건", "구형4개1건0개0건",
    ]);
  }
  const remaining = await json(request, "/api/defects/locations");
  expect(remaining.some((row: { record_id: string }) => row.record_id === origin.record_id)).toBe(false);
  for (const key of ["reason_category_id", "department", "model", "process_step"]) filters[key] = null;
  await report(() => page.getByRole("button", { name: "전체 초기화", exact: true }).first().click());
  await expect(page.getByRole("button", { name: "부서 튜브 ×", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `모델 ${data.model.model_name} ×`, exact: true })).toHaveCount(0);
  filters.reason_category_id = data.reason.category_id;
  const reset = await report(() => selectedReason.click());
  expect(reset.summary).toMatchObject({ quantity: 18, record_count: 6 });
});
