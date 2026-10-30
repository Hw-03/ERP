import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costsApi } from "@/lib/api/costs";
import { ApiError } from "@/lib/api-core";
import { CostPurchaseInfo } from "../CostPurchaseInfo";

vi.mock("@/lib/api/costs", () => ({ costsApi: { getPurchaseInfo: vi.fn(), updatePurchaseInfo: vi.fn() } }));
vi.mock("@/lib/queries/useCostQuery", async importOriginal => ({ ...await importOriginal<object>(), useCostEditPermission: () => true }));
const actor = { employee_id: "manager", token: "token" };
const info = { item_id: "raw", item_name: "전극", mes_code: "8-TR", unit: "EA", supplier: "기존 공급사", supplier_item_code: null,
  standard_purchase_price: "2600.00", purchase_price_effective_date: null, purchase_currency: "USD", foreign_purchase_price: "2.00", purchase_exchange_rate: "1300.000000",
  min_stock: 0, reorder_point: null, procurement_lead_time_days: null, minimum_order_quantity: null, purchase_memo: null,
  standard_work_minutes: null, hourly_labor_rate: "6000.00" };
function setup(onStateChange = vi.fn(), onAccessDenied = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={qc}><CostPurchaseInfo itemId="raw" actor={actor} onStateChange={onStateChange} onAccessDenied={onAccessDenied} /></QueryClientProvider>), qc, onStateChange };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(costsApi.getPurchaseInfo).mockResolvedValue(info);
  vi.mocked(costsApi.updatePurchaseInfo).mockResolvedValue(info);
});
describe("통합 정보 입력", () => {
  it("TF·NF에만 기준 수율을 표시하고 다른 변경과 함께 저장한다", async () => {
    vi.mocked(costsApi.getPurchaseInfo).mockResolvedValue({ ...info, process_type_code: "TF", standard_yield_percent: null });
    vi.mocked(costsApi.updatePurchaseInfo).mockResolvedValue({ ...info, process_type_code: "TF", standard_yield_percent: "70.00" });
    setup();
    const input = await screen.findByLabelText("원가 기준 수율 (%)");
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("1인 1개 추가 작업시간 (분)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "정보 저장" }));
    await waitFor(() => expect(costsApi.updatePurchaseInfo).toHaveBeenCalledWith("raw", "token", { standard_yield_percent: "70", standard_work_minutes: "5" }));
  });
  it("등록된 수율을 비우면 null을 보내고 잘못된 수율은 저장하지 않는다", async () => {
    vi.mocked(costsApi.getPurchaseInfo).mockResolvedValue({ ...info, process_type_code: "NF", standard_yield_percent: "90.00" });
    setup();
    const input = await screen.findByLabelText("원가 기준 수율 (%)");
    for (const value of ["0", "100.01", "70.001", "-1"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "정보 저장" }));
      expect(costsApi.updatePurchaseInfo).not.toHaveBeenCalled();
    }
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "정보 저장" }));
    await waitFor(() => expect(costsApi.updatePurchaseInfo).toHaveBeenCalledWith("raw", "token", { standard_yield_percent: null }));
  });
  it("중복 품목 제목 없이 변경한 필드만 저장해 외화 단가를 보존한다", async () => {
    const { onStateChange } = setup();
    await screen.findByRole("textbox", { name: "주 공급사" });
    expect(screen.queryByText("입력 대상")).not.toBeInTheDocument();
    expect(screen.queryByText(/전극/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("매입 통화")).toHaveValue("USD");
    expect(screen.queryByLabelText("원가 기준 수율 (%)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1인 1개 추가 작업시간 (분)")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "구매 메모" }), { target: { value: "납기 확인" } });
    expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, busy: false });
    fireEvent.click(screen.getByRole("button", { name: "정보 저장" }));
    await waitFor(() => expect(costsApi.updatePurchaseInfo).toHaveBeenCalledWith("raw", "token", { purchase_memo: "납기 확인" }));
  });
  it("외화·환율과 작업시간만 저장하고 시급은 저장하지 않는다", async () => {
    setup();
    await screen.findByRole("textbox", { name: "주 공급사" });
    fireEvent.change(screen.getByLabelText("외화 매입단가 (USD)"), { target: { value: "3.25" } });
    fireEvent.change(screen.getByLabelText("1인 1개 추가 작업시간 (분)"), { target: { value: "2" } });
    expect(screen.queryByLabelText("회사 공통 시급 (원/시간)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정보 저장" }));
    await waitFor(() => expect(costsApi.updatePurchaseInfo).toHaveBeenCalledWith("raw", "token", {
      purchase_currency: "USD", foreign_purchase_price: "3.25", purchase_exchange_rate: "1300.000000", standard_work_minutes: "2",
    }));
    expect(costsApi.updatePurchaseInfo).toHaveBeenCalledTimes(1);
  });
  it("저장 실패 시 입력을 유지하고 저장 중에는 입력과 중복 저장을 막는다", async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(costsApi.updatePurchaseInfo).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const { onStateChange } = setup();
    const supplier = await screen.findByRole("textbox", { name: "주 공급사" });
    fireEvent.change(supplier, { target: { value: "수정 공급사" } });
    fireEvent.click(screen.getByRole("button", { name: "정보 저장" }));
    await waitFor(() => expect(supplier).toBeDisabled());
    expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, busy: true });
    await act(async () => fail(new Error("저장 실패")));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
    expect(supplier).toHaveValue("수정 공급사");
    expect(supplier).not.toBeDisabled();
    expect(onStateChange).toHaveBeenLastCalledWith({ dirty: true, busy: false });
  });
  it("서버에서 접근이 거부되면 정보 입력을 제공하지 않는다", async () => {
    vi.mocked(costsApi.getPurchaseInfo).mockRejectedValue(new ApiError("접근 권한 없음", 403));
    const denied = vi.fn();
    setup(vi.fn(), denied);
    await waitFor(() => expect(denied).toHaveBeenCalled());
    expect(screen.queryByRole("textbox", { name: "주 공급사" })).not.toBeInTheDocument();
  });
});
