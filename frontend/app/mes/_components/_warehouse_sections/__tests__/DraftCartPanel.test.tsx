import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IoBatch } from "@/lib/api";
import { DraftCartPanel } from "../DraftCartPanel";

const mockDraftData = vi.hoisted(() => ({
  stockDrafts: [] as unknown[],
  ioDrafts: [] as unknown[],
}));

vi.mock("@/lib/queries/useDraftCartQuery", () => ({
  useDraftCartQuery: () => ({
    data: mockDraftData,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeleteIoDraftMutation: () => ({ mutate: vi.fn() }),
  useDeleteStockRequestDraftMutation: () => ({ mutate: vi.fn() }),
}));

function makeIoDraft(): IoBatch {
  return {
    batch_id: "batch-1",
    work_type: "process",
    sub_type: "disassemble",
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: null,
    to_department: "조립",
    requires_approval: true,
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

describe("DraftCartPanel empty state", () => {
  beforeEach(() => {
    mockDraftData.stockDrafts = [];
    mockDraftData.ioDrafts = [];
  });

  it("offers a request-compose action when there is no work in progress", () => {
    const onStartCompose = vi.fn();

    render(
      <DraftCartPanel
        layout="desktop"
        employeeId="emp-1"
        refreshNonce={0}
        onContinue={vi.fn()}
        onChanged={vi.fn()}
        onStartCompose={onStartCompose}
      />,
    );

    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeInTheDocument();
    expect(screen.getByTestId("warehouse-empty-work-area")).toHaveClass("flex-1", "min-h-0");
    fireEvent.click(screen.getByRole("button", { name: "요청 작성" }));
    expect(onStartCompose).toHaveBeenCalledOnce();
  });

  it("uses the hierarchy table only in the desktop layout", () => {
    mockDraftData.ioDrafts = [makeIoDraft()];
    const commonProps = {
      employeeId: "emp-1",
      refreshNonce: 0,
      onContinue: vi.fn(),
      onContinueIo: vi.fn(),
      onChanged: vi.fn(),
    };
    const { rerender } = render(<DraftCartPanel {...commonProps} layout="desktop" />);

    expect(screen.getByRole("columnheader", { name: "예정 변동" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/작업 카드:/)).not.toBeInTheDocument();

    rerender(<DraftCartPanel {...commonProps} layout="mobile" />);
    expect(screen.queryByRole("columnheader", { name: "예정 변동" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("작업 카드: 부서 입출고, 출고 · BOM")).toBeInTheDocument();
  });
});
