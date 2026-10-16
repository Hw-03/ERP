import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, loginUi, type CommonActors } from "./_common-expectations";
import { fixturePython } from "./_admin-export-expectations";

const ADMIN = { "X-Admin-Pin": "0000" };
type Part = { item_id: string; item_name: string };
async function createFixture(request: APIRequestContext): Promise<{ parent: Part; children: Part[] }> {
  const parts: Part[] = [];
  const name = `QA 구성검수 ${randomUUID().slice(0, 7)}`;
  for (const [index, code] of ["AA", "TR", "HR"].entries()) {
    const response = await request.post("/api/items", { headers: ADMIN, data: {
      item_name: `${name}-${index}`, process_type_code: code, unit: "EA", model_slots: [1], initial_quantity: 0,
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    parts.push(await response.json());
  }
  for (const child of parts.slice(1)) {
    const response = await request.post("/api/bom", { headers: ADMIN, data: {
      parent_item_id: parts[0].item_id, child_item_id: child.item_id, quantity: 2, unit: "EA",
    } });
    expect(response.status(), await response.text()).toBe(201);
  }
  return { parent: parts[0], children: parts.slice(1) };
}
async function currentRows(request: APIRequestContext, parentId: string) {
  const response = await request.get(`/api/bom/${parentId}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function openBom(page: Page, actors: CommonActors, parent: Part) {
  await loginUi(page, actors.approver);
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) {
    for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  }
  await navigation.getByRole("button", { name: "BOM 관리", exact: true }).click();
  const parentList = page.getByText("상위 품목 선택", { exact: true }).locator("..").locator("..");
  await parentList.getByPlaceholder("품목명 / 코드 검색").fill(parent.item_name);
  await parentList.locator("button[data-bom-row-surface]").filter({ hasText: parent.item_name }).click();
  await expect(page.getByText("현재 구성 (2건)", { exact: true })).toBeVisible();
}
function childRow(page: Page, name: string) {
  return page.locator("div[data-bom-row-surface]").filter({ hasText: name });
}
async function quantity(page: Page, name: string, value: string) {
  const row = childRow(page, name);
  await row.getByTitle("클릭하여 수량 수정").click();
  await row.getByRole("spinbutton").fill(value);
  await row.getByRole("spinbutton").press("Enter");
}

test("BOM 8.19-19 여러 오류·실패 초안을 유지하고 전체 구성을 한 요청으로 저장", async ({ page, request, actors }) => {
  const { parent, children } = await createFixture(request);
  const before = await currentRows(request, parent.item_id);
  await openBom(page, actors, parent);
  await quantity(page, children[0].item_name, "0.5");
  await quantity(page, children[1].item_name, "-1");
  const errors = page.getByRole("alert").filter({ hasText: "양의 정수" });
  await expect(errors).toContainText(children[0].item_name);
  await expect(errors).toContainText(children[1].item_name);
  await expect(page.getByRole("button", { name: "구성 저장", exact: true })).toBeDisabled();
  expect(await currentRows(request, parent.item_id)).toEqual(before);
  await quantity(page, children[0].item_name, "3");
  await quantity(page, children[1].item_name, "4");
  expect(await currentRows(request, parent.item_id)).toEqual(before);
  const endpoint = `**/api/bom/${parent.item_id}`;
  await page.route(endpoint, async route => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "검수 저장 실패" }) });
    else await route.continue();
  });
  await page.getByRole("button", { name: "구성 저장", exact: true }).click();
  await expect(page.locator('p[role="alert"]').filter({ hasText: "검수 저장 실패" })).toBeVisible();
  await expect(childRow(page, children[0].item_name).getByTitle("클릭하여 수량 수정")).toHaveText("3EA");
  await expect(childRow(page, children[1].item_name).getByTitle("클릭하여 수량 수정")).toHaveText("4EA");
  expect(await currentRows(request, parent.item_id)).toEqual(before);
  await page.unroute(endpoint);
  let saves = 0;
  page.on("request", incoming => { if (incoming.method() === "PUT" && incoming.url().endsWith(`/api/bom/${parent.item_id}`)) saves++; });
  await page.getByRole("button", { name: "구성 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "구성 저장", exact: true })).toBeDisabled();
  await expect.poll(async () => (await currentRows(request, parent.item_id)).map((row: { quantity: number }) => row.quantity).sort()).toEqual([3, 4]);
  expect(saves).toBe(1);
  expect((await currentRows(request, parent.item_id)).map((row: { bom_id: string }) => row.bom_id).sort()).toEqual(before.map((row: { bom_id: string }) => row.bom_id).sort());
});

test("BOM 8.19-17/18/19 두 탭 충돌·완료 잠금·해제 실패 재시도·전체 변경 이력 보존", async ({ page, context, request, actors }) => {
  const { parent, children } = await createFixture(request);
  await openBom(page, actors, parent);
  const other = await context.newPage();
  await openBom(other, actors, parent);
  await quantity(page, children[0].item_name, "3");
  await quantity(other, children[0].item_name, "5");
  await other.getByRole("button", { name: "구성 저장", exact: true }).click();
  await expect.poll(async () => (await currentRows(request, parent.item_id)).find((row: { child_item_id: string }) => row.child_item_id === children[0].item_id).quantity).toBe(5);
  const conflict = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/api/bom/${parent.item_id}`));
  await page.getByRole("button", { name: "구성 저장", exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.locator('p[role="alert"]').filter({ hasText: "다른 작업" })).toBeVisible();
  await expect(childRow(page, children[0].item_name).getByTitle("클릭하여 수량 수정")).toHaveText("3EA");
  await page.getByRole("button", { name: "변경 취소", exact: true }).click();
  await expect(childRow(page, children[0].item_name).getByTitle("클릭하여 수량 수정")).toHaveText("5EA");
  await quantity(other, children[0].item_name, "7");
  await childRow(other, children[0].item_name).getByTitle("클릭하여 수량 수정").click();
  await childRow(other, children[0].item_name).getByRole("spinbutton").fill("8");
  await page.getByRole("button", { name: /검토.*완료/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "완료로 표시", exact: true }).click();
  await expect(childRow(page, children[0].item_name).getByTitle("클릭하여 수량 수정")).toBeDisabled();
  await expect(childRow(other, children[0].item_name).getByTitle("클릭하여 수량 수정")).toHaveText("5EA");
  await expect(childRow(other, children[0].item_name).getByTitle("클릭하여 수량 수정")).toBeDisabled();
  await expect(childRow(other, children[0].item_name).getByRole("spinbutton")).toHaveCount(0);
  const rows = await currentRows(request, parent.item_id);
  expect((await request.put(`/api/bom/${parent.item_id}`, { headers: ADMIN, data: { expected_rows: rows, rows: [] } })).status()).toBe(409);
  await page.getByRole("button", { name: /검토.*완료/ }).click();
  const endpoint = `**/api/items/${parent.item_id}/bom-completion`;
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "완료 해제 검수 실패" }) }));
  await page.getByRole("dialog").getByRole("button", { name: "완료 해제", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("완료 해제 검수 실패");
  expect(await currentRows(request, parent.item_id)).toEqual(rows);
  await page.unroute(endpoint);
  await page.getByRole("dialog").getByRole("button", { name: "완료 해제", exact: true }).click();
  await expect(childRow(page, children[0].item_name).getByTitle("클릭하여 수량 수정")).toBeEnabled();
  await quantity(page, children[0].item_name, "6");
  await page.getByRole("button", { name: "구성 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "구성 저장", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /검토.*완료/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "완료로 표시", exact: true }).click();
  await expect(childRow(page, children[0].item_name).getByTitle("클릭하여 수량 수정")).toBeDisabled();
  const audits = await (await request.get("/api/admin/audit-logs?limit=2000", { headers: ADMIN })).json();
  const target = audits.filter((row: { target_id: string; action: string }) => row.target_id === parent.item_id && ["bom.replace", "item.bom_completion"].includes(row.action));
  expect(target.filter((row: { action: string }) => row.action === "bom.replace")).toHaveLength(2);
  expect(target.filter((row: { action: string }) => row.action === "item.bom_completion")).toHaveLength(3);
  expect(target.every((row: { created_at: string; request_id: string }) => row.created_at && row.request_id)).toBe(true);
  const storedActors = fixturePython<string[]>([
    "import json,os,uuid", "from app.database import SessionLocal", "from app.models import AdminAuditLog",
    "v=json.loads(os.environ['EXPORT_FIXTURE'])", "db=SessionLocal()", "try:",
    "    rows=db.query(AdminAuditLog).filter(AdminAuditLog.audit_id.in_([uuid.UUID(value) for value in v['ids']])).all()",
    "    print(json.dumps([row.actor_employee_code for row in rows]))", "finally:", "    db.close()",
  ].join("\n"), { ids: target.map((row: { audit_id: string }) => row.audit_id) });
  expect(storedActors).toHaveLength(5);
  expect(storedActors.every(code => code === actors.approver.employee_code)).toBe(true);
  await other.close();
});

test("BOM 8.19-17 부서 상태별 모집단·완료 구성·사용처 건수와 편집 필터 복원", async ({ page, request, actors }) => {
  const fixture = await createFixture(request);
  const completed = await createFixture(request);
  expect((await request.patch(`/api/items/${completed.parent.item_id}/bom-completion`, { headers: ADMIN, data: { completed: true } })).status()).toBe(200);
  const extras: Part[] = [];
  for (const code of ["AF", "AA"]) {
    const response = await request.post("/api/items", { headers: ADMIN, data: {
      item_name: `QA 구성상태 ${code} ${randomUUID().slice(0, 7)}`, process_type_code: code, unit: "EA", model_slots: [1], initial_quantity: 0,
    } });
    expect(response.status()).toBe(201);
    extras.push(await response.json());
  }
  expect((await request.post("/api/bom", { headers: ADMIN, data: {
    parent_item_id: extras[0].item_id, child_item_id: fixture.parent.item_id, quantity: 7, unit: "EA",
  } })).status()).toBe(201);
  const items = await (await request.get("/api/items?limit=2000")).json();
  const allRows = await (await request.get("/api/bom")).json();
  const parents = items.filter((item: { deleted_at: string | null; process_type_code: string }) =>
    !item.deleted_at && item.process_type_code.startsWith("A") && !item.process_type_code.endsWith("R"));
  const withChildren = new Set(allRows.map((row: { parent_item_id: string }) => row.parent_item_id));
  const populations = [
    { label: "전체", rows: parents },
    { label: "완료", rows: parents.filter((item: { bom_completed_at: string | null }) => item.bom_completed_at) },
    { label: "작업중", rows: parents.filter((item: { item_id: string; bom_completed_at: string | null }) => !item.bom_completed_at && withChildren.has(item.item_id)) },
    { label: "미착수", rows: parents.filter((item: { item_id: string; bom_completed_at: string | null }) => !item.bom_completed_at && !withChildren.has(item.item_id)) },
  ];
  await openBom(page, actors, fixture.parent);
  const parentList = page.getByText("상위 품목 선택", { exact: true }).locator("..").locator("..");
  const search = parentList.getByPlaceholder("품목명 / 코드 검색");
  await search.fill("");
  for (const population of populations) {
    const card = page.getByRole("button", { name: new RegExp(`^${population.label}\\s*${population.rows.length}$`) });
    await expect(card).toBeVisible();
    await card.click();
    await expect(parentList.locator("button[data-bom-row-surface]")).toHaveCount(population.rows.length);
    expect((await parentList.locator("[data-bom-row-label]").allTextContents()).sort()).toEqual(population.rows.map((item: Part) => item.item_name).sort());
  }
  await page.getByRole("button", { name: new RegExp(`^완료\\s*${populations[1].rows.length}$`) }).click();
  await parentList.locator("button[data-bom-row-surface]").filter({ hasText: completed.parent.item_name }).click();
  await expect(page.getByText("현재 구성 (2건)", { exact: true })).toBeVisible();
  for (const child of completed.children) {
    await expect(childRow(page, child.item_name).getByTitle("클릭하여 수량 수정")).toHaveText("2EA");
    await expect(childRow(page, child.item_name).getByTitle("클릭하여 수량 수정")).toBeDisabled();
    await expect(childRow(page, child.item_name).getByTitle("삭제", { exact: true })).toBeDisabled();
  }
  await page.getByRole("button", { name: new RegExp(`^전체\\s*${parents.length}$`) }).click();
  await parentList.getByRole("button", { name: "중간공정", exact: true }).click();
  await search.fill(fixture.parent.item_name);
  const selected = parentList.locator("button[data-bom-row-surface]").filter({ hasText: fixture.parent.item_name });
  await selected.click();
  await page.getByRole("group", { name: "BOM 보기 방식" }).getByRole("button", { name: "사용처", exact: true }).click();
  await expect(page.getByText("사용처 (1건)", { exact: true })).toBeVisible();
  const used = page.getByTitle("이 부모로 이동 (편집 모드)");
  await expect(used).toHaveCount(1);
  await expect(used).toContainText(extras[0].item_name);
  await expect(used).toContainText("7EA");
  await page.getByRole("group", { name: "BOM 보기 방식" }).getByRole("button", { name: "편집", exact: true }).click();
  await expect(search).toHaveValue(fixture.parent.item_name);
  await expect(page.getByTestId("bom-department-filters").getByRole("button", { name: "조립", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(parentList.getByRole("button", { name: "중간공정", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("현재 구성 (2건)", { exact: true })).toBeVisible();
  expect(await (await request.get("/api/bom")).json()).toEqual(allRows);
});
