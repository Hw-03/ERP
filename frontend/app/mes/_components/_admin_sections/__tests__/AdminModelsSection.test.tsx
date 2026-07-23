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

function findByClasses(container: HTMLElement, ...classes: string[]) {
  return [...container.querySelectorAll<HTMLElement>("div")].find((element) =>
    classes.every((className) => element.classList.contains(className)),
  );
}

describe("AdminModelsSection", () => {
  it("keeps the narrow layout and uses a 2:8 list-detail split at xl", async () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await screen.findByDisplayValue("DX3000");

    expect(findByClasses(container, "xl:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]")).toHaveClass(
      "flex",
      "gap-4",
      "xl:grid",
      "xl:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]",
    );
    expect(findByClasses(container, "w-[288px]", "xl:w-auto")).toHaveClass("w-[288px]", "xl:w-auto");
  });

  it("가용 높이를 채우며 통계는 세로 스택, 삭제는 하단에 정렬한다", async () => {
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

    expect(findByClasses(container, "h-full", "min-h-0", "flex-1", "flex-col", "gap-3")).toHaveClass("min-h-0", "flex-1", "gap-3");
    expect(findByClasses(container, "p-3", "rounded-[14px]", "border")).toHaveClass("p-3");
    expect(findByClasses(container, "xl:grid", "xl:items-stretch", "xl:gap-3")).toHaveClass("min-h-0", "flex-1", "xl:grid", "xl:gap-3");
    expect(findByClasses(container, "shrink-0", "flex-col", "gap-3")).toHaveClass("min-h-0", "flex", "flex-col", "gap-3");
    expect(screen.getByText("연결 품목 수").parentElement).toHaveClass("flex-1");
    expect(screen.getByText("연결 BOM 수").parentElement).toHaveClass("flex-1");
    expect(findByClasses(container, "min-h-0", "flex-1", "flex-col")).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");
    expect(screen.getAllByText(/linked item [1-6]$/)).toHaveLength(6);
    expect(screen.queryByText("linked item 7")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 모델 삭제" })).toHaveClass("mt-auto");
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
    const fields = findByClasses(container, "grid-cols-1", "sm:grid-cols-[minmax(0,1fr)_7rem]");

    expect(fields).toHaveClass("grid-cols-1", "sm:grid-cols-[minmax(0,1fr)_7rem]");

    fireEvent.change(symbol, { target: { value: "ABCDEF" } });
    expect(savedEditForm).toEqual({
      model_name: "DX3000",
      symbol: "ABCDE",
    });
    expect(name).toBeInTheDocument();
  });
});
