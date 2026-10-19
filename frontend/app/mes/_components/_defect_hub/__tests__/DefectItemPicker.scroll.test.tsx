import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../_warehouse_v2/types";
import { DefectItemPicker } from "../DefectItemPicker";
const preferences = vi.hoisted(() => ({
  order: undefined as undefined | { item_id: string; display_order: number }[],
  save: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("../../_warehouse_v2/useItemOrderDrag", () => ({
  useItemOrderDrag: () => ({
    dragId: null,
    dropTargetId: null,
    makeHandlers: () => ({}),
  }),
}));

vi.mock("@/lib/queries/useMyItemOrderQuery", () => ({
  useMyItemOrderQuery: () => ({ data: preferences.order }),
  usePutMyItemOrderMutation: () => ({ mutateAsync: preferences.save, isPending: false }),
  useResetMyItemOrderMutation: () => ({ mutateAsync: preferences.reset, isPending: false }),
}));

vi.mock("../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_id: "emp-1", department: "조립", assigned_model_slots: [] }),
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
  it.each([false, true])("재고가 없거나 전량 예약된 품목은 추가를 막고 담긴 품목은 제거한다 (mobile=%s)", (mobilePresentation) => {
    const items = [
      { ...makeItem(1), warehouse_qty: 0, available_quantity: 0 },
      { ...makeItem(2), warehouse_qty: 10, pending_quantity: 10, available_quantity: 0 },
      makeItem(3),
    ];
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const props = { mobilePresentation, items, productModels: [], source: "warehouse" as const, selectedIds: new Set<string>(), onAdd, onRemove };
    const { rerender } = render(<DefectItemPicker {...props} />);
    expect(screen.queryByTestId("defect-picker-row-item-1")).not.toBeInTheDocument();
    for (const id of ["item-2"]) {
      const button = within(screen.getByTestId(`defect-picker-row-${id}`)).getByRole("button");
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId("defect-picker-row-item-3")).getByRole("button"));
    expect(onAdd).toHaveBeenCalledWith(items[2]);
    rerender(<DefectItemPicker {...props} selectedIds={new Set(["item-1"])} />);
    const remove = within(screen.getByTestId("defect-picker-row-item-1")).getByRole("button");
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith(items[0]);
  });

  it("부서 재고도 예약분을 제외한 가용이 없으면 추가하지 못한다", () => {
    const item = { ...makeItem(1), process_type_code: "AR", locations: [{ department: "조립", status: "PRODUCTION", quantity: 10, pending_quantity: 10, available_quantity: 0 }] } as Item;
    render(<DefectItemPicker items={[item]} productModels={[]} source="production" selectedIds={new Set()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole("columnheader", { name: "부서 가용" })).toBeInTheDocument();
    expect(within(screen.getByTestId("defect-picker-row-item-1")).getByRole("button")).toBeDisabled();
  });

  beforeEach(() => {
    preferences.order = undefined;
    preferences.save.mockClear();
    preferences.reset.mockClear();
  });

  it("PC 표 머리글 전체 화면 전환은 검색·선택·스크롤을 유지한다", () => {
    const onFullscreenChange = vi.fn();
    const props = { items: [makeItem(1), makeItem(2)], productModels: [], source: "warehouse" as const, selectedIds: new Set(["item-2"]), onAdd: vi.fn(), onRemove: vi.fn(), onFullscreenChange };
    const { rerender } = render(<DefectItemPicker {...props} />);
    const input = screen.getByRole("textbox", { name: "검색" });
    fireEvent.change(input, { target: { value: "SOLO item 2" } });
    const scroll = screen.getByTestId("defect-picker-scroll");
    scroll.scrollTop = 78;
    const enterButton = screen.getByRole("button", { name: "전체 화면" });
    expect(enterButton.closest("th")).toHaveTextContent("품목명");
    expect(enterButton).toHaveClass("absolute", "left-1/2", "top-1/2", "hidden", "lg:inline-flex");
    fireEvent.click(enterButton);
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);

    rerender(<DefectItemPicker {...props} fullscreen />);
    expect(screen.getByRole("textbox", { name: "검색" })).toBe(input);
    expect(input).toHaveValue("SOLO item 2");
    expect(screen.queryByText("SOLO item 1")).not.toBeInTheDocument();
    expect(screen.getByTestId("defect-picker-row-item-2")).toHaveAttribute("data-added", "true");
    expect(screen.getByTestId("defect-picker-scroll")).toBe(scroll);
    expect(scroll.scrollTop).toBe(78);
    fireEvent.click(screen.getByRole("button", { name: "전체 화면 해제" }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("전체 화면 전환은 편집 중인 순서와 검색·스크롤을 보존하고 저장하지 않는다", () => {
    const onFullscreenChange = vi.fn();
    const props = { items: [makeItem(1), makeItem(2)], productModels: [], source: "warehouse" as const, selectedIds: new Set<string>(), onAdd: vi.fn(), onRemove: vi.fn(), onFullscreenChange };
    const { container, rerender } = render(<DefectItemPicker {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "검색" }), { target: { value: "item 2" } });
    fireEvent.click(screen.getByRole("button", { name: "순서 편집" }));
    const originalRows = Array.from(container.querySelectorAll("tbody tr"));
    const scroll = screen.getByTestId("defect-picker-scroll");
    scroll.scrollTop = 64;
    preferences.order = [{ item_id: "item-2", display_order: 0 }];
    fireEvent.click(screen.getByRole("button", { name: "전체 화면" }));
    rerender(<DefectItemPicker {...props} fullscreen />);

    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(Array.from(container.querySelectorAll("tbody tr"))).toEqual(originalRows);
    expect(scroll.scrollTop).toBe(64);
    expect(screen.getByRole("textbox", { name: "검색" })).toHaveValue("item 2");
    const exitButton = screen.getByRole("button", { name: "전체 화면 해제" });
    expect(exitButton.closest("th")).toHaveTextContent("품목명");
    fireEvent.click(exitButton);
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    rerender(<DefectItemPicker {...props} />);
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(preferences.save).not.toHaveBeenCalled();
    expect(preferences.reset).not.toHaveBeenCalled();
  });

  it("모바일은 전체 화면 버튼과 Escape 종료를 노출하지 않는다", () => {
    const onFullscreenChange = vi.fn();
    render(<DefectItemPicker mobilePresentation fullscreen onFullscreenChange={onFullscreenChange} items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /전체 화면/ })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFullscreenChange).not.toHaveBeenCalled();
  });

  it("선택기가 소비한 Escape는 전체 화면을 유지하고 다음 Escape로 종료한다", async () => {
    const onFullscreenChange = vi.fn();
    render(<DefectItemPicker fullscreen onFullscreenChange={onFullscreenChange} items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    const department = screen.getByRole("combobox", { name: "부서" });
    fireEvent.click(department);
    await screen.findByRole("listbox");
    fireEvent.keyDown(department, { key: "Escape" });
    expect(onFullscreenChange).not.toHaveBeenCalled();
    await waitFor(() => expect(department).toHaveAttribute("aria-expanded", "false"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("Escape 종료 시 비어 있는 포커스는 버튼으로 복구하되 검색 포커스는 유지한다", () => {
    const onFullscreenChange = vi.fn();
    const props = { items: [makeItem(1)], productModels: [], source: "warehouse" as const, selectedIds: new Set<string>(), onAdd: vi.fn(), onRemove: vi.fn(), onFullscreenChange };
    const { rerender } = render(<DefectItemPicker {...props} fullscreen />);
    fireEvent.keyDown(window, { key: "Escape" });
    rerender(<DefectItemPicker {...props} />);
    expect(screen.getByRole("button", { name: "전체 화면" })).toHaveFocus();
    rerender(<DefectItemPicker {...props} fullscreen />);
    const input = screen.getByRole("textbox", { name: "검색" });
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    rerender(<DefectItemPicker {...props} />);
    expect(input).toHaveFocus();
  });

  it("PC 전체 목록은 로그인 부서를 우선하고 모바일 순서는 유지한다", () => {
    const items = [{ ...makeItem(1), process_type_code: "TR" }, { ...makeItem(2), process_type_code: "AR" }];
    const props = { items, productModels: [], source: "warehouse" as const, selectedIds: new Set<string>(), onAdd: vi.fn(), onRemove: vi.fn() };
    const { rerender } = render(<DefectItemPicker {...props} />);
    expect(screen.getAllByTestId(/defect-picker-row-/).map((row) => row.dataset.testid)).toEqual(["defect-picker-row-item-2", "defect-picker-row-item-1"]);
    rerender(<DefectItemPicker {...props} mobilePresentation />);
    expect(screen.getAllByTestId(/defect-picker-row-/).map((row) => row.dataset.testid)).toEqual(["defect-picker-row-item-1", "defect-picker-row-item-2"]);
    rerender(<DefectItemPicker {...props} />);
    fireEvent.click(screen.getByRole("combobox", { name: "부서" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "튜브" }));
    expect(screen.getAllByTestId(/defect-picker-row-/).map((row) => row.dataset.testid)).toEqual(["defect-picker-row-item-1"]);
  });
  it("PC 로그인 부서보다 저장된 개인 순서를 먼저 따른다", () => {
    preferences.order = [{ item_id: "item-1", display_order: 0 }];
    render(<DefectItemPicker items={[{ ...makeItem(1), process_type_code: "TR" }, { ...makeItem(2), process_type_code: "AR" }]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getAllByTestId(/defect-picker-row-/).map((row) => row.dataset.testid)).toEqual(["defect-picker-row-item-1", "defect-picker-row-item-2"]);
    preferences.order = undefined;
  });
  it("한글 조합 중에도 품목 목록을 필터링한다", () => {
    render(<DefectItemPicker items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    const input = screen.getByPlaceholderText("품목명 · 품목 코드");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "없는품목" } });
    expect(screen.queryByText("SOLO item 1")).not.toBeInTheDocument();
    fireEvent.compositionEnd(input, { data: "없는품목" });
    expect(screen.queryByText("SOLO item 1")).not.toBeInTheDocument();
  });

  it("격리 등록은 담긴 건수를 표시하고 선택된 품목으로 이동한다", () => {
    const onSelected = vi.fn();
    const onRemove = vi.fn();
    render(<DefectItemPicker items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set(["item-1"])} onAdd={vi.fn()} onRemove={onRemove}
      {...{ selectedLineCounts: new Map([["item-1", 3]]), onSelected }} />);
    const button = screen.getByRole("button", { name: /SOLO item 1/ });
    expect(button).toHaveTextContent("담김 · 3건");
    fireEvent.click(button);
    expect(onSelected).toHaveBeenCalledWith(expect.objectContaining({ item_id: "item-1" }));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("제출 잠금과 줄수 상한에서는 새 품목을 추가할 수 없다", () => {
    const onAdd = vi.fn();
    const { rerender } = render(<DefectItemPicker items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={onAdd} onRemove={vi.fn()} {...{ addingDisabled: true }} />);
    expect(screen.getByRole("button", { name: /장바구니에 추가/ })).toBeDisabled();
    rerender(<DefectItemPicker items={[makeItem(1)]} productModels={[]} source="warehouse" selectedIds={new Set()} onAdd={onAdd} onRemove={vi.fn()} {...{ disabled: true }} />);
    expect(screen.getByRole("button", { name: /장바구니에 추가/ })).toBeDisabled();
  });

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
