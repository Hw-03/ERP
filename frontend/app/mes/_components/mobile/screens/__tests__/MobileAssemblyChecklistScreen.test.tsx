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
  reorderItems: vi.fn(),
}));

vi.mock("@/lib/queries/useAssemblyChecklistsQuery", () => ({
  useAssemblyChecklistsQuery: () => ({ data: state.checklists, isLoading: false, error: null }),
  useCreateAssemblyChecklistMutation: () => ({ mutateAsync: state.createChecklist, isPending: false }),
  useCreateAssemblyChecklistSectionMutation: () => ({ mutateAsync: state.createSection, isPending: false }),
  useCreateAssemblyChecklistItemMutation: () => ({ mutateAsync: state.createItem, isPending: false }),
  useDeleteAssemblyChecklistItemMutation: () => ({ mutateAsync: state.deleteItem, isPending: false }),
  useReorderAssemblyChecklistItemsMutation: () => ({ mutateAsync: state.reorderItems, isPending: false }),
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
    state.reorderItems.mockReset();
  });

  it("lists only models that already have a checklist", () => {
    renderChecklistScreen();

    expect(screen.getByRole("button", { name: "DX3000 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADX6000FB 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ADX4000W 체크리스트 열기" })).not.toBeInTheDocument();
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

  it("keeps checklist cards free of shadows", () => {
    const { container } = renderChecklistScreen();
    [container.querySelector<HTMLElement>("section"), ...screen.getAllByRole("button", { name: /체크리스트 열기$/ })]
      .forEach((card) => expectCardWithoutShadow(card!));
  });
});
