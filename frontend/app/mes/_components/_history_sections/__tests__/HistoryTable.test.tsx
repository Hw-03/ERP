import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { transactionColor } from "@/lib/mes-status";
import { HistoryTable } from "../HistoryTable";
import type { HistorySelection } from "../historyConstants";
import type { LogGroup } from "../historyTableHelpers";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1", item_id: "ITEM-1", mes_code: "3-AA-0005", item_name: "대표 품목", item_process_type_code: "AA", item_unit: "EA",
    transaction_type: "PRODUCE", quantity_change: 1, quantity_before: 0, quantity_after: 1, warehouse_qty_before: null, warehouse_qty_after: null,
    transfer_qty: 1, reference_no: "reference-1", produced_by: "요청자", requester_name: "요청자", approver_name: null, requested_at: "2026-07-15T00:00:00Z",
    approved_at: null, department: "조립", notes: null, operation_batch_id: null, created_at: "2026-07-15T00:00:00Z", edit_count: 0,
    cancelled: false, cancel_reason: null, cancelled_by: null, cancelled_at: null, inventory_effect: null, ...overrides,
  };
}

function makeBatch(): IoBatch {
  return {
    batch_id: "batch-1", work_type: "process", sub_type: "produce", status: "completed", requester_employee_id: "E001", requester_name: "요청자",
    requester_department: "조립", approver_employee_id: null, approver_name: null, from_department: null, to_department: "조립", requires_approval: false,
    stock_request_id: null, reference_no: null, notes: null, created_at: "2026-07-15T00:00:00Z", updated_at: "2026-07-15T00:00:00Z",
    submitted_at: "2026-07-15T00:00:00Z", completed_at: "2026-07-15T00:00:00Z",
    bundles: [{
      bundle_id: "bundle-1", source_kind: "bom_parent", title: "대표 품목", source_item_id: "ITEM-1", source_mes_code: "3-AA-0005", quantity: 1, expanded_level: 1,
      lines: [
        { line_id: "parent", item_id: "ITEM-1", item_name: "대표 품목", mes_code: "3-AA-0005", unit: "EA", direction: "in", from_bucket: "none", from_department: null, to_bucket: "production", to_department: "조립", quantity: 1, bom_expected: null, included: true, origin: "direct", edited: false, has_children: true, shortage: 0, exclusion_note: null },
        { line_id: "child", item_id: "COMP-1", item_name: "BOM 구성품", mes_code: "3-AR-0001", unit: "EA", direction: "out", from_bucket: "production", from_department: "조립", to_bucket: "none", to_department: null, quantity: 1, bom_expected: 1, included: true, origin: "bom_auto", edited: false, has_children: false, shortage: 0, exclusion_note: null },
      ],
    }],
  };
}

function renderTable(groups: LogGroup[], batchCache = new Map<string, IoBatch>(), collapseRequestNonce = 0) {
  return render(
    <HistoryTable loading={false} displayGroups={groups} selection={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={batchCache} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} collapseRequestNonce={collapseRequestNonce} />,
  );
}

