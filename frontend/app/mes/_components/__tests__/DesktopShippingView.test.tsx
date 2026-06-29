import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DesktopShippingView } from "../DesktopShippingView";
import type { Item, ShippingRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
    getBOM: vi.fn(),
    getShippingRequests: vi.fn(),
    getShippingHistory: vi.fn(),
    createShippingRequest: vi.fn(),
    updateShippingRequest: vi.fn(),
    sendShippingToPrep: vi.fn(),
    updateShippingChecklist: vi.fn(),
    clearShippingChecklist: vi.fn(),
    prepareShippingComplete: vi.fn(),
    cancelShippingPrepare: vi.fn(),
    completeShippingPickup: vi.fn(),
    matchShippingBom: vi.fn(),
  },
}));

import { api } from "@/lib/api";

function item(id: string, name: string, process: string, mes = id): Item {
  return {
    item_id: id,
    item_name: name,
    unit: "EA",
    quantity: 10,
    warehouse_qty: 10,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 10,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: mes,
    model_symbol: "S",
    model_slots: [],
    process_type_code: process,
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-06-26T00:00:00Z",
    updated_at: "2026-06-26T00:00:00Z",
    department: null,
  };
}

const items = [
  item("pf-1", "Standard PF", "PF", "PF-001"),
  item("pa-1", "Standard PA", "PA", "PA-001"),
  item("af-1", "AF Main", "AF", "AF-001"),
  item("acc-1", "Cable Set", "R", "R-001"),
  item("bracket-1", "Bracket Kit", "R", "R-BR"),
  item("carton-1", "Carton Box", "R", "R-BOX"),
];

function request(overrides: Partial<ShippingRequest> = {}): ShippingRequest {
  return {
    request_id: "req-1",
    status: "PREPARING",
    base_pf_item_id: "pf-1",
    base_pf_item_name: "Standard PF",
    base_pf_mes_code: "PF-001",
    final_pa_item_id: null,
    final_pa_item_name: null,
    final_pf_item_id: null,
    final_pf_item_name: null,
    requested_by_name: "shipping",
    custom_pa_name: null,
    custom_pf_name: null,
    notes: "urgent",
    prepared_at: null,
    picked_up_at: null,
    created_at: "2026-06-26T00:00:00Z",
    updated_at: "2026-06-26T00:00:00Z",
    bom_lines: [
      {
        line_id: "bom-1",
        parent_stage: "PF",
        child_item_id: "pa-1",
        item_name: "Standard PA",
        mes_code: "PA-001",
        process_type_code: "PA",
        quantity: 1,
        unit: "EA",
        included: true,
        origin: "DEFAULT",
      },
      {
        line_id: "bom-2",
        parent_stage: "PA",
        child_item_id: "af-1",
        item_name: "AF Main",
        mes_code: "AF-001",
        process_type_code: "AF",
        quantity: 1,
        unit: "EA",
        included: true,
        origin: "DEFAULT",
      },
      {
        line_id: "bom-3",
        parent_stage: "PA",
        child_item_id: "acc-1",
        item_name: "Cable Set",
        mes_code: "R-001",
        process_type_code: "R",
        quantity: 2,
        unit: "EA",
        included: true,
        origin: "DEFAULT",
      },
    ],
    companion_lines: [],
    checklist_lines: [
      {
        line_id: "check-1",
        item_id: "pa-1",
        item_name: "Standard PA",
        mes_code: "PA-001",
        process_type_code: "PA",
        quantity: 1,
        checked: false,
      },
      {
        line_id: "check-2",
        item_id: "acc-1",
        item_name: "Cable Set",
        mes_code: "R-001",
        process_type_code: "R",
        quantity: 2,
        checked: false,
      },
    ],
    events: [],
    transactions: [],
    transaction_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getItems).mockResolvedValue(items);
  vi.mocked(api.getShippingRequests).mockResolvedValue([
    request({ request_id: "requested-1", status: "REQUESTED" }),
    request(),
    request({ request_id: "prepared-1", status: "PREPARED", prepared_at: "2026-06-26T01:00:00Z" }),
  ]);
  vi.mocked(api.getShippingHistory).mockResolvedValue([
    request({
      request_id: "hist-1",
      status: "PICKED_UP",
      final_pa_item_id: "pa-1",
      final_pa_item_name: "Standard PA",
      final_pf_item_id: "pf-1",
      final_pf_item_name: "Standard PF",
      picked_up_at: "2026-06-26T01:00:00Z",
      transactions: [
        {
          log_id: "tx-1",
          item_id: "pf-1",
          item_name: "Standard PF",
          mes_code: "PF-001",
          item_process_type_code: "PF",
          transaction_type: "SHIP",
          quantity_change: -1,
          quantity_before: 1,
          quantity_after: 0,
          warehouse_qty_before: 1,
          warehouse_qty_after: 0,
          reference_no: "SHIP-req",
          produced_by: "shipping",
          notes: "final PF shipped",
          shipping_phase: "PICKUP",
          created_at: "2026-06-26T01:00:00Z",
          cancelled: false,
          cancel_reason: null,
          cancelled_at: null,
          inventory_effect: [{ scope: "warehouse", delta: -1 }],
        },
      ],
      transaction_count: 1,
    }),
  ]);
  vi.mocked(api.getBOM).mockImplementation(async (parentId: string) => {
    if (parentId === "pf-1") {
      return [{ bom_id: "b1", parent_item_id: "pf-1", child_item_id: "pa-1", quantity: 1, unit: "EA", notes: null }];
    }
    return [
      { bom_id: "b2", parent_item_id: "pa-1", child_item_id: "af-1", quantity: 1, unit: "EA", notes: null },
      { bom_id: "b3", parent_item_id: "pa-1", child_item_id: "acc-1", quantity: 2, unit: "EA", notes: null },
    ];
  });
  vi.mocked(api.matchShippingBom).mockResolvedValue({
    matched_pa_item_id: "pa-1",
    matched_pf_item_id: null,
    matched_pa_item_name: "Standard PA",
    matched_pf_item_name: null,
    requires_pa_name: false,
    requires_pf_name: true,
  });
  vi.mocked(api.updateShippingChecklist).mockResolvedValue(request({
    checklist_lines: request().checklist_lines.map((line) => line.item_id === "acc-1" ? { ...line, checked: true } : line),
  }));
  vi.mocked(api.clearShippingChecklist).mockResolvedValue(request());
  vi.mocked(api.createShippingRequest).mockResolvedValue(request({ request_id: "new-1", status: "REQUESTED" }));
  vi.mocked(api.updateShippingRequest).mockResolvedValue(request({ request_id: "requested-1", status: "REQUESTED" }));
  vi.mocked(api.sendShippingToPrep).mockResolvedValue(request({ status: "PREPARING" }));
  vi.mocked(api.prepareShippingComplete).mockResolvedValue(request({ status: "PREPARED" }));
  vi.mocked(api.cancelShippingPrepare).mockResolvedValue(request({ status: "PREPARING" }));
  vi.mocked(api.completeShippingPickup).mockResolvedValue(request({ request_id: "req-1", status: "PICKED_UP" }));
});

