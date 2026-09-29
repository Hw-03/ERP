import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BomDetailModal } from "../BomDetailModal";

vi.mock("../../_warehouse_v2/BomSubExpander", () => ({
  useBomTree: () => ({ tree: { item_id: "551", item_name: "DX3000", mes_code: "DX-3000", unit: "EA", current_stock: 2, additional_producible_quantity: 3, children: [{ item_id: "branch" }] }, retry: vi.fn() }),
  getBomBranchItemIds: () => ["branch"],
  ModalBomTree: ({ expandedItemIds }: { expandedItemIds: Set<string> }) => <div data-testid="bom-tree">{expandedItemIds.has("branch") ? "expanded" : "collapsed"}</div>,
}));

describe("BOM 모바일 헤더", () => {
  it("제목 줄에 접근 가능한 펼치기·접기·닫기를 두고 메타 정보와 읽기 전용 설명을 유지한다", async () => {
    const onClose = vi.fn();
    render(<BomDetailModal itemId="551" open mobilePresentation onClose={onClose} />);
    const header = await screen.findByTestId("bom-modal-header");
    const titleRow = within(header).getByText("BOM 구성 보기").parentElement!;
    const expand = within(titleRow).getByRole("button", { name: "모두 펼치기" });
    const collapse = within(titleRow).getByRole("button", { name: "모두 접기" });
    const close = within(titleRow).getByRole("button", { name: "닫기" });
    [expand, collapse, close].forEach((button) => expect(button).toHaveClass("h-11", "w-11"));
    expect(header).toHaveTextContent("DX3000");
    expect(header).toHaveTextContent("DX-3000");
    expect(header).toHaveTextContent("현재 재고 2 EA");
    expect(header).toHaveTextContent("추가 생산 가능 3 EA");
    const description = screen.getByText("읽기 전용 · 구성품별 현재 총 재고");
    expect(description).toHaveClass("sr-only");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-describedby", description.id);
    expect(collapse).toBeDisabled();
    fireEvent.click(expand);
    expect(screen.getByTestId("bom-tree")).toHaveTextContent("expanded");
    expect(expand).toBeDisabled();
    fireEvent.click(collapse);
    expect(screen.getByTestId("bom-tree")).toHaveTextContent("collapsed");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
