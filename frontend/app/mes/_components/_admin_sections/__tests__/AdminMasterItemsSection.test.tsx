import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminMasterItemsSection } from "../AdminMasterItemsSection";
import styles from "../_admin_primitives/AdminMasterData.module.css";
import { AdminReadProvider, INITIAL_ADMIN_READ_STATES } from "../_admin_primitives/AdminReadState";
import { AdminSessionProvider } from "../../_admin_hooks/useAdminSessionState";

const item = {
  item_id: "item-1",
  item_name: "주 품목명",
  mes_code: "MES-001",
  quantity: 10,
  min_stock: 1,
  deleted_at: null,
};

const context: any = {
  visibleItems: [item],
  selectedItem: null,
  setSelectedItem: vi.fn(),
  itemSearch: "",
  setItemSearch: vi.fn(),
  addMode: false,
  setAddMode: vi.fn(),
  saveItem: vi.fn(),
  dirty: false,
  canReorderItems: true,
  reorderItems: vi.fn(),
  deleteItem: vi.fn(),
  restoreItem: vi.fn(),
  addForm: {},
  setAddForm: vi.fn(),
  addItem: vi.fn(),
  saveItemField: vi.fn(),
  updateItemFull: vi.fn(),
  editForm: {
    item_name: item.item_name,
    legacy_item_type: "",
    supplier: "",
    supplier_item_code: "",
    standard_purchase_price: "",
    purchase_price_effective_date: "",
    min_stock: "",
    reorder_point: "",
    procurement_lead_time_days: "",
    minimum_order_quantity: "",
    process_type_code: "TR",
    unit: "EA",
    model_slots: [],
    sales_review_required: false,
  },
  setEditForm: vi.fn(),
  productModels: [],
};

vi.mock("../AdminMasterItemsContext", () => ({
  useAdminMasterItemsContext: () => context,
}));

vi.mock("../../DepartmentsContext", () => ({
  useDepartments: () => [],
}));

function findByClasses(container: HTMLElement, ...classes: string[]) {
  return [...container.querySelectorAll<HTMLElement>("div")].find((element) =>
    classes.every((className) => element.classList.contains(className)),
  );
}

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "animate");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  context.visibleItems = [item];
  context.selectedItem = null;
  context.addMode = false;
  context.addForm = {};
  context.canReorderItems = true;
});

