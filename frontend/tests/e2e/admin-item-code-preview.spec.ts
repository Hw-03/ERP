import { randomUUID } from "crypto";
import type { Page } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";

async function unlockItems(page: Page): Promise<void> {
  await page.goto("/mes?tab=admin");
  const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
  if (!await navigation.isVisible()) {
    for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
  }
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: "품목 관리", exact: true }).click();
}

test.use({ trace: "retain-on-failure" });

test("8.19-05 실제 모델·카테고리 변경의 정확한 미리보기와 저장 코드가 같다", async ({ page, request, actors }) => {
  const modelsResponse = await request.get("/api/models");
  expect(modelsResponse.status()).toBe(200);
  const models: { slot: number; symbol: string; model_name: string }[] = await modelsResponse.json();
  const first = models.find((model) => model.slot === 1)!;
  const second = models.find((model) => model.slot === 2)!;
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000", "X-MES-Employee-Code": actors.approver.employee_code }, data: {
    item_name: `코드미리보기${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [first.slot], unit: "EA", initial_quantity: 0,
  } });
  expect(created.status()).toBe(201);
  const item = await created.json();
  await loginUi(page, actors.approver);
  await unlockItems(page);
  const row = page.locator(`[data-item-id="${item.item_id}"]`);
  if (await row.getAttribute("aria-selected") !== "true") await row.click();
  const preview = page.locator("[aria-readonly]");
  await expect(preview).toHaveText(item.mes_code);
  await page.getByRole("button", { name: `${first.model_name} (${first.symbol})`, exact: true }).click();
  await page.getByRole("button", { name: `${second.model_name} (${second.symbol})`, exact: true }).click();
  await expect(preview).toHaveText(`${second.symbol}-TR-${String(item.serial_no).padStart(4, "0")}`);
  const modelPreview = await preview.innerText();
  const modelWrite = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const modelResult = await modelWrite;
  expect(modelResult.status()).toBe(200);
  expect((await modelResult.json()).mes_code).toBe(modelPreview);
  await expect(row).toContainText(modelPreview);
  await page.getByPlaceholder("예: 텅스텐 필라멘트").locator("..").locator("..").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "HR — 고압 원자재", exact: true }).click();
  await expect(preview).toHaveText(new RegExp(`^${second.symbol}-HR-\\d{4}$`));
  const categoryPreview = await preview.innerText();
  const categoryWrite = page.waitForResponse((response) => response.url().endsWith(`/api/items/${item.item_id}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const categoryResult = await categoryWrite;
  expect(categoryResult.status()).toBe(200);
  expect((await categoryResult.json()).mes_code).toBe(categoryPreview);
  const persisted = await request.get(`/api/items/${item.item_id}`);
  expect((await persisted.json()).mes_code).toBe(categoryPreview);
  await expect(row).toContainText(categoryPreview);
});

test("8.19-05 미리보기 조회 실패는 생성하지 않고 입력을 보존해 재조회 뒤 정확히 저장", async ({ page, request, actors }) => {
  await loginUi(page, actors.approver);
  await unlockItems(page);
  const before = await (await request.get("/api/items?limit=2000")).json();
  const name = `조회실패코드${randomUUID().slice(0, 8)}`;
  await page.route("**/api/items/code-preview?**", (route) => route.fulfill({ status: 503, json: { detail: "코드 조회 검수 실패" } }));
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await page.getByPlaceholder("예: 텅스텐 필라멘트").fill(name);
  await page.getByRole("button", { name: /DX3000 \(3\)/ }).click();
  await page.getByRole("button", { name: "+ 위치 추가", exact: true }).click();
  await page.getByPlaceholder("수량", { exact: true }).fill("5");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("품목 코드를 확인하지 못했습니다.");
  await expect(page.getByRole("button", { name: "추가", exact: true }).last()).toBeDisabled();
  expect(await (await request.get("/api/items?limit=2000")).json()).toEqual(before);
  await page.unroute("**/api/items/code-preview?**");
  await page.getByRole("button", { name: "코드 다시 확인", exact: true }).click();
  await expect(page.locator("[aria-readonly]")).toHaveText(/^3-TR-\d{4}$/);
  const reviewed = await page.locator("[aria-readonly]").innerText();
  await expect(page.getByPlaceholder("예: 텅스텐 필라멘트")).toHaveValue(name);
  await expect(page.getByPlaceholder("수량", { exact: true })).toHaveValue("5");
  const write = page.waitForResponse((response) => response.url().endsWith("/api/items") && response.request().method() === "POST");
  await page.getByRole("button", { name: "추가", exact: true }).last().click();
  const response = await write;
  expect(response.status()).toBe(201);
  const created = await response.json();
  expect(created.mes_code).toBe(reviewed);
  const persisted = await (await request.get(`/api/items/${created.item_id}`)).json();
  expect(persisted.warehouse_qty).toBe(5);
  await expect(page.locator(`[data-item-id="${created.item_id}"]`)).toContainText(reviewed);
});
