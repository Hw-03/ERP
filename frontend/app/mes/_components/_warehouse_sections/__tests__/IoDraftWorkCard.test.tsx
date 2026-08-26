import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch } from "@/lib/api";
import { IoDraftWorkCard } from "../IoDraftWorkCard";

function makeDraft(): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "receive",
    sub_type: "receive_supplier",
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: null,
    to_department: null,
    requires_approval: false,
    stock_request_id: null,
    shipping_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-08-04T00:05:00Z",
    updated_at: "2026-08-04T00:10:00Z",
    submitted_at: null,
    completed_at: null,
    bundles: [],
  };
}

describe("IoDraftWorkCard timestamp", () => {
  it("상대시간 대신 작업 생성 일시를 KST 절대 시각으로 표시", () => {
    render(
      <IoDraftWorkCard
        draft={makeDraft()}
        isBusy={false}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText("2026년 08월 04일 09시 05분 작업 시작"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/(?:방금 전|분 전|시간 전|일 전)/)).not.toBeInTheDocument();
  });

  it("최신 연결 반려 사유를 작성 중 카드에 표시한다", () => {
    const draft = makeDraft();
    draft.stock_requests = [{
      stock_request_id: "request-1", request_code: "SR-1", status: "rejected",
      from_bucket: "production", from_department: "조립", approval_kind: "department",
      requires_warehouse_approval: false, requires_department_approval: true,
      approver_employee_id: null, approver_name: null,
      rejected_by_name: "조립 부서장", rejected_at: "2026-08-04T01:05:00Z",
      rejected_reason: "수량 근거를 보완하세요",
    }];

    render(<IoDraftWorkCard draft={draft} isBusy={false} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);

    expect(screen.getByText("반려 사유: 수량 근거를 보완하세요")).toBeInTheDocument();
    expect(screen.getByText(/조립 부서장.*2026년 08월 04일 10시 05분/)).toBeInTheDocument();
  });
});
