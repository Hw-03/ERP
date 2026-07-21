import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProductionCapacity } from "@/lib/api/types/production";
import { CapacityDetailModal } from "../CapacityDetailModal";

const mutations = vi.hoisted(() => ({
  clear: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/queries/useProductionQuery", () => ({
  usePfPinsQuery: () => ({ data: { DX3000: "pf-dx3000" } }),
  useSetPfPinMutation: () => ({ isPending: false, mutate: mutations.set }),
  useClearPfPinMutation: () => ({ isPending: false, mutate: mutations.clear }),
}));

const capacityData = {
  immediate: 0,
  maximum: 0,
  limiting_item: null,
  top_items: [],
  af: {
    basis: "AF",
    status: "producible",
    summary: { ship_ready: 410, fast_production: 86, total_production: 598 },
    items: [
      {
        af_item_id: "af-dx3000",
        af_code: "3-AF-0002",
        af_name: "DX3000 조립 완제품",
        model_symbol: "DX3000",
        ship_ready: 410,
        fast_production: 86,
        total_production: 598,
        bom_status: "complete",
        has_direct_children: true,
        has_pf_path: true,
        marked_complete: true,
      },
      {
        af_item_id: "af-adx4000w",
        af_code: "4-AF-0001",
        af_name: "ADX4000W 조립 완제품",
        model_symbol: "ADX4000W",
        ship_ready: 0,
        fast_production: 0,
        total_production: 0,
        bom_status: "complete",
        has_direct_children: true,
        has_pf_path: true,
        marked_complete: true,
      },
    ],
    pf_variants: [
      {
        pf_item_id: "pf-dx3000",
        pf_code: "3-PF-0002",
        pf_name: "DX3000_65kV, 1.7mA_USA_Vector 긴 기준 출하 완제품명",
        model_symbol: "DX3000",
        af_item_id: "af-dx3000",
        ship_ready: 410,
        fast_production: 86,
        total_production: 598,
        bom_status: "complete",
      },
    ],
  },
} satisfies ProductionCapacity;

function renderModal() {
  const result = render(<CapacityDetailModal capacityData={capacityData} onClose={() => {}} />);
  const mobileList = result.container.querySelector(".sm\\:hidden");
  if (!mobileList) throw new Error("모바일 생산 가능수량 목록을 찾을 수 없습니다.");
  return { ...result, mobileList };
}

describe("CapacityDetailModal 모바일 모델 요약", () => {
  it("기준 출하 완제품을 모델 제목과 분리해 표시하고 해제해도 그룹을 펼치지 않는다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);

    expect(mobile.getByText("기준 출하 완제품")).toBeInTheDocument();
    expect(mobile.getByText("DX3000_65kV, 1.7mA_USA_Vector 긴 기준 출하 완제품명")).toBeInTheDocument();

    const groupToggle = mobile.getByRole("button", { name: /DX3000 조립 완제품/ });
    fireEvent.click(mobile.getByRole("button", { name: "기준 PF 해제" }));

    expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("기준 PF 지정을 해제하시겠습니까?")).toBeInTheDocument();
  });

  it("기준 PF가 없는 모델에도 기준 출하 완제품 미지정과 빈 수량 구조를 유지한다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);

    expect(mobile.getByText("기준 출하 완제품 미지정")).toBeInTheDocument();
    expect(mobile.getAllByText("—")).toHaveLength(3);
  });
});
