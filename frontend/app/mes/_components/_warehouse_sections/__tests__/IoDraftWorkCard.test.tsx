import { fireEvent, render, screen } from "@testing-library/react";
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
  it("관련 조사 반영 후 이어서 작업으로 진입할 수 있다", () => {
    const draft: IoBatch = { ...makeDraft(), stocktake_pause: { token: "pause", round_id: "round", state: "ready", paused_at: "now", pending_target_count: 0, missing_target_count: 0 } };
    const onContinue = vi.fn();
    render(<IoDraftWorkCard draft={draft} isBusy={false} onContinue={onContinue} onRequestDelete={vi.fn()} />);
    expect(screen.getByText("이어서 작업 가능")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
  it("내역의 작업 분류는 배지에 한 번 표시하고 세부 작업명은 별도로 보존한다", () => {
    const draft = { ...makeDraft(), work_type: "warehouse_io", sub_type: "dept_to_warehouse" } as IoBatch;
    render(<IoDraftWorkCard draft={draft} isBusy={false} onContinue={vi.fn()} onRequestDelete={vi.fn()} />);
    const menu = screen.getByText("창고 입출고");
    expect(menu.parentElement).toHaveTextContent(/^창고 입출고$/);
    expect(menu.parentElement?.querySelector("svg")).toHaveClass("lucide-arrow-right-left");
    expect(screen.getAllByText("창고 입출고")).toHaveLength(1);
    expect(screen.getByText("부서 → 창고")).toBeInTheDocument();
  });

  it("일반 작업의 상태 배지는 생략하고 반려와 예약 확인 안내만 표시한다", () => {
    const props = { isBusy: false, onContinue: vi.fn(), onRequestDelete: vi.fn() };
    const view = render(<IoDraftWorkCard {...props} draft={{ ...makeDraft(), reservation_status: "reserved" }} />);
    expect(screen.queryByText("작업 중")).not.toBeInTheDocument();
    view.rerender(<IoDraftWorkCard {...props} draft={{ ...makeDraft(), reservation_status: "inactive" }} />);
    expect(screen.queryByText("작업 중")).not.toBeInTheDocument();
    expect(screen.queryByText("예약 해제")).not.toBeInTheDocument();
    view.rerender(<IoDraftWorkCard {...props} draft={{ ...makeDraft(), reservation_status: "inactive", reservation_issue: { code: "returned_after_rejection", message: "반려된 작업", shortages: [] } }} />);
    expect(screen.getByText("반려됨")).toBeInTheDocument();
    view.rerender(<IoDraftWorkCard {...props} draft={{ ...makeDraft(), reservation_status: undefined }} />);
    expect(screen.getByText("예약 상태 확인 필요")).toBeInTheDocument();
  });

  it("이어서 작업과 삭제 요청을 각각 전달하고 처리 중에는 잠근다", () => {
    const onContinue = vi.fn();
    const onRequestDelete = vi.fn();
    const props = { draft: makeDraft(), onContinue, onRequestDelete };
    const view = render(<IoDraftWorkCard {...props} isBusy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onRequestDelete).toHaveBeenCalledOnce();
    view.rerender(<IoDraftWorkCard {...props} isBusy />);
    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onRequestDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "이어서 작업" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "작업 삭제" })).toBeDisabled();
  });

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
