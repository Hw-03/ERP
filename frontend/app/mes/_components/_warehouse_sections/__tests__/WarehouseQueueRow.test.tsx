import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StockRequest } from "@/lib/api";
import { WarehouseQueueRow } from "../WarehouseQueueRow";

function makeRequest(): StockRequest {
  return {
    request_id: "req-1",
    request_type: "warehouse_to_dept",
    status: "reserved",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    notes: null,
    created_at: "2026-07-02T00:00:00Z",
    lines: [
      {
        line_id: "line-1",
        item_id: "item-1",
        item_name_snapshot: "테스트 품목",
        mes_code_snapshot: "3-TR-0001",
        quantity: 1,
        from_bucket: "warehouse",
        from_department: null,
        to_bucket: "production",
        to_department: "조립",
      },
    ],
  } as unknown as StockRequest;
}

const baseProps = {
  req: makeRequest(),
  busyId: null,
  approvePinFor: "req-1",
  approvePin: "",
  approveError: null,
  setApprovePin: vi.fn(),
  setApprovePinFor: vi.fn(),
  showRejectFor: null,
  rejectReason: "",
  rejectPin: "",
  rejectError: null,
  setRejectReason: vi.fn(),
  setRejectPin: vi.fn(),
  setShowRejectFor: vi.fn(),
  closeApprove: vi.fn(),
  closeReject: vi.fn(),
  submitApprove: vi.fn(),
  submitReject: vi.fn(),
};

describe("WarehouseQueueRow approval PIN", () => {
  it("keeps only four digits in approve PIN input", () => {
    const setApprovePin = vi.fn();
    render(<WarehouseQueueRow {...baseProps} setApprovePin={setApprovePin} />);

    fireEvent.change(screen.getByPlaceholderText("0000"), { target: { value: "12a345" } });

    expect(setApprovePin).toHaveBeenCalledWith("1234");
  });

  it("submits approval with Space only when a four-digit PIN is present", () => {
    const submitApprove = vi.fn();
    const { rerender } = render(
      <WarehouseQueueRow {...baseProps} approvePin="123" submitApprove={submitApprove} />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText("0000"), { key: " " });
    expect(submitApprove).not.toHaveBeenCalled();

    rerender(<WarehouseQueueRow {...baseProps} approvePin="1234" submitApprove={submitApprove} />);
    fireEvent.keyDown(screen.getByPlaceholderText("0000"), { key: " " });

    expect(submitApprove).toHaveBeenCalledWith("req-1");
  });
});
