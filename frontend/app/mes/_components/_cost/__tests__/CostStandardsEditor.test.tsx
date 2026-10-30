import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costsApi } from "@/lib/api/costs";
import { ApiError } from "@/lib/api-core";
import type { ItemCost } from "@/lib/api/types/cost";
import { CostStandardsEditor } from "../CostStandardsEditor";

vi.mock("@/lib/api/costs", () => ({ costsApi: { updateItemStandards: vi.fn(), updateStandards: vi.fn() } }));
const cost = {
  item_id: "part", process_type_code: "AR", can_edit: true, hourly_labor_rate: "12000",
  standards: { standard_purchase_price: "1000", purchase_price_effective_date: "2026-10-01", standard_work_minutes: "3" },
  tree: { item_name: "조립품", children: [] },
} as ItemCost;
const actor = { employee_id: "manager", token: "session" };
function mount(canEdit = true, hasChildren = false, processTypeCode = "AR") {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><CostStandardsEditor cost={{ ...cost, process_type_code: processTypeCode, can_edit: canEdit, tree: { ...cost.tree, children: hasChildren ? [cost.tree] : [] } }} actor={actor} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}
describe("원가 기준값 저장", () => {
  beforeEach(() => vi.resetAllMocks());
  it("외화 단가와 환율로 원화 환산액을 미리 보여주고 원본 기준값을 저장한다", async () => {
    vi.mocked(costsApi.updateItemStandards).mockResolvedValue(cost);
    const onClose = mount();
    fireEvent.change(screen.getByLabelText("매입 통화"), { target: { value: "USD" } });
    fireEvent.change(screen.getByLabelText("외화 매입단가 (USD)"), { target: { value: "2.50" } });
    fireEvent.change(screen.getByLabelText("적용 환율 (원 / 1 USD)"), { target: { value: "1380.123456" } });
    expect(screen.getByLabelText("원화 환산 단가")).toHaveTextContent("3,450.31 원");
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(costsApi.updateItemStandards).toHaveBeenCalledWith("part", "session", {
      standard_work_minutes: "3", purchase_price_effective_date: "2026-10-01",
      purchase_currency: "USD", foreign_purchase_price: "2.50", purchase_exchange_rate: "1380.123456",
    });
  });
  it("폼이 열리면 가까운 스크롤 영역에 표시하고 첫 입력에 포커스한다", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      mount();
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(screen.getByLabelText("기준 매입단가 (원)")).toHaveFocus();
      expect(screen.getByLabelText("기준 매입단가 (원)")).toHaveValue(1000);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });
  it.each(["AA", "AF"])("BOM이 없어도 %s 공정품 매입단가는 표시·전송하지 않는다", async (processType) => {
    vi.mocked(costsApi.updateItemStandards).mockResolvedValue(cost);
    const onClose = mount(true, false, processType);
    expect(screen.queryByLabelText("기준 매입단가 (원)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("단가 기준일")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(costsApi.updateItemStandards).toHaveBeenCalledWith("part", "session", { standard_work_minutes: "3" });
  });
  it.each(["success", "error"])("A 저장 대기 중 B를 열면 A의 늦은 %s 응답이 B 폼에 영향을 주지 않는다", async (outcome) => {
    let finish!: (value: ItemCost) => void;
    let fail!: (reason: Error) => void;
    vi.mocked(costsApi.updateItemStandards).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    const qc = new QueryClient();
    function Workspace() {
      const [itemId, setItemId] = useState<string | null>("A");
      return <><button onClick={() => setItemId("B")}>B 편집</button>{itemId && <CostStandardsEditor key={itemId} cost={{ ...cost, item_id: itemId, tree: { ...cost.tree, item_name: itemId } }} actor={actor} onClose={() => setItemId(null)} />}</>;
    }
    render(<QueryClientProvider client={qc}><Workspace /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("회사 공통 시급 (원/시간)"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    await waitFor(() => expect(costsApi.updateItemStandards).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "B 편집" }));
    await act(async () => { if (outcome === "success") finish(cost); else fail(new Error("이전 저장 실패")); });
    expect(screen.getByText("B · 기준값 수정")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(costsApi.updateStandards).not.toHaveBeenCalled();
  });
  it.each(["actor", "token", "permission"])("저장 중 %s가 바뀌면 이전 응답으로 공통 시급 저장·닫기를 실행하지 않는다", async (change) => {
    let finish!: (value: ItemCost) => void;
    vi.mocked(costsApi.updateItemStandards).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const qc = new QueryClient();
    const onClose = vi.fn();
    const view = (nextActor = actor, canEdit = true) => <QueryClientProvider client={qc}><CostStandardsEditor cost={{ ...cost, can_edit: canEdit }} actor={nextActor} onClose={onClose} /></QueryClientProvider>;
    const { rerender } = render(view());
    fireEvent.change(screen.getByLabelText("회사 공통 시급 (원/시간)"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    await waitFor(() => expect(costsApi.updateItemStandards).toHaveBeenCalledOnce());
    rerender(view({ employee_id: change === "actor" ? "another" : actor.employee_id, token: change === "token" ? "new-session" : actor.token }, change !== "permission"));
    await act(async () => finish(cost));
    expect(onClose).not.toHaveBeenCalled();
    expect(costsApi.updateStandards).not.toHaveBeenCalled();
  });
  it("하위 구성이 있는 공정품은 매입단가를 숨기고 저장할 때 기존 값을 보존한다", async () => {
    vi.mocked(costsApi.updateItemStandards).mockResolvedValue(cost);
    const onClose = mount(true, true);
    expect(screen.queryByLabelText("기준 매입단가 (원)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("단가 기준일")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(costsApi.updateItemStandards).toHaveBeenCalledWith("part", "session", { standard_work_minutes: "3" });
  });
  it("0원은 유지하고 비운 기준일은 null로 보내며 공통 시급 변경을 저장한다", async () => {
    vi.mocked(costsApi.updateItemStandards).mockResolvedValue(cost);
    vi.mocked(costsApi.updateStandards).mockResolvedValue({ hourly_labor_rate: "15000", can_edit: true });
    const onClose = mount();
    fireEvent.change(screen.getByLabelText("기준 매입단가 (원)"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("단가 기준일"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("회사 공통 시급 (원/시간)"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(costsApi.updateItemStandards).toHaveBeenCalledWith("part", "session", { standard_purchase_price: "0", purchase_price_effective_date: null, standard_work_minutes: "3" });
    expect(costsApi.updateStandards).toHaveBeenCalledWith("session", "15000");
  });
  it("저장 중 권한이 바뀌어 403이 오면 편집값을 유지하고 실패를 표시한다", async () => {
    vi.mocked(costsApi.updateItemStandards).mockRejectedValue(new ApiError("기준값 수정 권한이 없습니다.", 403));
    const onClose = mount();
    fireEvent.change(screen.getByLabelText("1인 1개 추가 작업시간 (분)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "기준값 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("기준값 수정 권한이 없습니다.");
    expect(screen.getByLabelText("1인 1개 추가 작업시간 (분)")).toHaveValue(5);
    expect(onClose).not.toHaveBeenCalled();
  });
  it("조회 전용 직원은 원가 기준값을 수정하거나 저장할 수 없다", () => {
    mount(false);
    expect(screen.getByLabelText("기준 매입단가 (원)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "기준값 저장" })).toBeDisabled();
  });
});
