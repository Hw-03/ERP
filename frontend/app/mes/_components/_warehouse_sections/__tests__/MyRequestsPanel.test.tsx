import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IoBatch, StockRequest } from "@/lib/api";
import { MyRequestsPanel } from "../MyRequestsPanel";

const hooks = vi.hoisted(() => ({
  cancel: { mutate: vi.fn(), isPending: false },
  revert: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/lib/queries/useStockRequestsQuery", () => ({
  useMyStockRequestsQuery: () => ({ data: requests, isLoading: false, error: null, refetch: vi.fn() }),
  useCancelStockRequestMutation: () => hooks.cancel,
  useRevertToDraftMutation: () => hooks.revert,
}));

vi.mock("@/lib/ui/ConfirmModal", () => ({
  ConfirmModal: ({ open, children, confirmLabel, onConfirm }: { open: boolean; children: React.ReactNode; confirmLabel: string; onConfirm: () => void }) => open ? (
    <div role="dialog">{children}<button type="button" onClick={onConfirm}>{confirmLabel}</button></div>
  ) : null,
}));

function request(overrides: Partial<StockRequest>): StockRequest {
  return {
    request_id: "request",
    request_code: null,
    requester_employee_id: "requester",
    requester_name: "요청자",
    requester_department: "조립",
    request_type: "internal_use",
    status: "completed",
    requires_warehouse_approval: false,
    reserved_at: null,
    submitted_at: "2026-09-15T00:00:00Z",
    approved_by_employee_id: null,
    approved_by_name: null,
    approved_at: null,
    rejected_by_employee_id: null,
    rejected_by_name: null,
    rejected_at: null,
    rejected_reason: null,
    requires_department_approval: false,
    department_approved_by_employee_id: null,
    department_approved_by_name: null,
    department_approved_at: null,
    requires_as_research_approval: false,
    as_research_approved_by_employee_id: null,
    as_research_approved_by_name: null,
    as_research_approved_at: null,
    cancelled_at: null,
    completed_at: null,
    reference_no: null,
    notes: null,
    operation_batch_id: "approval-batch",
    reason_category: null,
    reason_memo: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    lines: [],
    ...overrides,
  };
}

const internalUseRequests = [
  request({ request_id: "warehouse-rejected", status: "rejected", requires_warehouse_approval: true, rejected_by_name: "창고 반려자", rejected_reason: "창고 부족" }),
  request({ request_id: "as-approved", requires_as_research_approval: true, as_research_approved_by_name: "연구 승인자" }),
  request({ request_id: "department-open", status: "submitted", requires_department_approval: true }),
];

let requests: StockRequest[] = internalUseRequests;

describe("MyRequestsPanel", () => {
  beforeEach(() => {
    requests = internalUseRequests;
    hooks.cancel.mutate.mockClear();
    hooks.revert.mutate.mockClear();
  });

  it("대표가 반려여도 열린 형제를 batch 취소 대상으로 선택하고 AS·연구 batch 영향 범위를 안내한다", () => {
    render(<MyRequestsPanel employeeId="requester" refreshNonce={0} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("AS·연구 작업 묶음 전체가 취소됩니다");
    fireEvent.change(screen.getByPlaceholderText("PIN"), { target: { value: "0000" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "요청 취소" }));

    expect(hooks.cancel.mutate).toHaveBeenCalledWith(
      { requestId: "department-open", payload: { actor_employee_id: "requester", pin: "0000" } },
      expect.any(Object),
    );
  });

  it("internal_use가 아닌 같은 batch 요청은 각각 표시하고 단건 취소를 안내한다", () => {
    requests = [
      request({ request_id: "warehouse-1", request_type: "warehouse_to_dept", operation_batch_id: "ordinary-batch", status: "submitted" }),
      request({ request_id: "warehouse-2", request_type: "warehouse_to_dept", operation_batch_id: "ordinary-batch", status: "submitted" }),
    ];

    render(<MyRequestsPanel employeeId="requester" refreshNonce={0} onChanged={vi.fn()} />);

    expect(document.querySelectorAll("[data-stock-request-id]")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "요청 취소" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("본인 PIN을 입력하면 이 요청이 취소됩니다.");
  });

  it("internal_use 작업 묶음은 API 정렬과 무관하게 사용출고 요청을 카드 대표로 선택한다", () => {
    requests = [
      request({
        request_id: "return-adjustment",
        request_type: "manual_adjustment",
        operation_batch_id: "internal-use-batch",
        notes: "수량 조정 비고",
      }),
      request({
        request_id: "internal-use",
        request_type: "internal_use",
        operation_batch_id: "internal-use-batch",
        status: "rejected",
        requires_as_research_approval: true,
        notes: "AS 사용출고 비고",
        rejected_reason: "AS 반려 사유",
      }),
    ];

    render(<MyRequestsPanel employeeId="requester" refreshNonce={0} onChanged={vi.fn()} />);

    expect(screen.getByText("AS·연구 사용출고")).toBeInTheDocument();
    expect(screen.getByText("AS 사용출고 비고")).toBeInTheDocument();
    expect(screen.getByTestId("my-request-rejection")).toHaveTextContent("AS 반려 사유");
    expect(screen.queryByText("수량 조정 비고")).not.toBeInTheDocument();
  });

  it("수정 성공 시 반환된 입출고 draft를 이어서 작업 콜백으로 전달한다", () => {
    requests = [request({ request_id: "editable-request", request_type: "warehouse_to_dept", status: "submitted" })];
    const onContinueIoDraft = vi.fn();
    const restoredDraft = { batch_id: "reverted-draft" } as IoBatch;

    render(
      <MyRequestsPanel
        employeeId="requester"
        refreshNonce={0}
        onChanged={vi.fn()}
        onContinueIoDraft={onContinueIoDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("결재 요청을 작성 중으로 되돌립니다");
    fireEvent.change(screen.getByPlaceholderText("PIN"), { target: { value: "0000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "수정 시작" }));

    expect(hooks.revert.mutate).toHaveBeenCalledWith(
      { requestId: "editable-request", payload: { actor_employee_id: "requester", pin: "0000" } },
      expect.any(Object),
    );
    act(() => {
      (hooks.revert.mutate.mock.calls[0][1] as { onSuccess: (draft: IoBatch) => void }).onSuccess(restoredDraft);
    });
    expect(onContinueIoDraft).toHaveBeenCalledWith(restoredDraft);
  });

  it("수정 실패 시 모달을 유지하고 이어서 작업으로 이동하지 않는다", () => {
    requests = [request({ request_id: "editable-request", request_type: "warehouse_to_dept", status: "submitted" })];
    const onContinueIoDraft = vi.fn();

    render(
      <MyRequestsPanel
        employeeId="requester"
        refreshNonce={0}
        onChanged={vi.fn()}
        onContinueIoDraft={onContinueIoDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByPlaceholderText("PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 시작" }));
    act(() => {
      (hooks.revert.mutate.mock.calls[0][1] as { onError: (error: Error) => void }).onError(new Error("PIN 오류"));
    });

    expect(screen.getByRole("dialog")).toHaveTextContent("PIN 오류");
    expect(onContinueIoDraft).not.toHaveBeenCalled();
  });
});
