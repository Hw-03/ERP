import { expect, test, type Page } from "@playwright/test";
import type { TransactionLog } from "../../lib/api/types/production";
import { loginAsOperator } from "./_helpers";

function makeLog(overrides: Partial<TransactionLog>): TransactionLog {
  return {
    log_id: "request-log",
    item_id: "cocoon-item",
    mes_code: "COCOON",
    item_name: "COCOON 요청",
    item_process_type_code: null,
    item_unit: "EA",
    transaction_type: "TRANSFER_TO_PROD",
    quantity_change: -44,
    quantity_before: 94,
    quantity_after: 50,
    warehouse_qty_before: 94,
    warehouse_qty_after: 50,
    department_qty_before: 7,
    department_qty_after: 7,
    transfer_qty: 44,
    reference_no: null,
    produced_by: null,
    requester_name: "요청자",
    approver_name: "승인자",
    requested_at: "2026-09-08T01:00:00Z",
    approved_at: "2026-09-08T03:00:00Z",
    department: "조립",
    notes: null,
    operation_batch_id: null,
    operation_line_id: null,
    operation_id: null,
    operation_role: "PRIMARY",
    operation_kind: "BUSINESS",
    operation_display_label: null,
    operation_effective_status: "active",
    reversal_operation_id: null,
    reverses_log_id: null,
    shipping_phase: null,
    created_at: "2026-09-08T03:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    request_order_stock: {
      status: "available",
      reason: null,
      warehouse_qty_before: 44,
      warehouse_qty_after: 0,
      department_qty_before: 7,
      department_qty_after: 7,
    },
    ...overrides,
  };
}

async function mockDisplayGroups(page: Page, groups: Array<Record<string, unknown>>): Promise<void> {
  await page.route("**/api/inventory/transactions/display-groups**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        groups,
        next_cursor: null,
        has_more: false,
      },
    });
  });
}

