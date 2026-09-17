import { expect, test } from "@playwright/test";
import { loginAsOperator, readSeed } from "./_helpers";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsOperator(page, { role: "warehouse" });
});

test("전역 검색 없이 기존 품목 상세를 주소 변경 없이 연다", async ({ page }) => {
  const { rawItem } = readSeed();
  await page.goto("/mes?tab=dashboard");
  await expect(page.getByRole("textbox", { name: "자재 검색" })).toBeVisible();
  await expect(page.getByRole("button", { name: "화면·품목 검색" })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "화면 이름 또는 품목명·코드" })).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(rawItem.item_name) }).first().click();
  await expect(page.getByRole("dialog", { name: rawItem.item_name, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=dashboard$/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: rawItem.item_name, exact: true })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByPlaceholder("품명 · 코드 · 위치 · 공급처").fill(rawItem.item_name);
  await page.getByRole("button", { name: new RegExp(rawItem.item_name) }).first().click();
  await expect(page.getByRole("dialog", { name: `${rawItem.item_name} 상세`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=dashboard$/);
  await page.getByRole("button", { name: "시트 닫기 핸들" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("빈 검색 초기화와 없는 페이지 복구를 유지한다", async ({ page }) => {
  await page.goto("/mes?tab=dashboard");
  const filter = page.getByRole("textbox", { name: "자재 검색" });
  await filter.fill("일치하지않는검색어");
  await expect(page.getByText("검색 결과가 없습니다", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "검색 지우기", exact: true }).click();
  await expect(filter).toHaveValue("");
  await page.goto("/page-that-does-not-exist");
  await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
  await page.getByRole("link", { name: "대시보드로" }).click();
  await expect(page.getByRole("textbox", { name: "자재 검색" })).toBeVisible();
});

test("최초 재고 조회 실패를 해당 조회의 재시도로 복구", async ({ page }) => {
  let failing = true;
  await page.route("**/api/items?**", async (route) => {
    if (failing && new URL(route.request().url()).searchParams.get("limit") === "2000") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "검증용 조회 실패" }) });
    } else await route.continue();
  });
  await page.goto("/mes?tab=dashboard");
  const retry = page.getByRole("button", { name: "다시 시도", exact: true });
  await expect(retry).toBeVisible();
  failing = false;
  await retry.click();
  await expect(page.getByRole("button", { name: new RegExp(readSeed().rawItem.item_name) }).first()).toBeVisible();
});