function OperationSelectionHarness({ groups }: { groups: LogGroup[] }) {
  const [selection, setSelection] = useState<HistorySelection | null>(null);
  const selectLog = (log: TransactionLog) => {
    setSelection((current) => (
      current?.kind === "log" && current.log.log_id === log.log_id
        ? null
        : { kind: "log", log }
    ));
  };

  return (
    <>
      <output data-testid="selected-history-log">{selection?.kind === "log" ? selection.log.log_id : "none"}</output>
      <HistoryTable
        loading={false}
        displayGroups={groups}
        selection={selection}
        onSelectLog={selectLog}
        onSelectChildLog={selectLog}
        onSelectBatch={vi.fn()}
        batchCache={new Map()}
        setBatchCache={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />
    </>
  );
}

function makeOperationGroup() {
  const primary = makeLog({
    log_id: "operation-primary",
    item_name: "작업 대표 품목",
    operation_id: "operation-1",
    operation_role: "PRIMARY",
    operation_kind: "BUSINESS",
  });
  const child = makeLog({
    log_id: "operation-child",
    item_id: "CHILD-1",
    item_name: "작업 하위 자재",
    operation_id: "operation-1",
    operation_role: "COMPONENT_INPUT",
    operation_kind: "BUSINESS",
  });
  return { primary, child, groups: [{ type: "operation" as const, operationId: "operation-1", logs: [primary, child] }] };
}

function makeMixedProductionOperationGroup() {
  const productOutput = makeLog({
    log_id: "mixed-product-output",
    item_name: "혼합 생산 완제품",
    operation_id: "mixed-operation-1",
    operation_role: "PRODUCT_OUTPUT",
    operation_kind: "BUSINESS",
  });
  const componentInput = makeLog({
    log_id: "mixed-component-input",
    item_id: "MIXED-COMPONENT",
    item_name: "혼합 생산 구성품",
    transaction_type: "BACKFLUSH",
    quantity_change: -1,
    operation_id: "mixed-operation-1",
    operation_role: "COMPONENT_INPUT",
    operation_kind: "BUSINESS",
  });
  const correction = makeLog({
    log_id: "mixed-correction",
    item_id: "MIXED-ADJUST",
    item_name: "혼합 생산 단품 보정",
    transaction_type: "ADJUST",
    quantity_change: 1,
    operation_id: "mixed-operation-1",
    operation_role: "CORRECTION",
    operation_kind: "BUSINESS",
  });
  return {
    productOutput,
    groups: [{
      type: "operation" as const,
      operationId: "mixed-operation-1",
      logs: [componentInput, correction, productOutput],
    }],
  };
}

describe("HistoryTable hierarchy", () => {
  it("opens the selected operation detail and child rows on the first primary-row click", () => {
    const { primary, groups } = makeOperationGroup();
    render(<OperationSelectionHarness groups={groups} />);

    fireEvent.click(screen.getByText(primary.item_name).closest("tr")!);

    expect(screen.getByTestId("selected-history-log")).toHaveTextContent(primary.log_id);
    expect(screen.getByText("작업 하위 자재")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업 구성 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes both the selected operation detail and child rows when the same primary row is clicked again", () => {
    const { primary, groups } = makeOperationGroup();
    render(<OperationSelectionHarness groups={groups} />);
    const primaryRow = screen.getByText(primary.item_name).closest("tr")!;

    fireEvent.click(primaryRow);
    fireEvent.click(primaryRow);

    expect(screen.getByTestId("selected-history-log")).toHaveTextContent("none");
    expect(screen.queryByText("작업 하위 자재")).not.toBeInTheDocument();
  });

  it("closes the detail selection when a selected primary row is clicked after chevron-only collapse", () => {
    const { primary, groups } = makeOperationGroup();
    render(<OperationSelectionHarness groups={groups} />);
    const primaryRow = screen.getByText(primary.item_name).closest("tr")!;

    fireEvent.click(primaryRow);
    fireEvent.click(screen.getByRole("button", { name: "작업 구성 접기" }));
    expect(screen.queryByText("작업 하위 자재")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업 구성 펼치기" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(primaryRow);

    expect(screen.getByTestId("selected-history-log")).toHaveTextContent("none");
    expect(screen.queryByText("작업 하위 자재")).not.toBeInTheDocument();
  });

  it("switches from a selected child to the primary detail without collapsing child rows", () => {
    const { primary, child, groups } = makeOperationGroup();
    render(<OperationSelectionHarness groups={groups} />);
    const primaryRow = screen.getByText(primary.item_name).closest("tr")!;

    fireEvent.click(primaryRow);
    fireEvent.click(screen.getByText(child.item_name).closest("tr")!);
    fireEvent.click(primaryRow);

    expect(screen.getByTestId("selected-history-log")).toHaveTextContent(primary.log_id);
    expect(screen.getByText(child.item_name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "작업 구성 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles only child rows when the operation chevron is clicked", () => {
    const { groups } = makeOperationGroup();
    render(<OperationSelectionHarness groups={groups} />);

    fireEvent.click(screen.getByRole("button", { name: "작업 구성 펼치기" }));

    expect(screen.getByTestId("selected-history-log")).toHaveTextContent("none");
    expect(screen.getByText("작업 하위 자재")).toBeInTheDocument();
  });

  it("keeps the product output primary and distinguishes BOM input from single-item correction children", () => {
    const { productOutput, groups } = makeMixedProductionOperationGroup();
    render(<OperationSelectionHarness groups={groups} />);

    fireEvent.click(screen.getByText(productOutput.item_name).closest("tr")!);

    expect(screen.getByTestId("selected-history-log")).toHaveTextContent(productOutput.log_id);
    const componentRow = screen.getByText("혼합 생산 구성품").closest("tr")!;
    expect(within(componentRow).getByText("구성품")).toBeInTheDocument();
    const correctionRow = screen.getByText("혼합 생산 단품 보정").closest("tr")!;
    expect(within(correctionRow).getByText("단품 입고")).toBeInTheDocument();
  });

  it("keeps before-stock and status visible while marking only after-stock for cancelled source rows", () => {
    const css = readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toMatch(
      /tr\[data-history-cancelled\] > :is\(td:nth-child\(1\), td:nth-child\(2\), td:nth-child\(3\), td:nth-child\(4\)\)\s*\{[\s\S]*?opacity: \.55;[\s\S]*?position: relative;/,
    );
    expect(css).toMatch(
      /tr\[data-history-cancelled\] \[data-history-after-stock="true"\]\s*\{[^}]*opacity: \.55;[^}]*text-decoration: line-through;/,
    );
  });

  it("keeps the legacy hover strength for regular rows and uses 20 percent only for cancellation rows", () => {
    renderTable([{ type: "solo", log: makeLog() }]);
    const regularRow = screen.getByText("대표 품목").closest("tr")!;

    fireEvent.mouseEnter(regularRow);

    expect(regularRow).toHaveStyle({ background: tint(transactionColor("PRODUCE"), 14) });

    const css = readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toMatch(
      /tr\[data-history-cancellation="true"\]\s*\{\s*background: color-mix\(in srgb, var\(--c-red\) 10%, transparent\) !important;/,
    );
    expect(css).toMatch(
      /tr\[data-history-cancellation="true"\]:hover\s*\{\s*background: color-mix\(in srgb, var\(--c-red\) 20%, transparent\) !important;/,
    );
    expect(css).toMatch(
      /tr\[data-history-cancellation="true"\]\[aria-pressed="true"\]\s*\{\s*outline: 1\.5px solid var\(--c-red\) !important;/,
    );
    expect(css).toContain('tr[data-history-cancellation="true"] > td:nth-child(2) > span');
  });

  it("combines location snapshots into one compact before-and-after cell", () => {
    const log = makeLog({
      cancelled: true,
      warehouse_qty_before: 0,
      warehouse_qty_after: 4,
      department_qty_before: 0,
      department_qty_after: 7,
    });

    renderTable([{ type: "solo", log }]);

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "일시",
      "작업",
      "대상",
      "품목코드",
      "재고 변동",
      "담당자",
    ]);
    const itemCodeHeader = screen.getByRole("columnheader", { name: "품목코드" });
    expect(itemCodeHeader).not.toHaveAttribute("colspan");
    expect(screen.queryByRole("columnheader", { name: "품목코드 · 수량" })).not.toBeInTheDocument();
    const row = screen.getByText("대표 품목").closest("tr")!;
    const inventory = within(row).getByLabelText("재고 변동: 창고 0 +4→4, 부서 0 +7→7");
    const warehouseLine = within(inventory).getByLabelText("창고 0 +4→4");
    expect(warehouseLine).toBeInTheDocument();
    expect(within(warehouseLine).getByText("+4")).toHaveStyle({ width: "40px" });
    expect(within(warehouseLine).getByText("→")).toHaveAttribute("aria-hidden", "true");
    expect(within(inventory).getByLabelText("부서 0 +7→7")).toBeInTheDocument();
    expect(row).not.toHaveClass("opacity-60");
    expect(row).toHaveAttribute("data-history-cancelled", "true");
    expect(inventory.closest("td")).toBe(row.children[4]);
    expect(within(row.children[5] as HTMLElement).getByText("취소")).toBeInTheDocument();
    const cancelledWarehouse = within(inventory).getByLabelText("창고 0 +4→4");
    expect(cancelledWarehouse.children.item(2)).toHaveAttribute("data-history-after-stock", "true");
    expect(cancelledWarehouse.children.item(3)).toHaveAttribute("data-history-after-stock", "true");
    expect(cancelledWarehouse.children.item(4)).toHaveAttribute("data-history-after-stock", "true");
  });

  it("shows a muted no-change marker when neither location stock changed", () => {
    const log = makeLog({
      warehouse_qty_before: 516,
      warehouse_qty_after: 516,
      department_qty_before: 46,
      department_qty_after: 46,
    });

    renderTable([{ type: "solo", log }]);

    const row = screen.getByText("대표 품목").closest("tr")!;
    const inventory = within(row).getByLabelText("재고 변동 없음");
    expect(within(inventory).getByText("—")).toBeInTheDocument();
    expect(within(inventory).queryByLabelText(/^창고 /)).not.toBeInTheDocument();
    expect(within(inventory).queryByLabelText(/^부서 /)).not.toBeInTheDocument();
  });

  it("renders operation and cancellation groups as separate expandable rows", () => {
    const originalParent = makeLog({
      log_id: "original-parent",
      operation_id: "operation-1",
      operation_role: "PRIMARY",
      operation_kind: "BUSINESS",
      operation_effective_status: "cancelled",
      cancelled: true,
    });
    const originalChild = makeLog({
      log_id: "original-child",
      item_id: "CHILD-1",
      item_name: "원 작업 하위 자재",
      operation_id: "operation-1",
      operation_role: "COMPONENT_INPUT",
      operation_kind: "BUSINESS",
      operation_effective_status: "cancelled",
      cancelled: true,
    });
    const cancellationParent = makeLog({
      ...originalParent,
      log_id: "cancel-parent",
      operation_id: "operation-2",
      operation_kind: "CANCELLATION",
      operation_effective_status: "cancellation",
      quantity_change: -originalParent.quantity_change,
      cancelled: false,
    });
    const cancellationChild = makeLog({
      ...originalChild,
      log_id: "cancel-child",
      operation_id: "operation-2",
      operation_kind: "CANCELLATION",
      operation_effective_status: "cancellation",
      quantity_change: -originalChild.quantity_change,
      cancelled: false,
    });

    renderTable([
      { type: "operation", operationId: "operation-2", logs: [cancellationParent, cancellationChild] },
      { type: "operation", operationId: "operation-1", logs: [originalParent, originalChild] },
    ]);

    const cancellationRow = screen.getByText("부서 입출고 취소").closest("tr");
    expect(cancellationRow).not.toHaveAttribute("data-history-cancelled");
    expect(cancellationRow).toHaveAttribute("data-history-cancellation", "true");
    expect(within(cancellationRow as HTMLElement).queryByText("생산 -1 EA")).not.toBeInTheDocument();
    const originalRow = screen.getByText("부서 입출고").closest("tr");
    expect(originalRow).toHaveAttribute("data-history-cancelled", "true");
    expect(originalRow).not.toHaveAttribute("data-history-cancellation");
    const toggles = screen.getAllByRole("button", { name: "작업 구성 펼치기" });
    fireEvent.click(toggles[0]);
    expect(screen.getByText("원 작업 하위 자재").closest("tr")).not.toHaveAttribute("data-history-cancelled");
    fireEvent.click(toggles[1]);
    expect(screen.getByText("원 작업 하위 자재").closest("tr")).toHaveAttribute("data-history-cancelled", "true");
  });

  it("centers typical three-digit location changes on fixed baselines", () => {
    const log = makeLog({
      warehouse_qty_before: 472,
      warehouse_qty_after: 472,
      department_qty_before: 41,
      department_qty_after: 20,
    });
    const shortLog = makeLog({
      log_id: "log-2",
      warehouse_qty_before: 0,
      warehouse_qty_after: 0,
      department_qty_before: 8,
      department_qty_after: 8,
    });
    const longAfterLog = makeLog({
      log_id: "log-3",
      warehouse_qty_before: 1000,
      warehouse_qty_after: 1000,
      department_qty_before: 471,
      department_qty_after: 455,
    });

    renderTable([{ type: "solo", log }, { type: "solo", log: shortLog }, { type: "solo", log: longAfterLog }]);

    const departmentLine = screen.getByLabelText("부서 41 −21→20");
    const noChangeMarker = screen.getByLabelText("재고 변동 없음");
    const longDepartmentLine = screen.getByLabelText("부서 471 −16→455");
    const departmentLabel = departmentLine.children.item(0) as HTMLElement;
    const departmentBefore = departmentLine.children.item(1) as HTMLElement;
    const departmentDelta = departmentLine.children.item(2) as HTMLElement;
    const departmentArrow = departmentLine.children.item(3) as HTMLElement;
    const departmentAfter = departmentLine.children.item(4) as HTMLElement;
    const longDepartmentAfter = longDepartmentLine.children.item(4) as HTMLElement;

    expect(departmentLine.style.paddingLeft).toBe("");
    expect(departmentLabel).toHaveClass("w-7", "text-left");
    expect(departmentBefore).toHaveClass("text-right", "tabular-nums");
    expect(departmentBefore).toHaveStyle({ width: "24px" });
    expect(noChangeMarker).toHaveTextContent("—");
    expect(departmentDelta).toHaveTextContent("−21");
    expect(departmentDelta).toHaveClass("shrink-0", "text-left", "font-bold", "tabular-nums");
    expect(departmentDelta).toHaveStyle({ width: "40px" });
    expect(departmentArrow).toHaveTextContent("→");
    expect(departmentArrow).toHaveAttribute("aria-hidden", "true");
    expect(departmentArrow).toHaveClass("shrink-0", "text-center", "font-bold");
    expect(departmentArrow).toHaveStyle({ width: "24px" });
    expect(departmentAfter).toHaveClass("min-w-0", "shrink-0", "text-left", "font-bold", "tabular-nums");
    expect(departmentAfter).toHaveStyle({ width: "24px" });
    expect(longDepartmentAfter).toHaveTextContent("455");
    expect(longDepartmentAfter).toHaveStyle({ width: "24px" });
  });

  it("keeps the item code visible when the detail panel opens", () => {
    const log = makeLog();
    const groups: LogGroup[] = [{ type: "solo", log }];
    const view = renderTable(groups);
    const table = screen.getByRole("table");
    const itemCodeHeader = screen.getByRole("columnheader", { name: "품목코드" });
    const row = screen.getByText("대표 품목").closest("tr")!;
    const itemCodeCell = row.children.item(3) as HTMLElement;

    expect(table).toHaveClass("history-table-panel-motion");
    expect(table).toHaveAttribute("data-panel-open", "false");
    expect(itemCodeHeader).not.toHaveAttribute("colspan");
    expect(itemCodeHeader).toHaveStyle({ width: "144px" });
    expect(itemCodeCell).not.toHaveAttribute("colspan");
    expect(itemCodeCell).toHaveStyle({ width: "144px" });

    view.rerender(
      <HistoryTable loading={false} displayGroups={groups} selection={{ kind: "log", log }} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={new Map()} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />,
    );

    expect(table).toHaveAttribute("data-panel-open", "true");
    expect(itemCodeHeader).toHaveStyle({ width: "144px" });
    expect(itemCodeCell).toHaveStyle({ width: "144px" });
    expect(screen.getByText("대표 품목").closest("tr")?.children.item(3)).toHaveTextContent("3-AA-0005");

    view.rerender(
      <HistoryTable loading={false} displayGroups={groups} selection={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={new Map()} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />,
    );

    expect(table).toHaveAttribute("data-panel-open", "false");
    expect(itemCodeHeader).not.toHaveAttribute("aria-hidden");
  });

  it("shows unrecorded for legacy logs without a complete location snapshot", () => {
    renderTable([{ type: "solo", log: makeLog() }]);

    expect(screen.getAllByText("기록 없음")).toHaveLength(1);
  });

  it("uses the displayed shipment target log for the summary snapshots", () => {
    const source = makeLog({
      log_id: "source-pa",
      item_id: "SOURCE",
      item_name: "기존 PA",
      mes_code: "3-PA-0001",
      transaction_type: "BACKFLUSH",
      quantity_change: -1,
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 소스 PA 사용: 기존 PA x 1",
      warehouse_qty_before: 1,
      warehouse_qty_after: 0,
      department_qty_before: 2,
      department_qty_after: 2,
    });
    const target = makeLog({
      log_id: "target-pa",
      item_id: "TARGET",
      item_name: "변경 PA",
      mes_code: "3-PA-0002",
      transaction_type: "PRODUCE",
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 대상 PA 입고: 변경 PA x 1",
      warehouse_qty_before: 30,
      warehouse_qty_after: 31,
      department_qty_before: 40,
      department_qty_after: 40,
    });

    renderTable([{ type: "batch", refKey: "conversion", refNo: "ITEM-CONV-1", logs: [source, target] }]);

    const row = screen.getByLabelText("기존 PA → 변경 PA").closest("tr")!;
    const inventory = within(row).getByLabelText("재고 변동: 창고 30 +1→31");
    expect(within(inventory).getByLabelText("창고 30 +1→31")).toBeInTheDocument();
    expect(within(inventory).queryByLabelText(/^부서 /)).not.toBeInTheDocument();
  });

  it("uses the log matching the operation batch target for summary snapshots", () => {
    const component = makeLog({
      log_id: "component",
      item_id: "COMP-1",
      item_name: "BOM 구성품",
      mes_code: "3-AR-0001",
      transaction_type: "BACKFLUSH",
      operation_batch_id: "batch-1",
      warehouse_qty_before: 1,
      warehouse_qty_after: 1,
      department_qty_before: 9,
      department_qty_after: 8,
    });
    const target = makeLog({
      log_id: "target",
      operation_batch_id: "batch-1",
      warehouse_qty_before: 20,
      warehouse_qty_after: 20,
      department_qty_before: 4,
      department_qty_after: 5,
    });

    renderTable(
      [{ type: "op_batch", batchId: "batch-1", refNo: null, logs: [component, target] }],
      new Map([["batch-1", makeBatch()]]),
    );

    const row = screen.getByText("대표 품목").closest("tr")!;
    const inventory = within(row).getByLabelText("재고 변동: 부서 4 +1→5");
    expect(within(inventory).getByLabelText("부서 4 +1→5")).toBeInTheDocument();
    expect(within(inventory).queryByLabelText(/^창고 /)).not.toBeInTheDocument();
  });

  it("does not reuse a component snapshot when a custom BOM parent was not executed", () => {
    const batch = makeBatch();
    batch.bundles[0].lines[0] = {
      ...batch.bundles[0].lines[0],
      quantity: 5,
      included: false,
      exclusion_note: "커스텀 BOM 상위 미반영",
    };
    batch.bundles[0].lines[1] = {
      ...batch.bundles[0].lines[1],
      quantity: 5,
      edited: true,
    };
    const component = makeLog({
      log_id: "component-only",
      item_id: "COMP-1",
      item_name: "BOM 구성품",
      mes_code: "3-AR-0001",
      transaction_type: "BACKFLUSH",
      quantity_change: -5,
      operation_batch_id: "batch-1",
      operation_line_id: "child",
      warehouse_qty_before: 339,
      warehouse_qty_after: 339,
      department_qty_before: 8,
      department_qty_after: 3,
    });

    renderTable(
      [{ type: "op_batch", batchId: "batch-1", refNo: null, logs: [component] }],
      new Map([["batch-1", batch]]),
    );

    const row = screen.getByText("대표 품목").closest("tr")!;
    expect(within(row).queryByLabelText("재고 변동: 창고 339 +0→339, 부서 8 −5→3")).not.toBeInTheDocument();
    expect(within(row).getAllByText("—")).toHaveLength(1);
  });

  it("shows the matching transaction snapshot on the BOM parent row", () => {
    const parent = makeLog({
      operation_batch_id: "batch-1",
      warehouse_qty_before: 0,
      warehouse_qty_after: 0,
      department_qty_before: 0,
      department_qty_after: 1,
    });
    renderTable(
      [{ type: "op_batch", batchId: "batch-1", refNo: null, logs: [parent] }],
      new Map([["batch-1", makeBatch()]]),
    );

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    const bomRow = screen.getByText("BOM").closest("tr")!;
    expect(within(bomRow).getByLabelText("재고 변동: 부서 0 +1→1")).toBeInTheDocument();
  });

  it("keeps the final table geometry while the first page is loading", () => {
    const { container } = render(
      <HistoryTable loading displayGroups={[]} selection={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={new Map()} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />,
    );

    expect(screen.getByRole("table", { name: "입출고 내역 불러오는 중" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "작업" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "품목코드" })).toBeInTheDocument();
    const surface = screen.getByTestId("history-table-surface");
    expect(surface).toHaveClass(
      "min-w-0",
      "overflow-clip",
      "rounded-[24px]",
    );
    expect(surface).not.toHaveClass("border");
    expect(surface).toHaveStyle({ background: LEGACY_COLORS.s1 });
    expect(surface).not.toHaveClass("overflow-y-auto");
    expect(surface).not.toHaveClass("overflow-hidden");
    expect(surface).not.toHaveClass("flex-1");
    expect(screen.queryByTestId("history-table-scroll-area")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "입출고 내역 불러오는 중" }).parentElement).toBe(surface);
    expect(container.querySelectorAll("[data-history-loading-row='true']")).toHaveLength(8);
    expect(screen.getByRole("columnheader", { name: "일시" })).toHaveClass("rounded-tl-[22px]");
    expect(screen.getByRole("columnheader", { name: "담당자" })).toHaveClass("rounded-tr-[22px]");
    expect(screen.getByRole("columnheader", { name: "일시" })).toHaveStyle({
      background: "var(--c-history-table-header)",
    });
    expect(screen.getByRole("columnheader", { name: "담당자" }).parentElement).not.toHaveAttribute("style");
    const cornerMask = screen.getByTestId("history-table-corner-mask");
    expect(cornerMask).toHaveClass("sticky", "top-0", "z-20", "-mb-6");
    expect(cornerMask.children).toHaveLength(2);
    expect(cornerMask.children[0].getAttribute("style")).toContain(
      "var(--c-bg)",
    );
  });

  it("keeps both sticky header corners aligned with the table surface", () => {
    renderTable([{ type: "solo", log: makeLog() }]);

    expect(screen.getByRole("columnheader", { name: "일시" })).toHaveClass("sticky", "rounded-tl-[22px]");
    expect(screen.getByRole("columnheader", { name: "담당자" })).toHaveClass("sticky", "rounded-tr-[22px]");
    expect(screen.getByTestId("history-table-surface")).not.toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("history-table-surface")).not.toHaveClass("overflow-hidden");
    expect(screen.queryByTestId("history-table-scroll-area")).not.toBeInTheDocument();
  });

  it("keeps existing rows visible and retries from a non-blocking refresh failure", () => {
    const retryRefresh = vi.fn();
    const current = makeLog({ item_name: "현재 내역" });

    render(
      <HistoryTable
        loading={false}
        refreshError="동기화 실패"
        onRetryRefresh={retryRefresh}
        displayGroups={[{ type: "solo", log: current }]}
        selection={null}
        onSelectLog={vi.fn()}
        onSelectBatch={vi.fn()}
        batchCache={new Map()}
        setBatchCache={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByText("현재 내역")).toBeInTheDocument();
    const surface = screen.getByTestId("history-table-surface");
    expect(screen.getByRole("table").parentElement).toBe(surface);
    expect(screen.getByRole("alert")).toHaveTextContent("최신 입출고 내역을 동기화하지 못했습니다");
    expect(surface).not.toContainElement(screen.getByRole("alert"));
    fireEvent.click(screen.getByRole("button", { name: "다시 동기화" }));
    expect(retryRefresh).toHaveBeenCalledOnce();
  });

  it("shows neutral placeholders instead of inferred operation details before batch metadata arrives", () => {
    const parent = makeLog({ operation_batch_id: "batch-1" });

    renderTable([{ type: "op_batch", batchId: "batch-1", refNo: null, logs: [parent] }]);

    expect(screen.queryByText("부서 입출고")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("작업 정보 확인 중")).toHaveLength(1);
  });

  it("shows BOM sections before their item rows", () => {
    const parent = makeLog({ operation_batch_id: "batch-1" });
    renderTable([{ type: "op_batch", batchId: "batch-1", refNo: null, logs: [parent] }], new Map([["batch-1", makeBatch()]]));

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    expect(screen.getByText("BOM")).toBeInTheDocument();
    expect(screen.queryByText("BOM 구성품")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("BOM 구성품")).toBeInTheDocument();
  });

  it("keeps multi-item quantity adjustments behind one operation batch row", () => {
    const first = makeLog({
      log_id: "adjust-a",
      item_name: "보정 품목 A",
      transaction_type: "ADJUST",
      operation_batch_id: "batch-adjust",
      warehouse_qty_before: 7,
      warehouse_qty_after: 8,
      department_qty_before: 2,
      department_qty_after: 3,
    });
    const second = makeLog({
      log_id: "adjust-b",
      item_id: "ITEM-2",
      item_name: "보정 품목 B",
      transaction_type: "ADJUST",
      operation_batch_id: "batch-adjust",
      warehouse_qty_before: 40,
      warehouse_qty_after: 41,
      department_qty_before: 4,
      department_qty_after: 5,
    });
    const batch = { ...makeBatch(), batch_id: "batch-adjust", sub_type: "adjust_in", bundles: [] };

    renderTable(
      [{ type: "op_batch", batchId: "batch-adjust", refNo: null, logs: [first, second] }],
      new Map([["batch-adjust", batch]]),
    );

    expect(screen.queryByText("보정 품목 B")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-history-main-row='true']")).toHaveLength(1);
    const summaryRow = screen.getByText("보정 품목 A 외 1건").closest("tr")!;
    expect(within(summaryRow).queryByLabelText(/^재고 변동:/)).not.toBeInTheDocument();
    expect(within(summaryRow).getAllByText("—")).toHaveLength(1);
    const toggle = screen.getByRole("button", { name: "묶음 펼치기" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps multi-item shipment rows behind their section", () => {
    const first = makeLog({ log_id: "ship-a", item_name: "출하 품목 A", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    const second = makeLog({ log_id: "ship-b", item_id: "ITEM-2", item_name: "출하 품목 B", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    renderTable([{ type: "batch", refKey: "shipment", refNo: "shipment", logs: [first, second] }]);

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    expect(screen.getAllByText("출하 품목 A")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "출하 구성 펼치기" }));
    expect(screen.getAllByText("출하 품목 A")).toHaveLength(2);
    expect(screen.getByText("출하 품목 B")).toBeInTheDocument();
  });

  it("keeps multi-item rework rows behind their result section", () => {
    const parent = makeLog({ log_id: "disassemble", transaction_type: "DISASSEMBLE", reference_no: "defect-disassemble:1" });
    const first = makeLog({ log_id: "scrap-a", item_id: "SCRAP-A", item_name: "폐기 품목 A", transaction_type: "DEFECT_SCRAP", reference_no: parent.reference_no });
    const second = makeLog({ log_id: "scrap-b", item_id: "SCRAP-B", item_name: "폐기 품목 B", transaction_type: "DEFECT_SCRAP", reference_no: parent.reference_no });
    renderTable([{ type: "batch", refKey: "rework", refNo: parent.reference_no!, logs: [parent, first, second] }]);

    fireEvent.click(screen.getByRole("button", { name: "묶음 펼치기" }));
    expect(screen.getByText("폐기 결과")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "처리결과 구성 펼치기" }));
    expect(screen.getByText("폐기 품목 A")).toBeInTheDocument();
    expect(screen.getByText("폐기 품목 B")).toBeInTheDocument();
  });

  it("collapses an open group when the detail panel requests a close", () => {
    const first = makeLog({ log_id: "ship-close-a", item_name: "Shipment A", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    const second = makeLog({ log_id: "ship-close-b", item_id: "ITEM-2", item_name: "Shipment B", transaction_type: "SHIP", shipping_phase: "PICKUP" });
    const groups: LogGroup[] = [{ type: "batch", refKey: "shipment-close", refNo: "shipment-close", logs: [first, second] }];
    const view = renderTable(groups);
    const toggle = screen.getAllByRole("button").find((button) => button.hasAttribute("aria-expanded"));

    expect(toggle).toBeDefined();
    fireEvent.click(toggle!);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    view.rerender(
      <HistoryTable loading={false} displayGroups={groups} selection={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} batchCache={new Map()} setBatchCache={vi.fn()} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} collapseRequestNonce={1} />,
    );

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Shipment B")).not.toBeInTheDocument();
  });
});
