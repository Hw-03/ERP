import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "../../_warehouse_v2/types";
import { DefectItemPicker } from "../DefectItemPicker";

vi.mock("../useItemOrderDrag", () => ({
  useItemOrderDrag: () => ({
    dragId: null,
    dropTargetId: null,
    makeHandlers: () => ({}),
  }),
}));

vi.mock("@/lib/queries/useMyItemOrderQuery", () => ({
  useMyItemOrderQuery: () => ({ data: null }),
  usePutMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_id: "emp-1", assigned_model_slots: [] }),
}));

function makeItem(index: number): Item {
  return {
    item_id: `item-${index}`,
    item_name: `SOLO item ${index}`,
    mes_code: `46-AA-${String(index).padStart(4, "0")}`,
    quantity: 10,
    warehouse_qty: 10,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 10,
    min_stock: null,
    locations: [],
    model_slots: [],
    deleted_at: null,
  } as unknown as Item;
}

describe("DefectItemPicker mobile scroll", () => {
  it("모바일은 두 열에서 코드와 모든 재고 정보를 표시하며 선택 문구를 사용한다", () => {
    const onRemove = vi.fn();
    render(<DefectItemPicker mobilePresentation items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set(["item-1"])} onAdd={() => {}} onRemove={onRemove} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    const row = screen.getByTestId("defect-picker-row-item-1");
    expect(within(row).getAllByRole("cell")).toHaveLength(2);
    expect(row).toHaveTextContent("46-AA-0001");
    expect(row).toHaveTextContent("보유 10 · 예약 0 · 가용 10");
    fireEvent.click(within(row).getByRole("button", { name: "SOLO item 1 선택 해제" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }));
  });
  it("모바일 품목 선택 행은 로딩 완료 직후 투명도 애니메이션 없이 표시한다", () => {
    const { container } = render(<DefectItemPicker mobilePresentation items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={() => {}} onRemove={() => {}} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("tbody")).not.toHaveAttribute("class");
  });
  it("모바일 검색 이름을 유지하고 외곽 바깥쪽 스크롤바로 결과만 스크롤한다", async () => {
    render(<DefectItemPicker mobilePresentation items={[makeItem(1), makeItem(2)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={() => {}} onRemove={() => {}} />);
    const input = screen.getByRole("textbox", { name: "검색" });
    expect(screen.getByText("검색")).toHaveClass("sr-only");
    const frame = screen.getByTestId("defect-picker-table");
    const scroll = screen.getByTestId("defect-picker-scroll");
    expect(frame).toHaveClass("relative", "min-h-0", "flex-1");
    expect(scroll).toHaveClass("overscroll-contain");
    expect(scroll).toHaveStyle({ backgroundClip: "content-box" });
    expect(screen.getByTestId("defect-picker-frame-outline")).toHaveClass("rounded-[16px]");
    expect(screen.getByRole("columnheader", { name: "품목명" }).closest("thead")).toHaveClass("sticky", "top-0");
    scroll.scrollTop = 120;
    fireEvent.change(input, { target: { value: "SOLO item 2" } });
    await waitFor(() => expect(scroll.scrollTop).toBe(0));
    expect(screen.queryByText("SOLO item 1")).not.toBeInTheDocument();
  });

  it("keeps the department availability header while showing only the available quantity", () => {
    const item = {
      ...makeItem(1),
      process_type_code: "TR",
      production_total: 5,
      locations: [
        {
          department: "튜브",
          status: "PRODUCTION",
          quantity: 5,
          pending_quantity: 1,
          available_quantity: 4,
        },
      ],
    } as unknown as Item;

    render(
      <DefectItemPicker
        items={[item]}
        productModels={[]}
        source="production"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "부서 가용" })).toBeInTheDocument();
    const row = screen.getByTestId("defect-picker-row-item-1");
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent(/^4$/);
  });

  it("does not repeat the automatic department as a desktop table column", () => {
    render(
      <DefectItemPicker
        items={[makeItem(1)]}
        productModels={[]}
        source="production"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.queryByRole("columnheader", { name: "부서" })).not.toBeInTheDocument();
  });

  it("makes the result table the touch scroll owner and resets it on search", async () => {
    const { container } = render(
      <DefectItemPicker
        items={Array.from({ length: 30 }, (_, index) => makeItem(index + 1))}
        productModels={[]}
        source="production"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    const frame = screen.getByTestId("defect-picker-table");
    const table = screen.getByTestId("defect-picker-scroll");
    const input = container.querySelector("input");

    expect(input).toBeTruthy();
    expect(frame).toHaveClass("relative", "min-h-0", "flex-1");
    expect(table).toHaveClass("overflow-y-auto", "touch-pan-y", "overscroll-contain", "lg:-right-2.5", "lg:[scrollbar-gutter:stable]");
    expect(screen.getByTestId("defect-picker-frame-outline")).toHaveClass("pointer-events-none", "absolute", "inset-0", "rounded-[16px]");

    table.scrollTop = 120;
    fireEvent.change(input as HTMLInputElement, { target: { value: "SOLO item 2" } });

    await waitFor(() => expect(table.scrollTop).toBe(0));
  });

  it("keeps the department browse filter visible in warehouse source while requiring warehouse stock", () => {
    const withoutWarehouse = { ...makeItem(1), item_id: "no-warehouse", item_name: "창고 없음", warehouse_qty: 0 };
    render(
      <DefectItemPicker
        items={[makeItem(2), withoutWarehouse]}
        productModels={[]}
        source="warehouse"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByText("SOLO item 2")).toBeInTheDocument();
    expect(screen.queryByText("창고 없음")).not.toBeInTheDocument();
  });

  it("blocks an unmapped item only for production source", () => {
    const unmapped = { ...makeItem(3), item_id: "unmapped", item_name: "미지정 품목", process_type_code: "XX" };
    const { rerender } = render(
      <DefectItemPicker
        items={[unmapped]}
        productModels={[]}
        source="production"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText("부서 미지정 · 생산 출처에서 추가할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미지정 품목 장바구니에 추가" })).toBeDisabled();

    rerender(
      <DefectItemPicker
        items={[unmapped]}
        productModels={[]}
        source="warehouse"
        selectedIds={new Set()}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "미지정 품목 장바구니에 추가" })).toBeEnabled();
  });
});
