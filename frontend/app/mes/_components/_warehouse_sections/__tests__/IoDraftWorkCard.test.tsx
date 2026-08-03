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
});
