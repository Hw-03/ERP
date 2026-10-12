import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { DefectCartFlow } from "../DefectCartFlow";
import type { Item, ProductModel } from "../../_warehouse_v2/types";
import { DesktopHomeHarness } from "../../__tests__/DesktopHomeHarness";

function render(ui: ReactElement, client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })) {
  return {
    ...rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
    queryClient: client,
  };
}

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { quarantine: vi.fn(), quarantineBulk: vi.fn(), listReasonCategories: vi.fn() },
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
async function selectReasonCategory(label = "외관 불량") {
  const categoryButton = screen.getAllByRole("button", { name: "사유 카테고리 선택" }).find((el) =>
    el.textContent?.includes("카테고리 선택") || el.textContent?.includes(label),
  );
  expect(categoryButton).toBeTruthy();
  fireEvent.click(categoryButton as HTMLElement);
  fireEvent.click(await screen.findByRole("button", { name: label, exact: true }));
}

async function enterReasonMemos(value = "회귀 테스트 사유") {
  for (const button of screen.getAllByRole("button", { name: "사유 카테고리 선택" })) {
    if (!button.textContent?.includes("카테고리 선택")) continue;
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: "외관 불량", exact: true }));
  }
  screen.getAllByPlaceholderText(/스크래치 다수/).forEach((field) => {
    fireEvent.change(field, { target: { value } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(defectsApi.listReasonCategories).mockResolvedValue([
    { category_id: "surface-id", name: "외관 불량", is_active: true, is_other: false },
    { category_id: "other-id", name: "기타", is_active: true, is_other: true },
  ]);
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
  it("격리 확인은 네 사유의 열과 메모를 보여주고 취소하면 입력을 보존한다", async () => {
    render(<DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    for (let index = 1; index < 4; index++) fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    await enterReasonMemos("");
    const quantities = screen.getAllByPlaceholderText(/예: 3/);
    quantities.forEach((field, index) => fireEvent.change(field, { target: { value: String(index + 1) } }));
    const memo = "첫 줄 확인 메모\n둘째 줄 긴 메모 내용도 그대로 보존";
    fireEvent.change(screen.getAllByPlaceholderText(/스크래치 다수/)[0], { target: { value: memo } });
    fireEvent.click(within(screen.getAllByRole("group", { name: "보관 분류" })[1]).getByRole("button", { name: "B급" }));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(4건\)/ }));

    const dialog = await screen.findByRole("dialog");
    ["수량", "사유 카테고리", "보관 분류", "메모"].forEach((name) => expect(within(dialog).getByRole("columnheader", { name })).toBeInTheDocument());
    const reasons = within(dialog).getAllByTestId("defect-confirm-line");
    expect(reasons).toHaveLength(4);
    expect(reasons[0].textContent).toContain(memo);
    expect(reasons[1]).toHaveTextContent("2 EA");
    expect(reasons[1]).toHaveTextContent("외관 불량");
    expect(reasons[1]).toHaveTextContent("B급");
    expect(within(dialog).getAllByLabelText("메모 없음")).toHaveLength(3);
    expect(within(dialog).getAllByLabelText("메모 없음")[0]).toHaveTextContent("—");
    expect(dialog).toHaveTextContent("총 10 EA · 4건");
    expect(dialog).not.toHaveTextContent(/사유 \d+/);
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/예: 3/).map((field) => (field as HTMLInputElement).value)).toEqual(["1", "2", "3", "4"]);
    expect(screen.getAllByPlaceholderText(/스크래치 다수/)[0]).toHaveValue(memo);
    expect(defectsApi.quarantine).not.toHaveBeenCalled();
    expect(defectsApi.quarantineBulk).not.toHaveBeenCalled();
  });

  it("격리 사유는 번호·복사 행 없이 기존 크기의 입력을 두 줄로 묶는다", async () => {
    render(<DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    await enterReasonMemos();
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    const group = screen.getByTestId("defect-quarantine-item-group");
    expect(within(group).queryAllByText(/^사유 \d+$/)).toHaveLength(0);
    expect(within(group).queryByRole("button", { name: /사유 복사/ })).not.toBeInTheDocument();
    expect(within(group).getByText("3-AR-0001 · 조립")).toBeInTheDocument();
    const line = within(group).getByRole("group", { name: "원자재 사유 1", exact: true });
    const quantity = within(line).getByRole("spinbutton", { name: "수량" });
    const category = within(line).getByRole("button", { name: "사유 카테고리 선택" });
    const remove = within(line).getByRole("button", { name: "원자재 사유 1 삭제" });
    expect(quantity).toHaveClass("min-h-11", "w-20", "text-sm");
    expect(remove).toHaveClass("h-11", "w-11");
    expect(quantity.parentElement?.parentElement).toBe(category.parentElement?.parentElement);
    expect(remove.parentElement?.parentElement).toBe(category.parentElement?.parentElement);
    expect(within(line).queryByRole("button", { name: "다른 사유 추가" })).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "다른 사유 추가" }).closest("fieldset")).toBe(
      within(group).getByRole("group", { name: "원자재 사유 2", exact: true }),
    );
    expect(within(line).getByRole("textbox", { name: "메모" })).toHaveAttribute("rows", "2");
    fireEvent.click(screen.getByRole("button", { name: "원자재 사유 2 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(1건\)/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toHaveTextContent(/사유 \d+/);
    expect(dialog).toHaveTextContent("1 EA");
    expect(dialog).toHaveTextContent("외관 불량");
  });

  it("같은 품목의 세 사유를 한 카드에 담고 합계와 중간 삭제 후 입력을 유지한다", async () => {
    render(<DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "3" } });
    await enterReasonMemos("첫 사유");
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    let quantities = screen.getAllByPlaceholderText(/예: 3/);
    expect(quantities[1]).toHaveFocus();
    expect(screen.getAllByPlaceholderText(/스크래치 다수/)[1]).toHaveValue("");
    expect(screen.getAllByRole("button", { name: "사유 카테고리 선택" })[1]).toHaveTextContent("카테고리 선택");
    fireEvent.change(quantities[1], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    quantities = screen.getAllByPlaceholderText(/예: 3/);
    fireEvent.change(quantities[2], { target: { value: "3" } });
    fireEvent.change(screen.getAllByPlaceholderText(/스크래치 다수/)[2], { target: { value: "마지막 사유" } });
    const group = screen.getByTestId("defect-quarantine-item-group");
    expect(group).toHaveTextContent("총 10 EA · 3건");
    expect(screen.getAllByTestId("defect-quarantine-item-group")).toHaveLength(1);
    expect(screen.getByTestId("defect-side-toolbar")).toHaveTextContent("장바구니 1품목 · 3건");
    fireEvent.click(screen.getByRole("button", { name: "원자재 담긴 사유 3건 보기" }));
    expect(screen.getAllByPlaceholderText(/예: 3/)).toHaveLength(3);
    fireEvent.click(within(group).getByRole("button", { name: "원자재 사유 2 삭제" }));
    expect(screen.getAllByPlaceholderText(/예: 3/).map((field) => (field as HTMLInputElement).value)).toEqual(["3", "3"]);
    expect(screen.getAllByPlaceholderText(/예: 3/)[1]).toHaveFocus();
    expect(screen.getAllByPlaceholderText(/스크래치 다수/).map((field) => (field as HTMLTextAreaElement).value)).toEqual(["첫 사유", "마지막 사유"]);
    fireEvent.click(screen.getByRole("button", { name: "원자재 사유 2 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "원자재 사유 1 삭제" }));
    expect(screen.getByRole("button", { name: "원자재 장바구니에 추가" })).toHaveFocus();
  });

  it("같은 품목 사유 합계가 가용 재고를 넘으면 제출을 막는다", async () => {
    const stock = { ...rItem, locations: [{ department: "조립", status: "PRODUCTION", quantity: 5, pending_quantity: 0, available_quantity: 5 }] } as Item;
    render(<DefectCartFlow mode="add" items={[stock]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    fireEvent.change(screen.getAllByPlaceholderText(/예: 3/)[1], { target: { value: "3" } });
    await enterReasonMemos();
    expect(screen.getByText("사유 합계 6개는 조립 가용 5개보다 1개 많습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /격리하기 \(2건\)/ })).toBeDisabled();
  });

  it("격리 처리 중 편집을 잠그고 실패 재시도는 모든 사유와 요청 ID를 유지한다", async () => {
    let rejectRequest!: (error: Error) => void;
    vi.mocked(defectsApi.quarantineBulk).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    render(<DefectCartFlow mode="add" items={[rItem, fItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    fireEvent.change(screen.getAllByPlaceholderText(/예: 3/)[1], { target: { value: "4" } });
    await enterReasonMemos("보존 메모");
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("총 7 EA · 2건");
    expect(within(dialog).getAllByTestId("defect-confirm-line")).toHaveLength(2);
    expect(dialog).toHaveTextContent("외관 불량");
    expect(dialog).toHaveTextContent("보존 메모");
    fireEvent.click(within(dialog).getByRole("button", { name: "격리하기" }));
    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(1));
    screen.getAllByPlaceholderText(/예: 3/).forEach((field) => expect(field).toBeDisabled());
    expect(screen.getByRole("button", { name: "다른 사유 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "원자재 사유 1 삭제" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /사유 복사/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "완제품 장바구니에 추가" })).toBeDisabled();
    rejectRequest(new Error("네트워크 실패"));
    await waitFor(() => expect(screen.getByRole("button", { name: /격리하기 \(2건\)/ })).toBeEnabled());
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(within(screen.getByTestId("defect-cart-panel")).getByRole("alert")).toHaveTextContent("네트워크 실패");
    expect(screen.getAllByText(/네트워크 실패/)).toHaveLength(1);
    expect(screen.queryByText(/2건 실패/)).not.toBeInTheDocument();
    screen.getAllByPlaceholderText(/스크래치 다수/).forEach((field) => expect(field).toHaveValue("보존 메모"));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "격리하기" }));
    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const [first, retry] = vi.mocked(defectsApi.quarantineBulk).mock.calls.map(([payload]) => payload);
    expect(retry).toEqual(first);
    expect(first.lines.map((line) => line.qty)).toEqual([3, 4]);
  });

  it("실패 후 메모 편집은 일괄 오류를 지우고 새 batch ID로 제출한다", async () => {
    vi.mocked(defectsApi.quarantineBulk).mockRejectedValueOnce(new Error("실패"));
    render(<DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    await enterReasonMemos();
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "격리하기" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getAllByPlaceholderText(/스크래치 다수/)[0], { target: { value: "수정 메모" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/스크래치 다수/)[1]).toHaveValue("회귀 테스트 사유");
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "격리하기" }));
    await waitFor(() => expect(defectsApi.quarantineBulk).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(defectsApi.quarantineBulk).mock.calls;
    expect(calls[1][0].client_request_id).not.toBe(calls[0][0].client_request_id);
  });

  it.each(["add", "delete", "quantity", "category", "management"] as const)("격리 일괄 실패 후 %s 변경은 오류를 지우고 입력을 유지한다", async (mutation) => {
    vi.mocked(defectsApi.quarantineBulk).mockRejectedValueOnce(new Error("일괄 처리 실패"));
    render(<DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    await enterReasonMemos("유지 메모");
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "격리하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("일괄 처리 실패");
    if (mutation === "add") fireEvent.click(screen.getByRole("button", { name: "다른 사유 추가" }));
    if (mutation === "delete") fireEvent.click(screen.getByRole("button", { name: "원자재 사유 2 삭제" }));
    if (mutation === "quantity") fireEvent.change(screen.getAllByPlaceholderText(/예: 3/)[0], { target: { value: "2" } });
    if (mutation === "category") {
      fireEvent.click(screen.getAllByRole("button", { name: "사유 카테고리 선택" })[0]);
      fireEvent.click(await screen.findByRole("button", { name: "기타", exact: true }));
    }
    if (mutation === "management") fireEvent.click(screen.getAllByRole("button", { name: "B급" })[0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/스크래치 다수/)[0]).toHaveValue("유지 메모");
  });

  it("즉시 폐기는 기존 사유 복사 버튼과 동작을 유지한다", async () => {
    render(<DefectCartFlow mode="scrap" items={[rItem, fItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    await enterReasonMemos("원본 메모");
    fireEvent.change(screen.getAllByPlaceholderText(/스크래치 다수/)[1], { target: { value: "별도 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "위 사유 복사" }));
    expect(screen.getAllByPlaceholderText(/스크래치 다수/)[1]).toHaveValue("원본 메모");
  });

  it("격리 사유 100건에서 새 품목과 사유 추가를 잠그고 삭제하면 다시 허용한다", () => {
    render(<DefectCartFlow mode="add" items={[rItem, fItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    const addReason = screen.getByRole("button", { name: "다른 사유 추가" });
    const addItem = screen.getByRole("button", { name: "완제품 장바구니에 추가" });
    act(() => {
      for (let index = 1; index < 100; index++) fireEvent.click(addReason);
    });
    expect(screen.getAllByPlaceholderText(/예: 3/)).toHaveLength(100);
    expect(screen.getByRole("button", { name: "다른 사유 추가" })).toBeDisabled();
    expect(addItem).toBeDisabled();
    expect(screen.getByText("한 번에 사유 100건까지 등록할 수 있습니다.")).toBeInTheDocument();
    fireEvent.click(within(screen.getAllByTestId("defect-quarantine-reason-line")[49]).getByRole("button", { name: "원자재 사유 50 삭제" }));
    expect(screen.getByRole("button", { name: "다른 사유 추가" })).toBeEnabled();
    expect(addItem).toBeEnabled();
  }, 30000);
  it("shares a submission ID and keeps it when a failed line is edited and retried", async () => {
    vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error("retry"));
    render(<DefectCartFlow mode="scrap" items={[rItem, fItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    await enterReasonMemos();
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(2건\)/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "즉시 폐기" }));
    await waitFor(() => expect(stockRequestsApi.createStockRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByPlaceholderText(/스크래치 다수/)).toHaveLength(1));
    const [first, failed] = vi.mocked(stockRequestsApi.createStockRequest).mock.calls.map(([payload]) => payload);
    expect(failed.submission_id).toBe(first.submission_id);
    expect(failed.reason_category_id).toBe("surface-id");
    fireEvent.change(screen.getByPlaceholderText(/스크래치 다수/), { target: { value: "수정한 메모" } });
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "즉시 폐기" }));
    await waitFor(() => expect(stockRequestsApi.createStockRequest).toHaveBeenCalledTimes(3));
    expect(vi.mocked(stockRequestsApi.createStockRequest).mock.calls[2][0]).toMatchObject({ submission_id: first.submission_id, client_request_id: failed.client_request_id, reason_category_id: "surface-id", reason_memo: "수정한 메모" });
  });
  it("품목에서 이전 확인을 취소하면 수량·사유를 유지한다", async () => {
    const onCancel = vi.fn();
    render(<DefectCartFlow mode="scrap" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    await enterReasonMemos("보존할 사유");
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("입력 내용이 사라집니다.");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByPlaceholderText(/스크래치 다수/)).toHaveValue("보존할 사유");
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(stockRequestsApi.createStockRequest).not.toHaveBeenCalled();
  });

  it("BOM에서 품목으로 돌아갔다 앞으로 가면 입력한 분류를 유지한다", async () => {
    render(<DefectCartFlow mode="scrap" initialAction="rework" items={[{ ...fItem, has_bom: true }]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    await enterReasonMemos("재작업 사유");
    fireEvent.click(screen.getByRole("button", { name: /BOM 확인/ }));
    await screen.findByText("하위 품목");
    fireEvent.change(screen.getByLabelText("하위 품목 격리 수량"), { target: { value: "1" } });
    fireEvent(window, new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 2 } }));
    expect(screen.getByPlaceholderText(/스크래치 다수/)).toHaveValue("재작업 사유");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent(window, new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 3 } }));
    expect(await screen.findByLabelText("하위 품목 격리 수량")).toHaveValue(1);
  });

  it("불량 작성 단계는 공통 탭 진입 모션을 사용한다", async () => {
    const { container } = render(
      <DefectCartFlow
        mode="add"
        items={[rItem, fItem]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector(".animate-desktop-navigation-enter")).toHaveTextContent("왼쪽에서 품목을 추가하세요.");
  });

  it.each(["add", "scrap"] as const)("%s 작성 입력은 복귀 확인 취소로 보존되고 폐기할 때만 닫힌다", async (mode) => {
    render(<DesktopHomeHarness><DefectCartFlow mode={mode} items={[rItem, fItem]} productModels={productModels}
      currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} /></DesktopHomeHarness>);
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    await enterReasonMemos("미저장 사유");
    fireEvent.click(screen.getByText("현재 메뉴 복귀"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("계속 머무르기"));
    expect(screen.getByPlaceholderText(/스크래치 다수/)).toHaveValue("미저장 사유");
    fireEvent.click(screen.getByText("현재 메뉴 복귀"));
    fireEvent.click(screen.getByText("나가기", { exact: true }));
    expect(screen.getByText("메뉴 첫 화면")).toBeInTheDocument();
    expect(defectsApi.quarantineBulk).not.toHaveBeenCalled();
    expect(stockRequestsApi.createStockRequest).not.toHaveBeenCalled();
  });
  it("scrap 모드에서 R과 비R 품목을 모두 보여준다", async () => {
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


    expect(screen.getByText("원자재")).toBeInTheDocument();
    expect(screen.getByText("완제품")).toBeInTheDocument();
  });


  it("이전 역할 기반 defaultSource가 전달되어도 생산 출처로 시작한다", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "튜브 원자재 장바구니에 추가" }));

    expect(screen.getByText(`${fItem.mes_code} · 조립`)).toBeInTheDocument();
    expect(screen.getByText(`${tubeItem.mes_code} · 튜브`)).toBeInTheDocument();
    await enterReasonMemos();

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

  it("바로 재작업은 출처 단계를 건너뛰고 품목 선택으로 연다", async () => {
    render(
      <DefectCartFlow
        mode="scrap" initialAction="rework"
        items={[{ ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );



    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(screen.queryByText("출처 선택")).not.toBeInTheDocument();
    expect(screen.getByTestId("defect-flow-stepper")).toHaveTextContent("1작업 선택2품목 선택3BOM 확인");
  });

  it("품목을 추가하면 Check 기반 담김 상태와 선택 행 강조를 보여준다", async () => {
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

    fireEvent.click(screen.getAllByRole("button", { name: /추가/ })[0]);

    const addedButton = screen.getByRole("button", { name: "원자재 담긴 사유 1건 보기" });
    expect(addedButton).toHaveTextContent("담김 · 1건");
    expect(screen.getByTestId("defect-picker-row-r-1")).toHaveAttribute("data-added", "true");
    expect(screen.getByText("장바구니 1품목 · 1건")).toBeInTheDocument();

    fireEvent.click(addedButton);

    expect(screen.getByPlaceholderText(/예: 3/)).toHaveFocus();
    expect(screen.getByText("장바구니 1품목 · 1건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "원자재 사유 1 삭제" }));
    expect(screen.getByText("장바구니 0품목 · 0건")).toBeInTheDocument();
  });

  it("바로 재작업 Step 2에서 진행 표시와 좌우 툴바/카드 구조를 보여준다", async () => {
    render(
      <DefectCartFlow
        mode="scrap" initialAction="rework"
        items={[{ ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );



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
    expect(pickerTable).toHaveClass("relative", "min-h-0", "flex-1");
    expect(within(pickerTable).getByTestId("defect-picker-scroll")).toHaveClass("overflow-y-auto", "lg:-right-2.5", "lg:[scrollbar-gutter:stable]");
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

    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "2" } });
    await selectReasonCategory();

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

    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    fireEvent.click(screen.getByRole("button", { name: "B급" }));
    await selectReasonCategory();
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

    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "확인 튜브 장바구니에 추가" }));
    const quantities = screen.getAllByPlaceholderText(/예: 3/);
    fireEvent.change(quantities[0], { target: { value: "2" } });
    fireEvent.change(quantities[1], { target: { value: "7" } });
    const classifications = screen.getAllByRole("group", { name: "보관 분류" });
    fireEvent.click(within(classifications[0]).getByRole("button", { name: "B급" }));
    fireEvent.click(within(classifications[1]).getByRole("button", { name: "구형" }));
    await enterReasonMemos();
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));

    const dialog = await screen.findByRole("dialog");
    const cards = within(dialog).getAllByTestId("defect-confirm-item-group");
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


  it("바로 재작업 품목 선택에는 has_bom=true 품목만 보여준다", async () => {
    render(
      <DefectCartFlow
        mode="scrap" initialAction="rework"
        items={[assemblyWithoutBom, { ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );



    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(screen.queryByText("BOM 없는 조립품")).not.toBeInTheDocument();
  });
  it("바로 재작업 제출 시 rework_normal 요청과 하위 품목 결정을 보낸다", async () => {
    const onDone = vi.fn();
    render(
      <DefectCartFlow
        mode="scrap" initialAction="rework"
        items={[rItem, { ...fItem, has_bom: true }]}
        productModels={productModels}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );



    expect(screen.queryByText("원자재")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    await selectReasonCategory();

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

  it("새로고침 시 직렬화되지 않은 재작업 BOM 단계는 재작업 품목 선택으로 안전 복원한다", async () => {
    window.history.replaceState({ defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 3 }, "");
    render(
      <DefectCartFlow mode="scrap" items={[{ ...fItem, has_bom: true }]} productModels={productModels} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText("완제품")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ directAction: "rework", source: "production", step: 2 });
  });


  it("[8.5-03][8.7-03][8.8-01][8.10-02] 부서 출처는 자동 부서의 보유·예약·가용 재고를 표시한다", async () => {
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


    expect(screen.getByRole("columnheader", { name: "부서 가용" })).toBeInTheDocument();
    const row = screen.getByTestId("defect-picker-row-tube-stock");
    expect(row).toHaveTextContent("튜브");
    expect(row).toHaveTextContent("보유 5");
    expect(row).toHaveTextContent("예약 1");
    expect(row).toHaveTextContent("가용 4");
    expect(row).not.toHaveTextContent("16");
  });

  it("[8.5-03][8.7-03] 창고 출처는 창고의 보유·예약·가용 재고를 표시한다", async () => {
    const warehouseItem = makeItem({
      item_id: "warehouse-stock",
      mes_code: "8-TR-0003",
      item_name: "창고 품목",
      warehouse_qty: 10,
      pending_quantity: 3,
    });
    render(
      <DefectCartFlow mode="add" initialSource="warehouse" items={[warehouseItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );



    expect(screen.getByRole("columnheader", { name: "창고 가용" })).toBeInTheDocument();
    const row = screen.getByTestId("defect-picker-row-warehouse-stock");
    expect(row).toHaveTextContent("창고");
    expect(row).toHaveTextContent("보유 10");
    expect(row).toHaveTextContent("예약 3");
    expect(row).toHaveTextContent("가용 7");
  });

  it("카테고리 미선택은 메모가 있어도 막고 기타는 메모도 요구한다", async () => {
    render(
      <DefectCartFlow mode="add" items={[rItem]} productModels={[]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    const submit = screen.getByRole("button", { name: /격리하기/ });

    expect(submit).toBeDisabled();
    expect(screen.queryByText("사유 카테고리를 선택하세요.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/스크래치 다수/), { target: { value: "메모만 입력" } });
    expect(submit).toBeDisabled();
    await selectReasonCategory("기타");
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText(/스크래치 다수/), { target: { value: " " } });
    expect(submit).toBeDisabled();
  });

  it("[8.10-05] 여러 행이 부족하면 모든 오류를 표시하고 확인창과 API 호출을 전부 차단한다", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "부족 튜브 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 조립 장바구니에 추가" }));
    const quantities = screen.getAllByPlaceholderText(/예: 3/);
    fireEvent.change(quantities[0], { target: { value: "4" } });
    fireEvent.change(quantities[1], { target: { value: "3" } });
    await enterReasonMemos();

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
    fireEvent.click(screen.getByRole("button", { name: "원자재 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "완제품 장바구니에 추가" }));
    await enterReasonMemos();
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
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    await selectReasonCategory();
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 폐기" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["items"] }));
    expect(onDone).toHaveBeenCalledWith("scrap");
  });
});
