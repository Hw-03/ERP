import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminModelsSection } from "../AdminModelsSection";
import { AdminReadProvider, INITIAL_ADMIN_READ_STATES } from "../_admin_primitives/AdminReadState";

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
  it("예약된 목록 열과 상세 필드를 보여 주고 최초 조회 후 실제 내용으로 전환한다", async () => {
    const retry = vi.fn();
    const view = (ready: boolean) => <AdminReadProvider value={{ states: Object.fromEntries(Object.keys(INITIAL_ADMIN_READ_STATES).map((key) => [key, { status: ready ? "ready" : "pending" }])) as typeof INITIAL_ADMIN_READ_STATES, retry }}>
      <DirtyGuardProvider><AdminModelsSection items={[]} allBomRows={[]} /></DirtyGuardProvider>
    </AdminReadProvider>;
    const { rerender } = render(view(false));
    expect(screen.getByTestId("admin-table-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("admin-detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/좌측에서 모델을 선택/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모델 추가" })).toBeDisabled();
    rerender(view(true));
    await screen.findByDisplayValue("DX3000");
    expect(screen.queryByTestId("admin-detail-skeleton")).not.toBeInTheDocument();
  });
  it("API 모델 슬롯으로 여러 글자 기호의 연결 품목과 BOM 수를 집계한다", async () => {
    const originalModels = context.productModels;
    context.productModels = [{ slot: 7, symbol: "QA", model_name: "QA 모델", is_reserved: false }];
    try {
      render(
        <DirtyGuardProvider>
          <AdminModelsSection
            items={[{ item_id: "item-qa", item_name: "QA 부품", mes_code: "QA-TR-0001", model_slots: [7] }]}
            allBomRows={[{ parent_item_id: "item-qa", child_item_id: "child-1" }]}
          />
        </DirtyGuardProvider>,
      );

      await screen.findByText("QA 부품");
      expect(screen.getByText("연결 품목 수").parentElement).toHaveTextContent("1");
      expect(screen.getByText("연결 BOM 수").parentElement).toHaveTextContent("1");
    } finally {
      context.productModels = originalModels;
    }
  });

  it("uses the shared department list width and external scrollbar", async () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await screen.findByDisplayValue("DX3000");

    expect(container.querySelector("div[style*='width: clamp(360px, 28vw, 440px)']")).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "모델 목록" })).toHaveAttribute("data-scrollbar-rail-viewport");
    expect(screen.getByRole("button", { name: "모델 추가" })).toBeInTheDocument();
  });

  it("가용 높이를 채우며 통계는 상단 입력 영역, 삭제는 하단에 정렬한다", async () => {
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
    const fields = screen.getByRole("group", { name: "모델 기본 정보" });
    expect(within(fields).getByText("연결 품목 수")).toBeInTheDocument();
    expect(within(fields).getByText("연결 BOM 수")).toBeInTheDocument();
    expect(fields.parentElement).toContainElement(screen.getByRole("button", { name: "저장" }));
    expect(findByClasses(container, "min-h-0", "flex-1", "flex-col")).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");
    expect(screen.getAllByText(/linked item [1-6]$/)).toHaveLength(6);
    expect(screen.queryByText("linked item 7")).not.toBeInTheDocument();
    const preview = screen.getByRole("region", { name: "연결 품목 미리보기" });
    expect(preview).toHaveAttribute("data-scrollbar-rail-viewport");
    expect(preview).toHaveClass("lg:-right-2.5", "lg:[scrollbar-gutter:stable]");
    expect(preview.parentElement).toHaveClass("min-h-0", "flex-1");
    expect(screen.getByRole("heading", { name: "연결 품목 미리보기" }).parentElement).toContainElement(screen.getByText("외 1건"));
    expect(preview).not.toContainElement(screen.getByText("외 1건"));
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

  it("모델 기호를 목록과 상세에 표시하고 슬롯 기반 코드는 노출하지 않는다", async () => {
    render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await screen.findByDisplayValue("DX3000");

    expect(screen.getByRole("columnheader", { name: "모델 기호" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("A")).toHaveLength(1));
    expect(screen.getByDisplayValue("A")).toBeInTheDocument();
    expect(screen.queryByText(/M-\d{4}/)).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: "DX3000 A 사용 중" })).toBeInTheDocument();
  });

  it("uses the shared primary action size for the selected model save button", async () => {
    render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    await screen.findByDisplayValue("DX3000");
    const saveButton = screen.getByRole("button", { name: "저장" });

    expect(saveButton).toHaveClass("h-11", "min-w-[88px]", "px-4", "py-2", "text-[13px]");
    expect(saveButton.querySelector("svg")).toHaveClass("h-4", "w-4");
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
    const fields = screen.getByRole("group", { name: "모델 기본 정보" });

    expect(fields).toContainElement(name);
    expect(fields).toContainElement(symbol);

    fireEvent.change(symbol, { target: { value: "ABCDEF" } });
    expect(savedEditForm).toEqual({
      model_name: "DX3000",
      symbol: "ABCDE",
    });
    expect(name).toBeInTheDocument();
  });

  it("renders models as selectable flat table rows with reorder handles and status cells", async () => {
    context.productModels.push({ slot: 2, symbol: "", model_name: null, is_reserved: false });
    const { container, unmount } = render(
      <DirtyGuardProvider>
        <AdminModelsSection items={[]} allBomRows={[]} />
      </DirtyGuardProvider>,
    );

    try {
      await screen.findByDisplayValue("DX3000");

      const grid = screen.getByRole("grid", { name: "모델 목록" });
      expect(within(grid).getByRole("columnheader", { name: "정렬" })).toBeInTheDocument();
      expect(within(grid).getByRole("columnheader", { name: "모델명" })).toBeInTheDocument();
      expect(within(grid).getByRole("columnheader", { name: "모델 기호" })).toBeInTheDocument();
      expect(within(grid).getByRole("columnheader", { name: "상태" })).toBeInTheDocument();

      const activeRow = within(grid).getByRole("row", { name: "DX3000 A 사용 중" });
      const idleRow = within(grid).getByRole("row", { name: "미등록 모델 미지정 비활성" });

      expect(activeRow).toHaveAttribute("aria-selected", "true");
      expect(idleRow).toHaveAttribute("aria-selected", "false");
      expect(activeRow).toHaveAttribute("draggable", "true");
      expect(activeRow).toHaveClass("grid", "grid-cols-[32px_minmax(0,1fr)_84px_76px]");
      expect(within(activeRow).getByLabelText("드래그 핸들")).toBeInTheDocument();
      expect(within(activeRow).getAllByRole("gridcell")).toHaveLength(4);
      expect(activeRow.querySelector(".h-10.w-10.rounded-full")).not.toBeInTheDocument();
      expect(within(grid).queryByText("슬롯 2")).not.toBeInTheDocument();

      fireEvent.click(idleRow);
      await waitFor(() => {
        expect(within(grid).getByRole("row", { name: "미등록 모델 미지정 비활성" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });
      expect(screen.getAllByText("미등록 모델")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "이 모델 삭제" }));
      expect(screen.getByText("'미등록 모델' 모델을 삭제하시겠습니까?")).toBeInTheDocument();
      expect(screen.queryByText("슬롯 2")).not.toBeInTheDocument();
    } finally {
      unmount();
      context.productModels.splice(1, 1);
    }
  });

  it("상단 저장 버튼은 선택 모델을 저장하고 저장 중에는 비활성화한다", async () => {
    context.editDirty = true;
    context.saveModel.mockClear();
    const view = render(<DirtyGuardProvider><AdminModelsSection items={[]} allBomRows={[]} /></DirtyGuardProvider>);
    try {
      const save = await screen.findByRole("button", { name: "저장" });
      fireEvent.click(save);
      expect(context.saveModel).toHaveBeenCalledWith(1);
      context.editSaving = true;
      view.rerender(<DirtyGuardProvider><AdminModelsSection items={[]} allBomRows={[]} /></DirtyGuardProvider>);
      expect(save).toBeDisabled();
      context.editSaving = false;
      context.editDirty = false;
      view.rerender(<DirtyGuardProvider><AdminModelsSection items={[]} allBomRows={[]} /></DirtyGuardProvider>);
      expect(save).toBeDisabled();
    } finally {
      context.editDirty = false;
      context.editSaving = false;
      view.unmount();
    }
  });

  it("바깥 스크롤 목록의 모델 드래그는 기존 순서 저장에 연결된다", () => {
    const original = context.productModels;
    context.productModels = [...original, { slot: 2, symbol: "B", model_name: "COCOON", is_reserved: false }];
    context.reorderModels.mockClear();
    const view = render(<DirtyGuardProvider><AdminModelsSection items={[]} allBomRows={[]} /></DirtyGuardProvider>);
    try {
      const first = screen.getByRole("row", { name: "DX3000 A 사용 중" });
      const second = screen.getByRole("row", { name: "COCOON B 사용 중" });
      const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
      fireEvent.dragStart(first, { dataTransfer });
      fireEvent.dragOver(second, { dataTransfer });
      fireEvent.drop(second, { dataTransfer });
      expect(context.reorderModels).toHaveBeenCalledWith([context.productModels[1], context.productModels[0]]);
    } finally {
      view.unmount();
      context.productModels = original;
    }
  });
});