describe("AdminMasterItemsSection", () => {
  it("restores the detail tab when returning to the same item within the admin session", () => {
    context.selectedItem = item;
    const view = (visible: boolean) => <AdminSessionProvider><DirtyGuardProvider>
      {visible && <AdminMasterItemsSection allBomRows={[]} />}
    </DirtyGuardProvider></AdminSessionProvider>;
    const { rerender } = render(view(true));
    fireEvent.click(screen.getByRole("tab", { name: "재고·구매" }));
    rerender(view(false));
    rerender(view(true));
    expect(screen.getByRole("tab", { name: "재고·구매" })).toHaveAttribute("aria-selected", "true");
  });

  it("다른 품목을 선택하면 기본 탭으로 바로 복귀하고 본문 페이드는 한 번만 재생한다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    context.selectedItem = item;
    const view = () => <DirtyGuardProvider><AdminMasterItemsSection allBomRows={[]} /></DirtyGuardProvider>;
    const { rerender } = render(view());
    const panel = screen.getByRole("tabpanel");
    panel.style.setProperty("--admin-fade-duration", "350ms");
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ width: 400, height: 300, left: 100, top: 200 } as DOMRect);
    fireEvent.click(screen.getByRole("tab", { name: "재고·구매" }));
    expect(animate).toHaveBeenCalledOnce();
    animate.mockClear();

    context.selectedItem = { ...item, item_id: "second", item_name: "다른 품목" };
    rerender(view());
    expect(screen.getByRole("tab", { name: "기본 정보" })).toHaveAttribute("aria-selected", "true");
    expect(animate).toHaveBeenCalledOnce();
  });

  it("삭제 품목을 재고 상태 집계에서 제외하고 별도 집계한다", () => {
    context.visibleItems = [
      item,
      { ...item, item_id: "low", quantity: 1, min_stock: 2 },
      { ...item, item_id: "zero", quantity: 0 },
      { ...item, item_id: "deleted-ok", deleted_at: "2026-10-19T00:00:00Z" },
      { ...item, item_id: "deleted-zero", quantity: 0, deleted_at: "2026-10-19T00:00:00Z" },
    ];
    render(<DirtyGuardProvider><AdminMasterItemsSection allBomRows={[]} /></DirtyGuardProvider>);
    expect(screen.getByText("전체 품목").parentElement).toHaveTextContent("5");
    expect(screen.getAllByText("정상")[0].parentElement).toHaveTextContent("1");
    expect(screen.getAllByText("부족")[0].parentElement).toHaveTextContent("1");
    expect(screen.getAllByText("품절")[0].parentElement).toHaveTextContent("1");
    expect(screen.getByText("삭제", { exact: true }).parentElement).toHaveTextContent("2");
  });

  it("최초 조회에서는 품목 안내 대신 실제 열과 기본 정보 자리를 예약한다", () => {
    render(<AdminReadProvider value={{ states: INITIAL_ADMIN_READ_STATES, retry: vi.fn() }}>
      <DirtyGuardProvider><AdminMasterItemsSection allBomRows={[]} /></DirtyGuardProvider>
    </AdminReadProvider>);
    expect(screen.getByTestId("admin-table-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("admin-detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/품목을 선택하거나 추가/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "품목 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "삭제", exact: true })).toBeDisabled();
  });
  it("[8.19-04] 1050개 visibleItems의 KPI와 가상 목록이 같은 모집단을 사용한다", () => {
    context.visibleItems = Array.from({ length: 1050 }, (_, index) => ({
      ...item,
      item_id: `item-${index + 1}`,
      item_name: `품목 ${String(index + 1).padStart(4, "0")}`,
      mes_code: `MES-${String(index + 1).padStart(4, "0")}`,
      quantity: index < 432 ? 10 : index < 684 ? 1 : 0,
      min_stock: index < 432 ? 1 : index < 684 ? 2 : 1,
    }));

    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const grid = screen.getByRole("grid", { name: "품목 목록" });
    expect(screen.getByText("1,050건")).toBeInTheDocument();
    expect(screen.getByText("전체 품목").parentElement).toHaveTextContent("1050");
    expect(screen.getAllByText("정상")[0]?.parentElement).toHaveTextContent("432");
    expect(screen.getAllByText("부족")[0]?.parentElement).toHaveTextContent("252");
    expect(screen.getAllByText("품절")[0]?.parentElement).toHaveTextContent("366");
    expect(grid).toHaveAttribute("aria-rowcount", "1051");
    expect(within(grid).getAllByRole("row").length).toBeLessThan(80);
  });

  it("locks item reordering while the list is filtered", () => {
    context.canReorderItems = false;
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    expect(screen.getByTestId("item-reorder-locked-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("item-reorder-grip")).not.toBeInTheDocument();
  });

  it("바깥 스크롤 목록의 품목 핸들은 포인터 정렬 저장을 유지한다", () => {
    const second = { ...item, item_id: "item-2", item_name: "두 번째 품목" };
    context.visibleItems = [item, second];
    context.reorderItems.mockClear();
    const originalPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    vi.stubGlobal("PointerEvent", MouseEvent);
    const view = render(<DirtyGuardProvider><AdminMasterItemsSection allBomRows={[]} /></DirtyGuardProvider>);
    try {
      const grip = screen.getAllByTestId("item-reorder-grip")[0];
      const target = screen.getByRole("row", { name: /두 번째 품목/ });
      Object.defineProperty(grip, "setPointerCapture", { configurable: true, value: vi.fn() });
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });
      fireEvent.pointerDown(grip, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(grip, { clientX: 10, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(grip, { clientX: 10, clientY: 30, pointerId: 1 });
      expect(context.reorderItems).toHaveBeenCalledWith([second, item]);
    } finally {
      view.unmount();
      vi.unstubAllGlobals();
      if (originalPoint) Object.defineProperty(document, "elementFromPoint", originalPoint);
      else Reflect.deleteProperty(document, "elementFromPoint");
    }
  });

  it("places the add-form close button in the card header without repeating the title", () => {
    context.addMode = true;
    context.addForm = {
      item_name: "",
      legacy_item_type: "",
      supplier: "",
      supplier_item_code: "",
      standard_purchase_price: "",
      purchase_price_effective_date: "",
      min_stock: "",
      reorder_point: "",
      procurement_lead_time_days: "",
      minimum_order_quantity: "",
      process_type_code: "TR",
      unit: "EA",
      model_slots: [],
      sales_review_required: false,
      initial_quantity: "",
      initial_locations: [],
    };
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const closeButton = screen.getByRole("button", { name: "새 품목 추가 닫기" });
    expect(closeButton).toHaveClass("h-11", "w-11", "!rounded-full");
    expect(screen.getAllByText("새 품목 추가")).toHaveLength(1);
  });

  it("passes the available detail height into the item workspace", () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    expect(findByClasses(container, "min-h-0", "flex-1", "flex-col")).toHaveClass("min-h-0", "flex-1");
  });

  it("선택 품목명과 상태를 좌측 목록과 기본 정보에만 표시한다", async () => {
    context.selectedItem = item;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("tab")).toHaveLength(3);
    });

    expect(screen.queryByText(/준비 중/)).not.toBeInTheDocument();
    expect(screen.getAllByText(item.item_name)).toHaveLength(1);
    expect(screen.getAllByText("정상")).toHaveLength(2);
    expect(screen.getByDisplayValue(item.item_name)).toBeInTheDocument();
    expect(container.querySelector('[class~="text-[18px]"]')).not.toBeInTheDocument();
  });

  it("품목 목록을 품목명·품목 코드·상태 열의 표형 행으로 표시한다", () => {
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const grid = screen.getByRole("grid", { name: "품목 목록" });
    expect(within(grid).getByRole("columnheader", { name: "품목명" })).toBeInTheDocument();
    expect(within(grid).getByRole("columnheader", { name: "품목 코드" })).toBeInTheDocument();
    expect(within(grid).getByRole("columnheader", { name: "상태" })).toBeInTheDocument();

    const row = within(grid).getByRole("row", { name: /주 품목명/ });
    const text = row.textContent ?? "";

    expect(text.indexOf("주 품목명")).toBeLessThan(text.indexOf("MES-001"));
    expect(row).toHaveClass(styles.tableRow);
    expect(within(row).getByText(item.item_name)).toHaveClass("truncate");
    expect(within(row).getAllByRole("gridcell")).toHaveLength(3);
  });

  it("선택한 품목 행을 배경과 좌측 강조선으로 구분한다", () => {
    context.selectedItem = item;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const grid = screen.getByRole("grid", { name: "품목 목록" });
    const row = within(grid).getByRole("row", { name: /주 품목명/ });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(row).toHaveClass(styles.tableRow);
  });

  it("keeps active item deletion controls beside the detail tabs", async () => {
    context.selectedItem = item;
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());

    const tablist = screen.getByRole("tablist");
    const deleteButton = screen.getByRole("button", { name: "삭제" });
    const tabRow = tablist.parentElement!;
    const actionWrapper = tablist.nextElementSibling;

    expect(tabRow).toHaveClass("flex", "justify-between");
    expect(tabRow.previousElementSibling).toBeNull();
    expect(actionWrapper).toBe(deleteButton.parentElement);
    expect(actionWrapper).toContainElement(deleteButton);
    expect(tablist).not.toContainElement(deleteButton);
  });

  it("재고·구매 탭은 저장 footer를 유지하고 기존 재고 카드 없이 기준 입력을 표시한다", async () => {
    context.selectedItem = item;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => expect(screen.getByRole("tab", { name: "재고·구매" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "재고·구매" }));

    const tabActionsRow = screen.getByRole("button", { name: "삭제" }).closest("div.border-b");
    expect(tabActionsRow).toBeTruthy();
    expect(within(tabActionsRow!).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(screen.getByText("구매 기준")).toBeInTheDocument();
    expect(screen.getByRole("tabpanel").firstElementChild).toHaveStyle({ display: "contents" });
    expect(screen.getByRole("tabpanel").querySelector("fieldset")?.firstElementChild).toHaveClass("h-full");
    expect(screen.queryByText("현재 재고")).not.toBeInTheDocument();
    expect(screen.queryByText("창고 보관")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "BOM / 사용처" }));
    expect(within(tabActionsRow!).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(container.querySelector("[data-admin-detail-content]")?.nextElementSibling).toBeNull();
    expect(findByClasses(container, "h-full", "min-h-[12rem]", "flex-col")).toHaveClass("h-full");
  });

  it("삭제 확인과 취소를 탭 작업 행에서 처리하면서 기본 정보 저장 footer는 유지한다", async () => {
    context.selectedItem = item;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument());
    const deleteTrigger = screen.getByRole("button", { name: "삭제" });
    const tabActionsRow = deleteTrigger.closest("div.border-b");
    expect(tabActionsRow).toBeTruthy();
    expect(deleteTrigger).not.toHaveFocus();

    deleteTrigger.focus();
    expect(deleteTrigger).toHaveFocus();

    fireEvent.click(deleteTrigger);
    expect(within(tabActionsRow!).getByText("정말 삭제하시겠습니까?")).toBeInTheDocument();
    const cancelButton = within(tabActionsRow!).getByRole("button", { name: "취소" });
    expect(cancelButton).toHaveFocus();
    expect(within(tabActionsRow!).getByRole("button", { name: "삭제 확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(container.querySelector("[data-admin-detail-content]")?.nextElementSibling).not.toBeNull();

    fireEvent.click(cancelButton);
    expect(within(tabActionsRow!).queryByText("정말 삭제하시겠습니까?")).not.toBeInTheDocument();
    expect(within(tabActionsRow!).queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
    expect(within(tabActionsRow!).queryByRole("button", { name: "삭제 확인" })).not.toBeInTheDocument();
    const restoredDeleteTrigger = within(tabActionsRow!).getByRole("button", { name: "삭제" });
    expect(restoredDeleteTrigger).toHaveFocus();

    fireEvent.click(restoredDeleteTrigger);
    expect(within(tabActionsRow!).getByRole("button", { name: "삭제 확인" })).toBeInTheDocument();

    context.deleteItem.mockClear();
    fireEvent.click(within(tabActionsRow!).getByRole("button", { name: "삭제 확인" }));
    expect(context.deleteItem).toHaveBeenCalledWith(item.item_id);
    await waitFor(() => expect(within(tabActionsRow!).queryByRole("button", { name: "삭제 확인" })).not.toBeInTheDocument());
  });

  it("초기 렌더와 확인 중 품목 전환에서는 삭제 버튼을 강제 포커스하지 않는다", async () => {
    context.selectedItem = item;
    const { rerender } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const deleteTrigger = await screen.findByRole("button", { name: "삭제" });
    expect(deleteTrigger).not.toHaveFocus();
    deleteTrigger.focus();
    fireEvent.click(deleteTrigger);
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();

    context.selectedItem = { ...item, item_id: "item-2", item_name: "다른 품목" };
    rerender(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const nextDeleteTrigger = await screen.findByRole("button", { name: "삭제" });
    expect(nextDeleteTrigger).not.toHaveFocus();
  });

  it("기본 정보에서 영업 확인 필요 설정을 보여준다", () => {
    context.selectedItem = { ...item, sales_review_required: false };
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    expect(screen.getByRole("checkbox", { name: "영업 확인 필요" })).not.toBeChecked();
    expect(screen.getByText(/출하 요청 작성 시 강조/)).toBeInTheDocument();
  });
});
