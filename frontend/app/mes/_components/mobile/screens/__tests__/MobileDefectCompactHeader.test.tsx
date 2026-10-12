import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileDefectCartFlow } from "../MobileDefectCartFlow";
import { MobileDefectProcessPanel } from "../MobileDefectProcessPanel";
import type { DefectLocation } from "@/lib/api/types/defects";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { MobileDefectStepHeader } from "../MobileDefectStepHeader";

function render(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return {
    ...rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
    queryClient: client,
  };
}

vi.mock("../../../_defect_hub/DisassembleTree", () => ({
  DisassembleTree: ({ onChange }: { onChange: (decisions: unknown[]) => void }) => (
    <div data-testid="disassemble-tree">
      <button type="button" onClick={() => onChange([{ child_item_id: "child-1", action: "recover" }])}>
        set tree decision
      </button>
    </div>
  ),
  toServerDecision: (decision: unknown) => decision,
  validateDecisionTree: () => true,
}));

vi.mock("../../rework/MobileReworkWorkspace", () => ({
  MobileReworkWorkspace: ({ onChange, onBack, onConfirm, canSubmit, steps, current }: { onChange: (decisions: unknown[]) => void; onBack: () => void; onConfirm: () => void; canSubmit: boolean; steps: string[]; current: number }) => <div data-testid="mobile-rework-workspace">
    <MobileDefectStepHeader title="구성품 처리" steps={steps} current={current} onBack={onBack} />
    <button type="button" onClick={() => onChange([{ child_item_id: "child-1", action: "recover" }])}>set tree decision</button>
    <button type="button" disabled={!canSubmit} onClick={onConfirm}>재작업 실행 확인 →</button>
  </div>,
}));

vi.mock("../../../_defect_hub/DefectItemPicker", () => ({
  DefectItemPicker: ({ onAdd, onSelected, selectedLineCounts, selectedIds, disabled, addingDisabled, mobilePresentation }: { onAdd?: (item: unknown) => void; onSelected?: (item: unknown) => void; selectedLineCounts?: ReadonlyMap<string, number>; selectedIds?: Set<string>; disabled?: boolean; addingDisabled?: boolean; mobilePresentation?: boolean }) => (
    <div data-testid="defect-item-picker" data-mobile-presentation={mobilePresentation}>
      <button
        type="button"
        aria-label="mock add"
        data-defect-picker-button="mock-item-1"
        disabled={disabled || (addingDisabled && !selectedIds?.has("mock-item-1"))}
        onClick={() =>
          (selectedIds?.has("mock-item-1") && onSelected ? onSelected : onAdd)?.({
            item_id: "mock-item-1",
            item_name: "Mock item",
            mes_code: "MOCK-001",
            quantity: 10,
            warehouse_qty: 20,
            pending_quantity: 0,
            locations: [{ department: "튜브", status: "PRODUCTION", quantity: 20, pending_quantity: reservedQuantity, available_quantity: 20 - reservedQuantity }],
            has_bom: true,
            process_type_code: "TR",
          })
        }
      >
        mock add
        {selectedLineCounts?.has("mock-item-1") && <span>담김 · {selectedLineCounts.get("mock-item-1")}건</span>}
      </button>
      <button
        type="button"
        data-defect-picker-button="mock-item-2"
        disabled={disabled || (addingDisabled && !selectedIds?.has("mock-item-2"))}
        onClick={() =>
          onAdd?.({
            item_id: "mock-item-2",
            item_name: "Mock second item",
            mes_code: "MOCK-002",
            quantity: 10,
            warehouse_qty: 20,
            pending_quantity: 0,
            locations: [{ department: "조립", status: "PRODUCTION", quantity: 20, pending_quantity: 0, available_quantity: 20 }],
            has_bom: false,
            process_type_code: "AF",
          })
        }
      >
        mock add second
      </button>
    </div>
  ),
}));

