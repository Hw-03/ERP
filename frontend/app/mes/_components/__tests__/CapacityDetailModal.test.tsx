import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function renderModal(data: ProductionCapacity = capacityData, onClose = vi.fn()) {
  return { onClose, ...render(<CapacityDetailModal capacityData={data} onClose={onClose} />) };
}

function getSummary() {
  return screen.getByRole("region", { name: "모델별 생산 가능수량" });
}

function openPfDetail(name: string) {
  const summary = getSummary();
  fireEvent.click(within(summary).getByRole("button", { name: /DX3000.*2종/ }));
  fireEvent.click(within(summary).getByRole("button", { name: /DX3000 조립 완제품 A/ }));
  const bomButton = within(summary)
    .getAllByRole("button", { name: `${name} BOM 확인` })
    .find((button) => !button.classList.contains("hidden"));
  fireEvent.click(bomButton!);
}

function returnToSummary() {
  fireEvent.click(screen.getByRole("button", { name: "생산 가능수량으로 돌아가기" }));
  fireEvent.popState(window, { state: null });
}

describe("CapacityDetailModal 데스크톱 요약과 PF BOM 상세", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    realtimeState.revision = 1;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((): MediaQueryList => ({
        matches: true,
        media: "(min-width: 640px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.spyOn(api, "getBOMTree").mockImplementation(async (itemId) => makeBomTree(itemId));
  });

  it("처음에는 모델별 비교 정보를 보여 주고 BOM을 요청하지 않는다", () => {
    renderModal();

    const summary = getSummary();
    expect(within(summary).getByText("조립 완제품")).toBeInTheDocument();
    expect(within(summary).getByText("모델 수")).toBeInTheDocument();
    expect(within(summary).getByText("자동 기준 출하품")).toBeInTheDocument();
    expect(within(summary).getByText("출하 대기")).toBeInTheDocument();
    expect(within(summary).getByText("빠른 생산")).toBeInTheDocument();
    expect(within(summary).getByText("총생산")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: /DX3000.*2종/ })).toBeInTheDocument();
    expect(within(summary).getByText("DX3000 PF A", { exact: true })).toBeInTheDocument();
    expect(api.getBOMTree).not.toHaveBeenCalled();
  });

  it("PF의 BOM 확인에서 해당 PF만 조회하고 뒤로가기로 요약표에 돌아온다", async () => {
    renderModal();

    openPfDetail("DX3000 PF A");

    const detail = screen.getByRole("region", { name: "선택한 출하 완제품 BOM" });
    expect(within(detail).getByText("DX3000 PF A", { exact: true })).toBeInTheDocument();
    expect(within(detail).getByText("3-PF-0001", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledWith("pf-1", { departmentOrder: "desc" }));
    expect(await within(detail).findByText("pf-1 최하위 구성품")).toBeInTheDocument();

    returnToSummary();
    expect(getSummary()).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "선택한 출하 완제품 BOM" })).not.toBeInTheDocument();
  });

  it("상세 BOM의 모든 가지를 기본으로 펼치고 다시 접고 펼칠 수 있다", async () => {
    renderModal();
    openPfDetail("DX3000 PF A");

    const detail = screen.getByRole("region", { name: "선택한 출하 완제품 BOM" });
    expect(await within(detail).findByText("pf-1 최하위 구성품")).toBeInTheDocument();
    const firstBranchRow = within(detail).getByText("pf-1 1단계 구성품").closest("li")!;
    const firstBranchButton = within(firstBranchRow).getByRole("button");
    expect(firstBranchButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(firstBranchButton);
    expect(within(detail).queryByText("pf-1 최하위 구성품")).not.toBeInTheDocument();
    expect(firstBranchButton).toHaveAttribute("aria-expanded", "false");
  });

  it("BOM 로딩 실패 뒤 재시도와 하위 품목 없음 상태를 표시한다", async () => {
    vi.mocked(api.getBOMTree)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeBomTree("pf-1"));
    renderModal();
    openPfDetail("DX3000 PF A");

    const detail = screen.getByRole("region", { name: "선택한 출하 완제품 BOM" });
    expect(await within(detail).findByText("하위 구성을 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "다시 시도" }));
    expect(await within(detail).findByText("pf-1 최하위 구성품")).toBeInTheDocument();

    vi.mocked(api.getBOMTree).mockResolvedValue(makeBomTree("pf-1", false));
    returnToSummary();
    openPfDetail("DX3000 PF A");
    expect(await within(screen.getByRole("region", { name: "선택한 출하 완제품 BOM" })).findByText("하위 품목이 없습니다.")).toBeInTheDocument();
  });

  it("현장 기준 설명과 닫기 동작을 유지한다", () => {
    const onClose = vi.fn();
    renderModal(capacityData, onClose);

    expect(screen.getByText(/박스 포장까지 완료되어 픽업을 기다리는 재고/)).toBeInTheDocument();
    expect(screen.getByText(/테스트 완료 완제품과 포장 자재로 빠르게 포장 가능한 수량/)).toBeInTheDocument();
    const closeButton = screen.getAllByRole("button", { name: "닫기" })
      .find((button) => button.classList.contains("ml-auto"));
    expect(closeButton).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
      color: LEGACY_COLORS.red,
    });
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
