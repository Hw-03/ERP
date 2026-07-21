import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProductionCapacity } from "@/lib/api/types/production";
import { InventoryCapacityPanel } from "../InventoryCapacityPanel";

vi.mock("@/lib/queries/useProductionQuery", () => ({
  usePfPinsQuery: () => ({ data: { DX3000: "pf-dx3000" } }),
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
    ],
    pf_variants: [
      {
        pf_item_id: "pf-dx3000",
        pf_code: "3-PF-0002",
        pf_name: "DX3000_65kV, 1.7mA_USA_Vector",
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

describe("InventoryCapacityPanel 모바일 표", () => {
  it("첫 번째 열을 모델로 명시하고 세 수량 열을 유지한다", () => {
    const { container } = render(<InventoryCapacityPanel capacityData={capacityData} />);
    const mobileTable = container.querySelector(".sm\\:hidden table");
    if (!mobileTable) throw new Error("모바일 생산 가능 현황 표를 찾을 수 없습니다.");

    const headers = within(mobileTable).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "모델",
      "출하 대기",
      "빠른 생산",
      "총생산",
    ]);
    expect(within(mobileTable).getByText("DX3000 조립 완제품")).toBeInTheDocument();
  });
});