vi.mock("../../../_defect_hub/ReasonFormFields", () => ({
  ReasonFormFields: ({ memo, onCategoryChange, onMemoChange, quarantineControls }: { memo: string; onCategoryChange: (category: string, id?: string) => void; onMemoChange: (memo: string) => void; quarantineControls?: { quantity: ReactNode; management: ReactNode; remove: ReactNode } }) => (
    <>{quarantineControls && <div data-testid="quarantine-controls">{quarantineControls.quantity}<span>관리 분류</span>{quarantineControls.remove}{quarantineControls.management}</div>}<button type="button" onClick={() => onCategoryChange("외관 불량", "surface-id")}>사유 선택</button><textarea aria-label="품목 메모" value={memo} onChange={(event) => onMemoChange(event.target.value)} /></>
  ),
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    quarantine: vi.fn(),
    quarantineBulk: vi.fn(),
    unquarantine: vi.fn(),
  },
}));

vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: {
    createStockRequest: vi.fn(),
  },
}));

const employee = { employee_id: "emp-1", name: "Kim", department: "Assembly" };
let reservedQuantity = 0;

const item = {
  item_id: "item-1",
  item_name: "Long item",
  mes_code: "MES-001",
  current_stock: 10,
  has_bom: true,
};

const location: DefectLocation = {
  record_id: "record-1",
  item_id: "item-1",
  item_name: "Long item",
  mes_code: "MES-001",
  department: "Assembly",
  quantity: 3,
  original_quantity: 3,
  pending_quantity: 0,
  available_quantity: 3,
  defective_at: null,
  reason_category: null,
  reason_memo: null,
  quarantined_by: "Kim",
  quarantined_by_employee_id: "emp-1",
  is_legacy: false,
  has_bom: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  reservedQuantity = 0;
  window.history.replaceState({}, "");
  vi.mocked(defectsApi.quarantine).mockResolvedValue(undefined);
  vi.mocked(defectsApi.quarantineBulk).mockResolvedValue(undefined as never);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue(undefined as never);
});

