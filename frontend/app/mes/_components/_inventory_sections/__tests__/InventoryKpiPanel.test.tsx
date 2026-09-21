import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InventoryKpiPanel } from "../InventoryKpiPanel";

const cards = [
  { key: "ALL" as const, label: "전체", value: 12, hint: "전체 품목", tone: "#2563eb" },
  { key: "NORMAL" as const, label: "정상", value: 8, hint: "정상 재고", tone: "#10b981" },
  { key: "LOW" as const, label: "부족", value: 3, hint: "부족 재고", tone: "#f59e0b" },
  { key: "ZERO" as const, label: "소진", value: 1, hint: "재고 없음", tone: "#ef4444" },
];

describe("InventoryKpiPanel 로딩 상태", () => {
  it("최초 재고 조회 중에는 0 대신 같은 자리의 카드 스켈레톤 4개를 표시한다", () => {
    render(
      <InventoryKpiPanel cards={cards} activeKey="ALL" onChange={vi.fn()} loading />,
    );

    expect(screen.getAllByRole("status", { name: "집계 중" })).toHaveLength(4);
    expect(screen.getByText("전체")).toBeInTheDocument();
    expect(screen.getByText("전체 품목")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("기존 카드가 있으면 재조회 여부와 무관하게 실제 값을 유지할 수 있다", () => {
    render(<InventoryKpiPanel cards={cards} activeKey="ALL" onChange={vi.fn()} />);

    expect(screen.getByText("전체")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
