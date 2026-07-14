import { fireEvent, render, screen } from "@testing-library/react";
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

describe("BomBatchDetail", () => {
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
});
