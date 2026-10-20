import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import type { InventoryWorkStatus } from "@/lib/api/types/work-reservations";
import { InventoryWorkStatusPanel } from "../InventoryWorkStatusPanel";

const state = vi.hoisted(() => ({ data: undefined as InventoryWorkStatus | undefined, isPending: false, isError: false, refetch: vi.fn() }));
vi.mock("@/lib/queries/useInventoryWorkStatus", () => ({ useInventoryWorkStatus: () => state }));

const item = { item_id: "material", item_name: "입력 자재", available_quantity: 3 } as Item;
const status: InventoryWorkStatus = {
  item_id: "material",
  summary: { work_reserved_quantity: 4, approval_reserved_quantity: 2, shipping_reserved_quantity: 1,
    expected_in_quantity: 8, expected_out_quantity: 4, transfer_in_quantity: 5, transfer_out_quantity: 5,
    forecast_complete: true, reservation_by_location: [], forecast_by_location: [
      { location: { bucket: "production", department: "튜닝" }, expected_in_quantity: 8, expected_out_quantity: 0, transfer_in_quantity: 5, transfer_out_quantity: 0 },
    ] },
  works: [{ batch_id: "batch-1", revision: 3, status: "partially_completed", reservation_status: "inactive", reservation_issue: null,
    work_type: "process", sub_type: "produce", reference_no: "작업-1", requester_employee_id: "employee-1", requester_name: "김담당",
    requester_department: "조립", requester_active: true, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z",
    targets: [{ item_id: "output", item_name: "완제품 긴 이름", mes_code: "O-1", unit: "EA", quantity: 2 }],
    reserved_inputs: [{ item_id: "material", item_name: "입력 자재", mes_code: "M-1", unit: "EA", quantity: 4,
      location: { bucket: "warehouse", department: null }, source: "approval", stock_request_id: "request", operation_line_ids: ["line"] }],
    expected_effects: [{ kind: "in", from: null, to: { bucket: "production", department: "튜닝" },
      item_id: "output", item_name: "완제품 긴 이름", mes_code: "O-1", unit: "EA", quantity: 2, effect_id: "effect", operation_line_id: "line", bundle_id: "bundle" }], forecast_issue: null,
  }],
};

beforeEach(() => { state.data = structuredClone(status); state.isPending = false; state.isError = false; state.refetch.mockReset(); });

