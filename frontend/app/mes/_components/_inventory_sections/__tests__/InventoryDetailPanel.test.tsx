import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type BOMTreeNode, type Item, type StockRequestReservationLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { DesktopRightPanel } from "../../DesktopRightPanel";
import { SlidePanel } from "../../common/SlidePanel";
import { BomSubExpander } from "../../_warehouse_v2/BomSubExpander";
import { BomDetailModal } from "../BomDetailModal";

const realtimeState = vi.hoisted(() => ({
  revision: 1 as number | null,
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtimeState.revision,
}));

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

function makeReservation(lineId: string, requesterName: string): StockRequestReservationLine {
  return {
    line_id: lineId,
    request_id: `request-${lineId}`,
    request_code: null,
    requester_name: requesterName,
    requester_department: "production",
    quantity: 5,
    from_bucket: "warehouse",
    to_bucket: "department",
    to_department: "production",
    created_at: "2026-08-04T00:00:00Z",
  } as unknown as StockRequestReservationLine;
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
  realtimeState.revision = 1;
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

  it("shows the combined warehouse and department approval pending quantity", () => {
    render(
      <InventoryDetailPanel
        item={{ ...makeItem(), available_quantity: 10, pending_quantity: 3, department_pending_quantity: 2 } as Item}
        onGoToWarehouse={() => {}}
      />,
    );

    expect(within(screen.getByText("승인 대기 수량").parentElement!).getByText("5")).toBeInTheDocument();
  });

  it("renders defective stock after available and pending quantities with red emphasis", () => {
    render(
      <InventoryDetailPanel
        item={{ ...makeItem(), available_quantity: 10, pending_quantity: 5, defective_total: 3.5 } as Item}
        onGoToWarehouse={() => {}}
      />,
    );

    const availableLabel = screen.getByText("사용 가능 재고");
    const pendingLabel = screen.getByText("승인 대기 수량");
    const defectiveLabel = screen.getByText("불량 재고");
    const defectiveCard = defectiveLabel.parentElement;

    expect(availableLabel.compareDocumentPosition(pendingLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pendingLabel.compareDocumentPosition(defectiveLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(defectiveLabel.parentElement?.parentElement).toHaveClass("grid-cols-3");
    expect(defectiveCard).toHaveStyle({
      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
    });
    expect(within(defectiveCard!).getByText(formatQty(3.5))).toHaveStyle({ color: LEGACY_COLORS.red });
  });

  it("does not render defective stock or expand the quantity grid when its total is zero", () => {
    render(
      <InventoryDetailPanel
        item={{ ...makeItem(), defective_total: 0 } as Item}
        onGoToWarehouse={() => {}}
      />,
    );

    expect(screen.queryByText("불량 재고")).not.toBeInTheDocument();
    expect(screen.getByText("사용 가능 재고").parentElement?.parentElement).toHaveClass("grid-cols-2");
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

describe("InventoryDetailPanel realtime reservations", () => {
  it("shows each reservation's actual warehouse, production, and defective source", async () => {
    vi.spyOn(api, "getItemReservations").mockResolvedValue([
      {
        ...makeReservation("dept-source", "부서 요청"),
        from_bucket: "production",
        from_department: "조립",
      },
      {
        ...makeReservation("defect-source", "불량 요청"),
        from_bucket: "defective",
        from_department: "고압",
      },
      makeReservation("warehouse-source", "창고 요청"),
    ]);
    render(
      <InventoryDetailPanel
        item={{ ...makeItem(), pending_quantity: 0, department_pending_quantity: 5 } as Item}
        onGoToWarehouse={() => {}}
      />,
    );

    expect(await screen.findByText(/조립 생산 →/)).toBeInTheDocument();
    expect(screen.getByText(/고압 불량 →/)).toBeInTheDocument();
    expect(screen.getByText(/창고 →/)).toBeInTheDocument();
  });

  it("refreshes unchanged pending quantity on a revision without closing the open quick action", async () => {
    vi.spyOn(api, "getItemReservations")
      .mockResolvedValueOnce([makeReservation("old", "기존 요청자")])
      .mockResolvedValueOnce([makeReservation("new", "최신 요청자")]);
    const item = { ...makeItem(), pending_quantity: 5 } as Item;
    const { rerender } = render(<InventoryDetailPanel item={item} onGoToWarehouse={() => {}} />);

    expect(await screen.findByText("기존 요청자")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "입고" }));
    expect(screen.getByTestId("quick-action-choices")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(<InventoryDetailPanel item={item} onGoToWarehouse={() => {}} />);

    expect(await screen.findByText("최신 요청자")).toBeInTheDocument();
    expect(api.getItemReservations).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("quick-action-choices")).toBeInTheDocument();
  });

  it("ignores an earlier reservation response after a revision refresh", async () => {
    const earlier = deferred<StockRequestReservationLine[]>();
    const latest = deferred<StockRequestReservationLine[]>();
    vi.spyOn(api, "getItemReservations")
      .mockReturnValueOnce(earlier.promise)
      .mockReturnValueOnce(latest.promise);
    const item = { ...makeItem(), pending_quantity: 5 } as Item;
    const { rerender } = render(<InventoryDetailPanel item={item} onGoToWarehouse={() => {}} />);
    await waitFor(() => expect(api.getItemReservations).toHaveBeenCalledTimes(1));

    realtimeState.revision = 2;
    rerender(<InventoryDetailPanel item={item} onGoToWarehouse={() => {}} />);
    await waitFor(() => expect(api.getItemReservations).toHaveBeenCalledTimes(2));

    await act(async () => {
      latest.resolve([makeReservation("new", "최신 요청자")]);
      await latest.promise;
    });
    expect(await screen.findByText("최신 요청자")).toBeInTheDocument();

    await act(async () => {
      earlier.resolve([makeReservation("old", "뒤늦은 요청자")]);
      await earlier.promise;
    });
    expect(screen.queryByText("뒤늦은 요청자")).not.toBeInTheDocument();
    expect(screen.getByText("최신 요청자")).toBeInTheDocument();
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
    expect(dialog).toHaveTextContent("10 EA");
    expect(api.getBOMTree).toHaveBeenCalledWith("item-1", { departmentOrder: "desc" });
    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(dialog).toHaveStyle({ background: "var(--c-bg)" });
    expect(screen.getByTestId("bom-detail-modal-panel")).toHaveClass("w-[calc(100vw-128px)]", "h-[84vh]");
    expect(screen.getByTestId("bom-detail-modal-panel")).toHaveStyle({
      background: "var(--c-popup-bg)",
    });
    expect(screen.getByRole("button", { name: "하위 구성 보기" }).querySelector("svg.lucide-chevron-right")).toBeNull();
    expect(within(dialog).queryByText("닫기")).not.toBeInTheDocument();
    expect(dialog.querySelector("footer")).toBeNull();
  });

  it("keeps a fixed-height modal header with root stock and tree-wide controls", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const panel = await screen.findByTestId("bom-detail-modal-panel");
    expect(panel).toHaveClass("h-[84vh]");
    expect(screen.getByTestId("bom-modal-header")).toHaveTextContent("완성품");
    expect(screen.getByTestId("bom-modal-header")).toHaveTextContent("현재 재고 3 EA");
    expect(screen.getByRole("button", { name: "모두 펼치기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "모두 접기" })).toBeDisabled();
  });

  it("uses a space before the unit in both BOM quantity columns", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    expect(await screen.findByText("2 EA", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("10 EA", { exact: true })).toBeInTheDocument();
  });

  it("marks zero stock in red in both the BOM header and component row", async () => {
    const zeroStockTree: BOMTreeNode = {
      ...bomTree,
      current_stock: 0,
      children: [{ ...bomTree.children[0], current_stock: 0 }],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(zeroStockTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const header = await screen.findByTestId("bom-modal-header");
    expect(within(header).getByText("현재 재고 0 EA")).toHaveStyle({ color: LEGACY_COLORS.red });
    const zeroStockCell = screen.getByText("0 EA", { exact: true });
    const zeroStockRow = zeroStockCell.closest("[data-testid='bom-modal-row']")!;
    expect(zeroStockCell).toHaveStyle({ color: LEGACY_COLORS.red });
    expect(zeroStockRow.querySelector("div")).toHaveAttribute("style", expect.stringContaining(`${LEGACY_COLORS.red} 15%`));
    expect(zeroStockRow.querySelector("div")).not.toHaveClass("bom-tree-depth");
  });

  it("toggles a branch from its full row and exposes tree-wide expand and collapse", async () => {
    const nestedTree: BOMTreeNode = {
      ...bomTree,
      children: [{
        ...bomTree.children[0],
        item_name: "상위 구성품",
        children: [{ ...bomTree.children[0], item_id: "nested-component", item_name: "하위 구성품" }],
      }],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(nestedTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const branch = await screen.findByRole("button", { name: /상위 구성품/ });
    expect(branch).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "모두 펼치기" })).toBeEnabled();

    fireEvent.click(branch);
    expect(await screen.findByText("하위 구성품")).toBeInTheDocument();
    expect(branch).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(branch, { key: " " });
    expect(screen.queryByText("하위 구성품")).not.toBeInTheDocument();

    fireEvent.keyDown(branch, { key: "Enter" });
    expect(await screen.findByText("하위 구성품")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(screen.queryByText("하위 구성품")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    expect(await screen.findByText("하위 구성품")).toBeInTheDocument();
  });

  it("does not toggle a branch while its item code text is selected", async () => {
    const nestedTree: BOMTreeNode = {
      ...bomTree,
      children: [{
        ...bomTree.children[0],
        item_name: "선택 가능한 상위 구성품",
        mes_code: "3-PA-0002",
        children: [{ ...bomTree.children[0], item_id: "nested-component", item_name: "하위 구성품" }],
      }],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(nestedTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const branch = await screen.findByRole("button", { name: /선택 가능한 상위 구성품/ });
    const code = within(branch).getByTestId("bom-modal-code");
    const range = document.createRange();
    range.selectNodeContents(code);
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "3-PA-0002",
      getRangeAt: () => range,
    } as unknown as Selection);

    fireEvent.click(branch);

    expect(screen.queryByText("하위 구성품")).not.toBeInTheDocument();
    expect(branch).toHaveAttribute("aria-expanded", "false");
  });

  it("reserves scrollbar space and delegates normal BOM depth tones to reactive CSS", async () => {
    const depthNodes: BOMTreeNode[] = Array.from({ length: 9 }, (_, depth) => ({
      ...bomTree.children[0],
      item_id: `depth-${depth}`,
      item_name: `깊이 ${depth}`,
      children: [],
    }));
    for (let depth = depthNodes.length - 2; depth >= 0; depth -= 1) {
      depthNodes[depth].children = [depthNodes[depth + 1]];
    }
    const depthTree: BOMTreeNode = {
      ...bomTree,
      children: [depthNodes[0]],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(depthTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));
    const scrollHost = await screen.findByTestId("bom-modal-tree-scroll");
    expect(scrollHost).toHaveClass("overflow-y-scroll");
    expect(scrollHost).not.toHaveClass("rounded-[18px]", "border");
    expect(screen.getByTestId("bom-modal-tree-table")).toHaveClass("min-h-full", "overflow-clip", "rounded-[18px]", "border");
    expect(screen.getByTestId("bom-modal-grid-header")).toHaveClass("bom-detail-modal-grid");
    expect(screen.getByTestId("bom-modal-grid-header")).toHaveTextContent("현재 재고");
    fireEvent.click(await screen.findByRole("button", { name: "모두 펼치기" }));
    await screen.findByText("깊이 8");

    const depthOneRow = screen.getByText("깊이 1").closest("[data-testid='bom-modal-row']")!;
    const depthTwoRow = screen.getByText("깊이 2").closest("[data-testid='bom-modal-row']")!;
    const depthEightRow = screen.getByText("깊이 8").closest("[data-testid='bom-modal-row']")!;
    const depthOneToggle = depthOneRow.querySelector("[aria-hidden='true']") as HTMLElement;
    const depthEightToggle = depthEightRow.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(depthOneToggle).toHaveClass("w-11");
    expect(depthOneToggle.style.transform).toBe("translateX(58px)");
    expect(depthEightToggle.style.transform).toBe("translateX(394px)");
    expect(depthOneRow.querySelector("[role='button']")).toHaveClass("bom-tree-depth", "bom-tree-depth-1");
    expect(depthTwoRow.querySelector("[role='button']")).toHaveClass("bom-tree-depth", "bom-tree-depth-2");
    expect(depthEightRow.firstElementChild).toHaveClass("bom-tree-depth", "bom-tree-depth-8");
    expect(depthOneRow.querySelector("[role='button']")).not.toHaveClass("hover:brightness-95");
    expect(depthEightRow.firstElementChild).not.toHaveClass("hover:brightness-95");
    expect(depthOneRow.querySelector("[role='button']")).not.toHaveAttribute("style", expect.stringContaining("color-mix"));
  });

  it("keeps a capacity-ignored zero-stock component row normal while striking its stock", async () => {
    const capacityIgnoredTree: BOMTreeNode = {
      ...bomTree,
      children: [{
        ...bomTree.children[0],
        item_name: "생산가능 수량 제외 구성품",
        current_stock: 0,
        production_capacity_ignored: true,
      }],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(capacityIgnoredTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const zeroStockCell = await screen.findByText("0 EA", { exact: true });
    const zeroStockRow = zeroStockCell.closest("[data-testid='bom-modal-row']")!;
    expect(zeroStockRow.querySelector("div")).not.toHaveAttribute("style", expect.stringContaining(`${LEGACY_COLORS.red} 15%`));
    expect(zeroStockCell).toHaveStyle({ color: LEGACY_COLORS.red });
    expect(zeroStockCell).toHaveClass("line-through");
  });

  it("highlights the modal BOM parent with a BOM badge and parent metadata", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue(bomTree);
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const parentHeader = await screen.findByTestId("bom-modal-header");
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

  it("shows current and additional production badges before the modal actions", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValue({
      ...bomTree,
      item_name: "매우 긴 상위 품목명도 생산 가능 수량 배지와 작업 버튼 영역을 밀어내지 않아야 합니다",
      additional_producible_quantity: 8,
    });
    render(<InventoryDetailPanel item={makeBomItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "하위 구성 보기" }));

    const header = await screen.findByTestId("bom-modal-header");
    const current = within(header).getByTestId("bom-current-stock-badge");
    const additional = within(header).getByTestId("bom-additional-producible-badge");
    const expand = within(header).getByRole("button", { name: "모두 펼치기" });
    const collapse = within(header).getByRole("button", { name: "모두 접기" });
    const close = within(header).getByRole("button", { name: "닫기" });

    expect(current).toHaveTextContent("현재 재고 3 EA");
    expect(additional).toHaveTextContent("추가 생산 가능 8 EA");
    expect(within(header).getByText("매우 긴 상위 품목명도 생산 가능 수량 배지와 작업 버튼 영역을 밀어내지 않아야 합니다")).toHaveClass("truncate");
    expect(current).toHaveClass("ml-auto", "shrink-0");
    expect(current.compareDocumentPosition(additional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(additional.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(expand.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(collapse.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(current).toHaveClass("ml-auto");
    expect(additional).toHaveStyle({ color: LEGACY_COLORS.purple });
  });

  it("shows muted zero and unavailable additional production states", async () => {
    vi.spyOn(api, "getBOMTree")
      .mockResolvedValueOnce({ ...bomTree, additional_producible_quantity: 0 })
      .mockResolvedValueOnce(bomTree);
    const { rerender } = render(<BomDetailModal itemId="item-1" open onClose={() => {}} />);

    const zeroBadge = await screen.findByTestId("bom-additional-producible-badge");
    expect(zeroBadge).toHaveTextContent("추가 생산 가능 0 EA");
    expect(zeroBadge).toHaveStyle({ color: LEGACY_COLORS.muted2 });

    realtimeState.revision = 2;
    rerender(<BomDetailModal itemId="item-1" open onClose={() => {}} />);
    const unavailableBadge = await screen.findByTestId("bom-additional-producible-badge");
    expect(unavailableBadge).toHaveTextContent("추가 생산 가능 계산 불가");
    expect(unavailableBadge).toHaveStyle({ color: LEGACY_COLORS.muted2 });
    expect(screen.queryByText("추가 생산 가능 0 EA")).not.toBeInTheDocument();
  });

  it("hides previous header badge values immediately while a new item tree loads", async () => {
    const nextTree = deferred<BOMTreeNode>();
    vi.spyOn(api, "getBOMTree")
      .mockResolvedValueOnce({ ...bomTree, additional_producible_quantity: 8 })
      .mockReturnValueOnce(nextTree.promise);
    const { rerender } = render(<BomDetailModal itemId="item-1" open onClose={() => {}} />);

    expect(await screen.findByText("현재 재고 3 EA")).toBeInTheDocument();
    expect(screen.getByText("추가 생산 가능 8 EA")).toBeInTheDocument();

    rerender(<BomDetailModal itemId="item-2" open onClose={() => {}} />);

    expect(screen.queryByText("현재 재고 3 EA")).not.toBeInTheDocument();
    expect(screen.queryByText("추가 생산 가능 8 EA")).not.toBeInTheDocument();

    await act(async () => {
      nextTree.resolve({
        ...bomTree,
        item_id: "item-1",
      });
      await nextTree.promise;
    });
    expect(screen.queryByText("현재 재고 3 EA")).not.toBeInTheDocument();
    expect(screen.queryByText("추가 생산 가능 8 EA")).not.toBeInTheDocument();
  });

  it("replaces current stock and additional production together on a realtime refresh", async () => {
    vi.spyOn(api, "getBOMTree")
      .mockResolvedValueOnce({ ...bomTree, current_stock: 3, additional_producible_quantity: 1 })
      .mockResolvedValueOnce({ ...bomTree, current_stock: 9, additional_producible_quantity: 6 });
    const { rerender } = render(<BomDetailModal itemId="item-1" open onClose={() => {}} />);

    expect(await screen.findByText("현재 재고 3 EA")).toBeInTheDocument();
    expect(screen.getByText("추가 생산 가능 1 EA")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(<BomDetailModal itemId="item-1" open onClose={() => {}} />);

    expect(await screen.findByText("현재 재고 9 EA")).toBeInTheDocument();
    expect(screen.getByText("추가 생산 가능 6 EA")).toBeInTheDocument();
    expect(screen.queryByText("현재 재고 3 EA")).not.toBeInTheDocument();
    expect(screen.queryByText("추가 생산 가능 1 EA")).not.toBeInTheDocument();
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

  it("keeps modal actions right-aligned while the BOM tree is loading or failed", async () => {
    const request = deferred<BOMTreeNode>();
    vi.spyOn(api, "getBOMTree").mockReturnValueOnce(request.promise);
    render(<BomDetailModal itemId="item-1" open onClose={() => {}} />);

    await screen.findByText("불러오는 중…");
    const close = screen.getByRole("button", { name: "닫기" });
    expect(close.parentElement).toHaveClass("ml-auto");

    await act(async () => {
      request.reject(new Error("network failure"));
      try {
        await request.promise;
      } catch {
        // useBomTree가 오류 UI로 전환하는 정상 흐름.
      }
    });
    await screen.findByRole("button", { name: "다시 시도" });
    expect(close.parentElement).toHaveClass("ml-auto");
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

  it("keeps the previous reservation rows when a realtime refresh fails", async () => {
    vi.spyOn(api, "getItemReservations")
      .mockResolvedValueOnce([makeReservation("old", "기존 요청자")])
      .mockRejectedValueOnce(new Error("refresh failed"));
    const item = { ...makeItem(), pending_quantity: 5 } as Item;
    const { rerender } = render(<InventoryDetailPanel item={item} onGoToWarehouse={() => {}} />);
    expect(await screen.findByText("기존 요청자")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(<InventoryDetailPanel item={item} onGoToWarehouse={() => {}} />);
    await waitFor(() => expect(api.getItemReservations).toHaveBeenCalledTimes(2));

    expect(screen.getByText("기존 요청자")).toBeInTheDocument();
  });

  it("renders modal BOM rows as a five-column grid without a type cell or tree rails", async () => {
    const nestedTree: BOMTreeNode = {
      ...bomTree,
      children: [{
        ...bomTree.children[0],
        item_name: "direct-component",
        process_type_code: "PA",
        required_quantity: 1.5,
        children: [{
          ...bomTree.children[0],
          item_id: "nested-component",
          item_name: "nested-component",
          required_quantity: 3,
          current_stock: 7,
          children: [],
        }],
      }],
    };
    vi.spyOn(api, "getBOMTree").mockResolvedValue(nestedTree);
    render(<BomSubExpander itemId="item-1" open modal />);

    const directName = await screen.findByText("direct-component");
    const row = directName.closest("[data-testid='bom-modal-row']")!;
    expect(screen.getByTestId("bom-modal-grid-header")).toHaveClass("bom-modal-grid", "sticky", "top-0");
    expect(row).toHaveClass("bom-modal-grid");
    expect(row).not.toHaveClass("hover:bg-[var(--c-s2)]");
    expect(within(row).getByRole("button", { expanded: false })).toHaveClass("bom-modal-toggle");
    expect(screen.getByTestId("bom-modal-grid-header")).not.toHaveTextContent("유형");
    expect(within(row).queryByText("Packaging")).not.toBeInTheDocument();
    expect(within(row).getByTestId("bom-modal-code")).toHaveTextContent("46-AA-0081");
    expect(within(row).getByText("1.5EA")).toHaveClass("text-center");
    expect(within(row).getByText("10 EA")).toHaveClass("text-right", "pr-3");
    expect(screen.queryByTestId("bom-modal-rail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bom-modal-connector")).not.toBeInTheDocument();
    expect(screen.queryByText("nested-component")).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { expanded: false }));
    const nestedName = await screen.findByText("nested-component");
    const nestedRow = nestedName.closest("[data-testid='bom-modal-row']")!;
    expect(nestedRow).toHaveAttribute("data-depth", "1");
    expect(within(nestedRow).getByTestId("bom-modal-name-cell")).toHaveStyle({ paddingLeft: "36px" });
  });

  it("강조 가능한 정형 코드만 분해하고 비정형 코드는 원문 단일 텍스트로 유지한다", async () => {
    const codes = ["46-AA-0081", "46-AA-0081-extra", "46--0081", "46-AA"];
    vi.spyOn(api, "getBOMTree").mockResolvedValue({
      ...bomTree,
      children: codes.map((mes_code, index) => ({
        ...bomTree.children[0],
        item_id: `component-${index}`,
        item_name: `코드 ${index}`,
        mes_code,
      })),
    });
    render(<BomSubExpander itemId="item-1" open modal />);

    await screen.findByText("코드 0");
    const [canonicalCode, ...malformedCodes] = screen.getAllByTestId("bom-modal-code");
    const stage = canonicalCode.querySelector("span[style*='--c-process-aa']");
    expect(stage).toHaveTextContent("-AA");
    expect(stage).toHaveStyle({ color: "var(--c-process-aa)" });
    expect(stage).toHaveClass("font-black");

    malformedCodes.forEach((code, index) => {
      expect(code).toHaveTextContent(codes[index + 1]);
      expect(code.childElementCount).toBe(0);
    });
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

  it("refreshes current stock on a realtime revision without collapsing an opened branch", async () => {
    const firstTree = {
      ...bomTree,
      children: [{
        ...bomTree.children[0],
        item_name: "branch-component",
        current_stock: 10,
        children: [{
          ...bomTree.children[0],
          item_id: "nested-component",
          item_name: "nested-visible",
          current_stock: 3,
        }],
      }],
    };
    const refreshedTree = {
      ...firstTree,
      children: [{
        ...firstTree.children[0],
        current_stock: 20,
        children: [{ ...firstTree.children[0].children[0], current_stock: 7 }],
      }],
    };
    vi.spyOn(api, "getBOMTree")
      .mockResolvedValueOnce(firstTree)
      .mockResolvedValueOnce(refreshedTree);
    const { rerender } = render(<BomSubExpander itemId="item-1" open modal />);

    const branch = await screen.findByText("branch-component");
    const branchRow = branch.closest("li")!;
    fireEvent.click(within(branchRow).getByRole("button", { expanded: false }));
    expect(await screen.findByText("nested-visible")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(<BomSubExpander itemId="item-1" open modal />);

    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("20 EA")).toBeInTheDocument();
    expect(screen.getByText("nested-visible")).toBeInTheDocument();
    expect(within(branchRow).getByRole("button")).toHaveAttribute("aria-expanded", "true");
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
    expect(rowContext.getByTestId("bom-modal-code")).toHaveTextContent("46-AA-0081");
    expect(rowContext.getByText("2 EA")).toHaveClass("text-center");
    expect(rowContext.getByText("10 EA")).toHaveClass("text-right", "pr-3");
    expect(rowContext.getByRole("button", { expanded: false })).toHaveClass("bom-modal-grid");
    expect(rowContext.getByTestId("bom-modal-name-cell")).toHaveClass("break-words");
    expect(rowContext.queryByTestId("bom-modal-connector")).not.toBeInTheDocument();
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
