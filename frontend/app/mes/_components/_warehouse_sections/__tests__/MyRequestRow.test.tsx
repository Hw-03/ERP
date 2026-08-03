import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StockRequest } from "@/lib/api";
import { MyRequestRow } from "../MyRequestRow";

function makeRequest(overrides: Partial<StockRequest> = {}): StockRequest {
  return {
    request_id: "req-1",
    request_type: "warehouse_to_dept",
    status: "completed",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    submitted_at: "2026-08-04T00:05:00Z",
    created_at: "2026-07-02T00:00:00Z",
    notes: null,
    rejected_reason: null,
    lines: [],
    ...overrides,
  } as StockRequest;
}

describe("MyRequestRow request timestamp", () => {
  it("상대시간 대신 실제 제출 일시를 표시", () => {
    render(
      <MyRequestRow
        req={makeRequest()}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("2026년 08월 04일 09시 05분")).toBeInTheDocument();
    expect(screen.queryByText(/(?:방금 전|분 전|시간 전|일 전)/)).not.toBeInTheDocument();
  });

  it("제출 일시가 없으면 생성 일시를 표시", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          submitted_at: null,
          created_at: "2026-08-03T15:05:00Z",
        })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("2026년 08월 04일 00시 05분")).toBeInTheDocument();
  });
});
