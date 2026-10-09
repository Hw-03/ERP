import { randomUUID } from "crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

async function read(request: APIRequestContext, url: string): Promise<unknown> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function stock(request: APIRequestContext, itemId: string) {
  return {
    item: await read(request, `/api/items/${itemId}`),
    cells: await read(request, `/api/inventory/locations/${itemId}`),
    records: (await read(request, "/api/defects/locations") as { item_id: string }[]).filter((row) => row.item_id === itemId),
    logs: await read(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`),
  };
}

async function sidebar(page: Page, name: string): Promise<void> {
  await page.getByRole("complementary").getByRole("button").filter({ has: page.getByText(name, { exact: true }) }).click();
}

async function openScrap(page: Page): Promise<void> {
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
  await choices.getByRole("button", { name: /^즉시 폐기/ }).click();
  await choices.getByRole("button", { name: /^창고 재고/ }).click();
  await expect(page.getByTestId("defect-picker-pane").filter({ visible: true })).toBeVisible();
}

test.use({ trace: "retain-on-failure" });

test("PC-DELTA-DEFECT-03 두 행 사유·기타메모는 실제 Back·새로고침·메뉴 머무르기에 보존되고 나가기는 처리 호출 없이 버린다", async ({ page, request, actors }) => {
  const items: Item[] = [];
  for (let index = 0; index < 2; index++) {
    const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `이탈초안${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 10,
    } });
    expect(response.status(), await response.text()).toBe(201);
    items.push(await response.json());
  }
  const before = await Promise.all(items.map((item) => stock(request, item.item_id)));
  await loginUi(page, actors.requester);
  await expect(page).toHaveURL(/tab=dashboard/);
  const dashboardDepth = await page.evaluate(() => history.length);
  await sidebar(page, "불량");
  await openScrap(page);
  const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
  await picker.getByRole("combobox").nth(0).click();
  await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  for (const item of items) {
    await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code!);
    await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
  }
  const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
  const categories = ["외관 불량", "기타"];
  const memos = ["첫 행 외관 사유 보존", "둘째 행 기타 상세 보존"];
  for (let index = 0; index < items.length; index++) {
    await cart.getByRole("spinbutton").nth(index).fill(String(index + 2));
    await cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).nth(index).click();
    await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: categories[index], exact: true }).click();
    await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").nth(index).fill(memos[index]);
  }
  const mutations: string[] = [];
  page.on("request", (outgoing) => {
    const url = new URL(outgoing.url());
    if (outgoing.method() === "POST" && (url.pathname.startsWith("/api/defects/") || url.pathname === "/api/stock-requests")) mutations.push(url.pathname);
  });
  const assertDraft = async (): Promise<void> => {
    await expect(cart.getByRole("spinbutton")).toHaveCount(2);
    for (let index = 0; index < items.length; index++) {
      await expect(cart).toContainText(items[index].item_name);
      await expect(cart.getByRole("spinbutton").nth(index)).toHaveValue(String(index + 2));
      await expect(cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).nth(index)).toHaveText(categories[index]);
      await expect(cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").nth(index)).toHaveValue(memos[index]);
    }
    await expect(page.getByRole("button", { name: /^즉시 폐기 \(2건\) →$/ }).filter({ visible: true })).toBeEnabled();
  };
  await assertDraft();
  const draftUrl = page.url();
  const exitDepth = (await page.evaluate(() => history.length)) - dashboardDepth;
  expect(exitDepth).toBeGreaterThan(0);
  await page.evaluate((depth) => history.go(-depth), exitDepth);
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "계속 머무르기", exact: true }).click();
  await expect(page).toHaveURL(draftUrl);
  await assertDraft();
  const beforeUnload = page.waitForEvent("dialog");
  await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
  const refreshDialog = await beforeUnload;
  expect(refreshDialog.type()).toBe("beforeunload");
  await refreshDialog.dismiss();
  await expect(page).toHaveURL(draftUrl);
  await assertDraft();
  await sidebar(page, "대시보드");
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "계속 머무르기", exact: true }).click();
  await assertDraft();
  expect(mutations).toEqual([]);
  expect(await Promise.all(items.map((item) => stock(request, item.item_id)))).toEqual(before);
  await sidebar(page, "대시보드");
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await expect(page).toHaveURL(/tab=dashboard/);
  await expect(cart).toHaveCount(0);
  expect(mutations).toEqual([]);
  expect(await Promise.all(items.map((item) => stock(request, item.item_id)))).toEqual(before);
  await sidebar(page, "불량");
  await openScrap(page);
  await expect(cart.getByRole("spinbutton")).toHaveCount(0);
  await expect(cart).toContainText("왼쪽에서 품목을 추가하세요.");
  expect(mutations).toEqual([]);
});
