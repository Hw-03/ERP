import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminMasterItemsSection } from "../AdminMasterItemsSection";

const item = {
  item_id: "item-1",
  item_name: "선택 품목",
  mes_code: "46-AA-0080",
  quantity: 10,
  min_stock: 1,
  deleted_at: null,
};

vi.mock("../AdminMasterItemsContext", () => ({
  useAdminMasterItemsContext: () => ({
    visibleItems: [item],
    selectedItem: item,
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
      min_stock: "1",
      process_type_code: "AA",
      unit: "EA",
      model_slots: [],
      mes_code: item.mes_code,
    },
    setEditForm: vi.fn(),
    productModels: [],
  }),
}));

vi.mock("../../DepartmentsContext", () => ({
  useDepartments: () => [],
}));

describe("AdminMasterItemsSection", () => {
  it("keeps an MES code muted when its item row is selected", () => {
    render(
      <DirtyGuardProvider>
        <AdminMasterItemsSection allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const code = screen.getAllByText("46-AA-0080").find((element) => element.tagName === "SPAN");
    expect(code).toBeDefined();
    expect(code?.getAttribute("style")).toContain("var(--c-muted)");
    expect(code?.getAttribute("style")).not.toContain("var(--c-blue)");
  });
});
