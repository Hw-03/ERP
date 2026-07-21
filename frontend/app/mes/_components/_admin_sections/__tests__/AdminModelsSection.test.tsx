import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminModelsSection } from "../AdminModelsSection";

const context = {
  productModels: [{ slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false }],
  modelAddName: "",
  setModelAddName: vi.fn(),
  modelAddSymbol: "",
  setModelAddSymbol: vi.fn(),
  addModel: vi.fn(),
  deleteModel: vi.fn(),
  editForm: { model_name: "DX3000", symbol: "A" },
  setEditForm: vi.fn(),
  editDirty: false,
  editSaving: false,
  initEditForm: vi.fn(),
  saveModel: vi.fn(),
  reorderModels: vi.fn(),
};

vi.mock("../AdminModelsContext", () => ({
  useAdminModelsContext: () => context,
}));

describe("AdminModelsSection", () => {
  it("keeps the model code in the list and header only", async () => {
    render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await screen.findByDisplayValue("DX3000");

    await waitFor(() => {
      expect(screen.getAllByText("M-0001")).toHaveLength(2);
    });
  });
});