describe("대시보드 선택 품목 작업 현황", () => {
  it("소비만 있는 위치 예정은 큰 섹션을 반복하지 않고 작업 효과 상세에 보존한다", () => {
    state.data!.summary.forecast_by_location = [{ location: { bucket: "production", department: "튜브" }, expected_in_quantity: 0, expected_out_quantity: 4, transfer_in_quantity: 0, transfer_out_quantity: 0 }];
    state.data!.works[0].expected_effects = [{ ...state.data!.works[0].expected_effects[0], kind: "out", from: { bucket: "production", department: "튜브" }, to: null, quantity: 4 }];
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.queryByRole("group", { name: "위치별 예정" })).toBeNull();
    expect(screen.getByText("소비·출고 예정").parentElement).toHaveTextContent("−4");
    fireEvent.click(screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ }));
    expect(screen.getByRole("region", { name: "김담당 작업 상세" })).toHaveTextContent("튜브 · −4 EA");
  });

  it("가용·작업·승인·입고 예정을 네 칸에 모으고 위치 재고 다음에 관련 작업을 배치한다", () => {
    render(<InventoryWorkStatusPanel item={item}><section aria-label="실제 위치 재고">창고 실재고</section></InventoryWorkStatusPanel>);
    const quantities = screen.getByRole("group", { name: "수량 현황" });
    expect(quantities).toHaveClass("grid-cols-2");
    expect(quantities.children).toHaveLength(4);
    expect(within(quantities).getByText("사용 가능 재고").parentElement).toHaveTextContent("3");
    expect(within(quantities).getByText("작업 예약")).toBeInTheDocument();
    expect(within(quantities).getByText("승인 예약")).toBeInTheDocument();
    expect(within(quantities).getByText("입고·생산 예정")).toBeInTheDocument();
    const locations = screen.getByRole("region", { name: "실제 위치 재고" });
    const works = screen.getByRole("region", { name: "관련 작업" });
    expect(locations.compareDocumentPosition(works) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(["2026-10-20T00:00:00", "2026-10-20T00:00:00Z", "2026-10-20T09:00:00+09:00"])("서버 UTC 시각 %s를 KST로 표시한다", (timestamp) => {
    state.data!.works[0].updated_at = timestamp;
    render(<InventoryWorkStatusPanel item={item} />);
    fireEvent.click(screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ }));
    expect(screen.getByText("마지막 저장 2026년 10월 20일 09시 00분")).toBeInTheDocument();
  });

  it("작업·승인·출하 예약과 증가 예정·위치 이동을 분리한다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    for (const [label, value] of [["작업 예약", "4"], ["승인 예약", "2"], ["출하 예약", "1"], ["입고·생산 예정", "+8"], ["소비·출고 예정", "−4"]]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent(value);
    }
    expect(screen.getByText("이동 도착 5 · 출발 5")).toBeInTheDocument();
    expect(screen.getByText(/전체 재고 증가 없음/)).toBeInTheDocument();
    const destination = screen.getByRole("group", { name: "위치별 예정" });
    expect(destination).toHaveTextContent("튜닝");
    expect(destination).toHaveTextContent("입고·생산 +8");
  });

  it("다른 직원의 작업을 읽기 전용으로 열어 목적·예약 자재·열린 결과를 확인한다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    fireEvent.click(screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ }));
    expect(screen.getByText("일부 완료")).toBeInTheDocument();
    const detail = screen.getByRole("region", { name: "김담당 작업 상세" });
    expect(detail).toHaveTextContent("예약 자재");
    expect(detail).toHaveTextContent("입력 자재");
    expect(detail).toHaveTextContent("창고");
    expect(detail).toHaveTextContent("완료 시 증감");
    expect(detail).toHaveTextContent("튜닝");
    expect(within(detail).getByText(/\+2 EA/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /취소|저장|재개/ })).toBeNull();
  });

  it("예약 필요와 예정 불완전을 직원 안내로 보여 주고 내부 사유는 숨긴다", () => {
    state.data!.summary.forecast_complete = false;
    state.data!.works[0].reservation_status = "needs_reservation";
    state.data!.works[0].reservation_issue = { code: "returned_after_rejection", message: "반려 후 다시 저장하여 예약해야 합니다.", shortages: [] };
    state.data!.works[0].forecast_issue = { code: "missing_effect_mapping", message: "열린 승인 행 연결을 확인할 수 없습니다." };
    state.data!.works[0].reserved_inputs = [];
    state.data!.works[0].expected_effects = [];
    render(<InventoryWorkStatusPanel item={item} mobile />);
    expect(screen.getByText("예약 필요")).toBeInTheDocument();
    expect(screen.getByText("반려 후 다시 저장하여 예약해야 합니다.")).toBeInTheDocument();
    expect(screen.queryByText("열린 승인 행 연결을 확인할 수 없습니다.")).toBeNull();
    expect(screen.getByText("이 작업의 입고·출고 예정을 모두 확인할 수 없습니다. 담당자에게 작업 내용을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByText(/확인 가능한 예정량만/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ }));
    expect(screen.getByText("예정 수량을 확인할 수 없습니다. 수량이 없는 것은 아닙니다.")).toBeInTheDocument();
    expect(screen.queryByText("확정된 예정이 없습니다.")).toBeNull();
  });

  it("기존 미전환 작업의 사유는 직원용 한국어로 안내한다", () => {
    state.data!.works[0].reservation_status = "needs_reservation";
    state.data!.works[0].reservation_issue = { code: "legacy_unprocessed", message: "Explicit reservation conversion required", shortages: [] };
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.queryByText("Explicit reservation conversion required")).toBeNull();
    expect(screen.getByText("아직 재고를 예약하지 않은 작업입니다. 다시 저장하면 자재를 확보합니다.")).toBeInTheDocument();
  });

  it("미제공·실패를 0으로 단정하지 않고 재시도한다", () => {
    state.data = undefined; state.isError = true;
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByText(/예약·예정 정보를 확인할 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /다시/ }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("조회 중과 성공한 빈 작업을 구분한다", () => {
    state.data = undefined; state.isPending = true;
    const { rerender } = render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByRole("status")).toHaveTextContent("작업 예약 현황을 불러오는 중");
    state.isPending = false; state.data = { ...status, works: [] };
    rerender(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByText("관련 작업이 없습니다.")).toBeInTheDocument();
  });
});
