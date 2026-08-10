/**
 * 창고 수량보정 입출고 — 창고 정·부 전용 즉시 반영 흐름.
 *
 * 전용 mes_e2e.db에서 데스크톱 보정 입고와 모바일 보정 출고를 차례로 제출한다.
 * 실제 mes.db는 globalSetup/globalTeardown의 해시 가드로 변경되지 않는다.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  advanceToQuantityStep,
  clickNextStep,
  gotoWarehouseCompose,
  loginAsOperator,
  pickWorkType,
} from "./_helpers";

async function visible(locator: Locator): Promise<Locator> {
  return locator.filter({ visible: true }).first();
}

async function stockValue(page: Page, label: string): Promise<number> {
  const labelNode = await visible(page.getByText(label, { exact: true }));
  const raw = await labelNode.locator("..").locator("div").nth(1).innerText();
  return Number(raw.replaceAll(",", ""));
}

async function addItemAndWaitForPreview(page: Page, itemButton: Locator): Promise<void> {
  const previewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/io/preview")
      && response.request().method() === "POST",
  );
  await itemButton.click();
  expect((await previewResponse).ok()).toBe(true);
}

test.describe.serial("입출고 V2 — 창고 수량보정", () => {
  test("데스크톱 보정 입고 → 즉시 완료 → 창고 ADJUST 이력", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOperator(page, { role: "warehouse" });
    await gotoWarehouseCompose(page);

    const adjustCard = await visible(
      page.getByRole("button", { name: /수량보정 입출고/ }),
    );
    const warehouseIoCard = await visible(
      page.getByRole("button", { name: /창고 입출고/ }),
    );
    const adjustBox = await adjustCard.boundingBox();
    const warehouseIoBox = await warehouseIoCard.boundingBox();
    expect(adjustBox).not.toBeNull();
    expect(warehouseIoBox).not.toBeNull();
    expect(adjustBox?.width).toBeCloseTo(warehouseIoBox?.width ?? 0, 0);
    expect(adjustBox?.height).toBeCloseTo(warehouseIoBox?.height ?? 0, 0);

    await adjustCard.click();
    const inbound = await visible(page.getByRole("button", { name: "입고", exact: true }));
    const outbound = await visible(page.getByRole("button", { name: "출고", exact: true }));
    expect((await inbound.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await outbound.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText("대상 부서", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText("출발 부서", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText("도착 부서", { exact: true }).filter({ visible: true })).toHaveCount(0);

    await inbound.click();
    await clickNextStep(page);
    await addItemAndWaitForPreview(
      page,
      page
        .getByRole("row", { name: /E2E원자재튜브/ })
        .getByRole("button", { name: "선택", exact: true }),
    );
    await expect(
      page.getByRole("button", { name: /수량 조정/ }).filter({ visible: true }).first(),
    ).toBeEnabled();
    await advanceToQuantityStep(page);

    await expect(page.getByText("보정 입고", { exact: true }).filter({ visible: true })).toBeVisible();
    const before = await stockValue(page, "현재 창고");
    const after = await stockValue(page, "실행 후");
    expect(after - before).toBe(1);

    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    await expect(page.getByText("즉시 재고 반영", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /결재 요청/ }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole("button", { name: /즉시 반영하기/ }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog", { name: /창고 보정 입고를 진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "즉시 반영", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /입출고 반영 완료/ })).toBeVisible();

    const response = await page.request.get(
      "/api/inventory/transactions?search=E2E원자재튜브&transaction_types=ADJUST",
    );
    expect(response.ok()).toBe(true);
    const logs: Array<Record<string, unknown>> = await response.json();
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transaction_type: "ADJUST",
          department: "창고",
          warehouse_qty_before: expect.any(Number),
          warehouse_qty_after: expect.any(Number),
        }),
      ]),
    );

    await page.getByRole("button", { name: "확인", exact: true }).click();
    await page.goto("/mes?tab=history");
    await expect(page.getByText("수량 조정", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("창고", { exact: true }).first()).toBeVisible();
  });

  test("모바일 보정 출고 → 압축 입력 → 즉시 완료", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsOperator(page, { role: "warehouse" });
    await gotoWarehouseCompose(page);

    const adjustCard = await visible(
      page.getByRole("button", { name: /수량보정 입출고/ }),
    );
    expect((await adjustCard.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await adjustCard.click();

    const outbound = await visible(page.getByRole("button", { name: "출고", exact: true }));
    expect((await outbound.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText("대상 부서", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await outbound.click();
    await clickNextStep(page);

    const search = await visible(page.getByPlaceholder("품목명 또는 코드"));
    await search.fill("E2E원자재튜브");
    await addItemAndWaitForPreview(
      page,
      await visible(page.getByRole("button", { name: /E2E원자재튜브/ })),
    );

    await expect(page.getByText("보정 출고 품목", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(
      page.getByText(/현재 창고 .*가용 .*보정 -1 .*예정/).filter({ visible: true }),
    ).toBeVisible();
    const review = await visible(page.getByRole("button", { name: /최종 검토/ }));
    expect((await review.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await review.click();

    await expect(page.getByText("즉시 재고 반영", { exact: true }).filter({ visible: true })).toBeVisible();
    const submit = await visible(page.getByRole("button", { name: /즉시 반영하기/ }));
    expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await submit.click();
    await expect(page.getByRole("dialog", { name: /창고 보정 출고를 진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "즉시 반영", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /입출고 반영 완료/ })).toBeVisible();
  });
});
