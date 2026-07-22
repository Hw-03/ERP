import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("lays name and symbol out responsively and limits the saved symbol to five characters", async () => {
    let savedEditForm = context.editForm;
    context.setEditForm.mockClear();
    context.setEditForm.mockImplementation((updater) => {
      savedEditForm = updater(context.editForm);
    });
    const { container } = render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    const name = await screen.findByDisplayValue("DX3000");
    const symbol = screen.getByDisplayValue("A");
    const fields = container.querySelector("[data-model-edit-fields]");

    expect(fields).toHaveClass("grid-cols-1", "sm:grid-cols-[minmax(0,1fr)_7rem]");

    fireEvent.change(symbol, { target: { value: "ABCDEF" } });
    expect(savedEditForm).toEqual({
      model_name: "DX3000",
      symbol: "ABCDE",
    });
    expect(name).toBeInTheDocument();
  });
});
