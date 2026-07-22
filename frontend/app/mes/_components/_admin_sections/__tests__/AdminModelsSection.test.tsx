import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("compresses the xl detail layout while retaining six linked-item previews and the delete path", async () => {
    const linkedItems = Array.from({ length: 7 }, (_, index) => ({
      item_id: `item-${index + 1}`,
      item_name: `linked item ${index + 1}`,
      mes_code: `A-TR-${String(index + 1).padStart(4, "0")}`,
      model_slots: [1],
    }));
    const { container } = render(
      <DirtyGuardProvider>
        <AdminModelsSection items={linkedItems} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await screen.findByText("linked item 1");

    expect(container.querySelector("[data-model-detail-layout]")).toHaveClass("gap-3");
    expect(container.querySelector("[data-model-edit-card]")).toHaveClass("p-3");
    expect(container.querySelector("[data-model-linked-layout]")).toHaveClass("flex", "flex-col", "xl:grid", "xl:gap-3");
    expect(screen.getAllByText(/linked item [1-6]$/)).toHaveLength(6);
    expect(screen.queryByText("linked item 7")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 모델 삭제" })).toBeInTheDocument();
  });

  it("keeps the model delete button connected to its confirmation handler", async () => {
    context.deleteModel.mockClear();
    render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "이 모델 삭제" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("button")[1]);

    await waitFor(() => {
      expect(context.deleteModel).toHaveBeenCalledWith(1);
    });
  });

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
