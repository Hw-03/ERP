import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapacityDetailModal } from "../CapacityDetailModal";
import type { ProductionCapacity } from "@/lib/api/types/production";

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
        af_name: "DX3000 조립 완제품 A",
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
    const header = desktopTable?.firstElementChild;
    const groupRow = desktopTable?.children[1]?.firstElementChild;

    expect(desktopTable).not.toBeNull();
    expect(header).not.toBeNull();
    expect(groupRow).not.toBeNull();

    expect(screen.getByText("모델 수")).toBeInTheDocument();
    expect(screen.getByText("기준 모델")).toBeInTheDocument();
    expect(screen.getByText("2종")).toBeInTheDocument();
    expect(screen.getAllByText("DX3000 수출형")).toHaveLength(2);
    expect(within(header!).queryByText(/병목/)).not.toBeInTheDocument();
    expect(groupRow!.children).toHaveLength(7);
    expect(groupRow!.children[2]).toHaveTextContent("2종");
    expect(groupRow!.children[3]).toHaveTextContent("DX3000 수출형");
    expect(within(groupRow!.children[3]).getByRole("button", { name: "기준 PF 해제" })).toBeInTheDocument();
    expect(container.querySelector(".hidden.sm\\:block .grid")).toHaveClass(
      "grid-cols-[20px_minmax(0,1fr)_72px_minmax(0,1fr)_84px_84px_84px]",
    );
  });

  it("핀 없는 그룹의 미지정 표시는 기준 모델 열에만 둔다", () => {
    pfPins = {};
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = desktopTable?.children[1]?.firstElementChild;

    expect(groupRow).not.toBeNull();
    expect(groupRow!.children).toHaveLength(7);
    expect(groupRow!.children[3]).toHaveTextContent("출고처 미지정");
    expect(within(groupRow!).getAllByText("출고처 미지정")).toHaveLength(1);
    expect(within(groupRow!.children[3]).queryByRole("button", { name: "기준 PF 해제" })).not.toBeInTheDocument();
  });

  it("펼친 AF 행도 수량을 마지막 세 열에 정렬한다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupContainer = desktopTable?.children[1];
    const groupRow = groupContainer?.firstElementChild;

    expect(groupContainer).not.toBeNull();
    expect(groupRow).not.toBeNull();
    fireEvent.click(groupRow!);

    const afRow = groupContainer?.children[1]?.firstElementChild;
    expect(afRow).not.toBeNull();
    expect(afRow).toHaveProperty("tagName", "BUTTON");
    expect(afRow!.children).toHaveLength(7);
    expect(afRow!.children[2]).toBeEmptyDOMElement();
    expect(afRow!.children[3]).toBeEmptyDOMElement();
    expect(afRow!.children[4]).toHaveTextContent("10");
    expect(afRow!.children[5]).toHaveTextContent("20");
    expect(afRow!.children[6]).toHaveTextContent("30");
  });

  it("현장 기준 수량 설명과 두 줄 공용 자재 안내를 표시한다", () => {
    render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);

    expect(screen.getByText(/박스 포장까지 완료되어 픽업을 기다리고 있는 재고입니다/)).toBeInTheDocument();
    expect(screen.getByText(/테스트가 완료된 완제품 재고와 포장 자재를 확인해 빠르게 박스 포장까지 할 수 있는 수량입니다/)).toBeInTheDocument();
    expect(screen.getByText(/튜브부터 박스까지 사내 재고를 사용해 이론적으로 생산할 수 있는 총합입니다/)).toBeInTheDocument();
    expect(screen.getByText("※ 공용 자재가 겹치는 모델은 표시 수량을 모두 동시에 생산할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("한 모델에 자재를 사용하면 다른 모델의 생산 가능 수량은 줄어들 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("조립 완제품(AF) 기준")).not.toBeInTheDocument();
  });
});
