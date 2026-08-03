import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAssemblyChecklistScreen } from "../MobileAssemblyChecklistScreen";

const ITEM_CONTENT = "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인";

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
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  reorderSections: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  updateItem: vi.fn(),
  reorderItems: vi.fn(),
  moveItem: vi.fn(),
}));

vi.mock("@/lib/queries/useAssemblyChecklistsQuery", () => ({
  useAssemblyChecklistsQuery: () => ({ data: state.checklists, isLoading: false, error: null }),
  useCreateAssemblyChecklistMutation: () => ({ mutateAsync: state.createChecklist, isPending: false }),
  useCreateAssemblyChecklistSectionMutation: () => ({ mutateAsync: state.createSection, isPending: false }),
  useUpdateAssemblyChecklistSectionMutation: () => ({ mutateAsync: state.updateSection, isPending: false }),
  useDeleteAssemblyChecklistSectionMutation: () => ({ mutateAsync: state.deleteSection, isPending: false }),
  useReorderAssemblyChecklistSectionsMutation: () => ({ mutateAsync: state.reorderSections, isPending: false }),
  useCreateAssemblyChecklistItemMutation: () => ({ mutateAsync: state.createItem, isPending: false }),
  useDeleteAssemblyChecklistItemMutation: () => ({ mutateAsync: state.deleteItem, isPending: false }),
  useUpdateAssemblyChecklistItemMutation: () => ({ mutateAsync: state.updateItem, isPending: false }),
  useReorderAssemblyChecklistItemsMutation: () => ({ mutateAsync: state.reorderItems, isPending: false }),
  useMoveAssemblyChecklistItemMutation: () => ({ mutateAsync: state.moveItem, isPending: false }),
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: state.models }),
}));

function renderChecklistScreen() {
  return render(<MobileAssemblyChecklistScreen />);
}

function openManageDetail() {
  fireEvent.click(screen.getByRole("button", { name: "체크리스트 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "DX3000 관리" }));
}

function preparePointer(handle: HTMLElement, target: Element, clientY = 30) {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => target),
  });
  Object.defineProperty(handle, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 40, height: 40, left: 0, right: 320, toJSON: () => ({}), top: 0, width: 320, x: 0, y: 0 }),
  });
  fireEvent.pointerDown(handle, { pointerId: 1, clientY: 0 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1, clientY });
  fireEvent.pointerUp(handle, { pointerId: 1, clientY });
}

