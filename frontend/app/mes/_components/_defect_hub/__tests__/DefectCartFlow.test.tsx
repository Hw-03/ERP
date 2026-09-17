import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { DefectCartFlow } from "../DefectCartFlow";
import type { Item, ProductModel } from "../../_warehouse_v2/types";

function render(ui: ReactElement, client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })) {
  return {
    ...rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
    queryClient: client,
  };
}

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { quarantine: vi.fn(), quarantineBulk: vi.fn() },
}));
vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: { createStockRequest: vi.fn() },
}));
vi.mock("@/lib/api/dept-adjustment", () => ({
  deptAdjustmentApi: { getBomTemplate: vi.fn() },
}));

import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";

function makeItem(over: Partial<Item> & { item_id: string; mes_code: string; item_name: string }): Item {
  const processTypeCode = over.process_type_code ?? over.mes_code.split("-")[1] ?? "TR";
  const departmentByLetter: Record<string, string> = {
    T: "튜브", H: "고압", V: "진공", N: "튜닝", A: "조립", P: "출하",
  };
  const department = departmentByLetter[processTypeCode[0] ?? ""];
  return {
    unit: "EA",
    quantity: 100,
    warehouse_qty: 50,
    production_total: department ? 100 : 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 100,
    last_reserver_name: null,
    location: null,
    locations: department
      ? [{ department, status: "PRODUCTION", quantity: 100, pending_quantity: 0, available_quantity: 100 }]
      : [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    model_symbol: null,
    model_slots: [],
    process_type_code: processTypeCode,
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    department: null,
    ...over,
  } as unknown as Item;
}

const rItem = makeItem({ item_id: "r-1", mes_code: "3-AR-0001", item_name: "원자재" });
const fItem = makeItem({ item_id: "f-1", mes_code: "3-AF-0002", item_name: "완제품" });
const assemblyWithoutBom = makeItem({ item_id: "aa-no-bom", mes_code: "6-AA-0038", item_name: "BOM 없는 조립품" });
const productModels: ProductModel[] = [];
const employee = { employee_id: "emp-1", name: "테스터", department: "조립" };
function selectReasonCategory(label = "기타") {
  const categoryCombobox = screen.getAllByRole("combobox").find((el) =>
    el.textContent?.includes("카테고리 선택") || el.textContent?.includes(label),
  );
  expect(categoryCombobox).toBeTruthy();
  fireEvent.click(categoryCombobox as HTMLElement);
  fireEvent.mouseDown(screen.getByRole("option", { name: label }));
}

function enterReasonMemos(value = "회귀 테스트 사유") {
  screen.getAllByPlaceholderText(/스크래치 다수/).forEach((field) => {
    fireEvent.change(field, { target: { value } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "");
  vi.mocked(defectsApi.quarantine).mockResolvedValue(undefined);
  vi.mocked(defectsApi.quarantineBulk).mockResolvedValue(undefined as never);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue(undefined as never);
  vi.mocked(deptAdjustmentApi.getBomTemplate).mockResolvedValue({
    lines: [
      { item_id: "f-1", item_name: "완제품", mes_code: "3-AF-0002", process_type_code: "AF", quantity: 1, has_children: true },
      { item_id: "child-1", item_name: "하위 품목", mes_code: "3-AR-0003", process_type_code: "AR", quantity: 2, has_children: false },
    ],
  });
});

describe("DefectCartFlow", () => {
  it("scrap 모드에서 R과 비R 품목을 모두 보여준다", () => {
    render(
      <DefectCartFlow
        mode="scrap"
        items={[rItem, fItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    expect(screen.getByText("원자재")).toBeInTheDocument();
    expect(screen.getByText("완제품")).toBeInTheDocument();
  });

  it("출처 선택은 기본 생산으로 같은 크기의 부서·창고 재고 카드만 보여준다", () => {
    render(
      <DefectCartFlow
        mode="add"
        items={[rItem, fItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getAllByText("출처 선택")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /부서 재고/ })).toHaveClass("h-full");
    expect(screen.getByRole("button", { name: /창고 재고/ })).toHaveClass("h-full");
    expect(screen.getByRole("button", { name: /부서 재고/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /창고 재고/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("출처·격리 부서")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
  });

  it("이전 역할 기반 defaultSource가 전달되어도 생산 출처로 시작한다", () => {
    const legacySource = { defaultSource: "warehouse" } as unknown as Record<string, never>;
    const productionOnly = { ...rItem, item_id: "production-only", item_name: "생산 전용", warehouse_qty: 0 };
    render(
      <DefectCartFlow
        {...legacySource}
        mode="add"
        items={[productionOnly]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByText("생산 전용")).toBeInTheDocument();
  });

  it("생산 격리는 품목 공정 코드의 자동 부서를 payload와 장바구니에 쓴다", async () => {
    const tubeItem = makeItem({ item_id: "t-1", mes_code: "3-TR-0001", item_name: "튜브 원자재", process_type_code: "TR" });
    render(
      <DefectCartFlow
        mode="add"
        items={[tubeItem, fItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "튜브 원자재 장바구니에 추가" }));

    expect(screen.getAllByText("자동 부서 · 조립").length).toBeGreaterThan(0);
    expect(screen.getAllByText("자동 부서 · 튜브").length).toBeGreaterThan(0);
    enterReasonMemos();

    fireEvent.click(screen.getByRole("button", { name: /격리하기/ }));
    fireEvent.click(await screen.findByRole("button", { name: "격리하기" }));

    await waitFor(() => {
      expect(defectsApi.quarantineBulk).toHaveBeenCalledWith(expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ item_id: "f-1", source_dept: "조립", target_dept: "조립" }),
          expect.objectContaining({ item_id: "t-1", source_dept: "튜브", target_dept: "튜브" }),
        ]),
      }));
    });
  });

  it("바로 재작업은 출처 단계를 건너뛰고 품목 선택으로 연다", () => {
    render(
      <DefectCartFlow
        mode="scrap"
        items={[{ ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));

    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(screen.queryByText("출처 선택")).not.toBeInTheDocument();
    expect(screen.getByTestId("defect-flow-stepper")).toHaveTextContent("1작업 선택2품목 선택3BOM 확인");
  });

  it("품목을 추가하면 Check 기반 담김 상태와 선택 행 강조를 보여준다", () => {
    render(
      <DefectCartFlow
        mode="add"
        items={[rItem, fItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /추가/ })[0]);

    const addedButton = screen.getByRole("button", { name: /장바구니에서 제거/ });
    expect(addedButton).toHaveTextContent("담김");
    expect(screen.getByTestId("defect-picker-row-r-1")).toHaveAttribute("data-added", "true");
    expect(screen.getByText("장바구니 1건")).toBeInTheDocument();

    fireEvent.click(addedButton);

    expect(screen.queryByRole("button", { name: /장바구니에서 제거/ })).not.toBeInTheDocument();
    expect(screen.getByText("장바구니 0건")).toBeInTheDocument();
  });

  it("바로 재작업 Step 2에서 진행 표시와 좌우 툴바/카드 구조를 보여준다", () => {
    render(
      <DefectCartFlow
        mode="scrap"
        items={[{ ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));

    const stepper = screen.getByTestId("defect-flow-stepper");
    const stepGrid = screen.getByTestId("defect-step2-grid");
    const pickerPane = screen.getByTestId("defect-picker-pane");
    const cartPane = screen.getByTestId("defect-cart-pane");
    const pickerTable = screen.getByTestId("defect-picker-table");
    const cartPanel = screen.getByTestId("defect-cart-panel");

    expect(stepper).toBeInTheDocument();
    expect(stepper).toHaveClass("text-base");
    expect(stepGrid.className).not.toContain("items-start");
    expect(pickerPane).toHaveClass("h-full", "min-h-0");
    expect(cartPane).toHaveClass("h-full", "min-h-0");
    expect(screen.getByTestId("defect-picker-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("defect-side-toolbar")).toHaveTextContent("재작업 품목");
    expect(pickerTable).toHaveClass("flex-1", "overflow-y-auto");
    expect(cartPanel).toHaveClass("flex-1", "overflow-y-auto");
  });
  it("[8.7-05] 즉시 폐기 확인은 대상·수량·실제 부서를 강조하고 취소 시 요청 없이 닫힌다", async () => {
    render(
      <DefectCartFlow
        mode="scrap"
        items={[rItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "2" } });
    selectReasonCategory();

    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "즉시 폐기" })).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog");
    const confirmLine = screen.getByTestId("defect-confirm-line");
    expect(confirmLine).toHaveClass("rounded-[14px]", "border", "px-4", "py-3");
    expect(confirmLine).toHaveTextContent("원자재");
    expect(confirmLine).toHaveTextContent("수량 2");
    expect(confirmLine).toHaveTextContent("조립");
    expect(dialog).not.toHaveTextContent("입출고 내역에서 취소·복구할 수 있습니다");
    expect(dialog).not.toHaveTextContent("되돌릴 수 없습니다");
    expect(dialog).not.toHaveTextContent("자동 부서");
    expect(dialog).not.toHaveTextContent("관리 분류");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stockRequestsApi.createStockRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기/ }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 폐기" }));

    await waitFor(() => {
      expect(stockRequestsApi.createStockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "scrap_normal",
          lines: [
            expect.objectContaining({
              item_id: "r-1",
              quantity: 2,
              from_bucket: "production",
              from_department: "조립",
              to_bucket: "none",
            }),
          ],
        }),
      );
    });
  });

  it("격리 등록은 줄의 B급 분류를 quarantine payload로 보낸다", async () => {
    render(
      <DefectCartFlow
        mode="add"
        items={[rItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    fireEvent.click(screen.getByRole("button", { name: "B급" }));
    selectReasonCategory();
    fireEvent.click(screen.getByRole("button", { name: /격리하기/ }));
    fireEvent.click(await screen.findByRole("button", { name: "격리하기" }));

    await waitFor(() => {
      expect(defectsApi.quarantine).toHaveBeenCalledWith(expect.objectContaining({
        management_category: "B_GRADE",
      }));
    });
  });

  it("최종 격리 확인을 품목별 카드로 나눠 수량·분류·부서를 간결하게 표시한다", async () => {
    const tubeItem = makeItem({ item_id: "confirm-tube", mes_code: "3-TR-0002", item_name: "확인 튜브", process_type_code: "TR" });
    render(
      <DefectCartFlow mode="add" items={[fItem, tubeItem]} productModels={productModels} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "확인 튜브 장바구니에 추가" }));
    const quantities = screen.getAllByPlaceholderText(/예: 3/);
    fireEvent.change(quantities[0], { target: { value: "2" } });
    fireEvent.change(quantities[1], { target: { value: "7" } });
    const classifications = screen.getAllByRole("group", { name: "보관 분류" });
    fireEvent.click(within(classifications[0]).getByRole("button", { name: "B급" }));
    fireEvent.click(within(classifications[1]).getByRole("button", { name: "구형" }));
    enterReasonMemos();
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));

    const dialog = await screen.findByRole("dialog");
    const cards = within(dialog).getAllByTestId("defect-confirm-line");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("완제품");
    expect(cards[0]).toHaveTextContent("2 EA");
    expect(cards[0]).toHaveTextContent("조립");
    expect(cards[0]).toHaveTextContent("B급");
    expect(cards[1]).toHaveTextContent("확인 튜브");
    expect(cards[1]).toHaveTextContent("7 EA");
    expect(cards[1]).toHaveTextContent("튜브");
    expect(cards[1]).toHaveTextContent("구형");
    expect(dialog).not.toHaveTextContent("관리 분류");
    expect(dialog).not.toHaveTextContent("자동 부서");
  });


  it("바로 재작업 품목 선택에는 has_bom=true 품목만 보여준다", () => {
    render(
      <DefectCartFlow
        mode="scrap"
        items={[assemblyWithoutBom, { ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));

    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(screen.queryByText("BOM 없는 조립품")).not.toBeInTheDocument();
  });
  it("바로 재작업 제출 시 rework_normal 요청과 하위 품목 결정을 보낸다", async () => {
    const onDone = vi.fn();
    render(
      <DefectCartFlow
        mode="scrap"
        items={[rItem, { ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));

    expect(screen.queryByText("원자재")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    selectReasonCategory();

    fireEvent.click(screen.getByRole("button", { name: /BOM 확인/ }));
    await waitFor(() => expect(screen.getByTestId("defect-flow-stepper")).toHaveTextContent("BOM 확인"));
    await screen.findByText("하위 품목");

    fireEvent.change(screen.getByLabelText("하위 품목 격리 수량"), { target: { value: "1" } });
    expect(screen.getByLabelText("하위 품목 정상 수량")).toHaveValue(1);

    fireEvent.click(screen.getByRole("button", { name: /즉시 재작업/ }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByTestId("defect-confirm-line")).toHaveTextContent("완제품수량 1·조립");
    expect(dialog).not.toHaveTextContent("자동 부서");
    expect(dialog).not.toHaveTextContent("관리 분류");
    fireEvent.click(await screen.findByRole("button", { name: "즉시 재작업" }));

    await waitFor(() => {
      expect(stockRequestsApi.createStockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "rework_normal",
          notes: expect.stringContaining("child_decisions"),
          lines: [expect.objectContaining({ item_id: "f-1", quantity: 1 })],
        }),
      );
    });
    const payload = vi.mocked(stockRequestsApi.createStockRequest).mock.calls.at(-1)?.[0] as { notes?: string };
    expect(JSON.parse(payload.notes ?? "{}")).toEqual({
      child_decisions: [
        expect.objectContaining({ item_id: "child-1", normal_qty: 1, defective_qty: 1, scrap_qty: 0 }),
      ],
    });
    expect(onDone).toHaveBeenCalledWith("rework");
  });
  it("폐기는 품목에서 출처를 거쳐 바로 처리 선택으로 돌아간다", () => {
    render(
      <DefectCartFlow
        mode="scrap"
        items={[rItem, fItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    expect(window.history.state).toMatchObject({ defect: "cart", mode: "scrap", directAction: "scrap", source: "production", step: 1 });
    fireEvent.click(screen.getByRole("button", { name: /창고 재고/ }));
    expect(window.history.state).toMatchObject({ source: "warehouse", step: 1 });
    fireEvent.click(screen.getByRole("button", { name: /\uB2E4\uC74C/ }));
    expect(screen.getByText("\uC6D0\uC790\uC7AC")).toBeInTheDocument();

    fireEvent(
      window,
      new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", directAction: "scrap", source: "warehouse", step: 1 } }),
    );
    expect(screen.getAllByText("출처 선택")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /창고 재고/ })).toHaveStyle({ borderWidth: "2px" });

    fireEvent(
      window,
      new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", directAction: null, source: "production", step: 1 } }),
    );
    expect(screen.getByRole("heading", { name: "바로 처리" })).toBeInTheDocument();
  });

  it.each([
    [{ defect: "cart", mode: "add", directAction: "scrap", source: "warehouse", step: 2 }, "원자재"],
    [{ defect: "cart", mode: "scrap", directAction: "scrap", source: "warehouse", step: 2 }, "원자재"],
    [{ defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 2 }, "완제품"],
  ] as const)("새로고침 시 유효한 카트 상태 %o를 복원한다", (state, expectedText) => {
    window.history.replaceState(state, "");
    render(
      <DefectCartFlow mode={state.mode} items={[{ ...fItem, has_bom: true }, rItem]} productModels={productModels} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("새로고침 시 직렬화되지 않은 재작업 BOM 단계는 재작업 품목 선택으로 안전 복원한다", () => {
    window.history.replaceState({ defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 3 }, "");
    render(
      <DefectCartFlow mode="scrap" items={[{ ...fItem, has_bom: true }]} productModels={productModels} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ directAction: "rework", source: "production", step: 2 });
  });

  it("새로고침 시 제거된 부서 단계 같은 잘못된 카트 상태는 첫 화면으로 정규화한다", () => {
    window.history.replaceState({ defect: "cart", mode: "add", directAction: "rework", source: "warehouse", step: 3 }, "");
    render(
      <DefectCartFlow mode="add" items={[rItem]} productModels={productModels} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getAllByText("출처 선택")).toHaveLength(2);
    expect(window.history.state).toMatchObject({ mode: "add", directAction: "scrap", source: "production", step: 1 });
  });

  it("[8.5-03][8.7-03][8.8-01][8.10-02] 부서 출처는 자동 부서의 보유·예약·가용 재고를 표시한다", () => {
    const tubeItem = makeItem({
      item_id: "tube-stock",
      mes_code: "8-TR-0002",
      item_name: "텅스텐 필라멘트",
      process_type_code: "TR",
      warehouse_qty: 16,
      pending_quantity: 5,
      locations: [{ department: "튜브", status: "PRODUCTION", quantity: 5, pending_quantity: 1, available_quantity: 4 }],
    });
    render(
      <DefectCartFlow mode="add" items={[tubeItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    expect(screen.getByRole("columnheader", { name: "부서 가용" })).toBeInTheDocument();
    const row = screen.getByTestId("defect-picker-row-tube-stock");
    expect(row).toHaveTextContent("튜브");
    expect(row).toHaveTextContent("보유 5");
    expect(row).toHaveTextContent("예약 1");
    expect(row).toHaveTextContent("가용 4");
    expect(row).not.toHaveTextContent("16");
  });

  it("[8.5-03][8.7-03] 창고 출처는 창고의 보유·예약·가용 재고를 표시한다", () => {
    const warehouseItem = makeItem({
      item_id: "warehouse-stock",
      mes_code: "8-TR-0003",
      item_name: "창고 품목",
      warehouse_qty: 10,
      pending_quantity: 3,
    });
    render(
      <DefectCartFlow mode="add" items={[warehouseItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /창고 재고/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    expect(screen.getByRole("columnheader", { name: "창고 가용" })).toBeInTheDocument();
    const row = screen.getByTestId("defect-picker-row-warehouse-stock");
    expect(row).toHaveTextContent("창고");
    expect(row).toHaveTextContent("보유 10");
    expect(row).toHaveTextContent("예약 3");
    expect(row).toHaveTextContent("가용 7");
  });

  it("[8.5-07] 사유 카테고리와 자유 메모가 모두 없으면 막고 메모만 있어도 허용한다", () => {
    render(
      <DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    const submit = screen.getByRole("button", { name: /격리하기/ });

    expect(submit).toBeDisabled();
    expect(screen.getByText("사유 카테고리 또는 메모 중 하나를 입력하세요.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/스크래치 다수/), { target: { value: "메모만 입력" } });
    expect(submit).toBeEnabled();
  });

  it("[8.10-05] 여러 행이 부족하면 모든 오류를 표시하고 확인창과 API 호출을 전부 차단한다", () => {
    const tubeItem = makeItem({
      item_id: "short-tube",
      mes_code: "8-TR-1001",
      item_name: "부족 튜브",
      locations: [{ department: "튜브", status: "PRODUCTION", quantity: 4, pending_quantity: 1, available_quantity: 3 }],
    });
    const assemblyItem = makeItem({
      item_id: "short-assembly",
      mes_code: "8-AF-1002",
      item_name: "부족 조립",
      locations: [{ department: "조립", status: "PRODUCTION", quantity: 2, pending_quantity: 0, available_quantity: 2 }],
    });
    render(
      <DefectCartFlow mode="add" items={[tubeItem, assemblyItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "부족 튜브 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 조립 장바구니에 추가" }));
    const quantities = screen.getAllByPlaceholderText(/예: 3/);
    fireEvent.change(quantities[0], { target: { value: "4" } });
    fireEvent.change(quantities[1], { target: { value: "3" } });
    enterReasonMemos();

    const submit = screen.getByRole("button", { name: /격리하기 \(2건\)/ });
    expect(submit).toBeDisabled();
    expect(screen.getByText("튜브 가용 3개보다 1개 많습니다.")).toBeInTheDocument();
    expect(screen.getByText("조립 가용 2개보다 1개 많습니다.")).toBeInTheDocument();
    fireEvent.click(submit);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(defectsApi.quarantine).not.toHaveBeenCalled();
    expect(defectsApi.quarantineBulk).not.toHaveBeenCalled();
  });

  it("[8.10-05] 유효한 복수 격리는 하나의 원자적 bulk 요청으로 제출한다", async () => {
    render(
      <DefectCartFlow mode="add" items={[rItem, fItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    enterReasonMemos();
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "격리하기" }));

    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(1));
    expect(defectsApi.quarantine).not.toHaveBeenCalled();
    expect(defectsApi.quarantineBulk).toHaveBeenCalledWith(expect.objectContaining({
      actor_employee_id: employee.employee_id,
      lines: expect.arrayContaining([
        expect.objectContaining({ item_id: "r-1", source_dept: "조립", target_dept: "조립" }),
        expect.objectContaining({ item_id: "f-1", source_dept: "조립", target_dept: "조립" }),
      ]),
    }));
  });

  it("[8.7-07] 폐기 성공 후 품목 재조회 완료를 기다리지 않고 완료 화면으로 이동한다", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(new Promise<void>(() => {}));
    const onDone = vi.fn();
    render(
      <DefectCartFlow mode="scrap" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={onDone} onCancel={vi.fn()} />,
      queryClient,
    );
    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    selectReasonCategory();
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 폐기" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["items"] }));
    expect(onDone).toHaveBeenCalledWith("scrap");
  });
});
