import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

vi.mock("../InventoryDetailPanel", () => ({
  InventoryDetailPanel: () => <div>상세 내용</div>,
}));

vi.mock("../InventoryRecentHistoryPanel", () => ({
  InventoryRecentHistoryPanel: () => <div>최근 내역 패널</div>,
}));

import { DesktopInventoryRightPanel } from "../DesktopInventoryRightPanel";

function makeItem(): Item {
  return {
    item_id: "item-1",
    item_name: "테스트 품목",
    mes_code: "46-AA-0080",
    spec: null,
    unit: "EA",
    quantity: 5,
    warehouse_qty: 5,
    min_stock: null,
    department: null,
    process_type: null,
    image_filename: null,
    locations: [],
  } as unknown as Item;
}

describe("DesktopInventoryRightPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("전체 품목명만 복사하고 완료 표시를 2초 후 초기화한다", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const item = { ...makeItem(), item_name: "DX3000_60kV, 2mA_러시아_IP Tsizinia S. A [White] 전체 이름" };
    render(<DesktopInventoryRightPanel selectedItem={item} displayItem={item} headerBadge={<span>정상</span>} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "품목명 복사" })));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(item.item_name);
    expect(screen.getByRole("button", { name: "품목명 복사" })).toHaveTextContent("완료");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "품목명 복사" })).toHaveTextContent("복사");
  });

  it.each([false, true])("클립보드 API 부재 또는 거부 시 대체 복사한다: %s", async (rejectApi) => {
    vi.stubGlobal("navigator", rejectApi ? { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } } : {});
    const execCommand = vi.fn(() => {
      expect((document.activeElement as HTMLTextAreaElement).value).toBe("테스트 품목");
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    const item = makeItem();
    render(<DesktopInventoryRightPanel selectedItem={item} displayItem={item} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />);
    const button = screen.getByRole("button", { name: "품목명 복사" });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(button).toHaveFocus();
    expect(document.querySelector("textarea")).toBeNull();
    expect(button).toHaveTextContent("완료");
  });

  it("복사 실패를 알리고 같은 버튼으로 재시도할 수 있다", async () => {
    vi.stubGlobal("navigator", {});
    const execCommand = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    const item = makeItem();
    render(<DesktopInventoryRightPanel selectedItem={item} displayItem={item} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "품목명 복사" })));
    expect(screen.getByRole("alert")).toHaveTextContent("다시 시도");
    expect(screen.getByRole("button", { name: "품목명 복사" })).toHaveTextContent("복사");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "품목명 복사" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "품목명 복사" })).toHaveTextContent("완료");
  });

  it("품목 전환으로 완료 표시를 지우고 세 탭에서 현재 품목을 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const item = makeItem();
    const props = { headerBadge: null, onClose: vi.fn(), onGoToWarehouse: vi.fn() };
    const { rerender } = render(<DesktopInventoryRightPanel {...props} selectedItem={item} displayItem={item} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "품목명 복사" })));
    const nextItem = { ...item, item_id: "item-2", item_name: "다른 품목" };
    rerender(<DesktopInventoryRightPanel {...props} selectedItem={nextItem} displayItem={nextItem} />);
    expect(screen.getByRole("button", { name: "품목명 복사" })).toHaveTextContent("복사");
    for (const tab of ["상세 정보", "최근 내역", "검색용 이름"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "품목명 복사" })));
      expect(writeText).toHaveBeenLastCalledWith(nextItem.item_name);
    }
  });

  it("품목 정보가 없으면 복사 버튼을 표시하지 않는다", () => {
    render(<DesktopInventoryRightPanel open selectedItem={null} displayItem={null} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} detailLoading />);
    expect(screen.queryByRole("button", { name: "품목명 복사" })).not.toBeInTheDocument();
  });

  it("이전 품목의 늦은 복사 결과를 새 품목에 표시하지 않는다", async () => {
    let finishCopy: () => void = () => {};
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const item = makeItem();
    const props = { headerBadge: null, onClose: vi.fn(), onGoToWarehouse: vi.fn() };
    const { rerender } = render(<DesktopInventoryRightPanel {...props} selectedItem={item} displayItem={item} />);
    fireEvent.click(screen.getByRole("button", { name: "품목명 복사" }));
    const nextItem = { ...item, item_id: "item-2", item_name: "다른 품목" };
    rerender(<DesktopInventoryRightPanel {...props} selectedItem={nextItem} displayItem={nextItem} />);
    await act(async () => finishCopy());
    expect(screen.getByRole("button", { name: "품목명 복사" })).toHaveTextContent("복사");
  });

  it("검색용 이름은 전용 탭에서 관리하며 탭 전환 후 입력을 유지한다", () => {
    const item = makeItem();
    render(<DesktopInventoryRightPanel selectedItem={item} displayItem={item} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "검색용 이름 추가" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "검색용 이름" }));
    expect(screen.getByRole("tabpanel", { name: "검색용 이름" })).toBeVisible();
    const input = screen.getByRole("textbox", { name: "검색용 이름 추가" });
    fireEvent.change(input, { target: { value: "현장 별명" } });
    fireEvent.click(screen.getByRole("tab", { name: "최근 내역" }));
    fireEvent.click(screen.getByRole("tab", { name: "검색용 이름" }));
    expect(screen.getByRole("textbox", { name: "검색용 이름 추가" })).toHaveValue("현장 별명");
  });

  it("삭제된 품목의 검색용 이름은 편집할 수 없다", () => {
    const item = { ...makeItem(), deleted_at: "2026-10-15T00:00:00Z" };
    render(<DesktopInventoryRightPanel selectedItem={item} displayItem={item} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "검색용 이름" }));
    expect(screen.getByRole("textbox", { name: "검색용 이름 추가" })).toBeDisabled();
  });
  it("복원 중에는 품목 객체가 없어도 상세창과 로딩 안내를 유지한다", () => {
    render(<DesktopInventoryRightPanel open selectedItem={null} displayItem={null} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} detailLoading />);
    expect(screen.getByRole("dialog", { name: "품목 상세" })).toBeVisible();
    expect(screen.getByRole("status", { name: "품목 상세를 불러오는 중" })).toBeVisible();
  });

  it("조회 실패는 삭제 안내 없이 상세창에서 재시도한다", () => {
    const retry = vi.fn();
    render(<DesktopInventoryRightPanel open selectedItem={null} displayItem={null} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} detailError="품목을 찾을 수 없습니다." onRetryDetail={retry} />);
    expect(screen.getByRole("dialog", { name: "품목 상세" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("품목을 찾을 수 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("삭제된 품목")).not.toBeInTheDocument();
  });

  it("최근 내역을 보고 있어도 삭제 확인 안내를 유지한다", () => {
    const deletedItem = { ...makeItem(), deleted_at: "2026-10-07T00:00:00Z" };
    render(<DesktopInventoryRightPanel selectedItem={deletedItem} displayItem={deletedItem} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "최근 내역" }));
    expect(screen.getByText("삭제된 품목입니다. 입출고 작업을 할 수 없습니다.")).toBeVisible();
    expect(screen.getByText("최근 내역 패널")).toBeVisible();
  });

  it("기본 상세 정보를 보여주고 최근 내역 탭으로 전환한다", () => {
    const item = makeItem();
    render(
      <DesktopInventoryRightPanel
        selectedItem={item}
        displayItem={item}
        headerBadge={null}
        onClose={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    const detailTab = screen.getByRole("tab", { name: "상세 정보" });
    const historyTab = screen.getByRole("tab", { name: "최근 내역" });
    const tablist = screen.getByRole("tablist", { name: "재고 상세 보기" });
    const title = screen.getByText("테스트 품목");
    const tabpanel = screen.getByRole("tabpanel");
    expect(tablist.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(title.compareDocumentPosition(tabpanel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(detailTab).toHaveAttribute("aria-selected", "true");
    expect(tablist).toHaveClass("flex", "min-w-0", "flex-1", "w-full");
    expect(detailTab).toHaveClass("flex-1");
    expect(historyTab).toHaveClass("flex-1");
    const closeButton = screen.getByRole("button", { name: "패널 닫기" });
    expect(tablist.parentElement).toHaveClass("flex", "items-center", "gap-2", "mb-4");
    expect(screen.getByTestId("desktop-right-panel-body")).not.toContainElement(closeButton);
    expect(screen.getByText("상세 내용")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-right-panel-body")).toHaveClass("-mr-[31px]", "pr-[31px]");

    fireEvent.click(historyTab);

    expect(historyTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("최근 내역 패널")).toBeInTheDocument();
    expect(screen.queryByText("상세 내용")).not.toBeInTheDocument();
  });

  it("resets the shared scroller on every tab change, item change and reopening", () => {
    const item = makeItem();
    const panel = (open: boolean, selectedItem = item) => <DesktopInventoryRightPanel open={open} selectedItem={selectedItem} displayItem={selectedItem} headerBadge={null} onClose={vi.fn()} onGoToWarehouse={vi.fn()} />;
    const { rerender } = render(panel(true));
    for (const name of ["최근 내역", "검색용 이름", "상세 정보"]) {
      const body = screen.getByTestId("desktop-right-panel-body");
      body.scrollTop = 150;
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(body.scrollTop).toBe(0);
    }
    screen.getByTestId("desktop-right-panel-body").scrollTop = 150;
    rerender(panel(true, { ...item, item_id: "next" }));
    expect(screen.getByTestId("desktop-right-panel-body").scrollTop).toBe(0);
    rerender(panel(false));
    rerender(panel(true));
    expect(screen.getByTestId("desktop-right-panel-body").scrollTop).toBe(0);
  });

  it("다른 품목을 열면 상세 정보 탭으로 돌아간다", () => {
    const firstItem = makeItem();
    const nextItem = { ...makeItem(), item_id: "item-2", item_name: "다음 품목" };
    const { rerender } = render(
      <DesktopInventoryRightPanel
        selectedItem={firstItem}
        displayItem={firstItem}
        headerBadge={null}
        onClose={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "최근 내역" }));
    rerender(
      <DesktopInventoryRightPanel
        selectedItem={nextItem}
        displayItem={nextItem}
        headerBadge={null}
        onClose={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "상세 정보" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("상세 내용")).toBeInTheDocument();
  });

  it("선택 탭만 탭 순서에 두고 방향키와 Home/End로 선택과 포커스를 이동한다", () => {
    const item = makeItem();
    render(
      <DesktopInventoryRightPanel
        selectedItem={item}
        displayItem={item}
        headerBadge={null}
        onClose={() => {}}
        onGoToWarehouse={() => {}}
      />,
    );

    const detailTab = screen.getByRole("tab", { name: "상세 정보" });
    const historyTab = screen.getByRole("tab", { name: "최근 내역" });
    expect(detailTab).toHaveAttribute("tabindex", "0");
    expect(historyTab).toHaveAttribute("tabindex", "-1");

    detailTab.focus();
    fireEvent.keyDown(detailTab, { key: "ArrowRight" });
    expect(historyTab).toHaveFocus();
    expect(historyTab).toHaveAttribute("aria-selected", "true");
    expect(historyTab).toHaveAttribute("tabindex", "0");
    expect(detailTab).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(historyTab, { key: "Home" });
    expect(detailTab).toHaveFocus();
    expect(detailTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(detailTab, { key: "End" });
    const aliasesTab = screen.getByRole("tab", { name: "검색용 이름" });
    expect(aliasesTab).toHaveFocus();
    fireEvent.keyDown(aliasesTab, { key: "ArrowRight" });
    expect(detailTab).toHaveFocus();
    fireEvent.keyDown(detailTab, { key: "ArrowLeft" });
    expect(aliasesTab).toHaveFocus();
  });

  it("keeps modal dialog semantics while using one red card close button", () => {
    const onClose = vi.fn();
    const item = makeItem();
    render(
      <DesktopInventoryRightPanel
        selectedItem={item}
        displayItem={item}
        headerBadge={<span>정상</span>}
        onClose={onClose}
        onGoToWarehouse={() => {}}
      />,
    );

    const code = screen.getByText("46-AA-0080");
    expect(code.parentElement).toContainElement(screen.getByText("정상"));
    expect(screen.getByRole("dialog", { name: "테스트 품목" })).toHaveAttribute("aria-modal", "true");
    const closeButtons = screen.getAllByRole("button", { name: "패널 닫기" });
    expect(closeButtons).toHaveLength(1);
    expect(closeButtons[0]).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
      color: LEGACY_COLORS.red,
    });

    fireEvent.click(closeButtons[0]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
