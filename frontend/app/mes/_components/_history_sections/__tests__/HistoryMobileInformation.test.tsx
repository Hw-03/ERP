import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import { HistoryMobileStockDetails, HistoryMobileContext } from "../HistoryMobileInformation";
import { buildHistoryDetailSummary } from "../historyDetailSummary";

function log(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return { log_id: "mark", item_id: "ceramic", item_name: "세라믹 바디 (70kV)", mes_code: "9-TR-0001",
    item_unit: "EA", transaction_type: "MARK_DEFECTIVE", quantity_change: -2,
    quantity_before: 15, quantity_after: 15, warehouse_qty_before: 0, warehouse_qty_after: 0,
    department_qty_before: 15, department_qty_after: 13, department: "튜브",
    produced_by: "김도영", requester_name: "김도영", created_at: "2026-09-30T06:48:00Z",
    operation_batch_id: null, cancelled: false, reference_no: null, notes: null,
    inventory_effect: [
      { scope: "location", department: "튜브", status: "PRODUCTION", delta: -2, quantity_before: 15, quantity_after: 13 },
      { scope: "location", department: "튜브", status: "DEFECTIVE", delta: 2, quantity_before: 0, quantity_after: 2 },
    ], ...overrides } as TransactionLog;
}

describe("HistoryMobileInformation", () => {
  it("배치 없는 격리도 정상·불량 위치별 실제 수량을 모두 표시한다", () => {
    render(<HistoryMobileStockDetails logs={[log()]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("9-TR-0001")).toBeInTheDocument();
    expect(screen.queryByText("실제 처리 재고")).not.toBeInTheDocument();
    expect(screen.getByLabelText("불량 0 +2→2")).toBeInTheDocument();
    expect(screen.getByLabelText("튜브 15 −2→13")).toBeInTheDocument();
  });
  it("동일 품목의 후속 처리도 합쳐 없애지 않고 개별 상세에 연결한다", () => {
    const first = log();
    const child = log({ log_id: "scrap", transaction_type: "DEFECT_SCRAP", inventory_effect: [] });
    const select = vi.fn();
    render(<HistoryMobileStockDetails logs={[first, child]} onSelectLog={select} />);
    const row = screen.getByRole("button", { name: /폐기.*세라믹 바디/ });
    fireEvent.click(row);
    expect(select).toHaveBeenCalledWith(child);
    expect(screen.getAllByText("9-TR-0001")).toHaveLength(2);
  });
  it("요청 순 재고 계산 불가 사유는 터치로 확인하고 실제 수량을 유지한다", () => {
    render(<HistoryMobileStockDetails logs={[log({request_order_stock: {status: "unavailable", reason: "ambiguous_order", warehouse_qty_before: null, warehouse_qty_after: null, department_qty_before: null, department_qty_after: null}})]} onSelectLog={vi.fn()} />);
    fireEvent.click(screen.getByText("계산 불가 · 사유 보기"));
    expect(screen.getByText("같은 처리 시각의 거래 순서를 확정할 수 없습니다.")).toBeVisible();
    expect(screen.getByLabelText("불량 재고 0 +2→2 EA")).toBeInTheDocument();
  });
  it("품목 전환의 기존품·변경품과 각 역할을 표시한다", () => {
    const source = log({transaction_type:"BACKFLUSH", shipping_phase:"COMPONENT_CHANGE", notes:"품목 전환 소스"});
    const target = log({log_id:"target", item_id:"new", item_name:"변경품", mes_code:"NEW", transaction_type:"PRODUCE", quantity_change:2, shipping_phase:"COMPONENT_CHANGE", notes:"품목 전환 대상"});
    render(<HistoryMobileStockDetails logs={[source,target]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("기존품 차감")).toBeInTheDocument();
    expect(screen.getByText("변경품 입고")).toBeInTheDocument();
  });
  it("증감이 같아도 요청 순 잔량과 실제 처리 잔량이 다르면 구분한다", () => {
    render(<HistoryMobileStockDetails logs={[log({
      request_order_stock: {status:"available",reason:null,warehouse_qty_before:0,warehouse_qty_after:0,department_qty_before:7,department_qty_after:5},
      inventory_effect:[{scope:"location",department:"튜브",status:"PRODUCTION",delta:-2}],
    })]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("요청 순 재고")).toBeInTheDocument();
    expect(screen.getByLabelText("부서 합계 7 −2→5")).toBeInTheDocument();
    expect(screen.getByText("실제 처리 재고")).toBeInTheDocument();
    expect(screen.getByLabelText("부서 합계 15 −2→13")).toBeInTheDocument();
    expect(screen.queryByLabelText("튜브 7 −2→5")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("튜브 15 −2→13")).not.toBeInTheDocument();
  });
  it("실제 위치 전후가 있어도 요청순 합계를 덮지 않고 각 위치의 실제 수량을 보존한다", () => {
    render(<HistoryMobileStockDetails logs={[log({
      transaction_type: "ADJUST", quantity_change: -4, quantity_before: 38, quantity_after: 34,
      warehouse_qty_before: 20, warehouse_qty_after: 18, department_qty_before: 18, department_qty_after: 16,
      request_order_stock: {status:"available",reason:null,warehouse_qty_before:10,warehouse_qty_after:8,department_qty_before:7,department_qty_after:5},
      inventory_effect:[
        {scope:"warehouse",delta:-2,quantity_before:20,quantity_after:18},
        {scope:"location",department:"튜브",status:"PRODUCTION",delta:-3,quantity_before:15,quantity_after:12},
        {scope:"location",department:"조립",status:"PRODUCTION",delta:1,quantity_before:3,quantity_after:4},
      ],
    })]} onSelectLog={vi.fn()} />);
    const requested = within(screen.getByText("요청 순 재고").parentElement!);
    expect(requested.getByLabelText("창고 10 −2→8")).toBeInTheDocument();
    expect(requested.getByLabelText("부서 합계 7 −2→5")).toBeInTheDocument();
    expect(requested.queryByLabelText("튜브 15 −3→12")).not.toBeInTheDocument();
    const actual = within(screen.getByText("실제 처리 재고").parentElement!);
    expect(actual.getByLabelText("창고 20 −2→18")).toBeInTheDocument();
    expect(actual.getByLabelText("튜브 15 −3→12")).toBeInTheDocument();
    expect(actual.getByLabelText("조립 3 +1→4")).toBeInTheDocument();
    expect([
      /^창고(?: 재고)? 20 [−-]2→18(?: EA)?$/,
      /^튜브(?: 재고)? 15 [−-]3→12(?: EA)?$/,
      /^조립(?: 재고)? 3 \+1→4(?: EA)?$/,
    ].map((label) => actual.getAllByLabelText(label).length)).toEqual([1, 1, 1]);
    expect(actual.queryByLabelText("창고 재고 20 -2→18 EA")).not.toBeInTheDocument();
    expect(actual.queryByLabelText("튜브 재고 15 -3→12 EA")).not.toBeInTheDocument();
    expect(actual.queryByLabelText("조립 재고 3 +1→4 EA")).not.toBeInTheDocument();
  });
  it.each([
    [{scope:"location",department:"튜브",status:"PRODUCTION",delta:-2}, "튜브 재고 -2 EA"],
    [{scope:"location",department:"튜브",status:"PRODUCTION",delta:-3,quantity_before:15,quantity_after:13}, "튜브 재고 15 -3→13 EA"],
    [{scope:"location",department:"튜브",status:"DEFECTIVE",delta:-2,quantity_before:15,quantity_after:13}, "불량 재고 15 -2→13 EA"],
    [{scope:"warehouse_box",box_id:"box-a",delta:-2,quantity_before:15,quantity_after:13}, "박스 재고 15 -2→13 EA"],
    [{scope:"location",department:"튜브",delta:-2,quantity_before:15,quantity_after:13}, "튜브 재고 15 -2→13 EA"],
  ] as const)("실제 재고 요약으로 대체할 수 없는 효과 %j는 보존한다", (effect, label) => {
    render(<HistoryMobileStockDetails logs={[log({
      request_order_stock: {status:"available",reason:null,warehouse_qty_before:0,warehouse_qty_after:0,department_qty_before:7,department_qty_after:5},
      inventory_effect:[effect],
    })]} onSelectLog={vi.fn()} />);
    const actual = within(screen.getByText("실제 처리 재고").parentElement!);
    expect(actual.getAllByLabelText(label)).toHaveLength(1);
  });
  it("요청 순 재고와 실제 재고가 같으면 위치 필드가 달라도 중복하지 않는다", () => {
    render(<HistoryMobileStockDetails logs={[log({transaction_type:"TRANSFER_TO_PROD",department:"창고",
      request_order_stock:{status:"available",reason:null,warehouse_qty_before:0,warehouse_qty_after:0,department_qty_before:15,department_qty_after:13},
      inventory_effect:[{scope:"location",department:"조립",status:"PRODUCTION",delta:-2,quantity_before:15,quantity_after:13}],
    })]} onSelectLog={vi.fn()} />);
    expect(screen.getByLabelText("조립 15 −2→13")).toBeInTheDocument();
    expect(screen.queryByText("요청 순 재고")).not.toBeInTheDocument();
    expect(screen.queryByText("실제 처리 재고")).not.toBeInTheDocument();
  });
  it("여러 위치를 합산하거나 접지 않고 모두 표시한다", () => {
    render(<HistoryMobileStockDetails logs={[log({inventory_effect:[
      {scope:"location",department:"조립",status:"PRODUCTION",delta:-2,quantity_before:20,quantity_after:18},
      {scope:"location",department:"연구소",status:"PRODUCTION",delta:2,quantity_before:3,quantity_after:5},
    ]})]} onSelectLog={vi.fn()} />);
    expect(screen.getByLabelText("조립 재고 20 -2→18 EA")).toBeInTheDocument();
    expect(screen.getByLabelText("연구소 재고 3 +2→5 EA")).toBeInTheDocument();
  });
  it("상태가 없는 기존 위치 기록도 실제 부서명을 유지한다", () => {
    render(<HistoryMobileStockDetails logs={[log({department:"창고",inventory_effect:[{scope:"location",department:"조립",delta:-2,quantity_before:15,quantity_after:13}]})]} onSelectLog={vi.fn()} />);
    expect(screen.getByLabelText("조립 재고 15 -2→13 EA")).toBeInTheDocument();
  });
  it.each([false,true])("재고 기록 없음과 변동 없음을 구분한다: %s", (missing) => {
    render(<HistoryMobileStockDetails logs={[log({inventory_effect:[],warehouse_qty_before:missing?null:0,warehouse_qty_after:missing?null:0,
      department_qty_before:missing?null:15,department_qty_after:missing?null:15})]} onSelectLog={vi.fn()} />);
    expect(screen.getByText(missing ? "기록 없음" : "변동 없음")).toBeInTheDocument();
  });
  it("재작업 회수·폐기는 개별 행을 유지하고 수량 요약을 중복하지 않는다", () => {
    const parent = log({transaction_type:"DISASSEMBLE", reference_no:"defect-disassemble:r"});
    const scrap = log({log_id:"scrap", item_id:"child", item_name:"회수 부품", transaction_type:"DEFECT_SCRAP", quantity_change:-3});
    const keep = {...scrap,log_id:"keep",transaction_type:"RECEIVE",quantity_change:1} as TransactionLog;
    render(<HistoryMobileStockDetails logs={[parent,scrap,keep]} onSelectLog={vi.fn()} />);
    expect(screen.queryByText("폐기 3 EA · 회수 1 EA")).not.toBeInTheDocument();
    expect(screen.getAllByText("회수 부품")).toHaveLength(2);
  });
  it.each(["modern", "legacy"])("입고 전에 폐기한 재작업 구성품은 기존 불량 재고 차감으로 오인하지 않게 표시한다: %s", (source) => {
    render(<HistoryMobileStockDetails logs={[log({transaction_type:"DEFECT_SCRAP",operation_role:source === "modern" ? "REWORK_CHILD_SCRAP" : null,
      reference_no:"defect-disassemble:r",notes:"[rework:scrap_child]",
      quantity_change:-1,quantity_before:194,quantity_after:193,warehouse_qty_before:0,warehouse_qty_after:0,
      department_qty_before:100,department_qty_after:100,inventory_effect:[]})]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("처리 수량 -1 EA")).toBeInTheDocument();
    expect(screen.getByText("재입고 하지 않고 폐기")).toBeInTheDocument();
    expect(screen.queryByText("변동 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("폐기 1 EA")).not.toBeInTheDocument();
  });
  it.each(["DISASSEMBLE", "DEFECT_SCRAP"] as const)("%s의 실제 불량 차감이 있으면 정상 재고의 변동 없음 안내를 생략한다", (transaction_type) => {
    render(<HistoryMobileStockDetails logs={[log({transaction_type,operation_role:transaction_type === "DEFECT_SCRAP" ? "REWORK_CHILD_SCRAP" : "REWORK_PARENT_DEFECTIVE",quantity_change:-1,quantity_before:194,quantity_after:193,
      department_qty_before:100,department_qty_after:100,
      inventory_effect:[{scope:"location",department:"튜브",status:"DEFECTIVE",delta:-1,quantity_before:94,quantity_after:93}]})]} onSelectLog={vi.fn()} />);
    expect(screen.getByLabelText("불량 재고 94 -1→93 EA")).toBeInTheDocument();
    expect(screen.queryByText("변동 없음")).not.toBeInTheDocument();
    expect(screen.queryByText("처리 수량 -1 EA")).not.toBeInTheDocument();
  });
  it("재작업의 불량 회수는 처리 제외로 잘못 표시하지 않는다", () => {
    render(<HistoryMobileStockDetails logs={[log({operation_role:"REWORK_CHILD_DEFECTIVE",quantity_change:2,
      quantity_before:0,quantity_after:2,warehouse_qty_before:0,warehouse_qty_after:0,department_qty_before:0,department_qty_after:0,
      inventory_effect:[{scope:"location",department:"튜브",status:"DEFECTIVE",delta:2,quantity_before:0,quantity_after:2}]})]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("불량 회수")).toBeInTheDocument();
    expect(screen.queryByText("처리 제외")).not.toBeInTheDocument();
    expect(screen.getByLabelText("불량 0 +2→2")).toBeInTheDocument();
  });
  it("전체 수량이 그대로인 격리도 실제 이동 수량을 표시한다", () => {
    render(<HistoryMobileStockDetails logs={[log({quantity_change:0,transfer_qty:2})]} onSelectLog={vi.fn()} />);
    expect(screen.getByLabelText("불량 0 +2→2")).toHaveTextContent("2EA");
    expect(screen.queryByText("0 EA")).not.toBeInTheDocument();
  });
  it("과거 재고 스냅샷이 없어도 거래의 처리 수량은 잃지 않는다", () => {
    render(<HistoryMobileStockDetails logs={[log({inventory_effect:[],warehouse_qty_before:null,warehouse_qty_after:null,department_qty_before:null,department_qty_after:null})]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("처리 수량 -2 EA")).toBeInTheDocument();
    expect(screen.getByText("기록 없음")).toBeInTheDocument();
  });
  it("PC 요약의 실행자·상태·품목 전환을 모바일에서도 제공한다", () => {
    const logs = [log({ executor_name:"실행자 B", approver_name:"승인자 C", cancelled:true, cancel_reason:"코드 오류" })];
    render(<HistoryMobileContext summary={buildHistoryDetailSummary(logs,null)} />);
    expect(screen.getByText("취소됨 · 코드 오류")).toBeInTheDocument();
    expect(screen.getByText("실행자 B")).toBeInTheDocument();
    expect(screen.getByText("승인자 C")).toBeInTheDocument();
  });
  it.each(["RECEIVE","PRODUCE","SHIP","ADJUST","BACKFLUSH","DISASSEMBLE","TRANSFER_TO_PROD","TRANSFER_TO_WH","TRANSFER_DEPT","MARK_DEFECTIVE","UNMARK_DEFECTIVE","DEFECT_SCRAP","SUPPLIER_RETURN","INTERNAL_USE","MATERIAL_OUT"] as const)("%s의 코드와 수량을 생략하지 않는다", (transaction_type) => {
    render(<HistoryMobileStockDetails logs={[log({transaction_type})]} onSelectLog={vi.fn()} />);
    expect(screen.getByText("9-TR-0001")).toBeInTheDocument();
    expect(screen.getByLabelText("튜브 15 −2→13")).toBeInTheDocument();
  });
});
