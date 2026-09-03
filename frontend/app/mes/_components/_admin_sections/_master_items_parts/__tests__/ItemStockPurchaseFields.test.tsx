import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemStockPurchaseFields } from "../ItemStockPurchaseFields";

const form = {
  supplier: "주 공급사",
  supplier_item_code: "SUP-001",
  standard_purchase_price: "1234.50",
  purchase_price_effective_date: "2026-09-01",
  min_stock: "10",
  reorder_point: "5",
  procurement_lead_time_days: "7",
  minimum_order_quantity: "20",
  purchase_memo: "첫 거래는 현금 결제",
};

describe("ItemStockPurchaseFields", () => {
  it("구매·재고 발주 기준과 구매 메모를 표시하되 기본 단위 칩은 표시하지 않는다", () => {
    const { container } = render(<ItemStockPurchaseFields form={form} setForm={vi.fn()} unit="kg" />);

    expect(screen.queryByText("기본 단위: kg")).not.toBeInTheDocument();
    expect(screen.getByText("구매 기준")).toBeInTheDocument();
    expect(screen.getByText("재고·발주 기준")).toBeInTheDocument();
    expect(screen.getByText("원 / kg · 부가세 별도")).toBeInTheDocument();
    expect(screen.getAllByText("kg")).toHaveLength(3);
    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "구매 메모" })).toHaveValue("첫 거래는 현금 결제");
    expect(container.querySelector(".grid.grid-cols-1")).toHaveClass("2xl:grid-cols-2");
  });

  it("발주점이 안전재고보다 작으면 저장을 막지 않는 경고를 표시한다", () => {
    render(<ItemStockPurchaseFields form={form} setForm={vi.fn()} unit="EA" />);

    expect(screen.getByText(/발주점이 안전재고보다 낮습니다/)).toBeInTheDocument();
  });

  it("MOQ 입력은 1 이상으로 제한한다", () => {
    render(<ItemStockPurchaseFields form={form} setForm={vi.fn()} unit="EA" />);

    expect(screen.getByRole("spinbutton", { name: "최소 발주수량(MOQ)" })).toHaveAttribute("min", "1");
  });

  it("숫자 입력은 단위까지 포함한 박스 전체에 포커스 강조를 표시한다", () => {
    render(<ItemStockPurchaseFields form={form} setForm={vi.fn()} unit="EA" />);

    const input = screen.getByRole("spinbutton", { name: "조달 리드타임" });
    expect(input.parentElement).toHaveClass(
      "focus-within:border-[var(--c-blue)]",
      "focus-within:ring-2",
      "focus-within:ring-[color:var(--c-blue)]/20",
    );
    expect(input).not.toHaveClass("focus-visible:outline");
  });

  it("편집 탭의 위아래 여백을 맞추고 구매 메모 크기 조절을 막는다", () => {
    const { container } = render(
      <ItemStockPurchaseFields form={form} setForm={vi.fn()} unit="EA" fillAvailableHeight />,
    );

    expect(container.firstElementChild).toHaveClass("flex", "h-full", "flex-col", "gap-3");
    expect(screen.getByRole("region", { name: "구매 메모" })).toHaveClass("flex-1", "flex", "flex-col");
    expect(screen.getByRole("textbox", { name: "구매 메모" })).toHaveClass("flex-1", "resize-none");
    expect(screen.getByRole("textbox", { name: "구매 메모" })).not.toHaveClass("resize-y");
  });

  it("숫자와 텍스트 입력을 동일한 form setter로 갱신한다", () => {
    const setForm = vi.fn();
    render(<ItemStockPurchaseFields form={{ ...form, reorder_point: "" }} setForm={setForm} unit="EA" />);

    fireEvent.change(screen.getByRole("textbox", { name: "주 공급사" }), { target: { value: "  새 공급사  " } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "발주점" }), { target: { value: "12" } });
    fireEvent.change(screen.getByRole("textbox", { name: "구매 메모" }), { target: { value: "  납기 전 연락  " } });

    const updates = setForm.mock.calls.map(([updater]) => (updater as (current: typeof form) => typeof form)(form));
    expect(updates.some((next) => next.supplier === "  새 공급사  ")).toBe(true);
    expect(updates.some((next) => next.reorder_point === "12")).toBe(true);
    expect(updates.some((next) => next.purchase_memo === "  납기 전 연락  ")).toBe(true);
  });
});
