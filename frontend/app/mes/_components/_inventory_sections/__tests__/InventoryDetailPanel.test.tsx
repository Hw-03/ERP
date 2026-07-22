import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type BOMTreeNode, type Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopRightPanel } from "../../DesktopRightPanel";
import { SlidePanel } from "../../common/SlidePanel";
import { BomSubExpander } from "../../_warehouse_v2/BomSubExpander";

vi.mock("@/app/mes/_components/DepartmentsContext", () => ({
  useDeptColorLookup: () => () => LEGACY_COLORS.blue,
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("../InventoryDetailLocations", () => ({
  InventoryDetailLocations: () => null,
}));

import { InventoryDetailPanel } from "../InventoryDetailPanel";

function makeItem(): Item {
  return {
    item_id: "item-1",
    item_name: "테스트 항목",
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

function makeBomItem(): Item {
  return { ...makeItem(), bom_completed_at: "2026-07-21T00:00:00Z" } as Item;
}

const bomTree: BOMTreeNode = {
  item_id: "item-1",
  item_name: "완성품",
  mes_code: "46-AA-0080",
  process_type_code: null,
  unit: "EA",
  required_quantity: 1,
  current_stock: 3,
  children: [{
    item_id: "component-1",
    item_name: "구성품 A",
    mes_code: "46-AA-0081",
    process_type_code: null,
    unit: "EA",
    required_quantity: 2,
    current_stock: 10,
    children: [],
  }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InventoryDetailPanel desktop quick actions", () => {
  it("uses directional buttons without outer group cards and keeps choices full-width", () => {
    render(
      <DesktopRightPanel title="테스트 항목">
        <InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />
      </DesktopRightPanel>,
    );

    expect(screen.queryByTestId("quick-action-group-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-action-group-out")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "입고" })).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 42%, ${LEGACY_COLORS.border})`,
      color: LEGACY_COLORS.blue,
    });
    expect(screen.getByRole("button", { name: "출고" })).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 42%, ${LEGACY_COLORS.border})`,
      color: LEGACY_COLORS.red,
    });

    fireEvent.click(screen.getByRole("button", { name: "입고" }));
    expect(screen.getByTestId("quick-action-choices")).toHaveClass("w-[calc(200%+0.5rem)]");
    expect(screen.getByRole("button", { name: /부서 입고/ })).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 32%, ${LEGACY_COLORS.border})`,
    });

    fireEvent.click(screen.getByRole("button", { name: "출고" }));
    expect(screen.getByTestId("quick-action-choices")).toHaveClass("w-[calc(200%+0.5rem)]");
    expect(screen.getByRole("button", { name: /부서 출고/ })).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 32%, ${LEGACY_COLORS.border})`,
    });
  });

  it("passes the selected desktop quick action intent and closes its choice menu", () => {
    const onGoToWarehouse = vi.fn();
    const item = makeItem();
    render(<InventoryDetailPanel item={item} onGoToWarehouse={onGoToWarehouse} />);

    fireEvent.click(screen.getByRole("button", { name: "입고" }));
    fireEvent.click(screen.getByRole("button", { name: /부서 입고/ }));

    expect(onGoToWarehouse).toHaveBeenCalledWith(item, { workType: "process", direction: "in" });
    expect(screen.queryByTestId("quick-action-choices")).not.toBeInTheDocument();
  });

  it("renders available stock before pending approval quantity", () => {
    render(<InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />);

    const availableLabel = screen.getByText("사용 가능 재고");
    const pendingLabel = screen.getByText("승인 대기 수량");
    expect(availableLabel.compareDocumentPosition(pendingLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the pending approval warning on the right-hand card", () => {
    render(
      <InventoryDetailPanel
        item={{ ...makeItem(), available_quantity: 10, pending_quantity: 5 } as Item}
        onGoToWarehouse={() => {}}
      />,
    );

    const pendingCard = screen.getByText("승인 대기 수량").parentElement;
    expect(pendingCard).toHaveStyle({
      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
    });
    expect(within(pendingCard!).getByText("5")).toHaveStyle({ color: LEGACY_COLORS.yellow });
  });

  it("portals desktop quick actions into the fixed right-panel footer", () => {
    render(
      <DesktopRightPanel title="테스트 항목">
        <InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />
      </DesktopRightPanel>,
    );

    const footer = screen.getByTestId("desktop-right-panel-footer");
    const body = screen.getByTestId("desktop-right-panel-body");
    expect(footer).toContainElement(screen.getByRole("button", { name: "입고" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "출고" }));
    expect(body).not.toContainElement(screen.getByRole("button", { name: "입고" }));
    expect(footer).toHaveClass("max-h-[45%]", "overflow-y-auto");
  });
});

