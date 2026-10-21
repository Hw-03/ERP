import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { loginAsOperator } from "./_helpers";

test("관리자 CSV 범위와 공식 서식을 실제 다운로드한다", async ({ page }, testInfo) => {
  await loginAsOperator(page, { code: "E01" });
  await page.goto("/mes?tab=admin");
  const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
  for (let index = 0; index < 4; index += 1) await zero.click();
  await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "내보내기", exact: true }).click();
  for (const scope of ["입출고", "직원", "BOM"]) {
    await page.getByRole("group", { name: "데이터 범위" }).getByRole("button", { name: scope, exact: true }).click();
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: `${scope} CSV 다운로드`, exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    expect((await readFile(path, "utf8")).trim().length).toBeGreaterThan(10);
  }
  for (const name of ["F704-02 대장 다운로드", "F705-02 생산일지 다운로드"]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    expect((await readFile(path)).subarray(0, 2).toString()).toBe("PK");
  }
});
