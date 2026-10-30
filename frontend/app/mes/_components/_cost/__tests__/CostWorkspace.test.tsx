import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemCost } from "@/lib/api/types/cost";
import { CostAnalysisWorkspace } from "../CostAnalysisWorkspace";
import { DashboardNavigationProvider, useDashboardNavigation } from "../../DashboardNavigation";

const state = vi.hoisted(() => ({ cost: undefined as ItemCost | undefined, token: "t" as string | null, price: null as string | null, failed: false, error: null as Error | null, summaryMode: "ready" as "ready" | "loading" | "error", retry: vi.fn(), pages: undefined as Item[][] | undefined, more: false, fetchMore: vi.fn() }));
vi.mock("@/lib/queries/useModelsQuery", () => ({ useModelsQuery: () => ({ data: [{ slot: 1, model_name: "DX3000" }, { slot: 2, model_name: "COCOON" }] }) }));
vi.mock("@/lib/queries/useCostQuery", () => ({ useCostActor: () => state.token ? ({ employee_id: "e", token: state.token }) : null, useCostQuery: () => ({ data: state.cost, isError: state.failed, error: state.error, refetch: state.retry }), useCostSummaryQueries: () => [{ data: state.summaryMode === "ready" ? [
  { item_id: "a", unit_cost: "12500", own_labor_cost: null, amount: "12500", status: "partial" },
  { item_id: "raw", unit_cost: state.price, own_labor_cost: "0", amount: state.price, status: state.price === null ? "unavailable" : "complete" },
]: undefined, isError: state.summaryMode === "error", refetch: state.retry }] }));
vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery: () => ({ data: { pages: state.pages ?? [[{ item_id: "a", item_name: "튜브", mes_code: "8-TF", process_type_code: "TF", locations: [], model_slots: [1] }, { item_id: "raw", item_name: "전극", mes_code: "8-TR", process_type_code: "TR", standard_purchase_price: state.price, unit: "EA", has_bom: false, locations: [], model_slots: [2], warehouse_qty: 1 }]] }, hasNextPage: state.more, isFetchingNextPage: false, fetchNextPage: state.fetchMore }) }));
vi.mock("../CostAnalysisPanel", () => ({ CostViews: ({ information, simulationControls, activeView, onViewChange, beforeViewChange, navigationDisabled }: { information?: ReactNode; simulationControls?: ReactNode; activeView: string; onViewChange: (value: string) => void; beforeViewChange: (action: () => void) => void; navigationDisabled: boolean }) => <div data-testid="cost-views">{information && <button role="tab" disabled={navigationDisabled} onClick={() => beforeViewChange(() => onViewChange("info"))}>정보</button>}<button role="tab" disabled={navigationDisabled} onClick={() => beforeViewChange(() => onViewChange("tree"))}>가계도</button>{activeView === "info" ? information : simulationControls}</div>, CostIssues: () => null }));
vi.mock("../CostPurchaseInfo", () => ({ CostPurchaseInfo: ({ itemId, onStateChange }: { itemId: string; onStateChange: (value: { dirty: boolean; busy: boolean }) => void }) => {
  useEffect(() => () => onStateChange({ dirty: false, busy: false }), [onStateChange]);
  return <div data-testid="purchase-info-form">입력 대상 {itemId}<button onClick={() => onStateChange({ dirty: true, busy: false })}>입력 변경</button><button onClick={() => onStateChange({ dirty: true, busy: true })}>저장 시작</button><button onClick={() => onStateChange({ dirty: false, busy: false })}>저장 완료</button></div>;
} }));
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} }); vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false }))); state.cost = undefined; state.token = "t"; state.price = null; state.failed = false; state.summaryMode = "ready"; state.retry.mockClear(); });
beforeEach(() => { state.pages = undefined; state.more = false; state.error = null; state.fetchMore.mockClear(); });
function finishTransition(): void {
  const end = new Event("transitionend", { bubbles: true });
  Object.defineProperty(end, "propertyName", { value: "width" });
  fireEvent(screen.getByLabelText("분석 품목 탐색"), end);
}
function editable(): void {
  state.cost = { item_id: "a", can_edit: true, status: "complete", unit_cost: "10", yield_adjusted_unit_cost: "12.50", yield_cost_difference: "2.50", yield_stages: [{ item_id: "a", path: ["a"], item_name: "튜브", mes_code: "8-TF", process_type_code: "TF", standard_yield_percent: "80.00", effective_yield_percent: "80.00", input_unit_cost: "10.00", output_unit_cost: "12.50" }], material_cost: "10", labor_cost: "0", tree: { item_id: "a", item_name: "튜브", mes_code: "8-TF", children: [] }, issues: [] } as unknown as ItemCost;
}

