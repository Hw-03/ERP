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

beforeEach(() => { state.data = structuredClone(status); item.work_reservations = state.data.summary; state.isPending = false; state.isError = false; state.refetch.mockReset(); });

describe("대시보드 선택 품목 작업 현황", () => {
  it("재고 갱신 중에도 이전 수량을 유지하며 진행 상태를 알린다", () => {
    const { rerender } = render(<InventoryWorkStatusPanel item={item} refreshing />);
    expect(screen.getByRole("group", { name: "수량 현황" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("재고 수량을 갱신하는 중");
    expect(screen.getByText("예약 재고").parentElement).toHaveTextContent("7");
    rerender(<InventoryWorkStatusPanel item={item} />);
    expect(screen.queryByText("재고 수량을 갱신하는 중")).toBeNull();
  });
  it("작업 현황 응답이 먼저 갱신돼도 수량은 전달된 품목과 함께 바뀐다", () => {
    const previous = { ...item, work_reservations: { ...status.summary, work_reserved_quantity: 1, approval_reserved_quantity: 0, shipping_reserved_quantity: 0, expected_in_quantity: 2 } };
    const current = { ...item, available_quantity: 1, work_reservations: { ...status.summary, work_reserved_quantity: 3, approval_reserved_quantity: 0, shipping_reserved_quantity: 0, expected_in_quantity: 4 } };
    const { rerender } = render(<InventoryWorkStatusPanel item={previous} />);
    expect(screen.getByText("예약 재고").parentElement).toHaveTextContent("1");
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("2");
    rerender(<InventoryWorkStatusPanel item={current} />);
    expect(screen.getByText("사용 가능 재고").parentElement).toHaveTextContent("1");
    expect(screen.getByText("예약 재고").parentElement).toHaveTextContent("3");
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("4");
  });
  it.each([false, true])("선택 품목의 입출고·이동은 요약에만 표시하고 추가 품목은 상세에 둔다 (mobile=%s)", (mobile) => {
    const work = state.data!.works[0];
    work.reserved_inputs.push({ ...work.reserved_inputs[0], quantity: 2, source: "draft", location: { bucket: "production", department: "튜닝" } });
    const effect = work.expected_effects[0];
    work.expected_effects.push(
      { ...effect, effect_id: "consume", item_id: "material", item_name: "입력 자재", mes_code: "M-1", quantity: 4, kind: "out", from: { bucket: "warehouse", department: null }, to: null },
      { ...effect, effect_id: "receive", item_id: "material", item_name: "입력 자재", mes_code: "M-1", quantity: 1, kind: "in", from: null, to: { bucket: "production", department: "조립" } },
      { ...effect, effect_id: "transfer", item_id: "material", item_name: "입력 자재", mes_code: "M-1", quantity: 2, kind: "move", from: { bucket: "warehouse", department: null }, to: { bucket: "production", department: "튜닝" } },
    );
    render(<InventoryWorkStatusPanel item={item} mobile={mobile} />);
    const detail = screen.getByRole("region", { name: "김담당 작업 상세" });
    expect(within(detail).queryByText("입력 자재", { exact: true })).not.toBeInTheDocument();
    const material = screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ });
    for (const [label, quantity] of [["출고 예정 · 창고", "−4 EA"], ["입고 예정 · 조립", "+1 EA"], ["이동 예정 · 창고 → 튜닝", "2 EA"]]) {
      expect(within(material).getByText(label).closest("div")).toHaveTextContent(quantity);
    }
    expect(within(detail).queryByText(/작업 예약|승인 예약/)).toBeNull();
    expect(within(detail).getByRole("listitem", { name: "완제품 긴 이름 내역" })).toHaveTextContent("+2 EA");
  });

  it("소비만 있는 위치 예정은 큰 섹션을 반복하지 않고 작업 요약에 보존한다", () => {
    state.data!.summary.forecast_by_location = [{ location: { bucket: "production", department: "튜브" }, expected_in_quantity: 0, expected_out_quantity: 4, transfer_in_quantity: 0, transfer_out_quantity: 0 }];
    state.data!.works[0].expected_effects = [{ ...state.data!.works[0].expected_effects[0], item_id: item.item_id, item_name: item.item_name, mes_code: "M-1", kind: "out", from: { bucket: "production", department: "튜브" }, to: null, quantity: 4 }];
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.queryByRole("group", { name: "위치별 예정" })).toBeNull();
    expect(screen.queryByText("소비·출고 예정")).toBeNull();
    const detail = screen.getByRole("article", { name: /김담당/ });
    expect(within(detail).getByText("출고 예정 · 튜브")).toBeInTheDocument();
    expect(within(detail).getByText("−4 EA")).toBeInTheDocument();
  });

  it("가용을 우선하고 예약 합계와 들어올 예정을 분리하며 위치 재고 다음에 관련 작업을 배치한다", () => {
    render(<InventoryWorkStatusPanel item={item}><section aria-label="실제 위치 재고">창고 실재고</section></InventoryWorkStatusPanel>);
    const quantities = screen.getByRole("group", { name: "수량 현황" });
    expect(quantities.children).toHaveLength(3);
    expect(within(quantities).getByText("사용 가능 재고").parentElement).toHaveTextContent("3");
    expect(within(quantities).getByText("예약 재고").parentElement).toHaveTextContent("7");
    expect(within(quantities).getByText("입고 예정").parentElement).toHaveTextContent("8");
    expect(screen.getByRole("heading", { name: "수량 현황" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "수량 현황" })).not.toHaveClass("sr-only");
    expect(within(quantities).getByRole("button", { name: "예약 내역" })).toHaveTextContent("예약 재고");
    expect(screen.queryByText("작업 예약")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "예약 내역" }));
    expect(screen.getByText("작업 예약")).toBeInTheDocument();
    const locations = screen.getByRole("region", { name: "실제 위치 재고" });
    const works = screen.getByRole("region", { name: "관련 작업" });
    expect(locations.compareDocumentPosition(works) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("상세에서 마지막 저장과 반복 설명 줄을 생략한다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.queryByText(/마지막 저장|완료 시 재고 변동/)).not.toBeInTheDocument();
  });

  it("작업·승인·출하 예약과 증가 예정·위치 이동을 분리한다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    fireEvent.click(screen.getByRole("button", { name: "예약 내역" }));
    for (const [label, value] of [["작업 예약", "4"], ["승인 예약", "2"], ["출하 예약", "1"], ["입고 예정", "8"]]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent(value);
    }
    expect(screen.getByText(/전체 재고 증가 없음/)).toBeInTheDocument();
    const destination = screen.getByRole("group", { name: "위치별 예정" });
    expect(destination).toHaveTextContent("튜닝");
    expect(destination).toHaveTextContent("이동 도착 5");
    expect(destination).not.toHaveTextContent("입고·생산 +8");
    expect(screen.queryByText("소비·출고 예정")).toBeNull();
  });

  it("다른 직원의 작업을 읽기 전용으로 열어 완료 시 재고 변동만 확인한다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ })).toHaveTextContent("일부 완료");
    const detail = screen.getByRole("region", { name: "김담당 작업 상세" });
    expect(detail).not.toHaveTextContent("완료 시 재고 변동");
    expect(within(detail).queryByText("입력 자재")).toBeNull();
    expect(within(detail).queryByText(/작업 예약|승인 예약/)).toBeNull();
    expect(detail).toHaveTextContent("튜닝");
    expect(within(detail).getByText(/\+2 EA/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /취소|저장|재개/ })).toBeNull();
  });

  it("반려 안내와 예정 불완전을 보여 주고 제거된 상태 경고는 표시하지 않는다", () => {
    state.data!.summary.forecast_complete = false;
    state.data!.works[0].reservation_status = "inactive";
    state.data!.works[0].reservation_issue = { code: "returned_after_rejection", message: "반려 후 다시 저장하여 예약해야 합니다.", shortages: [] };
    state.data!.works[0].forecast_issue = { code: "missing_effect_mapping", message: "열린 승인 행 연결을 확인할 수 없습니다." };
    state.data!.works[0].reserved_inputs = [];
    state.data!.works[0].expected_effects = [];
    render(<InventoryWorkStatusPanel item={item} mobile />);
    expect(screen.queryByText("예약 필요")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: /김담당/ })).toHaveTextContent("일부 완료");
    expect(screen.getByText("반려 후 다시 저장하여 예약해야 합니다.")).toBeInTheDocument();
    expect(screen.queryByText("열린 승인 행 연결을 확인할 수 없습니다.")).toBeNull();
    expect(screen.getByText("이 작업의 입고·출고 예정을 모두 확인할 수 없습니다. 담당자에게 작업 내용을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByText(/확인 가능한 예정량만/)).toBeInTheDocument();
    expect(screen.getByText("예정 수량을 확인할 수 없습니다. 수량이 없는 것은 아닙니다.")).toBeInTheDocument();
    expect(screen.queryByText("확정된 예정이 없습니다.")).toBeNull();
  });

  it("예약할 자재가 없는 입고는 예약 확보를 주장하지 않는다", () => {
    state.data!.works[0].reservation_status = "not_required";
    state.data!.works[0].status = "draft";
    state.data!.works[0].reserved_inputs = [];
    render(<InventoryWorkStatusPanel item={item} />);
    const heading = screen.getByRole("button", { name: /김담당.*완제품 긴 이름/ });
    expect(heading).toHaveTextContent("작업 중");
    expect(heading).not.toHaveTextContent("예약 4 EA");
    expect(within(screen.getByRole("region", { name: "김담당 작업 상세" })).queryByText("예약 없음")).toBeNull();
  });

  it("미제공·실패를 0으로 단정하지 않고 재시도한다", () => {
    state.data = undefined; state.isError = true;
    render(<InventoryWorkStatusPanel item={{ ...item, work_reservations: undefined }} />);
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
    expect(screen.getByRole("heading", { name: "관련 작업 — 없음" })).toBeInTheDocument();
  });

  it.each([false, true])("관련 작업이 없어도 예약 수량과 펼침을 보존한다 (mobile=%s)", (mobile) => {
    state.data!.works = [];
    render(<InventoryWorkStatusPanel item={item} mobile={mobile} />);
    const works = screen.getByRole("region", { name: "관련 작업" });
    expect(within(works).getByRole("heading", { name: "관련 작업 — 없음" })).toBeInTheDocument();
    expect(within(works).queryByText("관련 작업이 없습니다.")).toBeNull();
    const reservations = screen.getByRole("button", { name: "예약 내역" });
    expect(reservations).toHaveTextContent("7");
    fireEvent.click(reservations);
    expect(reservations).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("출하 예약").parentElement).toHaveTextContent("1");
  });

  it.each([false, true])("확인된 예정 0은 수량만 표시하고 완료 후 사용 안내를 생략한다 (mobile=%s)", (mobile) => {
    state.data!.summary.expected_in_quantity = 0;
    render(<InventoryWorkStatusPanel item={item} mobile={mobile} />);
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("0");
    expect(screen.queryByText("완료 후 사용")).toBeNull();
    expect(screen.queryByText("확인 필요")).toBeNull();
  });

  it("불완전한 예정 0은 확인 필요로 표시하며 양수가 확인되면 수량만 표시한다", () => {
    state.data!.summary.expected_in_quantity = 0;
    state.data!.summary.forecast_complete = false;
    const { rerender } = render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("확인 필요");
    expect(screen.queryByText("완료 후 사용")).toBeNull();
    state.data!.summary.expected_in_quantity = 8;
    rerender(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("확인된 8");
    expect(screen.queryByText("완료 후 사용")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("확인 가능한 예정량만 표시합니다.");
  });

  it("다른 품목의 이전 작업 응답이 있어도 현재 품목의 수량을 유지한다", () => {
    state.data!.item_id = "previous-item";
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByText("예약 재고").parentElement).toHaveTextContent("7");
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("8");
    expect(screen.queryByText("김담당")).toBeNull();
  });

  it("입고만 있는 위치 예정과 완료 후 사용 안내를 반복하지 않는다", () => {
    state.data!.summary.forecast_by_location[0].transfer_in_quantity = 0;
    state.data!.summary.transfer_in_quantity = 0;
    state.data!.summary.transfer_out_quantity = 0;
    render(<InventoryWorkStatusPanel item={item} />);
    expect(screen.queryByRole("group", { name: "위치별 예정" })).toBeNull();
    expect(screen.queryByText("완료 후 사용")).toBeNull();
    expect(screen.queryByText(/입고·생산 예정은 사용 가능 재고에 포함/)).toBeNull();
  });

  it("이동 예약은 접힌 행에도 출발과 도착을 보여 주며 들어올 총량에는 합산하지 않는다", () => {
    const work = state.data!.works[0];
    work.expected_effects = [{ ...work.expected_effects[0], item_id: "material", kind: "move", from: { bucket: "warehouse", department: null }, to: { bucket: "production", department: "튜닝" }, quantity: 4 }];
    render(<InventoryWorkStatusPanel item={item} />);
    const heading = screen.getByRole("article", { name: /김담당/ });
    expect(heading).toHaveTextContent("창고 → 튜닝");
    expect(heading).toHaveTextContent("4 EA");
    expect(heading).not.toHaveTextContent("사용 예약");
    expect(screen.getByText("입고 예정").parentElement).toHaveTextContent("8");
    expect(heading).toHaveTextContent("이동 예정 · 창고 → 튜닝");
  });
  it.each([[0, "var(--c-red)"], [3, "var(--c-yellow)"], [10, "var(--c-green)"]])("사용 가능 수량 %s에 기존 재고 상태색을 적용한다", (quantity, color) => {
    render(<InventoryWorkStatusPanel item={{ ...item, available_quantity: Number(quantity), min_stock: 5 }} />);
    const card = screen.getByText("사용 가능 재고").parentElement!;
    expect(within(card).getByText(String(quantity))).toHaveStyle({ color: String(color) });
  });
});
