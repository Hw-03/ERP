import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductionCapacity } from "@/lib/api/types/production";
import { CapacityDetailModal } from "../CapacityDetailModal";

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
    auto_representatives: [
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
  it("자동 기준 출하 완제품을 모델 제목과 분리해 표시한다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);

    expect(mobile.getByText("자동 기준 출하 완제품")).toBeInTheDocument();
    expect(mobile.getByText("DX3000_65kV, 1.7mA_USA_Vector 긴 기준 출하 완제품명")).toBeInTheDocument();
    expect(mobile.queryByRole("button", { name: "기준 PF 해제" })).not.toBeInTheDocument();
  });

  it("출하 경로가 없는 모델에는 자동 기준 출하 완제품 없음과 빈 수량 구조를 유지한다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);

    expect(mobile.getByText("자동 기준 출하 완제품 없음")).toBeInTheDocument();
    expect(mobile.getAllByText("—")).toHaveLength(3);
  });

  it("펼친 PF 상세에서는 자동 기준 배지를 유지한다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);

    fireEvent.click(mobile.getByRole("button", { name: /DX3000.*1종/ }));
    fireEvent.click(mobile.getAllByRole("button", { name: /DX3000 조립 완제품/ })[1]);

    expect(mobile.getAllByText("자동 기준")).toHaveLength(2);
  });
});
