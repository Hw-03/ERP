import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RequestBucket, StockRequestLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { StockRequestLineTable } from "../StockRequestLineTable";

function makeLine(
  index: number,
  fromBucket: RequestBucket,
  toBucket: RequestBucket,
  quantity = index,
): StockRequestLine {
  return {
    line_id: `line-${index}`,
    request_id: "req-1",
    item_id: `item-${index}`,
    item_name_snapshot: `테스트 품목 ${index}`,
    mes_code_snapshot: `3-TR-${String(index).padStart(4, "0")}`,
    quantity,
    from_bucket: fromBucket,
    from_department: null,
    to_bucket: toBucket,
    to_department: null,
    status: "submitted",
    created_at: "2026-08-27T00:00:00Z",
  };
}

describe("StockRequestLineTable", () => {
  it("데스크톱 열 제목과 입고·출고·이동 요청 수량을 표시", () => {
    render(
      <StockRequestLineTable
        lines={[
          makeLine(1, "none", "warehouse", 12),
          makeLine(2, "production", "none", 3),
          makeLine(3, "warehouse", "production", 5),
        ]}
      />,
    );

    const header = screen.getByText("품목명").parentElement;
    expect(header).not.toBeNull();
    expect(header).toHaveClass("hidden", "lg:grid");
    expect(header).toHaveTextContent("품목명");
    expect(header).toHaveTextContent("품목 코드");
    expect(header).toHaveTextContent("요청 수량");
    expect(header).toHaveStyle({ color: LEGACY_COLORS.muted2 });
    expect(header?.getAttribute("style")).toContain(
      `background: color-mix(in srgb, ${LEGACY_COLORS.muted2} 22%, ${LEGACY_COLORS.s1})`,
    );
    expect(screen.getByText("+12개")).toBeInTheDocument();
    expect(screen.getByText("-3개")).toBeInTheDocument();
    expect(screen.getByText("이동 5개")).toBeInTheDocument();
  });

  it("품목 행에 입고 품목 선택 표와 같은 호버 강조를 적용", () => {
    render(<StockRequestLineTable lines={[makeLine(1, "none", "warehouse")]} />);

    expect(screen.getByText("테스트 품목 1").closest("div")).toHaveClass(
      "transition-colors",
      "duration-150",
      "hover:bg-[var(--c-s4)]",
    );
  });

  it("데스크톱 품목 코드는 공정 기호를 열 제목의 중심축에 맞춤", () => {
    render(<StockRequestLineTable lines={[makeLine(1, "none", "warehouse")]} />);

    expect(screen.getByText("품목 코드")).toHaveClass("text-center");
    expect(screen.getByText("TR").parentElement).toHaveClass(
      "grid",
      "w-full",
      "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    );
    expect(screen.getByText("3-TR-0001")).toHaveClass("lg:hidden");
  });

  it("collapseAfter 이후 품목을 더보기와 접기로 전환", () => {
    const lines = Array.from({ length: 6 }, (_, index) =>
      makeLine(index + 1, "none", "warehouse"),
    );
    render(<StockRequestLineTable lines={lines} collapseAfter={5} />);

    expect(screen.getByText("테스트 품목 5")).toBeInTheDocument();
    expect(screen.queryByText("테스트 품목 6")).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "외 1건 더보기" });
    expect(expandButton).toHaveClass(
      "min-h-11",
      "px-3",
      "py-2",
      "text-center",
      "text-sm",
      "lg:min-h-0",
    );

    fireEvent.click(expandButton);

    expect(screen.getByText("테스트 품목 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "접기" })).toHaveClass(
      "min-h-11",
      "px-3",
      "py-2",
      "text-sm",
      "lg:min-h-0",
    );
  });

  it("collapseAfter가 없으면 승인 대상 품목을 모두 표시", () => {
    const lines = Array.from({ length: 6 }, (_, index) =>
      makeLine(index + 1, "warehouse", "production"),
    );
    render(<StockRequestLineTable lines={lines} />);

    expect(screen.getByText("테스트 품목 6")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /더보기|접기/ })).not.toBeInTheDocument();
  });
});
