import { randomUUID } from "crypto";
import type { Item } from "../../lib/api";
import { test, expect, loginUi } from "./_common-expectations";

test("CONSOLE-IMAGE PC-DELTA-CONSOLE-01 실제 품목 사진의 목록·상세 크기와 비율 경고 없음", async ({ page, request, actors }) => {
  const created = await request.post("/api/items", { headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" }, data: {
    item_name: `이미지검수${randomUUID().slice(0, 8)}`, process_type_code: "TR", model_slots: [1], unit: "EA", initial_quantity: 5,
  } });
  expect(created.status(), await created.text()).toBe(201);
  const item: Item = await created.json();
  // Connect a synthetic item to the existing real, non-square photograph.
  await page.route("**/images/items/manifest.json", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), [item.mes_code!]: "7-TR-0002.jpg" } });
  });
  const warnings: string[] = [];
  const errors: string[] = [];
  page.on("console", message => {
    if (message.type() === "warning") warnings.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  await loginUi(page, actors.requester);
  await page.getByRole("textbox", { name: "자재 검색", exact: true }).filter({ visible: true }).fill(item.item_name);
  const row = page.locator("tr[role=button]").filter({ hasText: item.item_name });
  const thumbnail = row.getByRole("img", { name: item.item_name, exact: true });
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(thumbnail).toHaveCSS("object-fit", "contain");
  await row.click();
  const detail = page.getByRole("dialog", { name: item.item_name, exact: true });
  const photo = detail.getByRole("img", { name: item.item_name, exact: true });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(photo).toHaveCSS("object-fit", "contain");
  expect(await thumbnail.evaluate((img: HTMLImageElement) => ({ width: img.width, height: img.height }))).toEqual({ width: 48, height: 48 });
  expect(await photo.evaluate((img: HTMLImageElement) => ({ width: img.width, height: img.height }))).toEqual({ width: 160, height: 160 });
  expect(warnings.filter(text => /aspect|width.*height|height.*width/i.test(text))).toEqual([]);
  expect(errors).toEqual([]);
});