describe("InventoryDetailPanel desktop BOM viewer", () => {
  it("opens a read-only BOM modal that shows the tree and current component stock", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(
      <DesktopRightPanel title="테스트 항목">
        <InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />
      </DesktopRightPanel>,
    );

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const dialog = await screen.findByRole("dialog", { name: "BOM 구성 보기" });
    expect(dialog).toHaveTextContent("구성품 A");
    expect(dialog).toHaveTextContent("현재 재고 10 EA");
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(screen.getByTestId("bom-detail-modal-panel")).toHaveClass("w-[calc(100vw-128px)]", "max-h-[84vh]");
    expect(screen.getByTestId("bom-detail-modal-panel")).toHaveStyle({ minHeight: "min(500px, 84vh)" });
    expect(screen.getByRole("button", { name: "하위 구성 보기" }).querySelector("svg.lucide-chevron-right")).toBeNull();
    expect(within(dialog).queryByText("닫기")).not.toBeInTheDocument();
    expect(dialog.querySelector("footer")).toBeNull();
  });

  it("highlights the modal BOM parent with a BOM badge and parent metadata", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const parentHeader = await screen.findByTestId("bom-tree-parent-header");
    expect(within(parentHeader).getByText("BOM", { exact: true })).toBeInTheDocument();
    expect(within(parentHeader).getByText(bomTree.item_name)).toHaveClass("font-black");
    expect(within(parentHeader).getByText(bomTree.mes_code)).toHaveClass("font-mono");
  });

  it("identifies the BOM parent item in the loaded modal header", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveTextContent(bomTree.item_name));
    expect(dialog).toHaveTextContent(bomTree.mes_code);
  });

  it("retries the same BOM request after a load error", async () => {
    vi.spyOn(api, "getBOMTree")
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(bomTree.item_name));
  });

  it("closes the BOM modal with Escape, its X button, or the backdrop and returns focus to its trigger", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    const trigger = screen.getByRole("button", { name: "하위 구성 보기" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "BOM 구성 보기" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const closeButton = await screen.findByRole("button", { name: "닫기" });
    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "BOM 구성 보기" });
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes only the BOM modal when Escape is pressed inside a containing SlidePanel", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    const closePanel = vi.fn();
    render(
      <SlidePanel open onClose={closePanel} hideCloseButton labelledBy="inventory-panel-title">
        <h2 id="inventory-panel-title">재고 상세</h2>
        <InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />
      </SlidePanel>,
    );

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));
    await screen.findByRole("dialog", { name: "BOM 구성 보기" });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "BOM 구성 보기" })).not.toBeInTheDocument());
    expect(closePanel).not.toHaveBeenCalled();
  });

  it("traps Tab and Shift+Tab on the modal close button", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));
    await screen.findByRole("dialog", { name: "BOM 구성 보기" });
    const closeButton = screen.getByRole("button", { name: "닫기" });
    expect(closeButton).toHaveFocus();

    expect(fireEvent.keyDown(closeButton, { key: "Tab" })).toBe(false);
    expect(closeButton).toHaveFocus();
    expect(fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true })).toBe(false);
    expect(closeButton).toHaveFocus();
  });

  it("does not render stale BOM responses after item changes and a rapid reopen", async () => {
    const first = deferred<BOMTreeNode>();
    const second = deferred<BOMTreeNode>();
    const latest = deferred<BOMTreeNode>();
    vi.spyOn(api, "getBOMTree")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(latest.promise);
    const { rerender } = render(
      <BomSubExpander itemId="item-1" open modal />,
    );

    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(1));
    rerender(<BomSubExpander itemId="item-2" open modal />);
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(2));
    rerender(<BomSubExpander itemId="item-2" open={false} modal />);
    rerender(<BomSubExpander itemId="item-2" open modal />);
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(3));

    await act(async () => {
      latest.resolve({ ...bomTree, children: [{ ...bomTree.children[0], item_name: "최신 구성품" }] });
      await latest.promise;
    });
    expect(await screen.findByText("최신 구성품")).toBeInTheDocument();

    await act(async () => {
      first.resolve({ ...bomTree, children: [{ ...bomTree.children[0], item_name: "오래된 구성품 1" }] });
      second.resolve({ ...bomTree, children: [{ ...bomTree.children[0], item_name: "오래된 구성품 2" }] });
      await Promise.all([first.promise, second.promise]);
    });
    expect(screen.queryByText("오래된 구성품 1")).not.toBeInTheDocument();
    expect(screen.queryByText("오래된 구성품 2")).not.toBeInTheDocument();
    expect(screen.getByText("최신 구성품")).toBeInTheDocument();
  });

  it("uses a full-width modal-only BOM tree row with wrapped names and aligned metadata", async () => {
    const longItemName = "긴 품목명도 오른쪽 메타데이터를 밀지 않고 여러 줄로 표시되는 구성품";
    const nestedTree = {
      ...bomTree,
      children: [{
        ...bomTree.children[0], item_name: longItemName,
        children: [{ ...bomTree.children[0], item_id: "component-2", item_name: "하위 구성품" }],
      }, {
        ...bomTree.children[0], item_id: "component-3", item_name: "별도 최상위 구성품",
      }],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(nestedTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));
    await screen.findByRole("dialog", { name: "BOM 구성 보기" });

    await screen.findByText(longItemName);
    const row = screen.getAllByTestId("bom-modal-row").find((candidate) =>
      within(candidate).queryByText(longItemName),
    );
    expect(row).toBeDefined();
    const rowContext = within(row!);
    expect(rowContext.getByText(longItemName)).toBeInTheDocument();
    expect(rowContext.getByText("조립")).toBeInTheDocument();
    expect(rowContext.getByText("46-AA-0081")).toBeInTheDocument();
    expect(rowContext.getByText("2")).toBeInTheDocument();
    expect(rowContext.getByText("현재 재고 10 EA")).toBeInTheDocument();
    expect(rowContext.getByTestId("bom-modal-row-meta")).toHaveClass(
      "w-full",
      "grid-cols-[minmax(0,1fr)_auto]",
      "sm:grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_8rem]",
      "sm:min-w-[18.25rem]",
    );
    expect(rowContext.getByTestId("bom-modal-connector")).toHaveClass("self-stretch");
    expect(rowContext.getByTestId("bom-modal-connector-line")).toHaveStyle({ height: "100%" });
    fireEvent.click(rowContext.getByRole("button", { expanded: false }));
    expect(await screen.findByText("하위 구성품")).toBeInTheDocument();
  });
});

describe("InventoryDetailPanel mobile BOM viewer", () => {
  it("keeps the BOM parent header exclusive to the desktop modal", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(
      <InventoryDetailPanel
        item={makeBomItem()}
        onGoToWarehouse={() => {}}
        quickActionVariant="mobile"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    expect(await screen.findByText("구성품 A")).toBeInTheDocument();
    expect(screen.queryByTestId("bom-tree-parent-header")).not.toBeInTheDocument();
    expect(screen.queryByText("BOM", { exact: true })).not.toBeInTheDocument();
  });
});