describe("mobile defect compact headers", () => {
  function openQuarantine(): void {
    render(<MobileDefectCartFlow mode="add" initialAction="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
  }

  it("격리 사유는 순번과 복사 버튼 없이 수량·관리 분류·삭제를 공용 입력에 배치한다", () => {
    openQuarantine();
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    expect(screen.queryAllByText(/^사유 \d+$/)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /사유 복사/ })).not.toBeInTheDocument();
    const controls = screen.getAllByTestId("quarantine-controls");
    expect(controls).toHaveLength(2);
    expect(within(controls[0]).getByRole("spinbutton")).toBeInTheDocument();
    expect(within(controls[0]).getByRole("group", { name: "보관 분류" })).toBeInTheDocument();
    expect(within(controls[1]).getByRole("button", { name: "Mock item 사유 2 삭제" })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: /Mock item 사유/ })).toHaveLength(2);
  });

  it("동일 품목 3+4+3 사유를 하나의 카드와 합계로 표시하고 중간 삭제 후 인접 수량에 포커스를 둔다", () => {
    openQuarantine();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("textbox", { name: "품목 메모" }), { target: { value: "첫 사유" } });
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    expect(screen.getAllByRole("spinbutton")[1]).toHaveFocus();
    expect(screen.getAllByRole("textbox", { name: "품목 메모" })[1]).toHaveValue("");
    expect(screen.getByRole("button", { name: /격리하기 \(2건\)/ })).toBeDisabled();
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    fireEvent.change(screen.getAllByRole("spinbutton")[2], { target: { value: "3" } });
    const group = screen.getByTestId("defect-quarantine-item-group");
    expect(within(group).getByText("총 10 EA · 3건")).toBeInTheDocument();
    expect(within(group).getAllByText("Mock item")).toHaveLength(1);
    expect(within(group).getAllByText("가능 재고")).toHaveLength(1);
    expect(screen.getByText("1품목 · 3건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock item 사유 2 삭제" }));
    expect(screen.getAllByRole("spinbutton").map((input) => (input as HTMLInputElement).value)).toEqual(["3", "3"]);
    expect(screen.getAllByRole("spinbutton")[1]).toHaveFocus();
    expect(screen.getAllByRole("textbox", { name: "품목 메모" })[0]).toHaveValue("첫 사유");
  });

  it("예약을 제외한 가용 재고보다 같은 품목 사유 합계가 많으면 제출을 막는다", () => {
    reservedQuantity = 13;
    openQuarantine();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "4" } });
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    expect(screen.getByText("사유 합계 8개는 튜브 가용 7개보다 1개 많습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /격리하기 \(2건\)/ })).toBeDisabled();
  });

  it("이미 담긴 품목은 해제하지 않고 해당 사유 카드로 이동한다", async () => {
    openQuarantine();
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    await screen.findByTestId("defect-item-picker");
    expect(screen.getByText("담김 · 2건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    expect(screen.getByTestId("defect-quarantine-item-group")).toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveFocus();
  });

  it("100건에 도달하면 새 사유와 새 품목을 막고 담긴 품목은 계속 열 수 있다", async () => {
    openQuarantine();
    const addReason = screen.getByRole("button", { name: "다른 사유 추가" });
    for (let count = 1; count < 100; count++) fireEvent.click(addReason);
    expect(screen.getAllByTestId("defect-quarantine-reason-line")).toHaveLength(100);
    expect(addReason).toBeDisabled();
    expect(screen.getByText(/한 번에 최대 100건/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("이전"));
    await screen.findByTestId("defect-item-picker");
    expect(screen.getByRole("button", { name: "mock add second" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "mock add" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByLabelText("Mock item 사유 100 삭제"));
    expect(screen.getByLabelText("다른 사유 추가")).toBeEnabled();
  }, 30_000);

  it("새 사유는 같은 품목 마지막 뒤에 제출하고 수정하면 오류를 지우고 batch ID를 갱신한다", async () => {
    vi.mocked(defectsApi.quarantineBulk).mockRejectedValue(new Error("확인 후 재시도"));
    openQuarantine();
    fireEvent.change(screen.getByRole("textbox", { name: "품목 메모" }), { target: { value: "공통 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    await screen.findByTestId("defect-item-picker");
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(2건\)/ }));
    const firstGroup = screen.getAllByTestId("defect-quarantine-item-group")[0];
    fireEvent.click(within(firstGroup).getByRole("button", { name: "다른 사유 추가" }));
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(within(screen.getAllByRole("group", { name: "보관 분류" })[1]).getByRole("button", { name: "B급" }));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(3건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "격리하기", exact: true }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("확인 후 재시도");
    expect(screen.getAllByText("확인 후 재시도")).toHaveLength(1);
    expect(screen.queryByText(/\d+건 실패/)).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-defect-cart-scroll")).toContainElement(alert);
    const first = vi.mocked(defectsApi.quarantineBulk).mock.calls[0][0];
    expect(first.lines.map((line) => line.item_id)).toEqual(["mock-item-1", "mock-item-1", "mock-item-2"]);
    expect(first.lines[1].reason_memo).toBeNull();
    fireEvent.change(screen.getAllByRole("textbox", { name: "품목 메모" })[1], { target: { value: "수정 메모" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "품목 메모" }).map((input) => (input as HTMLTextAreaElement).value)).toEqual(["공통 메모", "수정 메모", ""]);
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(3건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "격리하기", exact: true }));
    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(2));
    const second = vi.mocked(defectsApi.quarantineBulk).mock.calls[1][0];
    expect(second.client_request_id).not.toBe(first.client_request_id);
    expect(second.submission_id).toBe(first.submission_id);
    expect(second.lines[1].management_category).toBe("B_GRADE");
    vi.mocked(defectsApi.quarantineBulk).mockReset();
  });

  it("동일 품목 실패 재시도는 입력과 요청 순서를 보존하고 처리 중 모든 사유 조작을 잠근다", async () => {
    let resolveRequest: (value: never) => void = () => {};
    vi.mocked(defectsApi.quarantineBulk).mockRejectedValueOnce(new Error("전체 실패"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    openQuarantine();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "4" } });
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/총 7 EA · 2건/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/외관 불량/)).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "격리하기", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("전체 실패");
    const original = vi.mocked(defectsApi.quarantineBulk).mock.calls[0][0];
    expect(original.lines.map((line) => line.qty)).toEqual([3, 4]);
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "격리하기", exact: true }));
    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.mocked(defectsApi.quarantineBulk).mock.calls[1][0]).toEqual(original);
    expect(screen.getByRole("button", { name: "다른 사유 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mock item 사유 1 삭제" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /사유 복사/ })).not.toBeInTheDocument();
    screen.getAllByRole("spinbutton").forEach((input) => expect(input).toBeDisabled());
    screen.getAllByRole("button", { name: "B급" }).forEach((button) => expect(button).toBeDisabled());
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => expect(button).toBeDisabled());
    screen.getAllByRole("textbox", { name: "품목 메모" }).forEach((input) => expect(input).toBeDisabled());
    await act(async () => resolveRequest(undefined as never));
  });

  it.each(["quantity", "category", "management", "add", "delete"] as const)("격리 일괄 실패 후 %s 조작은 지난 오류를 지운다", async (change) => {
    vi.mocked(defectsApi.quarantineBulk).mockRejectedValueOnce(new Error("지난 일괄 오류"));
    openQuarantine();
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "격리하기", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("지난 일괄 오류");
    if (change === "quantity") fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "2" } });
    else if (change === "category") fireEvent.click(screen.getAllByRole("button", { name: "사유 선택" })[0]);
    else if (change === "management") fireEvent.click(screen.getAllByRole("button", { name: "B급" })[0]);
    else if (change === "add") fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    else fireEvent.click(screen.getByRole("button", { name: "Mock item 사유 1 삭제" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("지난 일괄 오류")).not.toBeInTheDocument();
  });

  it("단일 격리 실패도 장바구니 오류 하나로 표시하고 메모 수정 시 지운다", async () => {
    vi.mocked(defectsApi.quarantine).mockRejectedValueOnce(new Error("단일 격리 오류"));
    openQuarantine();
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "격리하기", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("단일 격리 오류");
    expect(screen.queryByText(/\d+건 실패/)).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
    fireEvent.change(screen.getByRole("textbox", { name: "품목 메모" }), { target: { value: "수정" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["add", "scrap"] as const)("%s 입력은 화면 이전 버튼과 브라우저 앞뒤 이동에도 보존한다", async (mode) => {
    render(<MobileDefectCartFlow mode={mode} initialAction="scrap" initialSource="production" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "7" } });
    fireEvent.change(screen.getByRole("textbox", { name: "품목 메모" }), { target: { value: "입력 보존" } });
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    await screen.findByTestId("defect-item-picker");
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(2건\)/ }));
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(7);
    expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(1);
    expect(screen.getAllByRole("textbox", { name: "품목 메모" })[0]).toHaveValue("입력 보존");
    if (mode === "scrap") fireEvent.click(screen.getByRole("button", { name: "아래 줄에 사유 복사" }));
    else {
      fireEvent.click(screen.getAllByRole("button", { name: "사유 선택" })[1]);
      fireEvent.change(screen.getAllByRole("textbox", { name: "품목 메모" })[1], { target: { value: "두 번째 입력" } });
    }
    expect(screen.getByRole("button", { name: mode === "add" ? /격리하기 \(2건\)/ : /즉시 폐기 \(2건\)/ })).toBeEnabled();
    act(() => window.history.back());
    await screen.findByTestId("defect-item-picker");
    act(() => window.history.forward());
    await screen.findByRole("heading", { name: "수량 조정" });
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(7);
    expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(1);
    expect(screen.getAllByRole("textbox", { name: "품목 메모" })[1]).toHaveValue(mode === "scrap" ? "입력 보존" : "두 번째 입력");
  });

  it("마지막 격리 사유 삭제는 품목 선택으로 자동 복귀하고 다시 담을 수 있다", async () => {
    render(<MobileDefectCartFlow mode="add" initialAction="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mock item 사유 1 삭제" }));
    expect(screen.getByRole("button", { name: /격리하기 \(0건\)/ })).toBeDisabled();
    expect(await screen.findByTestId("defect-item-picker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mock add" })).toHaveFocus();
    expect(screen.queryByText("담김 · 1건")).not.toBeInTheDocument();
    expect(window.history.state).toMatchObject({ step: 2 });
    act(() => window.history.forward());
    await screen.findByRole("button", { name: "품목 선택으로 돌아가기" });
    act(() => window.history.back());
    await screen.findByTestId("defect-item-picker");
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
  });

  it("재작업 단일 선택을 유지하고 수량 변경 시 BOM 결정을 초기화한다", async () => {
    render(<MobileDefectCartFlow mode="scrap" initialAction="rework" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "BOM 확인 →" }));
    fireEvent.click(screen.getByRole("button", { name: "set tree decision" }));
    expect(screen.getByRole("button", { name: "재작업 실행 확인 →" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    await screen.findByRole("spinbutton");
    expect(screen.getByRole("button", { name: "수량 1 감소" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "수량 1 증가" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "BOM 확인 →" }));
    expect(screen.getByRole("button", { name: "재작업 실행 확인 →" })).toBeDisabled();
    expect(window.history.state).toMatchObject({ step: 4, directAction: "rework" });
  });

  it("부분 실패 재시도는 실패 품목의 식별자와 입력을 유지하고 중복 제출을 차단한다", async () => {
    let resolveRetry: (value: never) => void = () => {};
    vi.mocked(stockRequestsApi.createStockRequest)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error("재시도 필요"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    const onDone = vi.fn();
    render(<MobileDefectCartFlow mode="scrap" initialAction="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={onDone} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(2건\)/ }));
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    fireEvent.change(screen.getAllByRole("spinbutton")[1], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(2건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기", exact: true }));
    await screen.findByText("실패: 재시도 필요");
    expect(screen.getByRole("spinbutton")).toHaveValue(4);
    const failedRequest = vi.mocked(stockRequestsApi.createStockRequest).mock.calls[1][0];
    expect(failedRequest.reason_category_id).toBe("surface-id");
    expect(failedRequest.submission_id).toBe(vi.mocked(stockRequestsApi.createStockRequest).mock.calls[0][0].submission_id);
    expect(failedRequest.submission_id).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기", exact: true }));
    await waitFor(() => expect(stockRequestsApi.createStockRequest).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "처리 중..." })).toBeDisabled();
    expect(vi.mocked(stockRequestsApi.createStockRequest).mock.calls[2][0]).toEqual(failedRequest);
    await act(async () => resolveRetry(undefined as never));
    expect(onDone).toHaveBeenCalledOnce();
  });
  it.each(["add", "scrap"] as const)("통합 화면에서 확정된 %s 출처로 품목 단계를 바로 연다", (mode) => {
    render(<MobileDefectCartFlow mode={mode} initialAction="scrap" initialSource="warehouse" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("defect-item-picker")).toBeInTheDocument();
    expect(screen.getByText("Step 3 / 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /다음/ })).not.toBeInTheDocument();
    expect(window.history.state).toMatchObject({ step: 2, source: "warehouse", directAction: "scrap" });
  });

  it("통합 화면의 즉시 재작업은 부서 재고로 품목 단계를 연다", () => {
    render(<MobileDefectCartFlow mode="scrap" initialAction="rework" initialSource="warehouse" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("defect-item-picker")).toBeInTheDocument();
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ step: 2, source: "production", directAction: "rework" });
  });

  it("품목 선택에는 입력 카드를 표시하지 않고 수량 조정 단계에서 입력한다", () => {
    render(<MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByTestId("defect-item-picker")).toHaveAttribute("data-mobile-presentation", "true");
    expect(screen.queryByText(/장바구니/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /수량 조정 \(0건\)/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    expect(screen.getByRole("heading", { name: "수량 조정" })).toBeInTheDocument();
    expect(screen.queryByTestId("defect-item-picker")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사유 선택" })).toBeInTheDocument();
  });

  it("keeps the direct action cards flush with the flow bottom for the common shell gap", () => {
    render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    const reworkButton = screen.getByRole("button", { name: /재작업/ });
    const scrollPane = reworkButton.parentElement?.parentElement;

    expect(scrollPane).toHaveClass("overflow-y-auto");
    expect(scrollPane).not.toHaveClass("pb-3");
  });

  it("uses a compact step header after choosing a direct defect action", () => {
    const { container } = render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText("Step 1 / 4")).toBeInTheDocument();

    fireEvent.click(container.querySelectorAll("button")[1]);

    expect(screen.getByRole("heading", { name: "출처 선택" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();
  });

  it("opens rework directly at the item picker without a department source step", () => {
    render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /재작업/ }));

    expect(screen.getByTestId("defect-item-picker")).toBeInTheDocument();
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();
    expect(screen.queryByText("출처·격리 부서")).not.toBeInTheDocument();
  });

  it("역할 기본값이 전달되어도 모바일 격리는 생산 출처로 시작한다", () => {
    const legacySource = { defaultSource: "warehouse" } as unknown as Record<string, never>;
    render(
      <MobileDefectCartFlow {...legacySource} mode="add" items={[{ ...item, warehouse_qty: 0 }]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByRole("button", { name: /부서 재고/ })).toHaveStyle({ borderWidth: "2px" });
  });

  it("모바일 최종 격리 확인에 두 품목의 수량·관리 분류·부서를 각각 표시한다", async () => {
    render(
      <MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(2건\)/ }));
    const quantities = screen.getAllByRole("spinbutton");
    fireEvent.change(quantities[0], { target: { value: "3" } });
    fireEvent.change(quantities[1], { target: { value: "8" } });
    const classifications = screen.getAllByRole("group", { name: "보관 분류" });
    fireEvent.click(within(classifications[0]).getByRole("button", { name: "B급" }));
    fireEvent.click(within(classifications[1]).getByRole("button", { name: "구형" }));
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));

    const dialog = await screen.findByRole("dialog");
    const confirmLines = screen.getAllByTestId("mobile-defect-confirm-line");
    expect(confirmLines[0]).toHaveTextContent("외관 불량 · 수량 3 · B급");
    expect(confirmLines[1]).toHaveTextContent("외관 불량 · 수량 8 · 구형");
    expect(dialog).not.toHaveTextContent(/사유 \d+/);
    expect(confirmLines[0].parentElement).toHaveTextContent("Mock item튜브 · 총 3 EA · 1건");
    expect(confirmLines[1].parentElement).toHaveTextContent("Mock second item조립 · 총 8 EA · 1건");
    expect(dialog).not.toHaveTextContent("자동 부서");
  });

  it("[8.7-05] 모바일 즉시 폐기 확인은 설명 없이 품목·수량·실제 부서를 강조한다", async () => {
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));

    const dialog = await screen.findByRole("dialog");
    const confirmLine = screen.getByTestId("mobile-defect-confirm-line");
    expect(confirmLine).toHaveClass("rounded-[14px]", "border", "px-3", "py-2.5");
    expect(confirmLine).toHaveTextContent("Mock item수량 1·튜브");
    expect(dialog).not.toHaveTextContent("입출고 내역에서 취소·복구할 수 있습니다");
    expect(dialog).not.toHaveTextContent("되돌릴 수 없습니다");
    expect(dialog).not.toHaveTextContent("자동 부서");
    expect(dialog).not.toHaveTextContent("관리 분류");
  });

  it("모바일 폐기 성공 후 품목 재조회 완료를 기다리지 않고 완료 화면으로 이동한다", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(new Promise<void>(() => {}));
    const onDone = vi.fn();
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={onDone} onCancel={() => {}} />,
      queryClient,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 폐기" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["items"] }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("모바일 즉시 재작업 확인에는 관리 분류 없이 품목·수량·부서만 표시한다", async () => {
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /BOM 확인/ }));
    fireEvent.click(await screen.findByRole("button", { name: "set tree decision" }));
    fireEvent.click(screen.getByRole("button", { name: "재작업 실행 확인 →" }));

    const dialog = await screen.findByRole("dialog");
    expect(screen.getByTestId("mobile-defect-confirm-line")).toHaveTextContent("Mock item수량 1·튜브");
    expect(dialog).not.toHaveTextContent("자동 부서");
    expect(dialog).not.toHaveTextContent("관리 분류");
  });

  it("restores direct action selection instead of the removed department step on browser back", () => {
    render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent(window, new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", step: 1 } }));

    expect(screen.getByRole("heading", { name: "작업 선택" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 / 4")).toBeInTheDocument();
  });

  it("격리 등록의 출처와 품목 선택은 작업 선택에 이어진 두 번째와 세 번째 단계다", () => {
    render(
      <MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByRole("heading", { name: "출처 선택" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByRole("heading", { name: "품목 선택" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 / 4")).toBeInTheDocument();
  });

  it("restores a rework BOM history entry to the rework item picker when its cart line is unavailable", () => {
    window.history.replaceState({ defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 3 }, "");
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByTestId("defect-item-picker")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ directAction: "rework", source: "production", step: 2 });
  });

  it("uses a compact process header on the BOM confirmation step", () => {
    const { container } = render(
      <MobileDefectProcessPanel
        location={location}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(container.querySelectorAll("button")[6]);
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    expect(screen.getByText("Step 2 / 2")).toBeInTheDocument();
  });

  it("BOM 단계가 없는 불량 처리는 한 단계만 표시한다", () => {
    render(<MobileDefectProcessPanel location={{ ...location, has_bom: false }} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);

    expect(screen.getByRole("heading", { name: "처리 선택" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 / 1")).toBeInTheDocument();
    expect(screen.queryByText("STEP 1 / 2")).not.toBeInTheDocument();
  });

  it("keeps the item picker usable after a cart item is added", () => {
    render(
      <MobileDefectCartFlow
        mode="add"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음|Next/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));

    expect(screen.getByTestId("mobile-defect-picker-pane")).toHaveClass("flex-1", "min-h-0");
    expect(screen.queryByTestId("mobile-defect-cart-scroll")).not.toBeInTheDocument();
  });

  it("[8.5-07] 모바일도 사유 카테고리와 메모가 모두 없으면 다음 진행을 막는다", () => {
    render(
      <MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));

    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    expect(screen.getByRole("button", { name: /격리하기 \(1건\)/ })).toBeDisabled();
    expect(screen.getByText("사유 카테고리를 선택하세요.")).toBeInTheDocument();
  });

  it("[8.10-05] 모바일 복수 품목 오류를 모두 표시하고 확인창과 API를 차단한다", () => {
    render(
      <MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(2건\)/ }));
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    const quantities = screen.getAllByRole("spinbutton");
    fireEvent.change(quantities[0], { target: { value: "21" } });
    fireEvent.change(quantities[1], { target: { value: "22" } });

    const submit = screen.getByRole("button", { name: /격리하기 \(2건\)/ });
    expect(submit).toBeDisabled();
    expect(screen.getByText("튜브 가용 20개보다 1개 많습니다.")).toBeInTheDocument();
    expect(screen.getByText("조립 가용 20개보다 2개 많습니다.")).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(defectsApi.quarantine).not.toHaveBeenCalled();
    expect(defectsApi.quarantineBulk).not.toHaveBeenCalled();
  });

  it("[8.10-05] 모바일 유효한 복수 격리는 하나의 원자적 bulk 요청으로 제출한다", async () => {
    render(
      <MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(2건\)/ }));
    screen.getAllByRole("button", { name: "사유 선택" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "격리하기" }));

    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(1));
    expect(defectsApi.quarantine).not.toHaveBeenCalled();
  });

  it("opens confirmation before mobile normal recovery and calls unquarantine once after confirmation", async () => {
    vi.mocked(defectsApi.unquarantine).mockResolvedValueOnce(undefined);
    const onDone = vi.fn();
    const { container } = render(
      <MobileDefectProcessPanel
        location={location}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    expect(defectsApi.unquarantine).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(defectsApi.unquarantine).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("sends the defect_disassemble payload after a BOM rework tree is confirmed", async () => {
    vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValueOnce({} as never);
    const { container } = render(
      <MobileDefectProcessPanel
        location={location}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(container.querySelectorAll("button")[6]);
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "set tree decision" }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(stockRequestsApi.createStockRequest).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(stockRequestsApi.createStockRequest).mock.calls[0][0];
    expect(payload).toMatchObject({
      request_type: "defect_disassemble",
      lines: [expect.objectContaining({ record_id: "record-1", item_id: "item-1", quantity: 3, from_bucket: "defective" })],
    });
    expect(JSON.parse(payload.notes ?? "{}")).toEqual({
      child_decisions: [{ child_item_id: "child-1", action: "recover" }],
    });
  });
});
