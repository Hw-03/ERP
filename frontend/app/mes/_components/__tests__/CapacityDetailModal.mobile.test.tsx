import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
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
  const mobileList = result.container.querySelector("[data-testid='capacity-mobile-columns']")?.parentElement;
  if (!mobileList) throw new Error("모바일 생산 가능수량 목록을 찾을 수 없습니다.");
  return { ...result, mobileList };
}

describe("CapacityDetailModal 모바일 모델 요약", () => {
  it("성공한 AF 없음 결과를 갱신 실패에도 유지한다", () => {
    render(<CapacityDetailModal capacityData={{ ...capacityData, af: null }} loading={false} error="생산 가능 조회 실패" onClose={() => {}} />);
    expect(screen.getByText("AF 기준 데이터가 없습니다. 백엔드 갱신 후 다시 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByText(/기존 내용을 표시합니다/)).toBeInTheDocument();
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string): MediaQueryList => ({
        matches: window.innerWidth >= Number(query.match(/min-width:\s*(\d+)px/)?.[1]),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.spyOn(api, "getBOMTree").mockReturnValue(new Promise(() => {}));
  });

  it("최초 조회에도 제목과 수량 3열을 유지한다", () => {
    render(<CapacityDetailModal capacityData={null} loading onClose={() => {}} />);
    expect(screen.getByText("생산 가능수량")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "생산 가능수량 불러오는 중" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("capacity-mobile-columns")).toHaveClass("grid-cols-3");
  });

  it("최초 실패는 로딩을 종료하고 재시도할 수 있다", () => {
    const onRetry = vi.fn();
    render(<CapacityDetailModal capacityData={null} loading={false} error="생산 가능 조회 실패" onRetry={onRetry} onClose={() => {}} />);
    expect(screen.queryByText("데이터를 불러오는 중…")).not.toBeInTheDocument();
    expect(screen.getByText(/생산 가능 조회 실패/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("갱신 실패 후에도 기존 모델과 수량을 표시한다", () => {
    render(<CapacityDetailModal capacityData={capacityData} loading={false} error="최신 조회 실패" onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/최신 조회 실패/)).toBeInTheDocument();
    expect(screen.getByTestId("capacity-mobile-columns")).toBeInTheDocument();
    expect(screen.getAllByText("410").length).toBeGreaterThan(0);
  });

  it("375px 모바일에서는 데스크톱 BOM 작업공간과 BOM 요청을 만들지 않는다", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    renderModal();

    expect(screen.queryByRole("region", { name: "PF별 생산 가능수량 및 BOM" })).not.toBeInTheDocument();
    expect(api.getBOMTree).not.toHaveBeenCalled();
  });

  it("768px에서도 수량 설명 없이 모바일 목록을 유지한다", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    const { mobileList } = renderModal();
    expect(mobileList).toHaveClass("lg:hidden");
    expect(screen.queryByText(/공용 자재가 겹치는 모델은/)).not.toBeInTheDocument();
    expect(screen.queryByText(/박스 포장까지 완료되어/)).not.toBeInTheDocument();
    expect(api.getBOMTree).not.toHaveBeenCalled();
  });

  it("자동 기준 출하 완제품을 모델 제목과 분리해 표시한다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);

    expect(mobile.queryByText("자동 기준 출하 완제품")).not.toBeInTheDocument();
    expect(screen.queryByText(/모델마다 출하대기·빠른생산·총생산 수량의 합이 가장 큰/)).not.toBeInTheDocument();
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

    expect(mobile.getAllByText("자동 기준")).toHaveLength(1);
  });

  it("모바일 헤더에는 설명 없이 제목을 표시한다", () => {
    const onClose = vi.fn();
    render(<CapacityDetailModal capacityData={capacityData} onClose={onClose} />);

    expect(screen.getByText("생산 가능수량")).toBeInTheDocument();
    expect(screen.queryByText("수량 기준")).not.toBeInTheDocument();
    expect(screen.queryByText(/박스 포장까지 완료되어/)).not.toBeInTheDocument();
    expect(screen.queryByText(/공용 자재가 겹치는 모델은/)).not.toBeInTheDocument();
    expect(screen.queryByText(/각 수량은 해당 품목 기준이며/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("수량 열 제목은 한 번만 표시하고 대표·AF·PF에 같은 열 순서로 수량을 유지한다", () => {
    const { mobileList } = renderModal();
    const mobile = within(mobileList);
    const header = mobile.getByTestId("capacity-mobile-columns");
    expect(header).toHaveClass("sticky", "top-0");
    expect(within(header).queryByText("품목")).not.toBeInTheDocument();
    expect(header).toHaveClass("grid-cols-3");
    fireEvent.click(mobile.getByRole("button", { name: /DX3000.*1종/ }));
    fireEvent.click(mobile.getAllByRole("button", { name: /DX3000 조립 완제품/ })[1]);
    ["출하대기", "빠른생산", "총생산"].forEach((label) => expect(mobile.getAllByText(label)).toHaveLength(1));
    const rows = mobile.getAllByTestId("capacity-mobile-quantity-row");
    expect(rows).toHaveLength(4);
    const populatedRows = rows.filter((row) => within(row).queryByText("410"));
    expect(populatedRows).toHaveLength(3);
    populatedRows.forEach((row) => {
      expect(row.firstElementChild).toHaveClass("col-span-3");
      expect(row).toHaveClass("grid-cols-3");
      expect(within(row).getByText("410")).toBeInTheDocument();
      expect(within(row).getByText("86")).toBeInTheDocument();
      expect(within(row).getByText("598")).toBeInTheDocument();
    });
    expect(within(populatedRows[0]).getByText("3-PF-0002")).toBeInTheDocument();
  });

  it("선택한 PF의 기존 모바일 BOM 창을 열고 Escape는 BOM 창만 닫는다", async () => {
    const onClose = vi.fn();
    const { container } = render(<CapacityDetailModal capacityData={capacityData} onClose={onClose} />);
    const mobileList = container.querySelector("[data-testid='capacity-mobile-columns']")!.parentElement!;
    const mobile = within(mobileList);
    const modelButton = mobile.getByRole("button", { name: /DX3000.*1종/ });
    fireEvent.click(modelButton);
    const afButton = mobile.getAllByRole("button", { name: /DX3000 조립 완제품/ })[1];
    fireEvent.click(afButton);
    const scroller = mobileList.parentElement!;
    scroller.scrollTop = 120;

    const bomButton = mobile.getByRole("button", { name: /BOM 보기/ });
    bomButton.focus();
    fireEvent.click(bomButton);
    const dialog = screen.getByRole("dialog", { name: "BOM 구성 보기" });
    expect(within(dialog).getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "모두 펼치기" })).toHaveClass("h-11");
    await waitFor(() => expect(api.getBOMTree).toHaveBeenCalledWith("pf-dx3000", undefined));
    expect(afButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "BOM 구성 보기" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(modelButton).toHaveAttribute("aria-expanded", "true");
    expect(afButton).toHaveAttribute("aria-expanded", "true");
    expect(scroller.scrollTop).toBe(120);
    expect(bomButton).toHaveFocus();
    fireEvent.click(mobile.getByRole("button", { name: /BOM 보기/ }));
    fireEvent.click(screen.getByRole("dialog", { name: "BOM 구성 보기" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "BOM 구성 보기" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("BOM 조회 실패를 재시도하고 빈 구성을 표시한 뒤 닫아 목록을 유지한다", async () => {
    vi.mocked(api.getBOMTree)
      .mockRejectedValueOnce(new Error("조회 실패"))
      .mockResolvedValueOnce({ item_id: "pf-dx3000", item_name: "DX3000 출하품", mes_code: "3-PF-0002", process_type_code: null, unit: "EA", required_quantity: 1, current_stock: 0, children: [] });
    const { mobileList } = renderModal();
    const mobile = within(mobileList);
    fireEvent.click(mobile.getByRole("button", { name: /DX3000.*1종/ }));
    fireEvent.click(mobile.getAllByRole("button", { name: /DX3000 조립 완제품/ })[1]);
    fireEvent.click(mobile.getByRole("button", { name: /BOM 보기/ }));
    const dialog = screen.getByRole("dialog", { name: "BOM 구성 보기" });
    await within(dialog).findByText("하위 구성을 불러오지 못했습니다.");
    fireEvent.click(within(dialog).getByRole("button", { name: "다시 시도" }));
    await within(dialog).findByText("하위 품목이 없습니다.");
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(mobile.getByRole("button", { name: /BOM 보기/ })).toBeInTheDocument();
  });
});
