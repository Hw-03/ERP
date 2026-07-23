import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminMasterItemsSection } from "../AdminMasterItemsSection";

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
    min_stock: "",
    process_type_code: "TR",
    unit: "EA",
    model_slots: [],
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
  context.selectedItem = null;
});

describe("AdminMasterItemsSection", () => {
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
    expect(row).toHaveClass("border-l-[3px]");
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
    expect(row).toHaveStyle({ borderLeftColor: "var(--c-blue)" });
  });

  it("모든 상세 탭에서 삭제 동작을 헤더에 두고 재고와 BOM 탭에는 삭제 footer를 렌더링하지 않는다", async () => {
    context.selectedItem = item;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => expect(screen.getByRole("tab", { name: "재고 정보" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "재고 정보" }));

    const detailHeader = screen.getByRole("button", { name: "삭제" }).closest("div.border-b");
    expect(detailHeader).toBeTruthy();
    expect(within(detailHeader!).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(container.querySelector("[data-admin-detail-content]")?.nextElementSibling).toBeNull();
    expect(findByClasses(container, "h-full", "min-h-[9rem]", "grid-rows-2")).toHaveClass("h-full");

    fireEvent.click(screen.getByRole("tab", { name: "BOM / 사용처" }));
    expect(within(detailHeader!).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(container.querySelector("[data-admin-detail-content]")?.nextElementSibling).toBeNull();
    expect(findByClasses(container, "h-full", "min-h-[12rem]", "flex-col")).toHaveClass("h-full");
  });

  it("삭제 확인과 취소를 헤더에서 처리하면서 기본 정보 저장 footer는 유지한다", async () => {
    context.selectedItem = item;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument());
    const detailHeader = screen.getByRole("button", { name: "삭제" }).closest("div.border-b");
    expect(detailHeader).toBeTruthy();

    fireEvent.click(within(detailHeader!).getByRole("button", { name: "삭제" }));
    expect(within(detailHeader!).getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(within(detailHeader!).getByRole("button", { name: "삭제 확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(container.querySelector("[data-admin-detail-content]")?.nextElementSibling).not.toBeNull();

    context.deleteItem.mockClear();
    fireEvent.click(within(detailHeader!).getByRole("button", { name: "삭제 확인" }));
    expect(context.deleteItem).toHaveBeenCalledWith(item.item_id);
  });
});
