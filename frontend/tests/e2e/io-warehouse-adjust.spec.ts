/**
 * 창고 수량보정 입출고 — 창고 정·부 전용 즉시 반영 흐름.
 *
 * 전용 mes_e2e.db에서 데스크톱 보정 입고와 모바일 보정 출고를 차례로 제출한다.
 * 실제 mes.db는 globalSetup과 캡처된 teardown의 해시 가드로 변경되지 않는다.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  advanceToQuantityStep,
  clickNextStep,
  gotoWarehouseCompose,
  loginAsOperator,
  readSeed,
} from "./_helpers";

interface SqlInventorySnapshot {
  item_id: string;
  quantity: number;
  warehouse_qty: number;
  location_qty: number;
  consistent: boolean;
}

function readSqlInventory(itemId: string): SqlInventorySnapshot {
  const databasePath = resolve(process.cwd(), "..", "backend", "mes_e2e.db");
  const script = [
    "import json, sqlite3, sys",
    "from pathlib import Path",
    "db_path = Path(sys.argv[1]).resolve()",
    "item_id = sys.argv[2].replace('-', '')",
    "connection = sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)",
    "try:",
    "    connection.execute('PRAGMA query_only = ON')",
    "    row = connection.execute(\"\"\"",
    "        SELECT inventory.quantity, inventory.warehouse_qty,",
    "               COALESCE((",
    "                   SELECT SUM(inventory_locations.quantity)",
    "                   FROM inventory_locations",
    "                   WHERE replace(inventory_locations.item_id, '-', '') = ?",
    "                     AND inventory_locations.status IN ('PRODUCTION', 'DEFECTIVE')",
    "               ), 0)",
    "        FROM inventory",
    "        WHERE replace(inventory.item_id, '-', '') = ?",
    "    \"\"\", (item_id, item_id)).fetchone()",
    "    if row is None:",
    "        raise RuntimeError('inventory row not found')",
    "    quantity, warehouse_qty, location_qty = map(int, row)",
    "    print(json.dumps({",
    "        'item_id': sys.argv[2],",
    "        'quantity': quantity,",
    "        'warehouse_qty': warehouse_qty,",
    "        'location_qty': location_qty,",
    "        'consistent': quantity == warehouse_qty + location_qty,",
    "    }))",
    "finally:",
    "    connection.close()",
  ].join("\n");
  const result = spawnSync("python", ["-c", script, databasePath, itemId], {
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout) as SqlInventorySnapshot;
}

function numericText(raw: string): number {
  return Number(raw.replace(/[^0-9-]/g, ""));
}

function writeFinalEvidence(filename: string, value: unknown): void {
  const evidenceDir = process.env.CP6_FINAL_EVIDENCE_DIR;
  if (!evidenceDir) return;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(resolve(evidenceDir, filename), JSON.stringify(value, null, 2), "utf8");
}

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
    const { rawItem } = readSeed();
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
      page.getByRole("button", { name: /수량 조정/, disabled: false }).filter({ visible: true }).first(),
    ).toBeEnabled();
    await advanceToQuantityStep(page);

    await expect(page.getByText("보정 입고", { exact: true }).filter({ visible: true })).toBeVisible();
    const before = await stockValue(page, "현재 창고");
    const after = await stockValue(page, "실행 후");
    const sqlBefore = readSqlInventory(rawItem.item_id);
    expect(sqlBefore.consistent).toBe(true);
    expect(before).toBe(sqlBefore.warehouse_qty);
    expect(after - before).toBe(1);

    await page.getByRole("button", { name: /제출확인/ }).filter({ visible: true }).click();
    await expect(page.getByText("즉시 재고 반영", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /결재 요청/ }).filter({ visible: true })).toHaveCount(0);
    await page.getByRole("button", { name: /즉시 반영하기/ }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog", { name: /창고 보정 입고를 진행하시겠습니까/ })).toBeVisible();
    await page.getByRole("button", { name: "즉시 반영", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /입출고 반영 완료/ })).toBeVisible();

    const sqlAfter = readSqlInventory(rawItem.item_id);
    expect(sqlAfter.consistent).toBe(true);
    expect(sqlAfter.warehouse_qty - sqlBefore.warehouse_qty).toBe(1);
    expect(sqlAfter.quantity - sqlBefore.quantity).toBe(1);

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
          warehouse_qty_before: sqlBefore.warehouse_qty,
          warehouse_qty_after: sqlAfter.warehouse_qty,
        }),
      ]),
    );

    await page.getByRole("button", { name: "확인", exact: true }).click();
    const itemsResponsePromise = page.waitForResponse((itemsResponse) => {
      const url = new URL(itemsResponse.url());
      return itemsResponse.request().method() === "GET"
        && url.pathname === "/api/items"
        && url.searchParams.get("limit") === "2000";
    });
    await page.goto("/mes?tab=dashboard");
    const itemsResponse = await itemsResponsePromise;
    expect(itemsResponse.ok()).toBe(true);
    const items: Array<Record<string, unknown>> = await itemsResponse.json();
    const apiItem = items.find((item) => item.item_id === rawItem.item_id);
    expect(apiItem).toBeDefined();
    expect(Number(apiItem?.warehouse_qty)).toBe(sqlAfter.warehouse_qty);
    expect(Number(apiItem?.quantity)).toBe(sqlAfter.quantity);

    const itemRow = page
      .locator('tr[role="button"]')
      .filter({ hasText: rawItem.item_name })
      .filter({ visible: true })
      .first();
    await expect(itemRow).toBeVisible();
    const warehouseChip = itemRow
      .getByTestId("inventory-dept-stock-summary")
      .locator("span")
      .first();
    await expect(warehouseChip).toBeVisible();
    await expect(warehouseChip).toHaveText(/^창고\s/);
    const uiWarehouseQty = numericText(await warehouseChip.innerText());
    const uiAvailableQty = numericText(await itemRow.getByTestId("inventory-total-stock").innerText());
    expect(uiWarehouseQty).toBe(Number(apiItem?.warehouse_qty));
    expect(uiAvailableQty).toBe(Number(apiItem?.available_quantity));
    expect(sqlAfter.quantity).toBe(sqlAfter.warehouse_qty + sqlAfter.location_qty);

    writeFinalEvidence("inventory-sql-api-ui-oracle.json", {
      database: "backend/mes_e2e.db",
      item: { item_id: rawItem.item_id, item_name: rawItem.item_name },
      before: sqlBefore,
      after: sqlAfter,
      apiPhysicalInventory: {
        quantity: Number(apiItem?.quantity),
        warehouse_qty: Number(apiItem?.warehouse_qty),
      },
      availableInventory: {
        api_available_quantity: Number(apiItem?.available_quantity),
        ui_available_quantity: uiAvailableQty,
      },
      uiWarehouseQty,
    });

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
