import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StockRequest } from "@/lib/api";
import { DraftCartItemRow } from "../DraftCartItemRow";

function makeDraft(): StockRequest {
  return {
    request_id: "draft-1",
    request_type: "warehouse_to_dept",
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    updated_at: "2026-08-04T00:05:00Z",
    created_at: "2026-07-02T00:00:00Z",
    notes: null,
    reference_no: null,
    lines: [],
  } as StockRequest;
}

describe("DraftCartItemRow timestamp", () => {
  it("알 수 없는 요청 유형은 안전 문구로 표시하고 draft command를 숨긴다", () => {
    render(
      <DraftCartItemRow
        draft={{ ...makeDraft(), request_type: "future_transfer" as "raw_receive" }}
        isBusy={false}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("알 수 없는 요청 (future_transfer)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이어서 작업" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  it("마지막 수정 일시를 KST 절대 시각으로 표시", () => {
    render(
      <DraftCartItemRow
        draft={makeDraft()}
        isBusy={false}
        onContinue={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("2026년 08월 04일 09시 05분")).toBeInTheDocument();
  });
});
