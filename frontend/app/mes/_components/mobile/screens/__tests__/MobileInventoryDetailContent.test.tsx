import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { MobileInventoryDetailContent } from "../MobileInventoryDetailContent";

const historyRender = vi.hoisted(() => vi.fn());
vi.mock("../../../_inventory_sections/InventoryRecentHistoryPanel", () => ({
  InventoryRecentHistoryPanel: ({ item, mobilePresentation }: { item: Item; mobilePresentation: boolean }) => {
    historyRender(item.item_id, mobilePresentation);
    return <div>최근 거래 {item.item_id}</div>;
  },
}));
vi.mock("../../../_inventory_sections/InventoryDetailPanel", () => ({
  InventoryDetailPanel: ({ item, onGoToWarehouse }: { item: Item; onGoToWarehouse: (item: Item) => void }) => <button onClick={() => onGoToWarehouse(item)}>입고</button>,
}));
const item = { item_id: "one", item_name: "테스트 품목", mes_code: "9-TR-0004" } as Item;
beforeEach(() => historyRender.mockClear());

it("최근 내역 탭에도 삭제 안내를 표시하고 내역을 유지한다", () => {
  render(<MobileInventoryDetailContent item={{ ...item, deleted_at: "2026-10-07T00:00:00Z" }} headerBadge={null} onGoToWarehouse={vi.fn()} actionsDisabled />);
  fireEvent.click(screen.getByRole("tab", { name: "최근 내역" }));
  expect(screen.getByText("삭제된 품목입니다. 입출고 작업을 할 수 없습니다.")).toBeVisible();
  expect(screen.getByText("최근 거래 one")).toBeVisible();
});

it("기본 상세는 조회하지 않고 최근 내역 탭에서만 모바일 조회를 마운트한다", () => {
  const navigate = vi.fn();
  render(<MobileInventoryDetailContent item={item} headerBadge={null} onGoToWarehouse={navigate} />);
  expect(screen.getByRole("tab", { name: "상세 정보" })).toHaveAttribute("aria-selected", "true");
  expect(historyRender).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "최근 내역" }));
  expect(historyRender).toHaveBeenCalledWith("one", true);
  expect(screen.queryByRole("button", { name: "입고" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "상세 정보" }));
  fireEvent.click(screen.getByRole("button", { name: "입고" }));
  expect(navigate).toHaveBeenCalledWith(item);
});

it("탭 전환은 시트 스크롤을 초기화하고 키보드로 전환할 수 있다", () => {
  const { container } = render(<div data-anim="sheetUp"><MobileInventoryDetailContent item={item} headerBadge={null} onGoToWarehouse={vi.fn()} /></div>);
  const sheet = container.firstElementChild!;
  sheet.scrollTop = 100;
  fireEvent.keyDown(screen.getByRole("tab", { name: "상세 정보" }), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "최근 내역" })).toHaveAttribute("aria-selected", "true");
  expect(sheet.scrollTop).toBe(0);
});

it("품목 변경과 시트 재열기는 상세 정보부터 시작한다", () => {
  const props = { item, headerBadge: null, onGoToWarehouse: vi.fn() };
  const view = render(<MobileInventoryDetailContent key="one" {...props} />);
  fireEvent.click(screen.getByRole("tab", { name: "최근 내역" }));
  view.rerender(<MobileInventoryDetailContent key="two" {...props} item={{ ...item, item_id: "two" }} />);
  expect(screen.getByRole("tab", { name: "상세 정보" })).toHaveAttribute("aria-selected", "true");
  view.rerender(<></>);
  view.rerender(<MobileInventoryDetailContent key="one" {...props} />);
  expect(screen.getByRole("tab", { name: "상세 정보" })).toHaveAttribute("aria-selected", "true");
});
