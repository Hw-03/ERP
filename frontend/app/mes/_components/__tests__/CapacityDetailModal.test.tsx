import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CapacityDetailModal } from "../CapacityDetailModal";
import type { ProductionCapacity } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";

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
    auto_representatives: [
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

const incompleteCapacityData: ProductionCapacity = {
  ...capacityData,
  af: {
    ...capacityData.af!,
    status: "incomplete",
    items: [
      ...capacityData.af!.items,
      {
        af_item_id: "af-ucla",
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
      {
        af_item_id: "af-no-pf",
        af_code: "3-AF-0046",
        af_name: "DX3000 출하경로 미연결 완제품",
        model_symbol: "DX3000",
        ship_ready: 0,
        fast_production: 0,
        total_production: 0,
        bom_status: "complete",
        has_direct_children: true,
        has_pf_path: false,
        marked_complete: true,
      },
    ],
  },
};

describe("CapacityDetailModal", () => {

  it("BOM 미등록 건수를 모달 본문 상단에 즉시 표시한다", () => {
    render(<CapacityDetailModal capacityData={incompleteCapacityData} onClose={vi.fn()} />);

    expect(
      screen.getByText("BOM 미등록 1건 · 모델 그룹을 펼쳐 해당 품목을 확인하세요."),
    ).toBeInTheDocument();
  });

  it("BOM이 모두 등록된 데이터에는 미등록 안내를 표시하지 않는다", () => {
    render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);

    expect(screen.queryByText(/BOM 미등록 \d+건/)).not.toBeInTheDocument();
  });

  it("품목 행은 BOM 미등록과 출하경로 없음을 별도로 표시한다", () => {
    const { container } = render(
      <CapacityDetailModal capacityData={incompleteCapacityData} onClose={vi.fn()} />,
    );
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = within(desktopTable!).getByText("4종").closest(".grid");

    fireEvent.click(groupRow!);

    const incompleteRow = within(desktopTable!).getByRole("button", { name: /UCLA/ });
    const noPfPathRow = within(desktopTable!).getByRole("button", { name: /출하경로 미연결 완제품/ });

    expect(within(incompleteRow).getByText("BOM 미등록")).toBeInTheDocument();
    expect(within(incompleteRow).queryByText("BOM 미완성")).not.toBeInTheDocument();
    expect(within(noPfPathRow).getByText("출하경로 없음")).toBeInTheDocument();
    expect(within(noPfPathRow).queryByText("BOM 미등록")).not.toBeInTheDocument();
  });

  it("데스크톱 표에서 모델 수와 자동 기준 출하품을 별도 열로 표시한다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");

    expect(desktopTable).not.toBeNull();
    const header = within(desktopTable!).getByText("조립 완제품").parentElement;
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    expect(header).not.toBeNull();
    expect(groupRow).not.toBeNull();
    expect(header).toHaveClass("grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(header).toHaveTextContent(/조립 완제품\s*모델 수\s*자동 기준 출하품\s*출하 대기\s*빠른 생산\s*총생산/);
    expect(groupRow).toHaveClass("grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(groupRow).toHaveTextContent(/2종\s*DX3000 수출형\s*자동 기준\s*10\s*20\s*30/);
    expect(within(groupRow!).getByText("자동 기준")).toBeInTheDocument();
    expect(within(groupRow!).queryByRole("button", { name: "기준 PF 해제" })).not.toBeInTheDocument();
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

  it("수동 지정·해제 UI와 확인 창을 표시하지 않는다", () => {
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={vi.fn()} />);
    const desktopTable = container.querySelector(".hidden.sm\\:block");
    const groupRow = within(desktopTable!).getByText("2종").closest(".grid");

    expect(groupRow).not.toBeNull();
    expect(within(groupRow!).queryByRole("button", { name: "기준 PF 해제" })).not.toBeInTheDocument();
    expect(screen.queryByText("기준 PF 지정을 해제하시겠습니까?")).not.toBeInTheDocument();
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

  it("PF 행은 수량, 자동 기준 상태, 빠른 생산 병목 정보를 유지한다", () => {
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
    expect(within(pfRow!).getByText("자동 기준")).toBeInTheDocument();
    expect(within(pfRow!).queryByRole("button", { name: "지정" })).not.toBeInTheDocument();
    expect(pfRow).toHaveClass("sm:grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]");
    expect(pfRow).toHaveClass("sm:gap-0", "sm:px-0");
    expect(pfRow).toHaveClass("items-center");
    expect(pfRow).not.toHaveClass("sm:items-start");
    expect(pfRow?.firstElementChild).toHaveClass("sm:col-span-4");
    expect(pfRow?.firstElementChild?.firstElementChild).toHaveClass("items-center");
  });
});