describe("MobileAssemblyChecklistScreen", () => {
  beforeEach(() => {
    Object.values(state).forEach((value) => {
      if (typeof value === "function" && "mockReset" in value) value.mockReset();
    });
  });

  it("체크리스트가 등록된 모델만 선택 화면에 표시한다", () => {
    renderChecklistScreen();

    expect(screen.getByRole("button", { name: "DX3000 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADX6000FB 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ADX4000W 체크리스트 열기" })).not.toBeInTheDocument();
  });

  it("기존 체크 수행 화면은 완료 상태를 로컬에서 유지한다", () => {
    renderChecklistScreen();
    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    const firstItem = within(screen.getByRole("list", { name: "전원 OFF 체크리스트" }))
      .getByRole("button", { name: new RegExp(ITEM_CONTENT) });
    fireEvent.click(firstItem);

    expect(firstItem).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("항목이 다른 박스로 이동해도 완료 상태를 유지한다", () => {
    const originalChecklist = state.checklists[0];
    const movedItem = originalChecklist.sections[0].items[0];
    const movedChecklist = {
      ...originalChecklist,
      sections: [
        { ...originalChecklist.sections[0], items: originalChecklist.sections[0].items.slice(1) },
        { ...originalChecklist.sections[1], items: [movedItem, ...originalChecklist.sections[1].items] },
      ],
    };
    const view = renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));
    fireEvent.click(within(screen.getByRole("list", { name: "전원 OFF 체크리스트" }))
      .getByRole("button", { name: new RegExp(ITEM_CONTENT) }));
    fireEvent.click(screen.getByRole("button", { name: "제품 선택으로 돌아가기" }));

    try {
      state.checklists[0] = movedChecklist;
      view.rerender(<MobileAssemblyChecklistScreen />);
      fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

      expect(within(screen.getByRole("list", { name: "전원 ON 체크리스트" }))
        .getByRole("button", { name: new RegExp(ITEM_CONTENT) }))
        .toHaveAttribute("aria-pressed", "true");
    } finally {
      state.checklists[0] = originalChecklist;
    }
  });

  it("일반 관리 목록은 드래그와 삭제를 숨기고 항목 편집 시트를 연다", () => {
    renderChecklistScreen();
    openManageDetail();

    expect(screen.getByRole("button", { name: "순서 변경" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "박스 추가" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${ITEM_CONTENT} 항목 순서 변경` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "항목 삭제" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 편집` }));

    expect(screen.getByRole("dialog", { name: "항목 수정" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "항목 문구" })).toHaveValue(ITEM_CONTENT);
  });

  it("박스와 항목을 각각 하단 시트에서 추가한다", async () => {
    state.createSection.mockResolvedValueOnce(state.checklists[0]);
    state.createItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();

    fireEvent.click(screen.getByRole("button", { name: "박스 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "박스 이름" }), { target: { value: "최종 검사" } });
    fireEvent.click(screen.getByRole("button", { name: "박스 추가 저장" }));
    await waitFor(() => expect(state.createSection).toHaveBeenCalledWith({ modelSlot: 1, title: "최종 검사" }));

    fireEvent.click(screen.getByRole("button", { name: "전원 OFF 항목 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "항목 문구" }), { target: { value: "전원 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "항목 추가 저장" }));
    await waitFor(() => expect(state.createItem).toHaveBeenCalledWith({ sectionId: "dx-off", content: "전원 확인" }));
  });

  it("항목 문구를 공백 제거 후 저장한다", async () => {
    state.updateItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();

    fireEvent.click(screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 편집` }));
    fireEvent.change(screen.getByRole("textbox", { name: "항목 문구" }), { target: { value: "  손잡이 체결 확인  " } });
    fireEvent.click(screen.getByRole("button", { name: "항목 저장" }));

    await waitFor(() => expect(state.updateItem).toHaveBeenCalledWith({ itemId: "dx-off-1", content: "손잡이 체결 확인" }));
  });

  it("항목을 선택한 다른 박스의 마지막으로 이동한다", async () => {
    state.moveItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();

    fireEvent.click(screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 편집` }));
    fireEvent.click(screen.getByRole("button", { name: "다른 박스로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "전원 ON으로 이동" }));

    await waitFor(() => expect(state.moveItem).toHaveBeenCalledWith({
      itemId: "dx-off-1",
      targetSectionId: "dx-on",
      targetIndex: 1,
    }));
  });

  it("항목 삭제는 확인 시트에서만 실행하고 취소하면 편집 시트로 돌아간다", async () => {
    state.deleteItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();

    fireEvent.click(screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 편집` }));
    fireEvent.click(screen.getByRole("button", { name: "항목 삭제" }));
    expect(state.deleteItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("dialog", { name: "항목 수정" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "항목 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "항목 삭제 확인" }));
    await waitFor(() => expect(state.deleteItem).toHaveBeenCalledWith({ itemId: "dx-off-1" }));
  });

  it("박스 이름을 수정하고 항목 수를 알린 뒤 박스를 삭제한다", async () => {
    state.updateSection.mockResolvedValueOnce(state.checklists[0]);
    state.deleteSection.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();

    fireEvent.click(screen.getByRole("button", { name: "전원 OFF 박스 메뉴" }));
    fireEvent.change(screen.getByRole("textbox", { name: "박스 이름" }), { target: { value: "  전원 준비  " } });
    fireEvent.click(screen.getByRole("button", { name: "박스 이름 저장" }));
    await waitFor(() => expect(state.updateSection).toHaveBeenCalledWith({ sectionId: "dx-off", title: "전원 준비" }));

    fireEvent.click(screen.getByRole("button", { name: "전원 OFF 박스 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "박스 삭제" }));
    expect(screen.getByText("2개 항목도 함께 삭제됩니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(state.deleteSection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "박스 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "박스 삭제 확인" }));
    await waitFor(() => expect(state.deleteSection).toHaveBeenCalledWith({ sectionId: "dx-off" }));
  });

  it("순서 변경은 현재 관리 화면에서 활성 완료 상태로 전환한다", async () => {
    state.reorderSections.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();
    fireEvent.click(screen.getByRole("button", { name: "순서 변경" }));

    expect(screen.getByRole("heading", { name: "DX3000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "순서 변경 완료" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "박스 추가" })).toBeDisabled();

    const source = screen.getByRole("button", { name: "전원 OFF 박스 순서 변경" });
    const target = document.querySelector('[data-checklist-section-sort-id="dx-on"]')!;
    preparePointer(source, target);

    await waitFor(() => expect(state.reorderSections).toHaveBeenCalledWith({
      modelSlot: 1,
      sectionIds: ["dx-on", "dx-off"],
    }));
    expect(screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 순서 변경` })).toHaveClass("h-11", "w-11");
    fireEvent.click(screen.getByRole("button", { name: "순서 변경 완료" }));
    expect(screen.queryByRole("button", { name: "전원 OFF 박스 순서 변경" })).not.toBeInTheDocument();
  });

  it("순서 변경 모드에서 항목을 다른 박스의 삽입 위치로 이동한다", async () => {
    state.moveItem.mockResolvedValueOnce(state.checklists[0]);
    renderChecklistScreen();
    openManageDetail();
    fireEvent.click(screen.getByRole("button", { name: "순서 변경" }));

    const source = screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 순서 변경` });
    const target = document.querySelector('[data-checklist-item-id="dx-on-1"]')!;
    preparePointer(source, target, 10);

    await waitFor(() => expect(state.moveItem).toHaveBeenCalledWith({
      itemId: "dx-off-1",
      targetSectionId: "dx-on",
      targetIndex: 0,
    }));
  });

  it("항목 저장이 실패하면 시트와 오류를 유지한다", async () => {
    state.updateItem.mockRejectedValueOnce(new Error("save failed"));
    renderChecklistScreen();
    openManageDetail();

    fireEvent.click(screen.getByRole("button", { name: `${ITEM_CONTENT} 항목 편집` }));
    fireEvent.click(screen.getByRole("button", { name: "항목 저장" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("항목 문구를 저장하지 못했습니다."));
    expect(screen.getByRole("textbox", { name: "항목 문구" })).toBeInTheDocument();
  });

  it("관리 화면의 조작 버튼은 44px 터치 영역을 유지한다", () => {
    renderChecklistScreen();
    openManageDetail();

    expect(screen.getByRole("button", { name: "전원 OFF 박스 메뉴" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "전원 OFF 항목 추가" })).toHaveClass("min-h-11");
    fireEvent.click(screen.getByRole("button", { name: "순서 변경" }));
    expect(screen.getByRole("button", { name: "전원 OFF 박스 순서 변경" })).toHaveClass("h-11", "w-11");
  });
});
