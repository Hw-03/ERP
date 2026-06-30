import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { DefectCartFlow } from "../DefectCartFlow";
import type { Item, ProductModel } from "../../_warehouse_v2/types";

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { quarantine: vi.fn() },
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
  return {
    unit: "EA",
    quantity: 100,
    warehouse_qty: 50,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 100,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    model_symbol: null,
    model_slots: [],
    process_type_code: over.mes_code.split("-")[1] ?? "TR",
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.quarantine).mockResolvedValue(undefined);
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

  it("Step 2에서 진입 부서를 헤더 메타로 보여주고 아이템 피커 배지는 숨긴다", () => {
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

    const entryMeta = screen.getByTestId("defect-entry-meta");
    expect(entryMeta).toHaveTextContent(`진입 부서 · ${employee.department}`);
    expect(entryMeta.tagName).toBe("SPAN");
    expect(screen.queryByTestId("defect-locked-dept")).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
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
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

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
  it("scrap 제출 확인 후 scrap_normal 요청을 보낸다", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기" }));

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
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

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
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    expect(screen.queryByText("원자재")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    selectReasonCategory();

    fireEvent.click(screen.getByRole("button", { name: /BOM 확인/ }));
    await waitFor(() => expect(screen.getByTestId("defect-flow-stepper")).toHaveTextContent("BOM 확인"));
    await screen.findByText("하위 품목");

    fireEvent.change(screen.getByLabelText("하위 품목 격리 수량"), { target: { value: "1" } });
    expect(screen.getByLabelText("하위 품목 정상 수량")).toHaveValue(1);

    fireEvent.click(screen.getByRole("button", { name: /즉시 재작업/ }));
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
  });
  it("browser history forward restores Step 2 after returning to Step 1", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /\uB2E4\uC74C/ }));
    expect(screen.getByText(`\uC9C4\uC785 \uBD80\uC11C \u00B7 ${employee.department}`)).toBeInTheDocument();

    fireEvent(
      window,
      new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", step: 1 } }),
    );
    expect(screen.queryByText(`\uC9C4\uC785 \uBD80\uC11C \u00B7 ${employee.department}`)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\uBD80\uC11C \uC7AC\uACE0/ })).toBeInTheDocument();

    fireEvent(
      window,
      new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", step: 2 } }),
    );
    expect(screen.getByText(`\uC9C4\uC785 \uBD80\uC11C \u00B7 ${employee.department}`)).toBeInTheDocument();
    expect(screen.getByText("\uC6D0\uC790\uC7AC")).toBeInTheDocument();
  });
});
