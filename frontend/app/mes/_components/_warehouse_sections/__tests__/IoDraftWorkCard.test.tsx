import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch } from "@/lib/api";
import { IoDraftWorkCard } from "../IoDraftWorkCard";

function makeDraft(overrides: Partial<IoBatch> = {}): IoBatch {
  return {
    batch_id: "draft-1",
    work_type: "warehouse_io",
    sub_type: "warehouse_to_dept",
    status: "draft",
    requester_employee_id: "employee-1",
    requester_name: "작업자",
    requester_department: "출하",
    approver_employee_id: null,
    approver_name: null,
    from_department: "출하",
    to_department: "조립",
    requires_approval: true,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-28T00:00:00Z",
    updated_at: "2026-07-28T00:00:00Z",
    submitted_at: null,
    completed_at: null,
    bundles: [{
      bundle_id: "bundle-1",
      source_kind: "direct_item",
      title: "품목",
      source_item_id: "item-1",
      source_mes_code: "PA-001",
      quantity: 1,
      expanded_level: 0,
      lines: [{
        line_id: "line-1",
        item_id: "item-1",
        item_name: "품목",
        mes_code: "PA-001",
        unit: "EA",
        direction: "move",
        from_bucket: "warehouse",
        from_department: null,
        to_bucket: "production",
        to_department: "조립",
        quantity: 1,
        bom_expected: null,
        included: true,
        origin: "direct",
        edited: false,
        has_children: false,
        shortage: 0,
        exclusion_note: null,
      }],
    }],
    ...overrides,
  };
}

describe("IoDraftWorkCard", () => {
  it("기존 창고→부서 draft는 상위 출발 부서 대신 line bucket의 창고 라벨을 표시한다", () => {
    render(<IoDraftWorkCard draft={makeDraft()} isBusy={false} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);

    expect(screen.getByText("창고 → 조립")).toBeInTheDocument();
    expect(screen.queryByText("출하 → 조립")).not.toBeInTheDocument();
  });
});
