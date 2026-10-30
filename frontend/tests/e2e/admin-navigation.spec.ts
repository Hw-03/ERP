import { expect, test, type Page } from "@playwright/test";
import { loginAsOperator } from "./_helpers";
import { readFile } from "node:fs/promises";

async function openAdmin(page: Page): Promise<void> {
  await loginAsOperator(page, { code: "E01" });
  await page.goto("/mes?tab=admin");
  const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
  for (let index = 0; index < 4; index += 1) await zero.click();
  await expect(page.getByRole("navigation", { name: "관리자 섹션" })).toBeVisible();
}

test.describe("관리자 상단 탭", () => {
  test("품목 CSV와 Excel을 실제 파일로 내려받는다", async ({ page }, testInfo) => {
    await openAdmin(page);
    await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "내보내기", exact: true }).click();
    await page.getByRole("group", { name: "데이터 범위" }).getByRole("button", { name: "품목", exact: true }).click();
    for (const format of ["CSV", "Excel"]) {
      await page.getByRole("group", { name: "파일 형식" }).getByRole("button", { name: format, exact: true }).click();
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: `품목 ${format} 다운로드`, exact: true }).click();
      const download = await downloadEvent;
      const name = download.suggestedFilename();
      expect(name).toMatch(format === "CSV" ? /^items_.*\.csv$/ : /\.xlsx$/);
      const path = testInfo.outputPath(name);
      await download.saveAs(path);
      const bytes = await readFile(path);
      if (format === "CSV") {
        expect(bytes.toString("utf8")).toContain("품목 코드");
        expect(bytes.toString("utf8").trim().split(/\r?\n/).length).toBeGreaterThan(1);
      } else {
        expect(bytes.subarray(0, 2).toString()).toBe("PK");
        expect(bytes.length).toBeGreaterThan(1000);
      }
    }
  });

  test("모델 저장 실패 후에도 입력을 유지하고 재시도한다", async ({ page }) => {
    await openAdmin(page);
    const name = page.getByRole("textbox").filter({ visible: true }).first();
    const save = page.getByRole("button", { name: "저장", exact: true });
    const form = page.locator("fieldset").filter({ has: name });
    const waitForSave = () => page.waitForResponse(response =>
      new URL(response.url()).pathname.startsWith("/api/models/") && response.request().method() === "PUT");
    const original = await name.inputValue();
    await name.fill(`${original} QA`);
    await page.route("**/api/models/*", async route => {
      if (route.request().method() === "PUT") {
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"QA save unavailable"}' });
      } else await route.continue();
    });
    const [failed] = await Promise.all([waitForSave(), save.click()]);
    expect(failed.status()).toBe(503);
    await expect(form).toHaveAttribute("aria-busy", "false");
    await expect(name).toHaveValue(`${original} QA`);
    await expect(save).toBeEnabled();
    await page.unroute("**/api/models/*");
    const [retried] = await Promise.all([waitForSave(), save.click()]);
    expect(retried.ok()).toBeTruthy();
    await expect(form).toHaveAttribute("aria-busy", "false");
    await expect(name).toHaveValue(`${original} QA`);
    await expect(save).toBeDisabled();
    await name.fill(original);
    const [restored] = await Promise.all([waitForSave(), save.click()]);
    expect(restored.ok()).toBeTruthy();
    await expect(form).toHaveAttribute("aria-busy", "false");
    await expect(name).toHaveValue(original);
    await expect(save).toBeDisabled();
  });

  test("PIN 잠금 해제 후 모든 섹션을 순회한다", async ({ page }) => {
    await loginAsOperator(page, { code: "E01" });
    await page.goto("/mes?tab=admin");

    const zeroKey = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) {
      await zeroKey.click();
    }

    const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
    await expect(navigation).toBeVisible();

    for (const label of [
      "모델 관리",
      "품목 관리",
      "직원 관리",
      "부서 관리",
      "BOM 관리",
      "내보내기",
      "정합성",
      "보안",
    ]) {
      const tab = navigation.getByRole("button", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-current", "page");
    }

  });

  for (const width of [1914, 1280]) {
    test(`${width}px: 준비된 품목·BOM 재진입과 메뉴·필터를 확인한다`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 883 });
      await openAdmin(page);
      const nav = page.getByRole("navigation", { name: "관리자 섹션" });
      const samples: Record<string, number[]> = { "품목 관리": [], "BOM 관리": [] };
      for (let round = 0; round < 11; round += 1) {
        for (const label of Object.keys(samples)) {
          const start = Date.now();
          await nav.getByRole("button", { name: label, exact: true }).click();
          await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
          await expect(page.getByTestId("admin-section-entry-cover")).toHaveCount(0);
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          if (round) samples[label].push(Date.now() - start);
        }
      }
      const results = Object.fromEntries(Object.entries(samples).map(([name, times]) => {
        const sorted = [...times].sort((a, b) => a - b);
        return [name, { times, median: (sorted[4] + sorted[5]) / 2, p95: sorted[9] }];
      }));
      await testInfo.attach("warm-navigation-ms", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
      console.log(JSON.stringify({ width, warmNavigation: results }));
      for (const group of ["상위 품목 단계 필터", "상위 품목 부서 필터"]) {
        const buttons = page.getByRole("group", { name: group, exact: true }).getByRole("button");
        for (let i = 0; i < await buttons.count(); i += 1) await buttons.nth(i).click();
        await buttons.first().click();
      }
      await page.getByRole("button", { name: "사용처", exact: true }).click();
      await expect(page.getByRole("group", { name: "상위 품목 단계 필터", exact: true }).getByRole("button", { name: "원자재", exact: true })).toBeVisible();
      await nav.getByRole("button", { name: "품목 관리", exact: true }).click();
      await nav.getByRole("button", { name: "BOM 관리", exact: true }).click();
      await expect(page.getByRole("group", { name: "상위 품목 단계 필터", exact: true }).getByRole("button", { name: "원자재", exact: true })).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
      await page.getByRole("button", { name: "편집", exact: true }).click();
      await expect(page.locator("[data-admin-detail-snapshot]")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`bom-${width}.png`) });
    });

    test(`${width}px: 모델 전환은 프레임을 유지하고 수정 중 선택을 보호한다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 883 });
      await openAdmin(page);
      const nav = page.getByRole("navigation", { name: "관리자 섹션" });
      await nav.getByRole("button", { name: "모델 관리", exact: true }).click();
      const rows = page.getByRole("row").filter({ visible: true });
      await expect(rows.nth(1)).toBeVisible();
      const remove = page.getByRole("button", { name: "이 모델 삭제", exact: true });
      await expect(remove).toBeVisible();
      const before = await remove.boundingBox();
      await rows.nth(2).click();
      await expect(remove).toBeVisible();
      const after = await remove.boundingBox();
      expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(before!.y - after!.y)).toBeLessThanOrEqual(1);
      const name = page.getByRole("textbox").filter({ visible: true }).first();
      await name.fill("QA-UNSAVED");
      await rows.nth(1).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "계속 작성", exact: true }).click();
      await expect(name).toHaveValue("QA-UNSAVED");
    });
  }
});
