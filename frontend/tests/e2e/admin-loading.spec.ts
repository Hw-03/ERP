import { expect, test } from "@playwright/test";
import { loginAsOperator } from "./_helpers";

for (const width of [1914, 1280]) {
  test(`${width}px: 품목 조회 전후 상세 탭과 삭제 위치가 같다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 883 });
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/items?**", async route => { await waiting; await route.continue(); });
    await loginAsOperator(page, { code: "E01" });
    await page.goto("/mes?tab=admin");
    const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) await zero.click();
    await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "품목 관리", exact: true }).click();
    const cover = page.getByTestId("admin-section-entry-cover");
    await expect(cover).toBeVisible();
    const before = [
      await cover.getByRole("tablist").boundingBox(),
      await cover.getByRole("button", { name: "삭제", exact: true }).boundingBox(),
      await cover.getByRole("tabpanel").boundingBox(),
    ];
    release();
    await expect(cover).toHaveCount(0);
    const after = [
      await page.getByRole("tablist").boundingBox(),
      await page.getByRole("button", { name: "삭제", exact: true }).boundingBox(),
      await page.getByRole("tabpanel").boundingBox(),
    ];
    for (let index = 0; index < before.length; index += 1) {
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(before[index]![key] - after[index]![key])).toBeLessThanOrEqual(1);
      }
    }
  });
  test(`${width}px: 직원·부서 선택은 고정 버튼 위치를 유지한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 883 });
    await loginAsOperator(page, { code: "E01" });
    await page.goto("/mes?tab=admin");
    const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) await zero.click();
    const nav = page.getByRole("navigation", { name: "관리자 섹션" });
    for (const [tab, table, action] of [
      ["직원 관리", "직원 목록", /^직원 (?:비활성화|활성화)$/],
      ["부서 관리", "부서 목록", /^부서 (?:비활성화|활성화)$/],
    ]) {
      await nav.getByRole("button", { name: tab, exact: true }).click();
      const rows = page.getByRole("grid", { name: table, exact: true }).getByRole("row");
      const button = page.getByRole("button", { name: action, exact: true });
      await expect(button).toBeVisible();
      const before = await button.boundingBox();
      for (const index of [2, 3, 1]) {
        await rows.nth(index).click();
        await expect(rows.nth(index)).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("[data-admin-detail-snapshot]")).toHaveCount(0);
        const after = await button.boundingBox();
        expect(Math.abs(before!.x - after!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(before!.y - after!.y)).toBeLessThanOrEqual(1);
      }
    }
  });
  test(`${width}px: BOM 조회 지연 중 헤더 위치를 예약한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 883 });
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/bom", async route => {
      await waiting;
      await route.continue();
    });
    await loginAsOperator(page, { code: "E01" });
    await page.goto("/mes?tab=admin");
    const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) await zero.click();
    await page.getByRole("navigation", { name: "관리자 섹션" }).getByRole("button", { name: "BOM 관리", exact: true }).click();
    const cover = page.getByTestId("admin-section-entry-cover");
    await expect(cover).toBeVisible();
    const before = await cover.getByRole("group", { name: "BOM 보기 방식" }).boundingBox();
    const searchBefore = await cover.getByPlaceholder("품목명 / 코드 검색").evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    const headersBefore = await cover.getByText("공정", { exact: true }).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
    const bottomBefore = await cover.getByText("미배치 원자재", { exact: true }).boundingBox();
    release();
    await expect(cover).toHaveCount(0);
    const after = await page.getByRole("group", { name: "BOM 보기 방식" }).boundingBox();
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(before![key] - after![key])).toBeLessThanOrEqual(1);
    }
    const searchAfter = await page.getByPlaceholder("품목명 / 코드 검색").evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(searchAfter).toHaveLength(searchBefore.length);
    for (let index = 0; index < searchBefore.length; index += 1) {
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(searchBefore[index][key] - searchAfter[index][key])).toBeLessThanOrEqual(1);
      }
    }
    const headersAfter = await page.getByText("공정", { exact: true }).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
    expect(headersAfter).toEqual(headersBefore);
    const bottomAfter = await page.getByText("미배치 원자재", { exact: true }).boundingBox();
    expect(Math.abs(bottomBefore!.y - bottomAfter!.y)).toBeLessThanOrEqual(1);
  });
}
