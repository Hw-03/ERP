import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequestBucket, StockRequest, StockRequestLine } from "@/lib/api";
import { WarehouseQueueRow } from "../WarehouseQueueRow";

function makeLine(
  index: number,
  fromBucket: RequestBucket = "warehouse",
  toBucket: RequestBucket = "production",
): StockRequestLine {
  return {
    line_id: `line-${index}`,
    request_id: "req-1",
    item_id: `item-${index}`,
    item_name_snapshot: `테스트 품목 ${index}`,
    mes_code_snapshot: `3-TR-${String(index).padStart(4, "0")}`,
    quantity: index,
    from_bucket: fromBucket,
    from_department: null,
    to_bucket: toBucket,
    to_department: "조립",
    status: "reserved",
    created_at: "2026-08-27T00:00:00Z",
  };
}

function makeRequest(overrides: Partial<StockRequest> = {}): StockRequest {
  return {
    request_id: "req-1",
    request_type: "warehouse_to_dept",
    status: "reserved",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    notes: null,
    submitted_at: "2026-08-04T00:05:00Z",
    created_at: "2026-07-02T00:00:00Z",
    lines: [makeLine(1)],
    ...overrides,
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

describe("WarehouseQueueRow request timestamp", () => {
  it("요청자의 실제 제출 일시를 KST 절대 시각으로 표시", () => {
    render(<WarehouseQueueRow {...baseProps} />);

    expect(screen.getByText("2026년 08월 04일 09시 05분")).toHaveClass(
      "text-base",
      "font-bold",
    );
  });

  it("제출 일시가 없는 레거시 요청은 생성 일시를 표시", () => {
    const req = {
      ...makeRequest(),
      submitted_at: null,
      created_at: "2026-08-03T15:05:00Z",
    };

    render(<WarehouseQueueRow {...baseProps} req={req} />);

    expect(screen.getByText("2026년 08월 04일 00시 05분")).toBeInTheDocument();
  });
});

describe("WarehouseQueueRow presentation", () => {
  it("submitted도 승인 대기로 표시하고 유형·부서·건수·상태 순으로 배치", () => {
    const { container } = render(
      <WarehouseQueueRow {...baseProps} req={makeRequest({ status: "submitted" })} />,
    );

    expect(screen.getByText("승인 대기")).toBeInTheDocument();
    expect(screen.getByText("창고 → 부서")).toHaveClass("text-xl");
    expect(screen.getByTestId("warehouse-request-summary")).toHaveTextContent("조립 · 1건");
    expect(screen.queryByText("제출됨")).not.toBeInTheDocument();
    const heading = container.querySelector("[data-stock-request-id] > div");
    expect(heading?.textContent?.replace(/\s/g, "")).toMatch(/^창고→부서조립·1건승인대기/);
  });

  it("승인 대상 품목을 3열로 전부 표시하고 접지 않음", () => {
    render(
      <WarehouseQueueRow
        {...baseProps}
        req={makeRequest({ lines: Array.from({ length: 6 }, (_, index) => makeLine(index + 1)) })}
      />,
    );

    expect(screen.getByText("품목명")).toBeInTheDocument();
    expect(screen.getByText("품목 코드")).toBeInTheDocument();
    expect(screen.getByText("요청 수량")).toBeInTheDocument();
    expect(screen.getByText("이동 6개")).toBeInTheDocument();
    expect(screen.getByText("테스트 품목 6")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /더보기|접기/ })).not.toBeInTheDocument();
  });

  it("기본 상태에서 비고와 승인·반려를 같은 줄에 두고 비고를 16px로 표시", () => {
    render(
      <WarehouseQueueRow
        {...baseProps}
        approvePinFor={null}
        req={makeRequest({ notes: "출고 테스트" })}
      />,
    );

    const footer = screen.getByTestId("warehouse-queue-footer");
    const actions = screen.getByTestId("warehouse-queue-actions");

    expect(screen.getByText("비고: 출고 테스트")).toHaveClass("text-base");
    expect(within(footer).getByRole("button", { name: "승인" })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: "반려" })).toBeInTheDocument();
    expect(actions).toHaveClass("ml-auto");
  });
});
