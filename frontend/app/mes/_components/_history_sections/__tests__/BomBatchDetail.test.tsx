import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch, IoLine } from "@/lib/api/types/io";
import { BomBatchDetail } from "../BomBatchDetail";

function makeLine(overrides: Partial<IoLine>): IoLine {
  return {
    line_id: "line",
    item_id: "item",
    item_name: "품목",
    mes_code: "MES-001",
    unit: "EA",
    direction: "out",
    from_bucket: "production",
    from_department: "조립",
    to_bucket: "none",
    to_department: null,
    quantity: 1,
    bom_expected: 1,
    included: true,
    origin: "bom_auto",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function makeBatch(): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "produce",
    status: "completed",
    requester_employee_id: "employee-1",
    requester_name: "작업자",
    requester_department: "조립",
    approver_employee_id: "employee-1",
    approver_name: "작업자",
    from_department: null,
    to_department: "조립",
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    submitted_at: "2026-07-10T00:00:00Z",
    completed_at: "2026-07-10T00:00:00Z",
    bundles: [
      {
        bundle_id: "bundle-1",
        source_kind: "bom_parent",
        title: "아주 긴 완제품 구성 묶음 이름",
        source_item_id: "parent",
        source_mes_code: "PARENT-001",
        quantity: 1,
        expanded_level: 1,
        lines: [
          makeLine({
            line_id: "parent-line",
            item_id: "parent",
            item_name: "완제품",
            mes_code: "PARENT-001",
            direction: "in",
            from_bucket: "none",
            from_department: null,
            to_bucket: "production",
            to_department: "조립",
            origin: "direct",
          }),
          makeLine({
            line_id: "child-line",
            item_id: "child",
            item_name: "아주 긴 구성품 라인 이름",
            mes_code: "CHILD-001",
          }),
        ],
      },
    ],
  };
}

function makeDuplicateManualBatch(): IoBatch {
  const batch = makeBatch();
  const makeBundle = (bundleId: string, lineId: string) => ({
    bundle_id: bundleId,
    source_kind: "manual" as const,
    title: "알루미늄 필터 (2T * Φ24)",
    source_item_id: "item",
    source_mes_code: "69-VR-0001",
    quantity: 1,
    expanded_level: 1,
    lines: [makeLine({
      line_id: lineId,
      item_id: "item",
      item_name: "알루미늄 필터 (2T * Φ24)",
      mes_code: "69-VR-0001",
      direction: "adjust",
      from_bucket: "none",
      from_department: null,
      to_bucket: "production",
      to_department: "조립",
      quantity: 1,
      bom_expected: null,
      origin: "manual",
    })],
  });

  return {
    ...batch,
    sub_type: "adjust_in",
    bundles: [makeBundle("bundle-1", "line-1"), makeBundle("bundle-2", "line-2")],
  };
}

function makeMultiItemAdjustmentBatch(): IoBatch {
  const batch = makeDuplicateManualBatch();
  batch.bundles[0] = {
    ...batch.bundles[0],
    title: "보정 품목 A",
    lines: [{ ...batch.bundles[0].lines[0], item_name: "보정 품목 A" }],
  };
  batch.bundles[1] = {
    ...batch.bundles[1],
    bundle_id: "bundle-2",
    title: "보정 품목 B",
    source_item_id: "item-2",
    source_mes_code: "MES-002",
    lines: [{
      ...batch.bundles[1].lines[0],
      line_id: "line-2",
      item_id: "item-2",
      item_name: "보정 품목 B",
      mes_code: "MES-002",
    }],
  };
  return batch;
}

