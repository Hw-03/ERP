import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapacityDetailModal } from "../CapacityDetailModal";
import type { ProductionCapacity } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";

let pfPins: Record<string, string> = { DX3000: "pf-1" };

vi.mock("@/lib/queries/useProductionQuery", () => ({
  usePfPinsQuery: () => ({ data: pfPins }),
  useSetPfPinMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useClearPfPinMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

const capacityData: ProductionCapacity = {
  immediate: 0,
  maximum: 0,
  limiting_item: null,
  top_items: [],
  af: {
    basis: "AF",
    status: "producible",
    summary: { ship_ready: 0, fast_production: 0, total_production: 0 },
    items: [
      {
        af_item_id: "af-1",
        af_code: "3-AF-0001",
        af_name: "DX3000 60KV 2mA / 10cm White [기본]",
        model_symbol: "DX3000",
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
        model_symbol: "DX3000",
        ship_ready: 5,
        fast_production: 15,
        total_production: 25,
        bom_status: "complete",
        has_direct_children: true,
        has_pf_path: true,
        marked_complete: true,
      },
    ],
    pf_variants: [
      {
        pf_item_id: "pf-1",
        pf_code: "3-PF-0001",
        pf_name: "DX3000 수출형",
        model_symbol: "DX3000",
        af_item_id: "af-1",
        ship_ready: 10,
        fast_production: 20,
        total_production: 30,
        fast_production_limiting_item: "포장 자재",
        bom_status: "complete",
      },
    ],
  },
};

describe("CapacityDetailModal", () => {
  beforeEach(() => {
    pfPins = { DX3000: "pf-1" };
  });

  it("데스크톱 표에서 모델 수와 기준 모델을 별도 열로 표시한다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");

    expect(desktopTable).not.toBeNull();
    const header = within(desktopTable!).getByText("조립 완제품").parentElement;
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    expect(header).not.toBeNull();
    expect(groupRow).not.toBeNull();
    expect(header).toHaveClass("grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(header).toHaveTextContent(/조립 완제품\s*모델 수\s*기준 모델\s*출하 대기\s*빠른 생산\s*총생산/);
    expect(groupRow).toHaveClass("grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(groupRow).toHaveTextContent(/2종\s*DX3000 수출형\s*10\s*20\s*30/);
    const clearPinnedPfButton = within(groupRow!).getByRole("button", { name: "기준 PF 해제" });
    expect(clearPinnedPfButton).toHaveClass("h-5", "w-5", "items-center", "justify-center");
    expect(clearPinnedPfButton).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
      color: LEGACY_COLORS.red,
    });
  });

  it("모달 닫기 버튼은 우측 패널과 같은 빨간 원형 아이콘 형식이다", () => {
    render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);

    const closeButton = screen.getAllByRole("button", { name: "닫기" })
      .find((button) => button.classList.contains("ml-4"));

    expect(closeButton).toHaveClass("h-8", "w-8", "items-center", "justify-center", "rounded-full");
    expect(closeButton).toHaveStyle({
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
      color: LEGACY_COLORS.red,
    });
    expect(closeButton?.querySelector("svg")).not.toBeNull();
  });

  it("핀 없는 그룹의 미지정 표시는 기준 모델 열에만 둔다", () => {
    pfPins = {};
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    expect(groupRow).not.toBeNull();
    expect(within(groupRow!).getAllByText("출고처 미지정")).toHaveLength(1);
    expect(within(groupRow!).queryByRole("button", { name: "기준 PF 해제" })).not.toBeInTheDocument();
  });

  it("펼친 AF 행도 수량을 마지막 세 열에 정렬한다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    expect(groupRow).not.toBeNull();
    fireEvent.click(groupRow!);

    const afRow = within(desktopTable!).getByRole("button", { name: /DX3000 60KV 2mA \/ 10cm White \[기본\]/ });
    expect(afRow).not.toBeNull();
    expect(afRow).toHaveClass("grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(afRow).toHaveTextContent(/DX3000 60KV 2mA \/ 10cm White \[기본\]\s*3-AF-0001\s*10\s*20\s*30/);
    expect(within(afRow).getByText("DX3000 60KV 2mA / 10cm White [기본]")).not.toHaveClass("truncate");
    expect(within(afRow).getByText("DX3000 60KV 2mA / 10cm White [기본]").closest(".col-span-3")).not.toBeNull();
  });

  it("현장 기준 수량 설명과 공용 자재 안내를 표시하되 기호는 넣지 않는다", () => {
    render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);

    expect(screen.getByText(/박스 포장까지 완료되어 픽업을 기다리고 있는 재고입니다/)).toBeInTheDocument();
    expect(screen.getByText(/테스트가 완료된 완제품 재고와 포장 자재를 확인해 빠르게 박스 포장까지 할 수 있는 수량입니다/)).toBeInTheDocument();
    expect(screen.getByText(/튜브부터 박스까지 사내 재고를 사용해 이론적으로 생산할 수 있는 총합입니다/)).toBeInTheDocument();
    expect(screen.getByText("공용 자재가 겹치는 모델은 표시 수량을 모두 동시에 생산할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("한 모델에 자재를 사용하면 다른 모델의 생산 가능 수량은 줄어들 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/※\s*공용 자재/)).not.toBeInTheDocument();
    expect(screen.queryByText("조립 완제품(AF) 기준")).not.toBeInTheDocument();
  });

  it("PF 목록은 출고처별 출하 준비 가능 제목만 표시하고 중복 머리글은 표시하지 않는다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    fireEvent.click(groupRow!);
    const afRow = within(desktopTable!).getByRole("button", { name: /DX3000 60KV 2mA \/ 10cm White \[기본\]/ });
    fireEvent.click(afRow!);

    expect(within(desktopTable!).getByText("출고처별 출하 준비 가능")).toBeInTheDocument();
    expect(within(desktopTable!).queryByText("출하 완제품 · 병목")).not.toBeInTheDocument();
  });

  it("PF 행은 수량, 기준 고정 상태, 빠른 생산 병목 정보를 유지한다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    fireEvent.click(groupRow!);
    const afRow = within(desktopTable!).getByRole("button", { name: /DX3000 60KV 2mA \/ 10cm White \[기본\]/ });
    fireEvent.click(afRow!);

    const bottleneck = within(desktopTable!).getByText("빠른 생산 병목: 포장 자재");
    const pfRow = bottleneck.closest(".grid");

    expect(pfRow).not.toBeNull();
    expect(within(pfRow!).getByText("10")).toBeInTheDocument();
    expect(within(pfRow!).getByText("20")).toBeInTheDocument();
    expect(within(pfRow!).getByText("30")).toBeInTheDocument();
    expect(within(pfRow!).getByRole("button", { name: "기준" })).toBeInTheDocument();
    expect(pfRow).toHaveClass("sm:grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(pfRow).toHaveClass("sm:gap-0", "sm:px-0");
    expect(pfRow).toHaveClass("items-center");
    expect(pfRow).not.toHaveClass("sm:items-start");
    expect(pfRow?.firstElementChild).toHaveClass("sm:col-span-4");
    expect(pfRow?.firstElementChild?.firstElementChild).toHaveClass("items-center");
  });
});
