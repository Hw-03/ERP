import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { BOMTreeNode } from "@/lib/api";
import type { ProductionCapacity, ProductionCapacityPfVariant } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { CapacityDetailModal } from "../CapacityDetailModal";

const realtimeState = vi.hoisted(() => ({
  revision: 1 as number | null,
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtimeState.revision,
}));

let desktopMatches = true;
let mediaListeners: Set<(event: MediaQueryListEvent) => void>;

function setDesktopMatch(matches: boolean) {
  desktopMatches = matches;
  const event = { matches, media: "(min-width: 640px)" } as MediaQueryListEvent;
  act(() => mediaListeners.forEach((listener) => listener(event)));
}

const pfA: ProductionCapacityPfVariant = {
  pf_item_id: "pf-1",
  pf_code: "3-PF-0001",
  pf_name: "DX3000 PF A",
  model_symbol: "3",
  af_item_id: "af-1",
  ship_ready: 10,
  fast_production: 20,
  total_production: 30,
  fast_production_limiting_item: "포장 자재",
  bom_status: "complete",
};

const pfB: ProductionCapacityPfVariant = {
  pf_item_id: "pf-2",
  pf_code: "3-PF-0002",
  pf_name: "DX3000 PF B",
  model_symbol: "3",
  af_item_id: "af-2",
  ship_ready: 4,
  fast_production: 14,
  total_production: 24,
  fast_production_limiting_item: "부족 부품",
  bom_status: "incomplete",
};

const pfC: ProductionCapacityPfVariant = {
  pf_item_id: "pf-3",
  pf_code: "4-PF-0001",
  pf_name: "ADX4000W PF C",
  model_symbol: "4",
  af_item_id: "af-3",
  ship_ready: 7,
  fast_production: 17,
  total_production: 27,
  bom_status: "complete",
};

const capacityData: ProductionCapacity = {
  immediate: 0,
  maximum: 0,
  limiting_item: null,
  top_items: [],
  af: {
    basis: "AF",
    status: "incomplete",
    summary: { ship_ready: 0, fast_production: 0, total_production: 0 },
    items: [
      {
        af_item_id: "af-1",
        af_code: "3-AF-0001",
        af_name: "DX3000 조립 완제품 A",
        model_symbol: "3",
        ship_ready: 10,
        fast_production: 20,
        total_production: 30,
        bom_status: "complete",
        has_direct_children: true,
        has_pf_path: true,
        marked_complete: true,
      },
      {
        af_item_id: "af-2",
        af_code: "3-AF-0002",
        af_name: "DX3000 조립 완제품 B",
        model_symbol: "3",
        ship_ready: 4,
        fast_production: 14,
        total_production: 24,
        bom_status: "incomplete",
        has_direct_children: false,
        has_pf_path: true,
        marked_complete: false,
      },
      {
        af_item_id: "af-3",
        af_code: "4-AF-0001",
        af_name: "ADX4000W 조립 완제품 C",
        model_symbol: "4",
        ship_ready: 7,
        fast_production: 17,
        total_production: 27,
        bom_status: "complete",
        has_direct_children: true,
        has_pf_path: true,
        marked_complete: true,
      },
    ],
    pf_variants: [pfA, pfB, pfC],
    auto_representatives: [pfA, pfC],
  },
};

