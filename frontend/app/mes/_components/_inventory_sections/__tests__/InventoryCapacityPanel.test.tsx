import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductionCapacity } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { capacityStatusBadge, InventoryCapacityPanel } from "../InventoryCapacityPanel";

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
    auto_representatives: [
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

const incompleteCapacityData = {
  ...capacityData,
  af: {
    ...capacityData.af,
    status: "incomplete",
    items: [
      ...capacityData.af.items,
      {
        af_item_id: "af-dx3000-ucla",
        af_code: "3-AF-0045",
        af_name: "DX3000 60KV 2mA / 10cm Black [UCLA / 기본]",
        model_symbol: "DX3000",
        ship_ready: 0,
        fast_production: 0,
        total_production: 0,
        bom_status: "incomplete",
        has_direct_children: false,
        has_pf_path: false,
        marked_complete: false,
      },
    ],
  },
} satisfies ProductionCapacity;

describe("InventoryCapacityPanel 모바일 표", () => {
  it("부분 BOM 미등록 상태도 메인에서는 생산 가능으로 요약한다", () => {
    const { container } = render(<InventoryCapacityPanel capacityData={incompleteCapacityData} />);

    expect(container).toHaveTextContent("생산 가능");
    expect(container).not.toHaveTextContent("일부 BOM 미완성");
  });

  it("부분 BOM 미등록 상태도 모바일 배지는 청록색 생산 가능으로 표시한다", () => {
    expect(capacityStatusBadge(incompleteCapacityData)).toEqual({
      label: "생산 가능",
      color: LEGACY_COLORS.cyan,
    });
  });

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

  it("출하 경로가 없는 모델은 요약에서 상태를 명시한다", () => {
    const noPfCapacity = {
      ...capacityData,
      af: {
        ...capacityData.af,
        auto_representatives: [],
      },
    } satisfies ProductionCapacity;

    const { container } = render(<InventoryCapacityPanel capacityData={noPfCapacity} />);

    expect(container).toHaveTextContent("출하 경로 없음");
  });

  it("renders AF and legacy model chips without leading dot separators", () => {
    const afWithTwoModels = {
      ...capacityData,
      af: {
        ...capacityData.af,
        items: [
          ...capacityData.af.items,
          {
            af_item_id: "af-dx2000",
            af_code: "3-AF-0003",
            af_name: "DX2000 assembly",
            model_symbol: "DX2000",
            ship_ready: 12,
            fast_production: 7,
            total_production: 20,
            bom_status: "complete" as const,
            has_direct_children: true,
            has_pf_path: true,
            marked_complete: true,
          },
        ],
      },
    } satisfies ProductionCapacity;
    const legacyCapacity = {
      immediate: 0,
      maximum: 0,
      limiting_item: null,
      status: "producible" as const,
      top_items: [],
      representative_items: [
        { item_id: "pf-1", item_name: "DX3000", mes_code: null, model_symbol: "DX3000", immediate: 10, maximum: 20 },
        { item_id: "pf-2", item_name: "DX2000", mes_code: null, model_symbol: "DX2000", immediate: 5, maximum: 15 },
      ],
    } satisfies ProductionCapacity;

    const { container, rerender } = render(<InventoryCapacityPanel capacityData={afWithTwoModels} />);
    expect(container.querySelector(".sm\\:flex")).toHaveTextContent("DX3000");
    expect(container.querySelector(".sm\\:flex")).toHaveTextContent("DX2000");
    expect(container.querySelector(".sm\\:flex")?.textContent).not.toContain("·");

    rerender(<InventoryCapacityPanel capacityData={legacyCapacity} />);
    expect(container.textContent).toContain("DX3000");
    expect(container.textContent).toContain("DX2000");
    expect(container.textContent).not.toContain("·");
  });
});
