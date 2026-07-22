import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

afterEach(() => {
  context.selectedItem = null;
});

describe("AdminMasterItemsSection", () => {
  it("shows only the three active detail tabs and does not duplicate the selected item name inside the form", async () => {
    context.selectedItem = item;
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("tab")).toHaveLength(3);
    });

    expect(screen.queryByText(/준비 중/)).not.toBeInTheDocument();
    expect(screen.getAllByText(item.item_name)).toHaveLength(2);

    const detailTitle = screen.getAllByText(item.item_name).find((element) =>
      element.classList.contains("text-[18px]"),
    );
    const detailHeader = detailTitle?.parentElement?.parentElement;
    expect(detailHeader).toBeTruthy();
    expect(within(detailHeader!).getByText(item.mes_code)).toBeInTheDocument();
    expect(within(detailHeader!).getByText("정상")).toBeInTheDocument();
  });

  it("품목 목록 행에서 품목명을 MES 코드보다 먼저 표시한다", () => {
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const row = screen.getByRole("button", { name: /주 품목명/ });
    const text = row.textContent ?? "";

    expect(text.indexOf("주 품목명")).toBeLessThan(text.indexOf("MES-001"));
  });
});
