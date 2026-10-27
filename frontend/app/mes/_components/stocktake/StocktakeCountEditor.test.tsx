import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider, useConfirmNavigation } from "@/lib/ui/dirty-guard";
import { StocktakeCountEditor } from "./StocktakeCountEditor";
import { stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeTarget } from "@/lib/api/types/stocktake";
import type { Operator } from "../login/useCurrentOperator";
import type { RecoveredStocktakeCommand } from "./StocktakeCommandRecovery";
import { ApiError } from "@/lib/api-core";

const actor = vi.hoisted(() => ({ employee_id: "a", name: "작업자", department_role: "none" }));
vi.mock("../login/useCurrentOperator", () => ({ readCurrentOperator: () => actor }));
vi.mock("@/lib/auth/operator-session", () => ({ restoreOperatorSession: () => ({ token: "test" }) }));
vi.mock("@/lib/api/stocktake", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/stocktake")>(), stocktakeApi: { read: vi.fn(), command: vi.fn() } }));
const count = { count_id: "c", round_id: "r", target_id: "t", owner_id: "a", owner_name: "작업자", version: 1, fence: 2, status: "DRAFT" as const, confirmation_revision_id: null, event_id: null,
  quantities: { normal: null, defect: null, b_grade: null, obsolete: null } };
const target: StocktakeTarget = { target_id: "t", item_id: "i", scope_id: "warehouse", scope_name: "창고", item_name: "시험 품목", current_item_name: "시험 품목", item_code: "I", current_item_code: "I", unit: "개", target_version: 1, version: 1, fence: 2, status: "DRAFT", quantities: count.quantities, confirmation_revision_id: null, count };
function Navigation({ leave }: { leave: () => void }) {
  const confirm = useConfirmNavigation();
  return <button type="button" onClick={() => confirm(leave)}>다른 화면</button>;
}
function mount(selectedTarget: StocktakeTarget = target) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const leave = vi.fn();
  const changed = vi.fn();
  const tree = (recovered?: RecoveredStocktakeCommand) => <QueryClientProvider client={client}><DirtyGuardProvider>
    <StocktakeCountEditor target={selectedTarget} token="test" operator={actor as Operator} onChanged={changed} recovered={recovered} /><Navigation leave={leave} />
  </DirtyGuardProvider></QueryClientProvider>;
  const view = render(tree());
  return { ...view, client, leave, changed, recovered: (outcome: RecoveredStocktakeCommand) => view.rerender(tree(outcome)),
    updateTarget: (next: StocktakeTarget) => { selectedTarget = next; view.rerender(tree()); } };
}
describe("stocktake input integration", () => {
  it("LAN HTTP에서도 작업 중단을 전송하고 처리 상태를 해제한다", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      vi.mocked(stocktakeApi.command).mockRejectedValue(new Error("중단 실패"));
      mount();
      fireEvent.click(screen.getByRole("button", { name: "작업 중단", exact: true }));
      await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledOnce());
      expect(vi.mocked(stocktakeApi.command).mock.calls[0][4]?.key).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
      expect(await screen.findByRole("alert")).toHaveTextContent("중단 실패");
      expect(screen.getByRole("button", { name: "작업 중단", exact: true })).toBeEnabled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("중단 버튼만 처리 상태를 표시하고 중복 실행을 막는다", async () => {
    let fail!: (error: Error) => void;
    vi.mocked(stocktakeApi.command).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "작업 중단", exact: true }));
    const processing = screen.getByRole("button", { name: "처리 중…", exact: true });
    expect(processing).toBeDisabled();
    expect(processing).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "계수 확인", exact: true })).not.toHaveAttribute("aria-busy", "true");
    fireEvent.click(processing);
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error("중단 실패")));
    expect(screen.getByRole("button", { name: "작업 중단", exact: true })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("중단 실패");
  });

  it("본인 중단은 사유 입력 없이 자동 사유와 기존 버전으로 요청한다", async () => {
    vi.mocked(stocktakeApi.read).mockResolvedValue(count);
    vi.mocked(stocktakeApi.command).mockResolvedValue({ ...count, status: "ABANDONED", version: 2 });
    mount();
    expect(screen.queryByLabelText("해제 사유")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "작업 중단", exact: true }));
    await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledWith("count_abandon", "/api/stocktakes/counts/c/abandon", "test", { expected_version: 1, fence: 2, reason_code: "OPERATOR_REQUEST", reason: "본인 계수 작업 중단" }, expect.objectContaining({ key: expect.any(String) })));
  });
  it("이전 결과에 실제 조사자와 KST 확인 시각을 표시한다", () => {
    const applied = { ...count, status: "APPLIED", confirmed_at: "2026-10-08T01:23:00Z", quantities: { normal: 12, defect: 2, b_grade: 0, obsolete: 3 } };
    vi.mocked(stocktakeApi.read).mockResolvedValue(applied);
    mount({ ...target, status: "APPLIED", confirmed_name: "조사 담당자", count: applied });
    expect(screen.getByLabelText("이전 조사 담당자")).toHaveTextContent("조사 담당자");
    expect(screen.getByLabelText("이전 조사 시각")).toHaveTextContent("2026년 10월 08일 10시 23분");
    expect(screen.getByLabelText("이전 조사 시각")).toHaveAttribute("datetime", "2026-10-08T01:23:00Z");
  });
  it("shows completed observations as previous results instead of editable fields", () => {
    const applied = { ...count, status: "APPLIED", quantities: { normal: 12, defect: 2, b_grade: 0, obsolete: 3 } };
    vi.mocked(stocktakeApi.read).mockResolvedValue(applied);
    mount({ ...target, status: "APPLIED", count: applied });
    expect(screen.getByRole("heading", { name: "이전 조사 결과" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "정상 수량" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("정상 조사 수량")).toHaveTextContent("12");
    expect(screen.getByLabelText("구형 조사 수량")).toHaveTextContent("3");
  });
  it("keeps routine autosave status from inserting a card into the input form", () => {
    mount();
    expect(screen.queryByText(/저장 완료/)).not.toBeInTheDocument();
    expect(screen.queryByText(/버전 1/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "4" } });
    expect(screen.queryByText("입력 중 · 자동저장 대기")).not.toBeInTheDocument();
  });
  beforeEach(() => { vi.clearAllMocks(); actor.employee_id = "a"; actor.department_role = "none"; vi.mocked(stocktakeApi.read).mockResolvedValue(count); });
  it("connects a journaled HTTP failure to the central same-key retry without a false conflict", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValue(new ApiError("503", 503, "SERVER_UNAVAILABLE", { command_pending: true }));
    const view = mount();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "23" } });
    await screen.findByRole("button", { name: "처리 결과 확인" });
    const request = vi.mocked(stocktakeApi.command).mock.calls[0];
    const result = { ...count, version: 2, quantities: { ...count.quantities, normal: 23 } };
    await act(async () => view.client.setQueryData(["stocktake", "a", "count", "c"], result));
    view.recovered({ token: "test", resolution: "COMPLETED", result, entry: { version: 2, actor_employee_id: "a", kind: "count_save",
      key: request[4].key, path: request[1], method: "PATCH", payload: request[3], command_payload: { count_id: "c", ...request[3] }, created_at: new Date().toISOString() } });
    await waitFor(() => expect(screen.getByLabelText("정상 수량")).not.toHaveAttribute("readonly"));
    expect(screen.getByLabelText("정상 수량")).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });
  it.each(["none", "primary", "deputy"])("다른 작업자의 계수에서 %s 권한에 맞는 동작만 노출한다", async departmentRole => {
    actor.employee_id = "other"; actor.department_role = departmentRole;
    mount();
    expect(screen.getByLabelText("정상 수량")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "계수 확인", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지금 저장" })).not.toBeInTheDocument();
    if (departmentRole !== "none") {
      fireEvent.click(screen.getByText("관리자 잠금 해제", { selector: "summary" }));
      expect(screen.getByRole("button", { name: "관리자 잠금 해제" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "계수 작업 중단" })).not.toBeInTheDocument();
    } else expect(screen.queryByText("관리자 잠금 해제")).not.toBeInTheDocument();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
  it("requires explicit zeros, saves before confirmation, and does not count blanks as zero", async () => {
    vi.mocked(stocktakeApi.command).mockImplementation(async (kind, _path, _token, body) => ({ ...count,
      ...(kind === "count_save" ? { version: 2, quantities: (body as { quantities: object }).quantities } : { version: 3, status: "CONFIRMED" }) }));
    mount();
    expect(screen.getByRole("button", { name: "계수 확인", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "미확인을 0으로 입력" }));
    fireEvent.click(screen.getByRole("button", { name: "계수 확인", exact: true }));
    await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledTimes(2));
    expect(vi.mocked(stocktakeApi.command).mock.calls[0][3]).toMatchObject({ quantities: { normal: 0, defect: 0, b_grade: 0, obsolete: 0 }, expected_version: 1 });
    expect(vi.mocked(stocktakeApi.command).mock.calls[1][3]).toEqual({ expected_version: 2, fence: 2 });
  });
  it("keeps failed input and blocks navigation until the save succeeds", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValueOnce(new Error("연결 실패"));
    const { leave } = mount();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
    await screen.findByText("연결 실패");
    expect(leave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("정상 수량")).toHaveValue("9");
    vi.mocked(stocktakeApi.command).mockResolvedValue({ ...count, version: 2, quantities: { ...count.quantities, normal: 9 } });
    fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  });
  it("blocks duplicate confirmation and navigation while its outcome is pending", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.command).mockImplementation(async (kind, _p, _t, body) => {
      if (kind === "count_save") return { ...count, version: 2, quantities: (body as { quantities: object }).quantities };
      return new Promise((resolve) => { finish = resolve; });
    });
    const { leave } = mount();
    fireEvent.click(screen.getByRole("button", { name: "미확인을 0으로 입력" }));
    fireEvent.click(screen.getByRole("button", { name: "계수 확인", exact: true }));
    await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "계수 확인", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
    await act(async () => {});
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
    expect(leave).not.toHaveBeenCalled();
    await act(async () => finish({ ...count, version: 3, status: "CONFIRMED" }));
  });
  it("queries a save receipt when confirmation's prerequisite save is ambiguous", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValue(Object.assign(new Error("결과 확인 필요"), { code: "COMMAND_RESULT_UNKNOWN" }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "미확인을 0으로 입력" }));
    fireEvent.click(screen.getByRole("button", { name: "계수 확인", exact: true }));
    await screen.findByRole("button", { name: "처리 결과 확인" });
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인" }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.some(([path]) => path.includes("kind=count_save"))).toBe(true));
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });

  it("central recovery releases an ambiguous editor while preserving unsubmitted observations", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValue(Object.assign(new Error("unknown"), { code: "COMMAND_RESULT_UNKNOWN" }));
    const view = mount();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "7" } });
    await screen.findByRole("button", { name: "처리 결과 확인" });
    const request = vi.mocked(stocktakeApi.command).mock.calls[0];
    view.recovered({ token: "test", resolution: "NOT_APPLIED", entry: { version: 2, actor_employee_id: "a", kind: "count_save",
      key: request[4].key, path: request[1], method: "PATCH", payload: request[3], command_payload: { count_id: "c", ...request[3] }, created_at: new Date().toISOString() } });
    await screen.findByRole("button", { name: "저장 다시 시도" });
    expect(screen.getByLabelText("정상 수량")).toHaveValue("7");
    expect(await screen.findByRole("alert")).toHaveTextContent("미반영");
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });

  it("a fence discovered from another tab releases local ambiguity without resending", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValue(Object.assign(new Error("unknown"), { code: "COMMAND_RESULT_UNKNOWN" }));
    mount();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "7" } });
    await screen.findByRole("button", { name: "처리 결과 확인" });
    vi.mocked(stocktakeApi.read).mockImplementation(async (path) => {
      if (path.includes("/commands/")) throw new ApiError("fenced", 409, "COMMAND_NOT_APPLIED", { definitive: true, receipt_id: "fenced" });
      return count;
    });
    fireEvent.click(screen.getByRole("button", { name: "처리 결과 확인" }));
    await screen.findByRole("button", { name: "저장 다시 시도" });
    expect(screen.getByLabelText("정상 수량")).toHaveValue("7");
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });
  it("refreshes conflict evidence while preserving the focused local input", async () => {
    const { client } = mount();
    await waitFor(() => expect(client.getQueryState(["stocktake", "a", "count", "c"])?.fetchStatus).toBe("idle"));
    const input = screen.getByLabelText("정상 수량");
    input.focus(); fireEvent.change(input, { target: { value: "7" } });
    await act(async () => client.setQueryData(["stocktake", "a", "count", "c"], { ...count, version: 4, quantities: { ...count.quantities, normal: 8 } }));
    expect(input).toHaveValue("7"); expect(input).toHaveFocus();
    await screen.findByText(/서버 버전 4/);
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
  it("autosaves after the debounce and warns before unloading unsaved input", async () => {
    vi.mocked(stocktakeApi.command).mockImplementation(async (_kind, _p, _t, body) => ({ ...count, version: 2, quantities: (body as { quantities: object }).quantities }));
    const view = mount();
    expect(screen.queryByRole("button", { name: "지금 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "저장 다시 시도" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "4" } });
    const before = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledTimes(1), { timeout: 1500 });
    await waitFor(() => expect(screen.queryByText("입력 중 · 자동저장 대기")).not.toBeInTheDocument());
    const after = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(view.changed).not.toHaveBeenCalled();
    expect(view.client.getQueryData(["stocktake", "a", "count", "c"])).toMatchObject({ version: 2, quantities: { normal: 4 } });
  });
  it("offers an explicit retry after autosave failure without losing the observed quantity", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValueOnce(new Error("연결 실패"));
    mount();
    fireEvent.change(screen.getByLabelText("정상 수량"), { target: { value: "9" } });
    const retry = await screen.findByRole("button", { name: "저장 다시 시도" });
    expect(screen.getByLabelText("정상 수량")).toHaveValue("9");
    vi.mocked(stocktakeApi.command).mockResolvedValue({ ...count, version: 2, quantities: { ...count.quantities, normal: 9 } });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "저장 다시 시도" })).not.toBeInTheDocument());
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "저장 다시 시도" })).not.toBeInTheDocument();
  });
  it.each([["tube", "튜브", 146, 2], ["warehouse", "창고", 50, 5]])("references %s physical quantities without replacing the draft on refresh", async (scopeId, scopeName, normal, defect) => {
    const inventory = { quantity: 264, warehouse_qty: 50, pending_quantity: 7, department_pending_quantity: 0, available_quantity: 250,
      locations: [{ department: "튜브", status: "PRODUCTION" as const, quantity: 146 }, { department: "조립", status: "PRODUCTION" as const, quantity: 60 }],
      defective_breakdown: [{ department: "튜브", management_category: "DEFECT" as const, quantity: 2 },
        { department: "창고", management_category: "DEFECT" as const, quantity: 5 }, { department: "튜브", management_category: "B_GRADE" as const, quantity: 1 }] };
    const selected = { ...target, scope_id: String(scopeId), scope_name: String(scopeName), current_inventory: inventory };
    const view = mount(selected);
    await waitFor(() => expect(view.client.getQueryState(["stocktake", "a", "count", "c"])?.fetchStatus).toBe("idle"));
    expect(screen.getByLabelText(`${scopeName} 정상 현재 재고 ${normal}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`${scopeName} 불량 현재 재고 ${defect}`)).toBeInTheDocument();
    expect(screen.getByLabelText(`${scopeName} 구형 현재 재고 0`)).toBeInTheDocument();
    const input = screen.getByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    view.updateTarget({ ...selected, current_inventory: undefined });
    expect(screen.getByLabelText(`${scopeName} 정상 현재 재고 확인 필요`)).toHaveTextContent("현재 —");
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("9");
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
});