test.describe("입출고 내역 — 요청 순 재고", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("대표·하위 행은 각 로그의 요청 순 재고를 표시하고 상세는 실제 처리 재고를 보존한다", async ({ page }) => {
    const requestLog = makeLog({});
    const assemblyLog = makeLog({
      log_id: "assembly-log",
      item_name: "COCOON 조립",
      transaction_type: "PRODUCE",
      quantity_change: 50,
      quantity_before: 44,
      quantity_after: 94,
      warehouse_qty_before: 44,
      warehouse_qty_after: 94,
      requested_at: "2026-09-08T02:00:00Z",
      approved_at: "2026-09-08T02:00:00Z",
      created_at: "2026-09-08T02:00:00Z",
      operation_role: "COMPONENT",
      request_order_stock: {
        status: "available",
        reason: null,
        warehouse_qty_before: 0,
        warehouse_qty_after: 50,
        department_qty_before: 7,
        department_qty_after: 7,
      },
    });
    await mockDisplayGroups(page, [{
      type: "operation",
      key: "request-order-stock-operation",
      logs: [requestLog, assemblyLog],
    }]);

    await page.goto("/mes?tab=history");

    const table = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "품목코드" }),
    });
    await expect(table).toBeVisible();

    const requestStock = table.getByLabel("재고 변동: 창고 44 −44→0");
    await expect(requestStock).toBeVisible();
    const requestRow = table.locator("tr").filter({
      has: page.getByLabel("재고 변동: 창고 44 −44→0"),
    });
    await expect(requestRow.getByText("COCOON 요청", { exact: true })).toBeVisible();
    await expect(requestRow).not.toContainText("94");

    await requestRow.click();

    const assemblyStock = table.getByLabel("재고 변동: 창고 0 +50→50");
    await expect(assemblyStock).toBeVisible();
    const assemblyRow = table.locator("tr").filter({
      has: page.getByLabel("재고 변동: 창고 0 +50→50"),
    });
    await expect(assemblyRow.getByText("COCOON 조립", { exact: true })).toBeVisible();
    await expect(assemblyRow).not.toContainText("44");

    const actualStock = page.getByTestId("history-stock-movement-summary");
    await expect(actualStock).toBeVisible();
    await expect(actualStock).toContainText(/재고 이동/);
    await expect(actualStock).toContainText(/창고\s*94\s*50/);
    await expect(actualStock).not.toContainText("정상 부서");
    await expect(page.getByText("실제 처리 당시 재고", { exact: true })).toHaveCount(0);

    const stockHelp = table.getByLabel("수량 변동 계산 기준");
    await stockHelp.hover();
    await expect(page.getByRole("tooltip")).toContainText("요청 시각 순서로 계산");
    await expect(page.getByRole("tooltip")).toContainText("승인되면 과거 표시도 변경");
  });

  test("계산 불가 응답은 실제 처리 재고로 대체하지 않고 사유를 설명한다", async ({ page }) => {
    const unavailableLog = makeLog({
      request_order_stock: {
        status: "unavailable",
        reason: "ambiguous_order",
        warehouse_qty_before: null,
        warehouse_qty_after: null,
        department_qty_before: null,
        department_qty_after: null,
      },
    });
    await mockDisplayGroups(page, [{
      type: "solo",
      key: "request-order-stock-unavailable",
      logs: [unavailableLog],
    }]);

    await page.goto("/mes?tab=history");

    const unavailable = page.getByLabel(
      "요청 순 재고 계산 불가: 같은 처리 시각의 거래 순서를 확정할 수 없습니다.",
    );
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toHaveText("계산 불가");
    const row = page.locator("tr").filter({ has: unavailable });
    await expect(row).not.toContainText("94");
    await expect(row).not.toContainText("50");

    await unavailable.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "같은 처리 시각의 거래 순서를 확정할 수 없습니다.",
    );
  });

  test("모바일 응답 fixture UI 계약은 요청 순 합계와 실제 창고·위치별 전후를 상세에서 분리한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // 실제 거래 생성·서버 계산의 증거가 아니라 응답 fixture의 모바일 표시 계약이다.
    const mobileLog = makeLog({
      log_id: "mobile-request-order-location-log",
      item_name: "모바일 요청 순 위치 검증",
      transaction_type: "ADJUST",
      quantity_change: -4,
      quantity_before: 38,
      quantity_after: 34,
      warehouse_qty_before: 20,
      warehouse_qty_after: 18,
      department_qty_before: 18,
      department_qty_after: 16,
      transfer_qty: null,
      request_order_stock: {
        status: "available",
        reason: null,
        warehouse_qty_before: 10,
        warehouse_qty_after: 8,
        department_qty_before: 7,
        department_qty_after: 5,
      },
      inventory_effect: [
        { scope: "warehouse", delta: -2, quantity_before: 20, quantity_after: 18 },
        { scope: "location", department: "튜브", status: "PRODUCTION", delta: -3, quantity_before: 15, quantity_after: 12 },
        { scope: "location", department: "조립", status: "PRODUCTION", delta: 1, quantity_before: 3, quantity_after: 4 },
      ],
    });
    await mockDisplayGroups(page, [{
      type: "solo",
      key: "mobile-request-order-location-fixture",
      logs: [mobileLog],
    }]);
    await page.goto("/mes?tab=history");
    await page.getByRole("button", { name: /모바일 요청 순 위치 검증/ }).click();

    const detail = page.locator('[data-history-detail-log-id="mobile-request-order-location-log"]').filter({ visible: true });
    await expect(detail).toBeVisible();
    const requested = detail.getByText("요청 순 재고", { exact: true }).locator("..");
    await expect(requested.getByLabel("창고 10 −2→8", { exact: true })).toBeVisible();
    await expect(requested.getByLabel("부서 합계 7 −2→5", { exact: true })).toBeVisible();
    await expect(requested.getByLabel("튜브 15 −3→12", { exact: true })).toHaveCount(0);
    await expect(requested.getByLabel("조립 3 +1→4", { exact: true })).toHaveCount(0);

    const actual = detail.getByText("실제 처리 재고", { exact: true }).locator("..");
    await expect(actual.getByLabel("창고 20 −2→18", { exact: true })).toBeVisible();
    await expect(actual.getByLabel("튜브 15 −3→12", { exact: true })).toBeVisible();
    await expect(actual.getByLabel("조립 3 +1→4", { exact: true })).toBeVisible();
    await expect(actual.getByLabel(/^창고(?: 재고)? 20 [−-]2→18(?: EA)?$/)).toHaveCount(1);
    await expect(actual.getByLabel(/^튜브(?: 재고)? 15 [−-]3→12(?: EA)?$/)).toHaveCount(1);
    await expect(actual.getByLabel(/^조립(?: 재고)? 3 \+1→4(?: EA)?$/)).toHaveCount(1);
    await expect(actual.getByLabel("창고 재고 20 -2→18 EA", { exact: true })).toHaveCount(0);
    await expect(actual.getByLabel("튜브 재고 15 -3→12 EA", { exact: true })).toHaveCount(0);
    await expect(actual.getByLabel("조립 재고 3 +1→4 EA", { exact: true })).toHaveCount(0);
    await expect(actual.getByLabel("창고 10 −2→8", { exact: true })).toHaveCount(0);
    await expect(actual.getByLabel("부서 합계 7 −2→5", { exact: true })).toHaveCount(0);
  });
});