describe("BomBatchDetail", () => {
  it("uses an operation label for a warehouse-to-department BOM bundle while preserving its component names", () => {
    const batch = makeBatch();
    batch.sub_type = "warehouse_to_dept";

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("이동 구성")).toBeInTheDocument();
    expect(screen.queryByText("아주 긴 완제품 구성 묶음 이름")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("아주 긴 구성품 라인 이름")).toBeInTheDocument();
  });

  it.each(["Enter", " "])("uses a real button for BOM expansion with %s", (key) => {
    const batch = makeBatch();
    render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
            compact
          />
        </tbody>
      </table>,
    );

    const toggle = screen.getByRole("button", { name: "BOM 구성 펼치기" });
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("아주 긴 완제품 구성 묶음 이름").closest("tr")).toHaveClass("h-[40px]");

    fireEvent.keyDown(toggle, { key });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const child = screen.getByText("아주 긴 구성품 라인 이름");
    expect(child.closest("tr")).toHaveClass("h-[40px]");
    expect(document.getElementById(controlsId!)).toBe(child.closest("tr"));
  });

  it.each(["click", "Enter", " "])("toggles an expandable BOM row with %s", (interaction) => {
    const batch = makeBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    const toggle = screen.getByRole("button", { name: "BOM 구성 펼치기" });
    const row = toggle.closest("tr")!;
    const controlsId = toggle.getAttribute("aria-controls")!;

    expect(row).not.toHaveAttribute("role");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveAttribute("aria-controls", controlsId);

    if (interaction === "click") fireEvent.click(row);
    else fireEvent.keyDown(row, { key: interaction });

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(controlsId)).toBeInTheDocument();
  });

  it("merges duplicate manual item bundles into one displayed quantity", () => {
    const batch = makeDuplicateManualBatch();
    const { container } = render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(container.querySelectorAll("tbody > tr")).toHaveLength(1);
    expect(screen.getByText("+2 EA")).toBeInTheDocument();
  });

  it("keeps shortage badges but never renders excluded badges in BOM summary or child rows", () => {
    const batch = makeBatch();
    batch.bundles[0].lines[1].shortage = 2;
    batch.bundles[0].lines.push(makeLine({
      line_id: "excluded-line",
      item_id: "excluded-item",
      item_name: "제외 구성품",
      included: false,
      shortage: 0,
    }));

    render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByText("부족 1")).toBeInTheDocument();
    expect(screen.queryByText("제외")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));

    expect(screen.queryByText("제외 구성품")).not.toBeInTheDocument();
    expect(screen.queryByText("제외")).not.toBeInTheDocument();
    expect(screen.getAllByText("부족 2")).toHaveLength(1);
  });

  it("uses the shared fixed operation pill width for the BOM section and its item rows", () => {
    const batch = makeBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("BOM").parentElement).toHaveClass("w-32", "max-w-full");
    fireEvent.click(screen.getByRole("button", { name: "BOM 구성 펼치기" }));
    expect(screen.getByText("자동차감").parentElement).toHaveClass("w-32", "max-w-full");
  });

  it.each(["Enter", " "])("expands multi-item quantity adjustments with %s", (key) => {
    const batch = makeMultiItemAdjustmentBatch();
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("수량보정 입고")).toBeInTheDocument();
    expect(screen.queryByText("보정 품목 A")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "라인 구성 펼치기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(toggle, { key });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("보정 품목 A")).toBeInTheDocument();
    expect(screen.getByText("보정 품목 B")).toBeInTheDocument();
  });

  it("uses the approved 출고 label for a multi-item quantity adjustment", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.sub_type = "adjust_out";
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("출고")).toBeInTheDocument();
    expect(screen.queryByText("수량보정 입고")).not.toBeInTheDocument();
  });

  it("groups legacy manual-only production batches as quantity adjustments", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.sub_type = "produce";
    batch.bundles = batch.bundles.map((bundle) => ({
      ...bundle,
      lines: bundle.lines.map((line) => ({
        ...line,
        direction: "in",
        from_bucket: "none",
        from_department: null,
        to_bucket: "production",
        to_department: "조립",
      })),
    }));

    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("수량보정 입고")).toBeInTheDocument();
    expect(screen.queryByText("보정 품목 A")).not.toBeInTheDocument();
  });

  it("keeps a single quantity adjustment as a direct item row", () => {
    const batch = makeMultiItemAdjustmentBatch();
    batch.bundles = [batch.bundles[0]];
    render(
      <table><tbody><BomBatchDetail batchId={batch.batch_id} colSpan={8} cache={new Map([[batch.batch_id, batch]])} onCached={vi.fn()} /></tbody></table>,
    );

    expect(screen.getByText("보정 품목 A")).toBeInTheDocument();
    expect(screen.queryByText("수량보정 입고")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "라인 구성 펼치기" })).not.toBeInTheDocument();
  });

  it("keeps the status-cell dash fallback for an exclusion-only BOM bundle", () => {
    const batch = makeBatch();
    batch.bundles[0].lines.push(makeLine({
      line_id: "excluded-line",
      item_id: "excluded-item",
      item_name: "제외 구성품",
      included: false,
      shortage: 0,
    }));

    render(
      <table>
        <tbody>
          <BomBatchDetail
            batchId={batch.batch_id}
            colSpan={8}
            cache={new Map([[batch.batch_id, batch]])}
            onCached={vi.fn()}
          />
        </tbody>
      </table>,
    );

    const headerRow = screen.getByText("아주 긴 완제품 구성 묶음 이름").closest("tr");
    expect(headerRow).not.toBeNull();
    const dash = within(headerRow!).getByText("-");
    expect(dash).toBeInTheDocument();
    expect(dash.closest("td")).toHaveClass("text-center");
    expect(dash.parentElement).toHaveClass("justify-center");
    expect(screen.queryByText("제외")).not.toBeInTheDocument();
  });
});
