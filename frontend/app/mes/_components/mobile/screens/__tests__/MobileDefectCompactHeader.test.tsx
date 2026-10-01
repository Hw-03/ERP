import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
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
  DefectItemPicker: ({ onAdd, mobilePresentation }: { onAdd?: (item: unknown) => void; mobilePresentation?: boolean }) => (
    <div data-testid="defect-item-picker" data-mobile-presentation={mobilePresentation}>
      <button
        type="button"
        onClick={() =>
          onAdd?.({
            item_id: "mock-item-1",
            item_name: "Mock item",
            mes_code: "MOCK-001",
            quantity: 10,
            warehouse_qty: 20,
            pending_quantity: 0,
            locations: [{ department: "튜브", status: "PRODUCTION", quantity: 20, pending_quantity: 0, available_quantity: 20 }],
            has_bom: true,
            process_type_code: "TR",
          })
        }
      >
        mock add
      </button>
      <button
        type="button"
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
  ReasonFormFields: ({ memo, onCategoryChange, onMemoChange }: { memo: string; onCategoryChange: (category: string) => void; onMemoChange: (memo: string) => void }) => (
    <><button type="button" onClick={() => onCategoryChange("기타")}>사유 선택</button><textarea aria-label="품목 메모" value={memo} onChange={(event) => onMemoChange(event.target.value)} /></>
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
  window.history.replaceState({}, "");
  vi.mocked(defectsApi.quarantine).mockResolvedValue(undefined);
  vi.mocked(defectsApi.quarantineBulk).mockResolvedValue(undefined as never);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue(undefined as never);
});

describe("mobile defect compact headers", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "아래 줄에 사유 복사" }));
    expect(screen.getByRole("button", { name: mode === "add" ? /격리하기 \(2건\)/ : /즉시 폐기 \(2건\)/ })).toBeEnabled();
    act(() => window.history.back());
    await screen.findByTestId("defect-item-picker");
    act(() => window.history.forward());
    await screen.findByRole("heading", { name: "수량 조정" });
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(7);
    expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(1);
    expect(screen.getAllByRole("textbox", { name: "품목 메모" })[1]).toHaveValue("입력 보존");
  });

  it("모두 삭제하면 제출을 막고 품목 선택으로 돌아갈 수 있다", async () => {
    render(<MobileDefectCartFlow mode="add" initialAction="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /수량 조정 \(1건\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByRole("button", { name: /격리하기 \(0건\)/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "품목 선택으로 돌아가기" }));
    expect(await screen.findByTestId("defect-item-picker")).toBeInTheDocument();
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
    expect(confirmLines[0]).toHaveTextContent("Mock item수량 3·튜브B급");
    expect(confirmLines[1]).toHaveTextContent("Mock second item수량 8·조립구형");
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
    expect(screen.getByText("사유 카테고리 또는 메모 중 하나를 입력하세요.")).toBeInTheDocument();
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
