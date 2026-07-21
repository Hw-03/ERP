import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  editForm: {},
  setEditForm: vi.fn(),
  productModels: [],
};

vi.mock("../AdminMasterItemsContext", () => ({
  useAdminMasterItemsContext: () => context,
}));

describe("AdminMasterItemsSection", () => {
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
