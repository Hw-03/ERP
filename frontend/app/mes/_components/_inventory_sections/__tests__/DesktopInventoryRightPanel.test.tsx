import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    expect(screen.getByText("상세 내용")).toBeInTheDocument();

    fireEvent.click(historyTab);

    expect(historyTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("최근 내역 패널")).toBeInTheDocument();
    expect(screen.queryByText("상세 내용")).not.toBeInTheDocument();
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