describe("DesktopShippingView", () => {
  it("출하 첫 화면은 큰 카드 3개로 진입하고 기존 설명 문구를 숨긴다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByRole("button", { name: /출하 요청/ })).toHaveAttribute("data-shipping-hub-card", "request");
    expect(screen.getByRole("button", { name: /출하 준비 중/ })).toHaveAttribute("data-shipping-hub-card", "prep");
    expect(screen.getByRole("button", { name: /출하 이력/ })).toHaveAttribute("data-shipping-hub-card", "history");
    expect(screen.queryByText(/요청 생성부터 준비 체크/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로고침" })).not.toBeInTheDocument();
  });

  it("요청 목록은 새 요청을 주 액션으로 노출하고 작성 화면은 목록 패널 없이 전폭으로 열린다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 요청/ }));
    const newRequestButton = await screen.findByRole("button", { name: "새 요청 만들기" });
    expect(newRequestButton).toHaveAttribute("data-primary-action", "new-shipping-request");

    fireEvent.click(newRequestButton);

    expect(await screen.findByText("출하 요청 작성")).toBeInTheDocument();
    expect(screen.getByText("1. 기준 PF 선택")).toBeInTheDocument();
    expect(screen.getByText("2. 요청 정보")).toBeInTheDocument();
    expect(screen.getByText("3. BOM 구성 조정")).toBeInTheDocument();
    expect(screen.getByText("4. 저장 및 전환")).toBeInTheDocument();
    expect(screen.queryByText("준비로 넘어간 요청도 여기서 상태를 확인합니다.")).not.toBeInTheDocument();
    expect(screen.getByText("기준 PF를 먼저 선택하세요")).toBeInTheDocument();
  });

  it("출하 요청은 목록에서 상세로 들어가고 수정 버튼 후 편집 화면으로 들어간다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 요청/ }));
    expect(await screen.findByText("요청 목록")).toBeInTheDocument();
    expect(screen.getByText("요청됨")).toBeInTheDocument();
    expect(screen.getAllByText("준비 중").length).toBeGreaterThan(0);
    expect(screen.getAllByText("준비 완료").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Standard PF/ })[0]);
    expect(await screen.findByText("요청 상세")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() => expect(screen.getAllByText("출하 요청 수정").length).toBeGreaterThan(0));
  });

  it("PF 선택 후 PF/PA 전체 구성을 보여주고 제외/추가와 자동 매칭을 처리한다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 요청/ }));
    fireEvent.click(await screen.findByRole("button", { name: "새 요청 만들기" }));
    fireEvent.change(await screen.findByLabelText("기준 PF"), { target: { value: "pf-1" } });

    await waitFor(() => {
      expect(api.getBOM).toHaveBeenCalledWith("pf-1");
      expect(api.getBOM).toHaveBeenCalledWith("pa-1");
    });
    expect(await screen.findByText("PF 구성품")).toBeInTheDocument();
    expect(screen.getAllByText("PA 구성품").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cable Set/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Cable Set 제외/ }));
    expect(await screen.findByText("제외됨")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /PA 구성품 추가/ }));
    expect(await screen.findByText("추가됨")).toBeInTheDocument();

    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalled());
    expect(await screen.findByText(/기존 PA 재사용/)).toBeInTheDocument();
    expect(screen.queryByLabelText("새 PA 이름")).not.toBeInTheDocument();
    expect(screen.getByLabelText("새 PF 이름")).toBeInTheDocument();
  });


  it("기존 요청 수정 후 준비 중 전환은 현재 draft를 먼저 저장한다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 요청/ }));
    fireEvent.click(await screen.findByRole("button", { name: /requested-1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "수정" }));

    fireEvent.click(await screen.findByRole("button", { name: /Cable Set 제외/ }));
    fireEvent.change(await screen.findByLabelText("새 PF 이름"), { target: { value: "Custom PF" } });
    fireEvent.click(screen.getByRole("button", { name: "준비 중으로 보내기" }));

    await waitFor(() => {
      expect(api.updateShippingRequest).toHaveBeenCalledWith(
        "requested-1",
        expect.objectContaining({
          custom_pf_name: "Custom PF",
          bom_lines: expect.arrayContaining([
            expect.objectContaining({ child_item_id: "acc-1", included: false, origin: "DEFAULT" }),
          ]),
        }),
      );
      expect(api.sendShippingToPrep).toHaveBeenCalledWith("requested-1");
    });
  });  it("출하 준비 중은 목록에서 체크 상세로 들어가고 PF/PA 묶음과 전체 해제가 동작한다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 준비 중/ }));
    expect(await screen.findByText("준비 중 목록")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Standard PF/ })[0]);

    expect(await screen.findByText("준비 체크")).toBeInTheDocument();
    expect(screen.getAllByText("PF 구성품").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PA 구성품").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Cable Set 체크"));

    await waitFor(() => {
      expect(api.updateShippingChecklist).toHaveBeenCalledWith("req-1", {
        checks: [{ item_id: "acc-1", checked: true }],
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /전체 해제/ }));
    await waitFor(() => {
      expect(api.clearShippingChecklist).toHaveBeenCalledWith("req-1");
    });
  });

  it("출하 이력은 완료 목록에서 상세 이력과 연결 입출고 로그로 들어간다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 이력/ }));
    expect(await screen.findByText("출하 완료 목록")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Standard PF/ }));

    expect(await screen.findByText("출하 상세 이력")).toBeInTheDocument();
    expect(screen.getByText("연결 입출고 로그")).toBeInTheDocument();
    expect(screen.getAllByText("SHIP-req").length).toBeGreaterThan(0);
  });

  it("준비 완료 요청은 상세에서 수정이 잠기고 취소 안내를 보여준다", async () => {
    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /출하 요청/ }));
    fireEvent.click(await screen.findByRole("button", { name: /prepared-1/ }));

    expect(await screen.findByText("요청 상세")).toBeInTheDocument();
    expect(screen.getByText(/준비 완료 취소 후 수정 가능/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
  });
});






