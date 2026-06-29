import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { DefectCartFlow } from "../DefectCartFlow";
import type { Item, ProductModel } from "../../_warehouse_v2/types";

// DefectCartFlow 내부의 DefectItemPicker 가 useMyItemOrderQuery(React Query)를 쓴다 → QueryClient 주입.
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

import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";

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

const rItem = makeItem({ item_id: "r-1", mes_code: "3-AR-0001", item_name: "원자재A" });
const fItem = makeItem({ item_id: "f-1", mes_code: "3-AF-0002", item_name: "완제품B" });

const productModels: ProductModel[] = [];
const employee = { employee_id: "emp-1", name: "테스터", department: "조립" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.quarantine).mockResolvedValue(undefined);
  vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValue(undefined as never);
});

describe("DefectCartFlow", () => {
  it("scrap 모드는 R·비R 모두 노출한다 (rOnly 제한 해제)", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByText("원자재A")).toBeInTheDocument();
    expect(screen.getByText("완제품B")).toBeInTheDocument();
  });

  it("add 모드는 R/비R 모두 노출한다", () => {
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
    expect(screen.getByText("원자재A")).toBeInTheDocument();
    expect(screen.getByText("완제품B")).toBeInTheDocument();
  });

  it("품목 추가 → 수량+사유 입력 → 제출(확인 후) 시 줄마다 quarantine 호출(add)", async () => {
    const onDone = vi.fn();
    render(
      <DefectCartFlow
        mode="add"
        items={[rItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    // Step 1 → Step 2
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    // 표에서 추가
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));

    // 장바구니 줄 등장 — 수량 입력
    fireEvent.change(screen.getByPlaceholderText("예: 3"), { target: { value: "4" } });

    // 사유 카테고리
    const categorySelect = screen.getAllByRole("combobox").find((el) =>
      el.querySelector('option[value="외관 불량"]'),
    );
    fireEvent.change(categorySelect as HTMLSelectElement, { target: { value: "외관 불량" } });

    // 제출 버튼 → ConfirmModal 오픈
    fireEvent.click(screen.getByRole("button", { name: /격리하기.*건/ }));

    // ConfirmModal의 확인 버튼 클릭
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "격리하기" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "격리하기" }));

    await waitFor(() => {
      expect(defectsApi.quarantine).toHaveBeenCalledWith(
        expect.objectContaining({
          item_id: "r-1",
          qty: 4,
          source: "production",
          source_dept: "조립",
          target_dept: "조립",
          reason_category: "외관 불량",
          actor_employee_id: "emp-1",
        }),
      );
      expect(onDone).toHaveBeenCalledOnce();
    });
  });

  it("locks the Step 2 department picker to the Step 1 department", () => {
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

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);

    expect(screen.getByTestId("defect-locked-dept")).toHaveTextContent(employee.department);
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("scrap 제출(확인 후) 시 scrap_normal 요청을 보낸다", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    fireEvent.change(screen.getByPlaceholderText("예: 3"), { target: { value: "2" } });
    const categorySelect = screen.getAllByRole("combobox").find((el) =>
      el.querySelector('option[value="기타"]'),
    );
    fireEvent.change(categorySelect as HTMLSelectElement, { target: { value: "기타" } });

    // 제출 버튼 → ConfirmModal 오픈
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기.*건/ }));

    // ConfirmModal의 확인 버튼 클릭
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

  it("부분 실패 시 실패 줄만 남기고 onDone 호출 안 함", async () => {
    const r2 = makeItem({ item_id: "r-2", mes_code: "3-AR-0003", item_name: "원자재C" });
    vi.mocked(defectsApi.quarantine)
      .mockResolvedValueOnce(undefined) // r-1 성공
      .mockRejectedValueOnce(new Error("재고 부족")); // r-2 실패
    const onDone = vi.fn();
    render(
      <DefectCartFlow
        mode="add"
        items={[rItem, r2]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    // Step 1 → Step 2
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    // 둘 다 추가
    const addButtons = screen.getAllByRole("button", { name: /추가/ });
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /추가/ })[0]);

    // 두 줄 수량/사유
    const qtyInputs = screen.getAllByPlaceholderText("예: 3");
    fireEvent.change(qtyInputs[0], { target: { value: "1" } });
    fireEvent.change(qtyInputs[1], { target: { value: "1" } });
    const catSelects = screen
      .getAllByRole("combobox")
      .filter((el) => el.querySelector('option[value="외관 불량"]'));
    fireEvent.change(catSelects[0] as HTMLSelectElement, { target: { value: "외관 불량" } });
    fireEvent.change(catSelects[1] as HTMLSelectElement, { target: { value: "외관 불량" } });

    // 제출 버튼 → ConfirmModal 오픈
    fireEvent.click(screen.getByRole("button", { name: /격리하기.*건/ }));

    // ConfirmModal의 확인 버튼 클릭
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "격리하기" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "격리하기" }));

    await waitFor(() => {
      expect(defectsApi.quarantine).toHaveBeenCalledTimes(2);
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.getByText(/1건 실패/)).toBeInTheDocument();
    });
  });
});
