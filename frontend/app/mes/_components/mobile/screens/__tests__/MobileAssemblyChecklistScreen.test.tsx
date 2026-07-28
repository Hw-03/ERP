import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAssemblyChecklistScreen } from "../MobileAssemblyChecklistScreen";

const state = vi.hoisted(() => ({
  checklists: [
    {
      checklist_id: "dx3000",
      model_slot: 1,
      model_name: "DX3000",
      sections: [
        {
          section_id: "dx-off",
          title: "전원 OFF",
          sort_order: 0,
          items: [
            { item_id: "dx-off-1", content: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인", sort_order: 0 },
            { item_id: "dx-off-2", content: "차폐 납 부착 상태 양호", sort_order: 1 },
          ],
        },
        {
          section_id: "dx-on",
          title: "전원 ON",
          sort_order: 1,
          items: [{ item_id: "dx-on-1", content: "펌웨어가 정상적으로 들어갔는지 확인", sort_order: 0 }],
        },
      ],
    },
    {
      checklist_id: "adx6000fb",
      model_slot: 5,
      model_name: "ADX6000FB",
      sections: [{ section_id: "adx", title: null, sort_order: 0, items: [{ item_id: "adx-1", content: "LCD 열고닫을때 소리안나는지 확인", sort_order: 0 }] }],
    },
    {
      checklist_id: "solo",
      model_slot: 3,
      model_name: "SOLO",
      sections: [{ section_id: "solo-section", title: null, sort_order: 0, items: [{ item_id: "solo-1", content: "Kapton Film Tape 부착 확인", sort_order: 0 }] }],
    },
    {
      checklist_id: "cocoon",
      model_slot: 2,
      model_name: "COCOON",
      sections: [{ section_id: "cocoon-section", title: null, sort_order: 0, items: [{ item_id: "cocoon-1", content: "전원 ON 시 파워 버튼 청색 LED 확인", sort_order: 0 }] }],
    },
  ],
  models: [
    { slot: 1, symbol: "3", model_name: "DX3000", is_reserved: false },
    { slot: 4, symbol: "4", model_name: "ADX4000W", is_reserved: false },
    { slot: 5, symbol: "6", model_name: "ADX6000FB", is_reserved: false },
  ],
  createChecklist: vi.fn(),
  createSection: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  updateItem: vi.fn(),
  updatePending: false,
  reorderItems: vi.fn(),
  moveItem: vi.fn(),
  movePending: false,
}));

vi.mock("@/lib/queries/useAssemblyChecklistsQuery", () => ({
  useAssemblyChecklistsQuery: () => ({ data: state.checklists, isLoading: false, error: null }),
  useCreateAssemblyChecklistMutation: () => ({ mutateAsync: state.createChecklist, isPending: false }),
  useCreateAssemblyChecklistSectionMutation: () => ({ mutateAsync: state.createSection, isPending: false }),
  useCreateAssemblyChecklistItemMutation: () => ({ mutateAsync: state.createItem, isPending: false }),
  useDeleteAssemblyChecklistItemMutation: () => ({ mutateAsync: state.deleteItem, isPending: false }),
  useUpdateAssemblyChecklistItemMutation: () => ({ mutateAsync: state.updateItem, isPending: state.updatePending }),
  useReorderAssemblyChecklistItemsMutation: () => ({ mutateAsync: state.reorderItems, isPending: false }),
  useMoveAssemblyChecklistItemMutation: () => ({ mutateAsync: state.moveItem, isPending: state.movePending }),
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: state.models }),
}));

function renderChecklistScreen(onExit?: () => void) {
  return render(<MobileAssemblyChecklistScreen onExit={onExit} />);
}

function expectCardWithoutShadow(card: HTMLElement) {
  expect(card.style.boxShadow).toBe("");
  expect(card.className.split(/\s+/).some((className) => className === "shadow" || className.startsWith("shadow-"))).toBe(false);
}

