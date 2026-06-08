import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { AddQuarantineModal } from "../AddQuarantineModal";
import type { Item } from "@/lib/api/types";

// AddQuarantineModal 이 useMyItemOrderQuery(React Query)를 쓴다 → QueryClient 주입.
function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    quarantine: vi.fn(),
  },
}));

vi.mock("@/lib/api/items", () => ({
  itemsApi: {
    getItems: vi.fn(),
    getMyItemOrder: vi.fn(),
  },
}));

import { defectsApi } from "@/lib/api/defects";
import { itemsApi } from "@/lib/api/items";

const mockItem = {
  item_id: "item-001",
  item_name: "전극(70kV)",
  mes_code: "7-TR-0001",
  unit: "EA",
  quantity: 100,
  warehouse_qty: 50,
  production_total: 50,
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
  process_type_code: "TR",
  serial_no: null,
  bom_completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  department: null,
} as unknown as Item;

const mockEmployee = {
  employee_id: "emp-001",
  name: "테스터",
  department: "조립",
};

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  currentEmployee: mockEmployee,
  onSubmitted: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.quarantine).mockResolvedValue(undefined);
  vi.mocked(itemsApi.getItems).mockResolvedValue([mockItem]);
  vi.mocked(itemsApi.getMyItemOrder).mockResolvedValue([]);
});

describe("AddQuarantineModal", () => {
  it("open=false 면 아무것도 렌더하지 않는다", () => {
    render(<AddQuarantineModal {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("열렸을 때 제목과 기본 필드가 보인다", () => {
    render(<AddQuarantineModal {...defaultProps} />);
    expect(screen.getByText("새 불량 추가")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/품목 코드 또는 이름 검색/)).toBeInTheDocument();
    expect(screen.getByText(/창고 재고/)).toBeInTheDocument();
    expect(screen.getByText(/부서 재고/)).toBeInTheDocument();
  });

  it("초기 상태에서 [격리하기] 버튼은 비활성", () => {
    render(<AddQuarantineModal {...defaultProps} />);
    const submitBtn = screen.getByText(/격리하기/);
    expect(submitBtn).toBeDisabled();
  });

  it("품목 검색 → 결과 클릭 → 선택 표시 + 검색창 사라짐", async () => {
    render(<AddQuarantineModal {...defaultProps} />);

    const search = screen.getByPlaceholderText(/품목 코드 또는 이름 검색/);
    fireEvent.change(search, { target: { value: "전극" } });

    await waitFor(() => {
      expect(itemsApi.getItems).toHaveBeenCalled();
    });

    const result = await screen.findByText("전극(70kV)");
    fireEvent.click(result);

    // 선택된 품목 표시 + [변경] 버튼 노출
    expect(screen.getByText("변경")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/품목 코드 또는 이름 검색/)).toBeNull();
  });

  it("품목 선택 + 카테고리 + 수량 입력 시 [격리하기] 활성화", async () => {
    render(<AddQuarantineModal {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText(/품목 코드 또는 이름 검색/), {
      target: { value: "전극" },
    });
    fireEvent.click(await screen.findByText("전극(70kV)"));

    // 사유 카테고리
    const categorySelect = screen.getAllByRole("combobox").find((el) =>
      el.querySelector('option[value="외관 불량"]'),
    );
    expect(categorySelect).toBeTruthy();
    fireEvent.change(categorySelect as HTMLSelectElement, { target: { value: "외관 불량" } });

    // 수량
    const qtyInput = screen.getByPlaceholderText("예: 3");
    fireEvent.change(qtyInput, { target: { value: "3" } });

    const submitBtn = screen.getByText(/격리하기/);
    expect(submitBtn).not.toBeDisabled();
  });

  it("제출 시 defectsApi.quarantine 호출 (창고 출처 → source=warehouse, source_dept 없음)", async () => {
    render(<AddQuarantineModal {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText(/품목 코드 또는 이름 검색/), {
      target: { value: "전극" },
    });
    fireEvent.click(await screen.findByText("전극(70kV)"));

    const categorySelect = screen.getAllByRole("combobox").find((el) =>
      el.querySelector('option[value="기능 불량"]'),
    );
    fireEvent.change(categorySelect as HTMLSelectElement, { target: { value: "기능 불량" } });

    fireEvent.change(screen.getByPlaceholderText("예: 3"), { target: { value: "5" } });

    fireEvent.click(screen.getByText(/격리하기/));

    await waitFor(() => {
      expect(defectsApi.quarantine).toHaveBeenCalledOnce();
      expect(defectsApi.quarantine).toHaveBeenCalledWith(
        expect.objectContaining({
          item_id: "item-001",
          qty: 5,
          source: "warehouse",
          source_dept: undefined,
          target_dept: "조립",
          reason_category: "기능 불량",
          actor_employee_id: "emp-001",
        }),
      );
    });
  });

  it("부서 재고 출처 선택 시 source=production + source_dept=target_dept", async () => {
    render(<AddQuarantineModal {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText(/품목 코드 또는 이름 검색/), {
      target: { value: "전극" },
    });
    fireEvent.click(await screen.findByText("전극(70kV)"));

    // 부서 재고 라디오
    fireEvent.click(screen.getByDisplayValue("production"));

    const categorySelect = screen.getAllByRole("combobox").find((el) =>
      el.querySelector('option[value="치수 불량"]'),
    );
    fireEvent.change(categorySelect as HTMLSelectElement, { target: { value: "치수 불량" } });

    fireEvent.change(screen.getByPlaceholderText("예: 3"), { target: { value: "2" } });

    fireEvent.click(screen.getByText(/격리하기/));

    await waitFor(() => {
      expect(defectsApi.quarantine).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "production",
          source_dept: "조립",
          target_dept: "조립",
        }),
      );
    });
  });

  it("성공 후 onSubmitted + onClose 호출된다", async () => {
    const onSubmitted = vi.fn();
    const onClose = vi.fn();
    render(<AddQuarantineModal {...defaultProps} onSubmitted={onSubmitted} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText(/품목 코드 또는 이름 검색/), {
      target: { value: "전극" },
    });
    fireEvent.click(await screen.findByText("전극(70kV)"));

    const categorySelect = screen.getAllByRole("combobox").find((el) =>
      el.querySelector('option[value="기타"]'),
    );
    fireEvent.change(categorySelect as HTMLSelectElement, { target: { value: "기타" } });
    fireEvent.change(screen.getByPlaceholderText("예: 3"), { target: { value: "1" } });

    fireEvent.click(screen.getByText(/격리하기/));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("[취소] 클릭 시 onClose 호출된다", () => {
    const onClose = vi.fn();
    render(<AddQuarantineModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("취소"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