describe("원가 분석 작업창", () => {
  it.each([403, 404])("복원 품목이 %s이면 첫 화면으로 정리한다", status => {
    editable(); state.failed = true; state.error = new ApiError("접근할 수 없는 품목", status);
    render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    expect(screen.queryByTestId("cost-summary-bar")).not.toBeInTheDocument();
  });
  it("숨긴 작업창은 Esc와 상단 전환 포털을 처리하지 않는다", () => {
    const close = vi.fn();
    const target = document.createElement("div"); document.body.append(target);
    const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={close} active={false} headerTarget={target} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(target).toBeEmptyDOMElement();
    view.unmount(); target.remove();
  });
  it("이전 필터의 펼친 목록을 복원할 때 표시 수를 첫 페이지로 덮지 않는다", () => {
    state.pages = [Array.from({ length: 150 }, (_, index) => ({ item_id: `raw-${index}`, item_name: `자재 ${index}`, mes_code: `8-TR-${index}`, process_type_code: "TR", locations: [], model_slots: [] } as unknown as Item))];
    window.history.replaceState({}, "", "/mes?tab=dashboard");
    function Owner() {
      const nav = useDashboardNavigation()!;
      const navigate = nav.navigate;
      useEffect(() => navigate("cost"), [navigate]);
      return <><button onClick={() => nav.commit(() => {})}>이력 저장</button><CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} /></>;
    }
    render(<DashboardNavigationProvider><Owner /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByRole("button", { name: "더 보기", exact: true }));
    expect(screen.getByRole("button", { name: "자재 149 8-TR-149 원가 분석" })).toBeVisible();
    const entry = window.history.state;
    fireEvent.click(screen.getByText("이력 저장"));
    fireEvent.click(screen.getByRole("button", { name: "원가 목록 필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "공정완료", exact: true }));
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: entry })));
    expect(screen.getByRole("button", { name: "자재 149 8-TR-149 원가 분석" })).toBeVisible();
  });
  it("상단 원가 탭으로 목록에 갔다가 뒤로 오면 저장 수율 비교를 복원한다", () => {
    localStorage.clear(); editable();
    window.history.replaceState({}, "", "/mes?tab=dashboard");
    const target = document.createElement("div"); document.body.append(target);
    function Owner() {
      const navigation = useDashboardNavigation()!;
      const navigate = navigation.navigate;
      useEffect(() => navigate("cost"), [navigate]); // Initial dashboard entry for this harness.
      return <CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} headerTarget={target} onDashboardViewChange={navigation.navigate} />;
    }
    const view = render(<DashboardNavigationProvider><Owner /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    const detail = window.history.state;
    fireEvent.click(screen.getByRole("button", { name: "원가 분석", exact: true }));
    expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    const home = window.history.state;
    act(() => { window.history.replaceState(detail, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: detail })); });
    expect(screen.getAllByText("12.50 원").length).toBeGreaterThan(0);
    act(() => { window.history.replaceState(home, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: home })); });
    expect(screen.queryByTestId("cost-summary-bar")).not.toBeInTheDocument();
    view.unmount(); target.remove();
  });
  it("원가 내역과 저장 기준 비교는 더보기에서 표시하고 수율 입력은 제공하지 않는다", () => {
    localStorage.clear(); editable();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    const summary = screen.getByTestId("cost-summary-bar");
    expect(within(summary).getByLabelText("기준 수율 적용 비교")).toBeVisible();
    expect(screen.queryByText(/^수율 100%$/)).not.toBeInTheDocument();
    expect(within(summary).getByText("기준 수율 적용 중")).toBeVisible();
    expect(within(summary).queryByText("재료비")).not.toBeInTheDocument();
    expect(within(summary).queryByText("누적 인건비")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("첫 통과율 가정 (%)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("가정 시급 (원/시간)")).not.toBeInTheDocument();
    fireEvent.click(within(summary).getByRole("button", { name: "원가 상세 더보기" }));
    const details = within(summary).getByLabelText("기준 수율 적용 비교");
    expect(within(details).getByText("재료비")).toBeVisible();
    expect(within(details).getByText("누적 인건비")).toBeVisible();
    expect(within(details).getByLabelText("가정 시급 (원/시간)")).toBeVisible();
    expect(within(details).queryByLabelText("첫 통과율 가정 (%)")).not.toBeInTheDocument();
    expect(within(summary).getAllByText("12.50 원").length).toBeGreaterThan(0);
    expect(within(summary).getByText("2.50 원")).toBeVisible();
    fireEvent.click(within(summary).getByRole("button", { name: "원가 상세 접기" }));
    expect(within(summary).queryByText("12.50 원")).not.toBeInTheDocument();
    expect(within(summary).queryByText("재료비")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("첫 통과율 가정 (%)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("가정 시급 (원/시간)")).not.toBeInTheDocument();
    expect(within(summary).getByText("기준 수율 적용 중")).toBeVisible();
    fireEvent.click(within(summary).getByRole("button", { name: "원가 상세 더보기" }));
    expect(screen.getByRole("table", { name: "단계별 기준 수율" })).toHaveTextContent("80%");
  });

  it("KPI에서 연 PF가 검색 목록 밖에 있어도 선택 행을 눌러 목록으로 복귀한다", () => {
    editable(); state.cost = { ...state.cost!, item_id: "outside", tree: { ...state.cost!.tree, item_id: "outside", item_name: "기준 PF", mes_code: "3-PF-001" } };
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      render(<CostAnalysisWorkspace initialItemId="outside" onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "기준 PF 3-PF-001", exact: true }));
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    } finally { vi.restoreAllMocks(); }
  });
  it("저장 기준 비교는 탭 왕복에 유지하고 새 품목 서버 결과로 바꾼다", () => {
    localStorage.clear(); editable();
    const view = render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "원가 상세 더보기" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    expect(screen.getAllByText("12.50 원").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.queryByLabelText("기준 수율 적용 비교")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "가계도" }));
    expect(screen.getByRole("table", { name: "단계별 기준 수율" })).toHaveTextContent("80%");
    expect(screen.getByRole("button", { name: "원가 상세 접기" })).toHaveAttribute("aria-expanded", "true");
    state.cost = { ...state.cost!, unit_cost: "20.00", yield_adjusted_unit_cost: "25.00", yield_cost_difference: "5.00" };
    view.rerender(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    expect(screen.getByText("25 원")).toBeVisible();
    expect(screen.getByRole("button", { name: "원가 상세 접기" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByLabelText("전극 8-TR"));
    state.cost = { ...state.cost!, item_id: "raw", yield_stages: [], yield_adjusted_unit_cost: "20.00", yield_cost_difference: "0.00" };
    view.rerender(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    expect(screen.queryByLabelText("첫 통과율 가정 (%)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원가 상세 더보기" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    expect(screen.getByText("기준 수율 적용 대상 공정이 없습니다.")).toBeVisible();
    expect(Object.keys(localStorage).some(key => key.includes("yield"))).toBe(false);
  });
  it("시급 디바운스와 이전 시급 응답에서는 수율 결과를 보류한다", () => {
    localStorage.clear(); editable();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    fireEvent.change(screen.getByLabelText("가정 시급 (원/시간)"), { target: { value: "20000" } });
    expect(within(screen.getByLabelText("기준 수율 적용 비교")).getByRole("status")).toHaveTextContent("다시 계산 중");
    expect(screen.queryByText("12.50 원")).not.toBeInTheDocument();
  });
  it("재고와 같은 모델·공정 필터를 결합하고 전체 초기화한다", () => {
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원가 목록 필터 열기" }));
    const panel = within(document.getElementById("cost-inventory-filter-panel")!);
    fireEvent.click(panel.getByRole("button", { name: "DX3000", exact: true }));
    expect(screen.getByRole("button", { name: "튜브 8-TF 원가 분석" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "전극 8-TR 원가 분석" })).not.toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: "원자재", exact: true }));
    expect(screen.getByText("검색 결과가 없습니다.")).toBeVisible();
    fireEvent.click(panel.getByRole("button", { name: "전체 초기화" }));
    expect(screen.getByRole("button", { name: "전극 8-TR 원가 분석" })).toBeVisible();
  });
  it("부서의 코드·재고 위치 기준을 적용하고 부서 칩은 재고와 같이 OR로 결합한다", () => {
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원가 목록 필터 열기" }));
    const panel = within(document.getElementById("cost-inventory-filter-panel")!);
    fireEvent.click(panel.getByRole("button", { name: "창고", exact: true }));
    expect(screen.getByText("검색 결과가 없습니다.")).toBeVisible();
    fireEvent.click(panel.getByRole("button", { name: "재고 위치 기준" }));
    expect(screen.getByRole("button", { name: "전극 8-TR 원가 분석" })).toBeVisible();
    fireEvent.click(panel.getByRole("button", { name: "튜브", exact: true }));
    expect(screen.getByRole("button", { name: "전극 8-TR 원가 분석" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "OR", exact: true }));
    expect(screen.getByRole("button", { name: "전극 8-TR 원가 분석" })).toBeVisible();
  });
  it("다음 API 페이지에만 일치 품목이 있어도 필터 결과에서 빠뜨리지 않는다", () => {
    const raw = { item_id: "raw", item_name: "전극", mes_code: "8-TR", process_type_code: "TR", locations: [], model_slots: [] } as unknown as Item;
    const finished = { ...raw, item_id: "a", item_name: "튜브", mes_code: "8-TF", process_type_code: "TF" };
    state.pages = [[raw]]; state.more = true;
    const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원가 목록 필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "공정완료", exact: true }));
    expect(state.fetchMore).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
    state.pages = [[raw], [finished]]; state.more = false;
    view.rerender(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "튜브 8-TF 원가 분석" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "전극 8-TR 원가 분석" })).not.toBeInTheDocument();
  });
  it("마지막 유효 시급을 작업자별로 복원하고 표시 쉼표와 계산값을 분리한다", () => {
    localStorage.clear();
    editable();
    localStorage.setItem("mes.cost-simulation.hourly-rate.other", "9000");
    const view = render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    const input = screen.getByLabelText("가정 시급 (원/시간)");
    expect(input.parentElement).toHaveTextContent("원");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "20,000.50" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("20,000.50");
    expect(localStorage.getItem("mes.cost-simulation.hourly-rate.e")).toBe("20000.50");
    expect(localStorage.getItem("mes.cost-simulation.hourly-rate.other")).toBe("9000");
    expect(screen.queryByRole("button", { name: "초기화" })).not.toBeInTheDocument();
    view.unmount();
    const restored = render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "원가 상세 더보기" }));
    const restoredInput = screen.getByLabelText("가정 시급 (원/시간)");
    expect(restoredInput).toHaveValue("20,000.50");
    fireEvent.focus(restoredInput);
    expect(restoredInput).toHaveValue("20000.50");
    fireEvent.change(restoredInput, { target: { value: "-1" } });
    expect(localStorage.getItem("mes.cost-simulation.hourly-rate.e")).toBe("20000.50");
    fireEvent.change(restoredInput, { target: { value: "0" } });
    expect(localStorage.getItem("mes.cost-simulation.hourly-rate.e")).toBe("0");
    restored.unmount();
    localStorage.clear();
  });
  it("담당자도 기준값 바로가기 없이 정보 탭으로만 수정에 진입한다", () => {
    editable();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /기준값/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.getByTestId("purchase-info-form")).toBeVisible();
  });
  it("목록 원가 조회 중·실패를 미등록 금액과 구분하고 다시 불러온다", () => {
    state.summaryMode = "loading";
    const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    expect(screen.getByRole("row", { name: /튜브.*8-TF/ })).toHaveTextContent("불러오는 중…");
    state.summaryMode = "error";
    view.rerender(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    expect(screen.getByRole("row", { name: /튜브.*8-TF/ })).toHaveTextContent("조회 실패");
    fireEvent.click(screen.getByRole("button", { name: "원가 다시 불러오기" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it("전체 목록에서 계산 원가·단계 인건비·합계를 보고 BOM 등록 열은 숨긴다", () => {
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    const table = screen.getByRole("table", { name: "원가분석 품목 목록" });
    expect(table.querySelectorAll("thead th")).toHaveLength(5);
    expect(table).toHaveTextContent("개당 원가단계 인건비합계");
    expect(screen.queryByRole("columnheader", { name: "BOM 구성 등록" })).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /튜브.*8-TF/ });
    expect(row).toHaveTextContent("12,500 원");
    expect(row).toHaveTextContent("미등록");
    expect(row.querySelectorAll("td")[4]).toHaveTextContent("12,500 원");
    expect(screen.getByRole("row", { name: /전극.*8-TR/ })).toHaveTextContent("정보 없음");
  });
  it("검수 화면에는 추정 단가 포함 여부를 표시하고 일반 환경에는 표시하지 않는다", () => {
    editable();
    vi.stubEnv("NEXT_PUBLIC_COST_PREVIEW", "1");
    try {
      const view = render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
      expect(screen.getByRole("main")).toHaveTextContent("실습 DB · 추정 단가 포함");
      vi.stubEnv("NEXT_PUBLIC_COST_PREVIEW", "0");
      view.rerender(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
      expect(screen.getByRole("main")).not.toHaveTextContent("실습 DB · 추정 단가 포함");
    } finally { vi.unstubAllEnvs(); }
  });
  it("코드 하나를 재사용하고 보이는 행만 transform으로 이동하며 반전·종료 시 정리한다", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
    const cancel = vi.fn();
    const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Animation>(() => ({ cancel }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(107);
    const headerHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) { return this.tagName === "THEAD" ? 42 : 0; });
    let midpoint = false;
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement): DOMRect {
      const phase = this.closest("[data-phase]")?.getAttribute("data-phase");
      const moving = phase === "collapsing";
      const code = this.dataset.costMotion === "code";
      const left = code ? moving ? midpoint ? 350 : 100 : 600 : 100;
      const top = code ? moving ? midpoint ? 28 : 34 : 22 : moving ? midpoint ? 15 : 10 : 20;
      return { left, top, width: this.tagName === "TABLE" ? 1000 : 0, height: 16 } as DOMRect;
    });
    try {
      const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      const navigation = screen.getByLabelText("분석 품목 탐색");
      expect(navigation.querySelectorAll('[data-cost-motion="code"]')).toHaveLength(2);
      expect(navigation.querySelectorAll('[data-cost-motion="name"]')).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.calls[1][0]).toEqual([{ transform: "translate(500px, -12px)" }, { transform: "none" }]);
      expect(animate.mock.calls[1][1]).toMatchObject({ duration: 400, easing: "cubic-bezier(.4, 0, .2, 1)" });
      midpoint = true;
      fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
      expect(cancel).toHaveBeenCalled();
      // Removing the header exposes the second row during the reverse transition.
      expect(animate).toHaveBeenCalledTimes(6);
      expect(animate.mock.calls[3][0]).toEqual([{ transform: "translate(-250px, 6px)" }, { transform: "none" }]);
      view.unmount();
      expect(cancel.mock.calls.length).toBeGreaterThan(2);
    } finally {
      bounds.mockRestore(); width.mockRestore(); height.mockRestore(); headerHeight.mockRestore();
      if (original) Object.defineProperty(HTMLElement.prototype, "animate", original);
      else Reflect.deleteProperty(HTMLElement.prototype, "animate");
    }
  });
  it("전환 중 스크롤하면 현재 목표 상태로 즉시 정리한다", () => {
    editable();
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
    expect(screen.queryByTestId("cost-views")).not.toBeInTheDocument();
    fireEvent.scroll(screen.getByTestId("cost-catalogue-viewport"));
    expect(screen.getByTestId("cost-views")).toBeVisible();
  });
  it("전환 중 창 크기가 바뀌면 현재 목표 상태로 즉시 정리한다", () => {
    editable();
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("cost-views")).toBeVisible();
  });
  it("상단 슬롯이 있으면 제목과 복귀 버튼을 옮기고 본문은 검색부터 시작한다", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const close = vi.fn();
    const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={close} headerTarget={target} />);
    expect(target).toHaveTextContent("원가 분석");
    expect(view.container.querySelector("section > header")).toBeNull();
    expect(screen.getByRole("textbox", { name: "분석 품목 검색" })).toBeVisible();
    expect(screen.getByRole("button", { name: "원가 분석", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "재고 현황", exact: true }));
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    expect(target).toBeEmptyDOMElement();
    target.remove();
  });
  it("좁은 화면에서 탐색 목록이 접혀도 본문에서 전체 목록으로 복귀할 수 있다", () => {
    editable();
    const target = document.createElement("div");
    document.body.append(target);
    try {
      render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} headerTarget={target} />);
      const main = screen.getByRole("main");
      const back = Array.from(main.querySelectorAll("button")).find(button => button.textContent?.includes("품목 목록"));
      expect(back).toBeDefined();
      fireEvent.click(back!);
      finishTransition();
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    } finally { target.remove(); }
  });
  it("조회 실패도 접힘 완료 후 분석 영역에 표시하고 재시도를 제공한다", () => {
    state.failed = true;
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    finishTransition();
    expect(screen.getByRole("alert")).toHaveTextContent("원가를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기", exact: true }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it("좁은 화면에서 이전 원가가 남은 재조회 오류도 목록 복귀를 제공한다", () => {
    editable(); state.failed = true;
    const target = document.createElement("div");
    document.body.append(target);
    try {
      render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} headerTarget={target} />);
      expect(screen.getByRole("alert")).toHaveTextContent("원가를 불러오지 못했습니다.");
      fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "품목 목록", exact: true }));
      finishTransition();
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    } finally { target.remove(); }
  });
  it("탐색 목록에서는 머리행을 숨기고 전체 목록으로 펼치면 복원한다", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      editable();
      render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("cell", { name: "8-TF", exact: true }));
      expect(screen.queryByRole("heading", { name: "튜브" })).not.toBeInTheDocument();
      finishTransition();
      expect(screen.queryByRole("columnheader", { name: "품목명", exact: true })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "튜브" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
      expect(screen.queryByRole("heading", { name: "튜브" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "개당 원가" })).not.toBeInTheDocument();
      finishTransition();
      expect(screen.getByRole("columnheader", { name: "개당 원가" })).toBeVisible();
      expect(screen.getByRole("columnheader", { name: "품목명", exact: true })).toBeVisible();
    } finally { width.mockRestore(); }
  });
  it("접힘 도중 해제와 재선택해도 최신 목표로만 전환을 완료한다", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      editable();
      render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "튜브 8-TF 원가 분석" }));
      fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
      fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
      expect(screen.queryByTestId("cost-views")).not.toBeInTheDocument();
      finishTransition();
      expect(screen.getByRole("heading", { name: "튜브" })).toBeVisible();
      finishTransition();
      expect(screen.getByRole("heading", { name: "튜브" })).toBeVisible();
    } finally { width.mockRestore(); }
  });
  it("동작 줄이기 설정에서는 대기 없이 상세와 전체 목록을 표시한다", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    editable();
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
    expect(screen.getByTestId("cost-views")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
    expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
  });
  it("반대 방향 전환 중 이전 폭의 완료 이벤트는 무시한다", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
      fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
      const bounds = vi.spyOn(screen.getByLabelText("분석 품목 탐색"), "getBoundingClientRect").mockReturnValue({ width: 500 } as DOMRect);
      finishTransition();
      expect(screen.queryByRole("table", { name: "원가분석 품목 목록" })).not.toBeInTheDocument();
      bounds.mockReturnValue({ width: 1600 } as DOMRect);
      finishTransition();
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
      bounds.mockRestore();
    } finally { width.mockRestore(); }
  });
  it("접히는 동안 표 형태를 유지하고 종료 후 공정 이름 없는 품목 카드로 바꾼다", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "튜브 8-TF 원가 분석" }));
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
      expect(screen.queryByRole("columnheader", { name: "개당 원가" })).not.toBeInTheDocument();
      const end = new Event("transitionend", { bubbles: true });
      Object.defineProperty(end, "propertyName", { value: "width" });
      fireEvent(screen.getByLabelText("분석 품목 탐색"), end);
      expect(screen.getByRole("button", { name: "튜브 8-TF", exact: true })).toBeVisible();
      expect(screen.queryByRole("columnheader", { name: "개당 원가" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("분석 품목 탐색")).not.toHaveTextContent(/Tube/);
    } finally { width.mockRestore(); }
  });
  it("목록 폭 전환이 끝난 뒤에만 가계도와 표를 마운트한다", () => {
    editable();
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
    expect(screen.queryByTestId("cost-views")).not.toBeInTheDocument();
    const end = new Event("transitionend", { bubbles: true });
    Object.defineProperty(end, "propertyName", { value: "width" });
    fireEvent(screen.getByLabelText("분석 품목 탐색"), end);
    expect(screen.getByTestId("cost-views")).toBeVisible();
  });
  it("전환 종료 이벤트가 누락되어도 분석 내용이 계속 대기하지 않는다", () => {
    vi.useFakeTimers();
    try {
      editable();
      render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
      expect(screen.queryByTestId("cost-views")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(400));
      expect(screen.queryByTestId("cost-views")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(50));
      expect(screen.getByTestId("cost-views")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
      expect(screen.queryByRole("table", { name: "원가분석 품목 목록" })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(450));
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    } finally { vi.useRealTimers(); }
  });
  it("품목코드 셀을 눌러도 선택되며 같은 검색·목록 영역이 좁아졌다 다시 펼쳐진다", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      editable();
      render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
      const search = screen.getByRole("textbox", { name: "분석 품목 검색" });
      const row = screen.getByRole("row", { name: /튜브.*8-TF/ });
      fireEvent.click(screen.getByRole("cell", { name: "8-TF", exact: true }));
      finishTransition();
      expect(screen.getByRole("heading", { name: "튜브" })).toBeVisible();
      expect(screen.getByRole("textbox", { name: "분석 품목 검색" })).toBe(search);
      expect(screen.getByRole("button", { name: /튜브.*8-TF/ }).closest("tr")).toBe(row);
      fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
      finishTransition();
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toContainElement(row);
      expect(screen.getByRole("textbox", { name: "분석 품목 검색" })).toBe(search);
    } finally { width.mockRestore(); }
  });
  it("전체 품목 표에서 원자재의 미등록 단가와 확인된 0원을 구분한다", () => {
    const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    expect(screen.getByRole("row", { name: /전극.*8-TR/ })).toHaveTextContent("정보 없음");
    state.price = "0.00";
    view.rerender(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    const zero = screen.getByRole("row", { name: /전극.*8-TR/ });
    expect(zero).not.toHaveTextContent("정보 없음");
    expect(zero).toHaveTextContent("—");
    expect(zero.querySelector('[title="등록된 0원"]')).not.toBeNull();
  });
  it("품목 목록 버튼으로 상세에서 전체 표로 돌아간다", () => {
    editable();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "품목 목록", exact: true }));
    finishTransition();
    expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "분석 품목 검색" })).toHaveFocus();
  });
  it("왼쪽에서 현재 선택 품목을 다시 누르면 선택을 해제하고 전체 표로 돌아간다", () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    try {
      editable();
      render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
      const current = screen.getByRole("complementary", { name: "분석 품목 탐색" }).querySelector('button[aria-pressed="true"]');
      expect(current).not.toBeNull();
      fireEvent.click(current!);
      finishTransition();
      expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    } finally { width.mockRestore(); }
  });
  it("미선택 진입은 대시보드 목록 대신 창 내부에서 품목을 고른다", () => {
    render(<CostAnalysisWorkspace initialItemId={null} onClose={vi.fn()} />);
    expect(screen.getByRole("region", { name: "원가 분석" })).toBeVisible();
    expect(screen.getByRole("table", { name: "원가분석 품목 목록" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "개당 원가" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "공정", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "단위", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("분석할 품목")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /튜브.*8-TF/ }));
    const end = new Event("transitionend", { bubbles: true });
    Object.defineProperty(end, "propertyName", { value: "width" });
    fireEvent(screen.getByLabelText("분석 품목 탐색"), end);
    expect(screen.queryByRole("table", { name: "원가분석 품목 목록" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("원가를 불러오는 중");
  });
  it("배경 클릭은 유지하고 Escape와 닫기로 복귀한다", () => {
    const close = vi.fn();
    render(<CostAnalysisWorkspace initialItemId={null} onClose={close} />);
    fireEvent.click(screen.getByRole("region", { name: "원가 분석" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("작업자 초기 복원은 허용하고 이후 계정 전환은 닫는다", () => {
    state.token = null;
    const close = vi.fn();
    const view = render(<CostAnalysisWorkspace initialItemId={null} onClose={close} />);
    state.token = "t";
    view.rerender(<CostAnalysisWorkspace initialItemId={null} onClose={close} />);
    expect(close).not.toHaveBeenCalled();
    state.token = "other";
    view.rerender(<CostAnalysisWorkspace initialItemId={null} onClose={close} />);
    expect(close).toHaveBeenCalledOnce();
  });
  it("가계도에서 이미 처리한 Esc는 작업창을 닫지 않는다", () => {
    const close = vi.fn();
    render(<CostAnalysisWorkspace initialItemId={null} onClose={close} />);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(document, event);
    expect(close).not.toHaveBeenCalled();
  });
  it("미저장 편집은 폐기 확인을 거치며 취소하면 유지한다", () => {
    editable();
    const close = vi.fn();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={close} />);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    fireEvent.click(screen.getByRole("button", { name: "입력 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "대시보드로 돌아가기" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소", exact: true }));
    expect(screen.getByTestId("purchase-info-form")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "대시보드로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 버리기" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("공통 대시보드 탐색으로 닫을 때 폐기 확인 한 번으로 재고 화면에 돌아간다", () => {
    editable();
    function Owner() {
      const navigation = useDashboardNavigation()!;
      const navigate = navigation.navigate;
      useEffect(() => navigate("cost"), [navigate]);
      return navigation.view === "cost"
        ? <CostAnalysisWorkspace initialItemId="a" onClose={() => navigate("inventory")} />
        : <p>재고 화면</p>;
    }
    window.history.replaceState({}, "", "/mes?tab=dashboard");
    render(<DashboardNavigationProvider><Owner /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    fireEvent.click(screen.getByRole("button", { name: "입력 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "대시보드로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 버리기" }));
    expect(screen.getByText("재고 화면")).toBeVisible();
    expect(screen.queryByRole("button", { name: "변경 내용 버리기" })).not.toBeInTheDocument();
  });
  it("공유 선택 버튼을 사용할 때 별도 버튼을 만들지 않고 저장 중 상태를 전달한다", () => {
    editable();
    const target = document.createElement("div"); document.body.append(target);
    const busy = vi.fn();
    const view = render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} headerTarget={target} renderDashboardSwitch={false} onNavigationBusyChange={busy} />);
    expect(screen.queryByRole("group", { name: "대시보드 보기" })).not.toBeInTheDocument();
    expect(busy).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    fireEvent.click(screen.getByRole("button", { name: "저장 시작" }));
    expect(busy).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "저장 완료" }));
    expect(busy).toHaveBeenLastCalledWith(false);
    view.unmount(); target.remove();
  });
  it("생산 가능으로 이동할 때 미저장 확인과 저장 중 차단을 유지한다", () => {
    editable();
    const target = document.createElement("div"); document.body.append(target);
    const navigate = vi.fn();
    const view = render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} headerTarget={target} onDashboardViewChange={navigate} />);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    fireEvent.click(screen.getByRole("button", { name: "입력 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "생산 가능", exact: true }));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소", exact: true }));
    expect(screen.getByTestId("purchase-info-form")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "저장 시작" }));
    expect(screen.getByRole("button", { name: "생산 가능", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "저장 완료" }));
    fireEvent.click(screen.getByRole("button", { name: "입력 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "생산 가능", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 버리기" }));
    expect(navigate).toHaveBeenCalledWith("capacity");
    view.unmount(); target.remove();
  });
  it("저장 중에는 전환과 닫기를 막고 성공하면 정보 화면을 유지한다", () => {
    editable();
    const close = vi.fn();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={close} />);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    fireEvent.click(screen.getByRole("button", { name: "저장 시작" }));
    expect(screen.getByRole("button", { name: "대시보드로 돌아가기" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "가계도" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "저장 완료" }));
    expect(screen.getByTestId("purchase-info-form")).toBeVisible();
    expect(screen.getByRole("tab", { name: "가계도" })).not.toBeDisabled();
    expect(close).not.toHaveBeenCalled();
  });
  it("정보 탭의 미저장 입력은 폐기 확인하고 다시 열면 선택 품목을 유지한다", () => {
    editable();
    render(<CostAnalysisWorkspace initialItemId="a" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.getByTestId("purchase-info-form")).toHaveTextContent("입력 대상 a");
    expect(screen.getByRole("heading", { name: "튜브" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "입력 변경" }));
    fireEvent.click(screen.getByRole("tab", { name: "가계도" }));
    fireEvent.click(screen.getByRole("button", { name: "취소", exact: true }));
    expect(screen.getByTestId("purchase-info-form")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "가계도" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 버리기" }));
    expect(screen.queryByTestId("purchase-info-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "정보" }));
    expect(screen.getByTestId("purchase-info-form")).toHaveTextContent("입력 대상 a");
  });
});