describe("MobileAssemblyChecklistScreen", () => {
  beforeEach(() => {
    state.createChecklist.mockReset();
    state.createSection.mockReset();
    state.createItem.mockReset();
    state.deleteItem.mockReset();
    state.updateItem.mockReset();
    state.updatePending = false;
    state.reorderItems.mockReset();
    state.moveItem.mockReset();
    state.movePending = false;
  });

  it("lists only models that already have a checklist", () => {
    renderChecklistScreen();

    expect(screen.getByRole("button", { name: "DX3000 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADX6000FB 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ADX4000W 체크리스트 열기" })).not.toBeInTheDocument();
  });

  it("removes repeated checklist labels and promotes the selection hierarchy", () => {
    renderChecklistScreen();

    const heading = screen.getByRole("heading", { name: "조립 체크리스트" });
    expect(heading).toHaveClass("text-2xl", "font-black");
    expect(screen.queryByText("제품을 선택하세요.")).not.toBeInTheDocument();
    expect(screen.getAllByText("조립 체크리스트")).toHaveLength(1);
    expect(screen.getByText("DX3000")).toHaveClass("text-xl", "font-black");
  });

  it("keeps the existing checklist as a local, read-only completion flow", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    expect(screen.getByRole("heading", { name: "DX3000" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전원 OFF 체크리스트" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전원 ON 체크리스트" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    const [powerOffList] = screen.getAllByRole("list");
    const [firstItem] = within(powerOffList).getAllByRole("button");
    fireEvent.click(firstItem);

    expect(firstItem).toHaveAttribute("aria-pressed", "true");
    expect(firstItem).toHaveClass("no-btn-inset");
    expect(screen.getAllByRole("button", { name: "전체 해제" })[0]).toHaveStyle({
      background: "color-mix(in srgb, var(--c-yellow) 12%, transparent)",
    });
  });

  it("keeps an item completed after it moves to another box", () => {
    const originalChecklist = state.checklists[0];
    const movedItem = originalChecklist.sections[0].items[0];
    const movedChecklist = {
      ...originalChecklist,
      sections: [
        {
          ...originalChecklist.sections[0],
          items: originalChecklist.sections[0].items.slice(1),
        },
        {
          ...originalChecklist.sections[1],
          items: [movedItem, ...originalChecklist.sections[1].items],
        },
      ],
    };
    const view = renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));
    const completedItem = within(screen.getByRole("list", { name: "전원 OFF 체크리스트" }))
      .getByRole("button", { name: /손잡이 나사 고정 상태 양호/ });
    fireEvent.click(completedItem);
    fireEvent.click(screen.getByRole("button", { name: "제품 선택으로 돌아가기" }));

    try {
      state.checklists[0] = movedChecklist;
      view.rerender(<MobileAssemblyChecklistScreen />);
      fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

      expect(within(screen.getByRole("list", { name: "전원 ON 체크리스트" }))
        .getByRole("button", { name: /손잡이 나사 고정 상태 양호/ }))
        .toHaveAttribute("aria-pressed", "true");
    } finally {
      state.checklists[0] = originalChecklist;
    }
  });

  it("centers the product name with matching left and right header columns", () => {
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    const heading = screen.getByRole("heading", { name: "DX3000" });
    expect(heading.parentElement).toHaveClass("grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]");
    expect(heading).toHaveClass("text-center");
  });

  it("opens management, adds an unregistered MES model, and adds a named box and item", async () => {
    state.createChecklist.mockResolvedValueOnce({ checklist_id: "adx4000", model_slot: 4, model_name: "ADX4000W", sections: [] });
    state.createSection.mockResolvedValueOnce({
      checklist_id: "adx4000",
      model_slot: 4,
      model_name: "ADX4000W",
      sections: [{ section_id: "adx4000-section", title: "전원 ON", sort_order: 0, items: [] }],
    });
    state.createItem.mockResolvedValueOnce({ checklist_id: "adx4000", model_slot: 4, model_name: "ADX4000W", sections: [] });
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "ADX4000W 체크리스트 추가" }));

    await waitFor(() => expect(state.createChecklist).toHaveBeenCalledWith({ modelSlot: 4 }));
    expect(screen.getByRole("heading", { name: "ADX4000W" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("박스 이름"), { target: { value: "전원 ON" } });
    fireEvent.click(screen.getByRole("button", { name: "박스 추가" }));
    await waitFor(() => expect(state.createSection).toHaveBeenCalledWith({ modelSlot: 4, title: "전원 ON" }));

    fireEvent.change(screen.getByLabelText("전원 ON 항목"), { target: { value: "전원 LED 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "항목 추가" }));
    await waitFor(() => expect(state.createItem).toHaveBeenCalledWith({ sectionId: "adx4000-section", content: "전원 LED 확인" }));
  });

  it("saves a dragged order only within the selected box", async () => {
    state.reorderItems.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

    const firstHandle = screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 순서 변경" });
    const target = screen.getByText("차폐 납 부착 상태 양호").closest("[data-item-id]");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });
    Object.defineProperty(firstHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });

    fireEvent.pointerDown(firstHandle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(firstHandle, { pointerId: 1, clientY: 30, clientX: 1 });
    fireEvent.pointerUp(firstHandle, { pointerId: 1, clientY: 30, clientX: 1 });

    await waitFor(() => expect(state.reorderItems).toHaveBeenCalledWith({
      sectionId: "dx-off",
      itemIds: ["dx-off-2", "dx-off-1"],
    }));
    expect(state.moveItem).not.toHaveBeenCalled();
  });

  it("moves a dragged item to a row in another box", async () => {
    state.moveItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

    const sourceRow = document.querySelector('[data-item-id="dx-off-1"]')!;
    const sourceHandle = within(sourceRow).getByRole("button", { name: /순서 변경$/ });
    const targetRow = document.querySelector('[data-item-id="dx-on-1"]');
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetRow),
    });
    Object.defineProperty(sourceHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });

    fireEvent.pointerDown(sourceHandle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });
    expect(document.querySelector('[data-checklist-item-id="dx-on-1"]')).toHaveStyle({
      borderColor: "var(--c-blue)",
    });
    fireEvent.pointerUp(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });

    await waitFor(() => expect(state.moveItem).toHaveBeenCalledWith({
      itemId: "dx-off-1",
      targetSectionId: "dx-on",
      targetIndex: 0,
    }));
  });

  it("moves a dragged item to the end when dropped on another box empty area", async () => {
    state.moveItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

    const sourceRow = document.querySelector('[data-item-id="dx-off-1"]')!;
    const sourceHandle = within(sourceRow).getByRole("button", { name: /순서 변경$/ });
    const targetSection = screen.getByText("전원 ON").closest("section");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetSection),
    });
    Object.defineProperty(sourceHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });

    fireEvent.pointerDown(sourceHandle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });
    fireEvent.pointerUp(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });

    await waitFor(() => expect(state.moveItem).toHaveBeenCalledWith({
      itemId: "dx-off-1",
      targetSectionId: "dx-on",
      targetIndex: 1,
    }));
  });

  it("keeps the checklist visible when moving an item fails", async () => {
    state.moveItem.mockRejectedValueOnce(new Error("move failed"));
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

    const sourceRow = document.querySelector('[data-item-id="dx-off-1"]')!;
    const sourceHandle = within(sourceRow).getByRole("button", { name: /순서 변경$/ });
    const targetRow = document.querySelector('[data-item-id="dx-on-1"]');
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetRow),
    });
    Object.defineProperty(sourceHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });

    fireEvent.pointerDown(sourceHandle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });
    fireEvent.pointerUp(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("항목을 다른 박스로 이동하지 못했습니다."));
    expect(screen.getByText(/나사가 풀리지/)).toBeInTheDocument();
  });

  it("clears the drag target without saving when pointer drag is cancelled", () => {
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

    const sourceRow = document.querySelector('[data-item-id="dx-off-1"]')!;
    const sourceHandle = within(sourceRow).getByRole("button", { name: /순서 변경$/ });
    const targetRow = document.querySelector('[data-item-id="dx-on-1"]')!;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetRow),
    });
    Object.defineProperty(sourceHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });

    fireEvent.pointerDown(sourceHandle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(sourceHandle, { pointerId: 1, clientY: 30, clientX: 1 });
    expect(targetRow).toHaveStyle({ borderColor: "var(--c-blue)" });
    fireEvent.pointerCancel(sourceHandle, { pointerId: 1 });

    expect(state.reorderItems).not.toHaveBeenCalled();
    expect(state.moveItem).not.toHaveBeenCalled();
    expect(document.querySelector('[data-checklist-item-id="dx-on-1"]')).toHaveStyle({
      borderColor: "var(--c-border)",
    });
  });

  it("deletes a managed item only after confirmation", async () => {
    state.deleteItem.mockResolvedValueOnce({
      ...state.checklists[0],
      sections: [{ ...state.checklists[0].sections[0], items: [state.checklists[0].sections[0].items[1]] }],
    });
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
    const deleteButton = screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 삭제" });

    fireEvent.click(deleteButton);
    expect(state.deleteItem).not.toHaveBeenCalled();
    fireEvent.click(deleteButton);
    await waitFor(() => expect(state.deleteItem).toHaveBeenCalledWith({ itemId: "dx-off-1" }));
  });

  it("edits a managed item with trimmed content", async () => {
    const updatedChecklist = {
      ...state.checklists[0],
      sections: state.checklists[0].sections.map((section) => section.section_id === "dx-off"
        ? { ...section, items: section.items.map((item) => item.item_id === "dx-off-1" ? { ...item, content: "손잡이 체결 확인" } : item) }
        : section),
    };
    state.updateItem.mockResolvedValueOnce(updatedChecklist);
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" }));
    const textarea = screen.getByRole("textbox", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 문구" });
    expect(textarea).toHaveFocus();
    fireEvent.change(textarea, {
      target: { value: "  손잡이 체결 확인  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "항목 수정 저장" }));

    await waitFor(() => expect(state.updateItem).toHaveBeenCalledWith({
      itemId: "dx-off-1",
      content: "손잡이 체결 확인",
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "손잡이 체결 확인 수정" })).toHaveFocus());
  });

  it("cancels a managed item edit without calling the update mutation", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "항목 수정 취소" }));

    expect(state.updateItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" })).toHaveFocus();
  });

  it("disables managed edit controls while an item update is pending", () => {
    const { rerender } = renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" }));
    state.updatePending = true;
    rerender(<MobileAssemblyChecklistScreen />);

    expect(screen.getByRole("textbox", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 문구" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "항목 수정 취소" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "항목 수정 저장" })).toBeDisabled();
  });

  it("keeps managed item edit, drag, and delete controls at 44px targets", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));

    expect(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" })).toHaveClass("min-h-11", "no-btn-inset");
    expect(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 순서 변경" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 삭제" })).toHaveClass("h-11", "w-11");
  });

  it("disables saving a blank managed item draft", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 문구" }), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: "항목 수정 저장" })).toBeDisabled();
  });

  it("keeps a managed item in edit mode when saving fails", async () => {
    state.updateItem.mockRejectedValueOnce(new Error("save failed"));
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "항목 수정 저장" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("항목 문구를 저장하지 못했습니다."));
    expect(screen.getByRole("textbox", { name: "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인 문구" })).toBeInTheDocument();
  });

  it("keeps checklist cards free of shadows", () => {
    const { container } = renderChecklistScreen();
    [container.querySelector<HTMLElement>("section"), ...screen.getAllByRole("button", { name: /체크리스트 열기$/ })]
      .forEach((card) => expectCardWithoutShadow(card!));
  });
});
