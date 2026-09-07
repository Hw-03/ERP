import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Handover } from "@/lib/api/types";
import { HandoverCardList } from "../HandoverSectionPanel";

function handover(status: string): Handover {
  return {
    handover_id: "handover-1",
    handover_code: null,
    status,
    author_employee_id: "employee-1",
    author_name: "작성자",
    from_department: "튜브",
    to_department: "고압",
    title: "인수인계",
    process_content: null,
    product_name: null,
    doc_date: null,
    analysis_text: null,
    notes: null,
    received_by_employee_id: null,
    received_by_name: null,
    received_at: null,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
    lines: [],
  };
}

describe("HandoverCardList", () => {
  it("알 수 없는 상태를 중립 표시하고 상태 전이 command를 숨긴다", () => {
    render(
      <HandoverCardList
        docs={[handover("future_status")]}
        emptyText="없음"
        onPrint={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReceive={vi.fn()}
      />,
    );

    expect(screen.getByText("알 수 없는 상태 (future_status)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이어쓰기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "임시저장 삭제" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "인수 확인" })).not.toBeInTheDocument();
  });
});