function makeBomTree(itemId: string, children = true): BOMTreeNode {
  return {
    item_id: itemId,
    mes_code: itemId === "pf-1" ? "3-PF-0001" : itemId === "pf-2" ? "3-PF-0002" : "4-PF-0001",
    item_name: `${itemId} 출하 완제품`,
    process_type_code: "PF",
    unit: "EA",
    required_quantity: 1,
    current_stock: 2,
    children: children
      ? [
          {
            item_id: `${itemId}-branch-1`,
            mes_code: "3-AA-0001",
            item_name: `${itemId} 1단계 구성품`,
            process_type_code: "AA",
            unit: "EA",
            required_quantity: 1,
            current_stock: 3,
            children: [
              {
                item_id: `${itemId}-branch-2`,
                mes_code: "3-AB-0001",
                item_name: `${itemId} 2단계 구성품`,
                process_type_code: "AB",
                unit: "EA",
                required_quantity: 2,
                current_stock: 0,
                children: [
                  {
                    item_id: `${itemId}-leaf`,
                    mes_code: "346789-VR-0004",
                    item_name: `${itemId} 최하위 구성품`,
                    process_type_code: "VR",
                    unit: "EA",
                    required_quantity: 1,
                    current_stock: 0,
                    children: [],
                  },
                ],
              },
            ],
          },
        ]
      : [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderModal(data: ProductionCapacity = capacityData) {
  return render(<CapacityDetailModal capacityData={data} onClose={vi.fn()} />);
}

function getWorkspace() {
  return screen.getByRole("region", { name: "PF별 생산 가능수량 및 BOM" });
}

function getLeftPane() {
  return within(getWorkspace()).getByRole("region", { name: "출하 완제품 선택" });
}

function getRightPane() {
  return within(getWorkspace()).getByRole("region", { name: "선택한 출하 완제품 BOM" });
}

function expectSummary(label: string, value: string) {
  const labelNode = within(getRightPane()).getByText(label, { exact: true });
  expect(within(labelNode.parentElement!).getByText(value, { exact: true })).toBeInTheDocument();
}

describe("CapacityDetailModal 데스크톱 PF 작업공간", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    realtimeState.revision = 1;
    desktopMatches = true;
    mediaListeners = new Set();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string): MediaQueryList => ({
        matches: desktopMatches,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: EventListener) =>
          mediaListeners.add(listener as (event: MediaQueryListEvent) => void),
        removeEventListener: (_type: string, listener: EventListener) =>
          mediaListeners.delete(listener as (event: MediaQueryListEvent) => void),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.spyOn(api, "getBOMTree").mockImplementation(async (itemId) => makeBomTree(itemId));
  });

  it("첫 모델의 자동 기준 PF와 3수량을 선택하고 해당 전체 BOM을 요청한다", async () => {
    renderModal();

    const rightPane = getRightPane();
    expect(within(rightPane).getByText("DX3000 PF A", { exact: true })).toBeInTheDocument();
    expect(within(rightPane).getByText("3-PF-0001", { exact: true })).toBeInTheDocument();
    expectSummary("출하 대기", "10");
    expectSummary("빠른 생산", "20");
    expectSummary("총생산", "30");
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledWith("pf-1", { departmentOrder: "desc" }));
  });

  it("선택 모델만 처음 펼치고 모델 헤더는 선택을 유지하며 PF 버튼은 선택과 BOM 대상을 바꾼다", async () => {
    const secondTree = deferred<BOMTreeNode>();
    vi.mocked(api.getBOMTree).mockImplementation((itemId) =>
      itemId === "pf-3" ? secondTree.promise : Promise.resolve(makeBomTree(itemId)),
    );
    renderModal();

    const leftPane = getLeftPane();
    const rightPane = getRightPane();
    const dxHeader = within(leftPane).getByRole("button", { name: /DX3000.*2종/ });
    const adxHeader = within(leftPane).getByRole("button", { name: /ADX4000W.*1종/ });
    expect(dxHeader).toHaveAttribute("aria-expanded", "true");
    expect(adxHeader).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(dxHeader);
    expect(dxHeader).toHaveAttribute("aria-expanded", "false");
    expect(within(rightPane).getByText("DX3000 PF A", { exact: true })).toBeInTheDocument();

    fireEvent.click(adxHeader);
    const pfButton = within(leftPane).getByRole("button", { name: /ADX4000W PF C.*4-PF-0001/ });
    fireEvent.click(pfButton);

    expect(pfButton).toHaveAttribute("aria-pressed", "true");
    expect(within(rightPane).getByText("ADX4000W PF C", { exact: true })).toBeInTheDocument();
    expectSummary("출하 대기", "7");
    expectSummary("빠른 생산", "17");
    expectSummary("총생산", "27");
    expect(within(rightPane).getByText("불러오는 중…", { exact: true })).toBeInTheDocument();
    expect(within(rightPane).queryByText("pf-1 최하위 구성품")).not.toBeInTheDocument();
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledWith("pf-3", { departmentOrder: "desc" }));

    secondTree.resolve(makeBomTree("pf-3"));
    expect(await within(rightPane).findByText("pf-3 최하위 구성품")).toBeInTheDocument();
  });

  it("sm 경계를 넘을 때만 데스크톱 작업공간을 마운트하고 다시 좁아지면 해제한다", async () => {
    desktopMatches = false;
    renderModal();

    expect(screen.queryByRole("region", { name: "PF별 생산 가능수량 및 BOM" })).not.toBeInTheDocument();
    expect(api.getBOMTree).not.toHaveBeenCalled();

    setDesktopMatch(true);
    expect(screen.getByRole("region", { name: "PF별 생산 가능수량 및 BOM" })).toBeInTheDocument();
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(1));

    setDesktopMatch(false);
    expect(screen.queryByRole("region", { name: "PF별 생산 가능수량 및 BOM" })).not.toBeInTheDocument();
  });

  it("선택한 PF의 전체 BOM 가지를 기본으로 펼치고 사용자가 다시 접고 펼칠 수 있다", async () => {
    renderModal();
    const rightPane = getRightPane();

    expect(await within(rightPane).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
    const firstBranchRow = within(rightPane).getByText("pf-1 1단계 구성품").closest("li")!;
    const firstBranchButton = within(firstBranchRow).getByRole("button");
    expect(firstBranchButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(firstBranchButton);
    expect(within(rightPane).queryByText("pf-1 최하위 구성품")).not.toBeInTheDocument();
    expect(firstBranchButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(firstBranchButton);
    expect(within(rightPane).getByText("pf-1 최하위 구성품")).toBeInTheDocument();
  });

  it("데스크톱의 AF 표·병목·상단 미등록 안내를 없애고 PF 행에만 미등록 배지를 둔다", async () => {
    renderModal();
    const workspace = getWorkspace();
    const leftPane = getLeftPane();

    expect(within(workspace).queryByText("조립 완제품")).not.toBeInTheDocument();
    expect(within(workspace).queryByText("자동 기준 출하품")).not.toBeInTheDocument();
    expect(within(workspace).queryByText(/빠른 생산 병목:/)).not.toBeInTheDocument();
    expect(within(workspace).queryByText(/BOM 미등록 \d+건/)).not.toBeInTheDocument();
    expect(within(leftPane).getByText("BOM 미등록", { exact: true })).toBeInTheDocument();
    expect(await within(getRightPane()).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
  });

  it("BOM 로딩, 실패 후 재시도, 자식 없음 상태를 각각 표시한다", async () => {
    const pending = deferred<BOMTreeNode>();
    vi.mocked(api.getBOMTree).mockReturnValue(pending.promise);
    const loadingRender = renderModal();
    expect(within(getRightPane()).getByText("불러오는 중…", { exact: true })).toBeInTheDocument();
    loadingRender.unmount();
    vi.mocked(api.getBOMTree).mockClear();

    vi.mocked(api.getBOMTree)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeBomTree("pf-1"));
    const retryRender = renderModal();
    const rightPane = getRightPane();
    expect(await within(rightPane).findByText("하위 구성을 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(within(rightPane).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(2));
    expect(await within(rightPane).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
    retryRender.unmount();

    vi.mocked(api.getBOMTree).mockResolvedValue(makeBomTree("pf-1", false));
    renderModal();
    expect(await within(getRightPane()).findByText("하위 품목이 없습니다.")).toBeInTheDocument();
  });

  it("동일 PF 갱신과 재시도가 연속 실패해도 오류와 재시도 UI를 유지한다", async () => {
    vi.mocked(api.getBOMTree)
      .mockResolvedValueOnce(makeBomTree("pf-1"))
      .mockRejectedValueOnce(new Error("refresh failure"))
      .mockRejectedValueOnce(new Error("retry failure"));
    const { rerender } = renderModal();
    const rightPane = getRightPane();
    expect(await within(rightPane).findByText("pf-1 최하위 구성품")).toBeInTheDocument();

    realtimeState.revision = 2;
    rerender(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);

    expect(await within(rightPane).findByText("하위 구성을 불러오지 못했습니다.")).toBeInTheDocument();
    const retryButton = within(rightPane).getByRole("button", { name: "다시 시도" });
    fireEvent.click(retryButton);

    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledTimes(3));
    expect(await within(rightPane).findByText("하위 구성을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(within(rightPane).getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(within(rightPane).queryByText("불러오는 중…", { exact: true })).not.toBeInTheDocument();
  });

  it("PF가 하나도 없으면 전용 빈 상태를 표시하고 BOM을 요청하지 않는다", () => {
    const noPfData: ProductionCapacity = {
      ...capacityData,
      af: { ...capacityData.af!, pf_variants: [], auto_representatives: [] },
    };
    renderModal(noPfData);

    expect(within(getWorkspace()).getByText("선택 가능한 출하 완제품(PF)이 없습니다")).toBeInTheDocument();
    expect(api.getBOMTree).not.toHaveBeenCalled();
  });

  it("갱신에도 선택 PF를 유지해 최신 수량을 표시하고 사라지면 초기 규칙으로 돌아간다", async () => {
    const { rerender } = renderModal();
    const leftPane = getLeftPane();
    expect(await within(getRightPane()).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
    fireEvent.click(within(leftPane).getByRole("button", { name: /DX3000 PF B.*3-PF-0002/ }));
    expect(await within(getRightPane()).findByText("pf-2 최하위 구성품")).toBeInTheDocument();

    const refreshedPfB = { ...pfB, ship_ready: 40, fast_production: 50, total_production: 60 };
    const refreshedData: ProductionCapacity = {
      ...capacityData,
      af: { ...capacityData.af!, pf_variants: [pfA, refreshedPfB, pfC] },
    };
    rerender(<CapacityDetailModal capacityData={refreshedData} onClose={vi.fn()} />);

    expect(within(getRightPane()).getByText("DX3000 PF B", { exact: true })).toBeInTheDocument();
    expectSummary("출하 대기", "40");
    expectSummary("빠른 생산", "50");
    expectSummary("총생산", "60");

    const removedData: ProductionCapacity = {
      ...capacityData,
      af: { ...capacityData.af!, pf_variants: [pfA, pfC] },
    };
    rerender(<CapacityDetailModal capacityData={removedData} onClose={vi.fn()} />);

    expect(within(getRightPane()).getByText("DX3000 PF A", { exact: true })).toBeInTheDocument();
    expectSummary("출하 대기", "10");
    expect(await within(getRightPane()).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
  });

  it("왼쪽 PF 목록과 오른쪽 BOM에 서로 독립적인 세로 스크롤 경계를 둔다", async () => {
    renderModal();
    const workspace = getWorkspace();
    const leftPane = getLeftPane();
    const rightPane = getRightPane();

    expect(workspace).toHaveClass("min-h-0", "overflow-hidden");
    expect(leftPane).toHaveClass("min-h-0", "overflow-y-auto");
    expect(await within(rightPane).findByTestId("bom-modal-tree-scroll")).toHaveClass("overflow-y-scroll");
  });

  it("sm 구간은 위아래 2행으로 BOM 폭을 확보하고 lg부터 좌우 2열로 전환한다", async () => {
    renderModal();
    const workspace = getWorkspace();
    const leftPane = getLeftPane();
    const rightPane = getRightPane();

    expect(workspace).toHaveClass(
      "grid-cols-[minmax(0,1fr)]",
      "grid-rows-[minmax(140px,0.36fr)_minmax(0,1fr)]",
      "lg:grid-cols-[minmax(260px,0.32fr)_minmax(0,1fr)]",
      "lg:grid-rows-[minmax(0,1fr)]",
    );
    expect(leftPane).toHaveClass("min-h-0", "min-w-0", "overflow-y-auto");
    expect(rightPane).toHaveClass("min-h-0", "min-w-0", "overflow-hidden");
    expect(await within(rightPane).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
  });

  it("현장 기준 설명, 공용 자재 안내와 빨간 원형 닫기 UI를 유지한다", async () => {
    const onClose = vi.fn();
    render(<CapacityDetailModal capacityData={capacityData} onClose={onClose} />);

    expect(screen.getByText(/박스 포장까지 완료되어 픽업을 기다리고 있는 재고입니다/)).toBeInTheDocument();
    expect(screen.getByText(/테스트가 완료된 완제품 재고와 포장 자재를 확인해 빠르게 박스 포장까지 할 수 있는 수량입니다/)).toBeInTheDocument();
    expect(screen.getByText(/튜브부터 박스까지 사내 재고를 사용해 이론적으로 생산할 수 있는 총합입니다/)).toBeInTheDocument();
    expect(screen.getByText("공용 자재가 겹치는 모델은 표시 수량을 모두 동시에 생산할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("한 모델에 자재를 사용하면 다른 모델의 생산 가능 수량은 줄어들 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/※\s*공용 자재/)).not.toBeInTheDocument();

    const closeButton = screen.getAllByRole("button", { name: "닫기" })
      .find((button) => button.classList.contains("ml-4"));
    expect(closeButton).toHaveClass("h-8", "w-8", "items-center", "justify-center", "rounded-full");
    expect(closeButton).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
      color: LEGACY_COLORS.red,
    });
    expect(closeButton?.querySelector("svg")).not.toBeNull();
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await within(getRightPane()).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
  });
});
