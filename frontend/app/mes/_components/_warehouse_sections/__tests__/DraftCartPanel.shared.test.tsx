import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-core";
import { saveWorkListReturn } from "@/lib/work-draft-navigation";
import { DraftCartPanel } from "../DraftCartPanel";

const state = vi.hoisted(() => ({
  mine: { stockDrafts: [] as unknown[], ioDrafts: [] as unknown[] },
  mineLoading: false,
  list: { data: undefined as unknown, isPending: false, isFetching: false, isError: false, error: null as unknown, refetch: vi.fn() },
  detail: { data: undefined as unknown, isPending: false, isFetching: false, isError: false, error: null as unknown, refetch: vi.fn() },
  query: vi.fn(),
}));
const motion = vi.hoisted(() => ({ reduced: false }));
const login = vi.hoisted(() => ({ employeeId: "emp-1", token: "login-1", version: 0 }));
vi.mock("@/lib/auth/operator-session", () => ({
  restoreOperatorSession: (employeeId?: string) => !employeeId || employeeId === login.employeeId
    ? { employee_id: login.employeeId, token: login.token } : null,
}));
vi.mock("../../login/useCurrentOperator", () => ({
  getOperatorAccessContext: () => ({ employeeId: login.employeeId, login: 1, version: login.version }),
}));
vi.mock("next/link", () => ({ default: ({ href, onClick, children, ...rest }: React.ComponentProps<"a">) =>
  <a {...rest} href={href} onClick={(event) => { onClick?.(event); event.preventDefault(); }}>{children}</a>,
}));
vi.mock("@/lib/queries/useDraftCartQuery", () => ({
  useDraftCartQuery: () => ({ data: state.mineLoading ? undefined : state.mine, isLoading: state.mineLoading, error: null, refetch: vi.fn() }),
  useDeleteIoDraftMutation: () => ({ mutate: vi.fn() }),
  useDeleteStockRequestDraftMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/queries/useWorkDrafts", () => ({
  useWorkDrafts: (...args: unknown[]) => { state.query(...args); return { list: state.list, detail: state.detail }; },
}));
vi.mock("@/lib/queries/useEmployeesQuery", () => ({ useEmployeesQuery: () => ({ data: [], isError: false }) }));
vi.mock("@/lib/queries/useDepartmentsQuery", () => ({ useDepartmentsQuery: () => ({ data: [], isError: false }) }));
vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-department-tube)" }));

const other = {
  kind: "io", id: "other-work", requester_employee_id: "emp-2", requester_name: "다른 담당자", requester_department: "조립", requester_active: true,
  work_type: "process", sub_type: "produce", request_type: null, notes: "첫 줄 메모\n둘째 줄 메모",
  movement_summary: { increase: 1, decrease: 13, move: 2 },
  targets: [
    { item_id: "item-1", item_name: "긴 이름의 작업 대상 품목", mes_code: "P-1", quantity: 2, unit: "개" },
    { item_id: "item-2", item_name: "길이 자재", mes_code: null, quantity: 3, unit: "m" },
  ],
  created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:30:00Z",
};
const own = { ...other, id: "my-work", requester_employee_id: "emp-1", requester_name: "내 담당자" };
const shipping = {
  ...other, kind: "shipping", id: "shipping-work", requester_employee_id: null,
  requester_name: "영업 요청자", requester_department: "출하", requester_active: false,
  worker_names: "김철수, 이영희, 박민수", work_type: null, sub_type: null,
  movement_summary: null,
  targets: [{ item_id: "final-pf", item_name: "출하할 완제품", mes_code: "4-PF-0010", quantity: 24, unit: "EA" }],
};
const props = { layout: "desktop" as const, employeeId: "emp-1", refreshNonce: 0, onContinue: vi.fn(), onChanged: vi.fn() };
function openAll(): void { fireEvent.click(screen.getByRole("button", { name: "전체 작업" })); }

describe("공유 작업함", () => {
  it("전체 작업을 스크롤하면 탭을 접고 맨 위로 돌아와야 다시 펼친다", () => {
    render(<DraftCartPanel {...props} defaultScope="all" />);
    const list = screen.getByRole("region", { name: "전체 작업 중 목록" });
    const panel = screen.getByRole("region", { name: "전체 작업 목록" });
    Object.defineProperties(list, { scrollHeight: { value: 1200 }, clientHeight: { value: 600 } });
    fireEvent.scroll(list, { target: { scrollTop: 24 } });
    expect(panel).toHaveAttribute("data-work-list-scrolled", "true");
    fireEvent.scroll(list, { target: { scrollTop: 180 } });
    expect(panel).toHaveAttribute("data-work-list-scrolled", "true");
    // 탭이 접히며 목록 높이가 늘어도 중간 위치에서는 다시 펼치지 않는다.
    fireEvent.scroll(list, { target: { scrollTop: 20 } });
    expect(panel).toHaveAttribute("data-work-list-scrolled", "true");
    expect(screen.getByRole("textbox", { name: "전체 작업 검색" })).toBeVisible();
    fireEvent.scroll(list, { target: { scrollTop: 0 } });
    expect(panel).not.toHaveAttribute("data-work-list-scrolled", "true");
  });

  it("전체 작업을 다시 열면 이전의 접힌 탭 상태를 남기지 않는다", () => {
    render(<DraftCartPanel {...props} defaultScope="all" />);
    fireEvent.scroll(screen.getByRole("region", { name: "전체 작업 중 목록" }), { target: { scrollTop: 180 } });
    expect(screen.getByRole("region", { name: "전체 작업 목록" })).toHaveAttribute("data-work-list-scrolled", "true");
    fireEvent.click(screen.getByRole("button", { name: "내 작업", exact: true }));
    openAll();
    expect(screen.getByRole("region", { name: "전체 작업 목록" })).not.toHaveAttribute("data-work-list-scrolled", "true");
  });

  it.each(["desktop", "mobile"] as const)("%s 부서 승인 담당자는 전체 작업으로 진입하고 내 작업도 선택할 수 있다", (layout) => {
    const { rerender, unmount } = render(<DraftCartPanel {...props} layout={layout} defaultScope="all" />);
    expect(screen.getByRole("button", { name: "전체 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "내 작업", exact: true }));
    rerender(<DraftCartPanel {...props} layout={layout} defaultScope="all" refreshNonce={1} />);
    expect(screen.getByRole("button", { name: "내 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
    unmount();
    render(<DraftCartPanel {...props} layout={layout} defaultScope="all" />);
    expect(screen.getByRole("button", { name: "전체 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  it("직원·부서 승인 권한이 바뀌면 해당 기본 조회 범위로 초기화한다", () => {
    const { rerender } = render(<DraftCartPanel {...props} defaultScope="all" />);
    expect(screen.getByRole("button", { name: "전체 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
    rerender(<DraftCartPanel {...props} defaultScope="mine" />);
    expect(screen.getByRole("button", { name: "내 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
    rerender(<DraftCartPanel {...props} employeeId="emp-3" defaultScope="all" />);
    expect(screen.getByRole("button", { name: "전체 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
  it.each(["desktop", "mobile"] as const)("%s 전체 작업의 구형 메모는 내부 JSON 대신 사용자 메모를 표시한다", (layout) => {
    const legacy = { ...other, kind: "stock_request", notes: JSON.stringify({ memo: "구형 사용자 메모", internal: "INTERNAL-PAYLOAD" }) };
    state.list.data = { items: [legacy], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...legacy, reserved_inputs: null, expected_effects: null };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.getByLabelText("작업 메모")).toHaveTextContent("구형 사용자 메모");
    expect(screen.queryByText(/INTERNAL-PAYLOAD/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(screen.getAllByLabelText("작업 메모")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "전체 작업 메모" })).not.toBeInTheDocument();
    if (layout === "desktop") expect(screen.getByLabelText("작업 메모")).toHaveClass("text-center", "text-sm", "font-medium", "leading-6");
    expect(screen.queryByText(/INTERNAL-PAYLOAD/)).not.toBeInTheDocument();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    login.employeeId = "emp-1"; login.token = "login-1"; login.version = 0;
    motion.reduced = false;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: motion.reduced })));
    state.mine = { stockDrafts: [], ioDrafts: [] };
    state.mineLoading = false;
    state.list = { ...state.list, data: { items: [other, own], total: 2, skip: 0, limit: 30 }, isPending: false, isFetching: false, isError: false, error: null };
    state.detail = { ...state.detail, data: undefined, isPending: false, isError: false, error: null };
  });

  it("검색·필터 높이가 바뀌면 데스크톱 열 제목의 고정 위치도 갱신하고 해제한다", () => {
    let height = 72;
    let resize: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height } as DOMRect));
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const { unmount } = render(<DraftCartPanel {...props} defaultScope="all" />);
    const surface = screen.getByRole("region", { name: "전체 작업 목록" });
    expect(surface.style.getPropertyValue("--work-search-height")).toBe("72px");
    height = 144;
    act(() => resize([], {} as ResizeObserver));
    expect(surface.style.getPropertyValue("--work-search-height")).toBe("144px");
    unmount();
    expect(surface.style.getPropertyValue("--work-search-height")).toBe("");
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("모바일 작업 목록에는 데스크톱 검색 높이 감시를 추가하지 않는다", () => {
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe = observe; disconnect() {} });
    render(<DraftCartPanel {...props} layout="mobile" defaultScope="all" />);
    expect(screen.getByRole("region", { name: "전체 작업 목록" }).style.getPropertyValue("--work-search-height")).toBe("");
    expect(observe).not.toHaveBeenCalled();
  });

  it("출하 링크로 떠난 이력에는 전체 목록의 조건·펼침·스크롤을 복원한다", () => {
    window.history.replaceState({ __NA: true, tree: "keep-next-state" }, "", "/mes?tab=warehouse");
    state.list.data = { items: [shipping], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...shipping, shipping_summary: { invoice_number: "INV", companion_lines: [] } };
    const view = render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.change(screen.getByRole("textbox", { name: "전체 작업 검색" }), { target: { value: "ADX" } });
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.click(screen.getByRole("button", { name: "출하", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "저장 시각 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: `${shipping.worker_names} 작업 상세 펼치기` }));
    const list = screen.getByRole("region", { name: "전체 작업 중 목록" });
    Object.defineProperties(list, { scrollHeight: { value: 1600, configurable: true }, clientHeight: { value: 400, configurable: true } });
    fireEvent.scroll(list, { target: { scrollTop: 550, scrollLeft: 30 } });
    fireEvent.click(screen.getByRole("link", { name: "출하에서 열기" }));
    expect(new URLSearchParams(window.location.search).get("section")).toBe("cart");
    expect(window.history.state).toMatchObject({ __NA: true, tree: "keep-next-state" });
    const source = { state: window.history.state, url: window.location.href };
    view.unmount();
    window.history.pushState(null, "", "/mes?tab=shipping&shippingView=requestDetail&shippingRequestId=shipping-work");
    window.history.replaceState(source.state, "", source.url);
    render(<DraftCartPanel {...props} />);
    expect(screen.getByRole("button", { name: "전체 작업" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "전체 작업 검색" })).toHaveValue("ADX");
    expect(screen.getByRole("button", { name: "필터" })).toHaveAttribute("aria-expanded", "true");
    expect(state.query).toHaveBeenLastCalledWith("emp-1", expect.objectContaining({ search: "ADX", requester_department: "출하", sort: "updated_desc" }), { kind: "shipping", id: "shipping-work" });
    expect(screen.getByRole("region", { name: "전체 작업 목록" })).toHaveAttribute("data-work-list-scrolled", "true");
  });

  it("복원 대상이 최신 목록에서 사라지면 펼침만 해제하고 검색 조건을 유지한다", () => {
    saveWorkListReturn("emp-1", { scope: "all", filters: { search: "BAT", skip: 0 }, filtersOpen: false,
      selected: { kind: "shipping", id: "shipping-work" }, scrollTop: 500, scrollLeft: 0, listScrolled: true });
    state.list.data = { items: [], total: 0, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    expect(screen.getByRole("textbox", { name: "전체 작업 검색" })).toHaveValue("BAT");
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { search: "BAT", skip: 0 }, null);
    expect(screen.queryByRole("link", { name: "출하에서 열기" })).not.toBeInTheDocument();
  });

  it("수정 키로 새 탭을 여는 링크는 원본 이력의 URL과 상태를 바꾸지 않는다", () => {
    state.list.data = { items: [shipping], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...shipping, shipping_summary: { invoice_number: "INV", companion_lines: [] } };
    render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: `${shipping.worker_names} 작업 상세 펼치기` }));
    const original = { url: window.location.href, state: window.history.state };
    fireEvent.click(screen.getByRole("link", { name: "출하에서 열기" }), { ctrlKey: true });
    expect(window.location.href).toBe(original.url);
    expect(window.history.state).toEqual(original.state);
  });

  it("빈 내 작업에서도 범위 전환을 유지하고 전체의 타인 작업에는 변경 행동을 제공하지 않는다", () => {
    const count = vi.fn();
    render(<DraftCartPanel {...props} layout="mobile" onCountChange={count} />);
    expect(screen.getByRole("button", { name: "내 작업" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeVisible();
    openAll();
    const otherCard = screen.getByRole("article", { name: "다른 담당자 작업" });
    expect(within(otherCard).queryByRole("button", { name: /삭제|이어서|제출|내 작업에서 보기/ })).not.toBeInTheDocument();
    expect(within(otherCard).getByText("2 개")).toBeVisible();
    expect(within(otherCard).queryByText("3 m")).not.toBeInTheDocument();
    expect(within(otherCard).getByText("외 1개 품목")).toBeVisible();
    expect(within(otherCard).getByText(/첫 줄 메모/)).toHaveClass("line-clamp-2");
    expect(screen.queryByText("2건")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 저장순")).not.toBeInTheDocument();
    expect(count).toHaveBeenLastCalledWith(0);
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department" }, null);
  });

  it("직원 변경 시 내 작업으로 돌아오고 범위와 필터를 초기화한다", () => {
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "내 작업", exact: true }));
    expect(screen.getByRole("button", { name: "내 작업" })).toHaveAttribute("aria-pressed", "true");
    openAll();
    fireEvent.change(screen.getByRole("textbox", { name: "전체 작업 검색" }), { target: { value: "품목" } });
    rerender(<DraftCartPanel {...props} employeeId="emp-3" />);
    expect(screen.getByRole("button", { name: "내 작업" })).toHaveAttribute("aria-pressed", "true");
    openAll();
    expect(screen.getByRole("textbox", { name: "전체 작업 검색" })).toHaveValue("");
    expect(state.query).toHaveBeenLastCalledWith("emp-3", { skip: 0, limit: 30, sort: "department" }, null);
  });

  it.each(["desktop", "mobile"] as const)("%s 출하는 전체 작업에서 작업자와 출하 부서를 표시하고 출하 상세로 연결한다", (layout) => {
    state.list.data = { items: [shipping, other], total: 2, skip: 0, limit: 30 };
    state.detail.data = {
      ...shipping, reservation_status: null, reservation_issue: null, reserved_inputs: null, expected_effects: null, forecast_issue: null,
      shipping_summary: { invoice_number: "DEXCO-TEST", companion_lines: [
        { item_id: "battery", item_name: "동반 배터리", mes_code: "BAT-1", quantity: 30, unit: "EA" },
      ] },
    };
    render(<DraftCartPanel {...props} layout={layout} />);
    expect(screen.queryByText(shipping.worker_names)).not.toBeInTheDocument();
    openAll();
    expect(screen.getByText(shipping.worker_names)).toBeVisible();
    expect(screen.getByText("출하", { exact: true, selector: "p" })).toBeVisible();
    expect(screen.getByText("출하 준비", { exact: true })).toBeVisible();
    expect(screen.getByText("픽업 시 출고")).toBeVisible();
    expect(screen.queryByText(/비활성 담당자/)).not.toBeInTheDocument();
    expect(screen.queryByText(shipping.requester_name)).not.toBeInTheDocument();
    expect(screen.getByText(other.requester_name)).toBeVisible();
    expect(screen.getByText(other.requester_department, { exact: true, selector: "p" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: `${shipping.worker_names} 작업 상세 펼치기` }));
    expect(screen.getByText(shipping.requester_name)).toBeVisible();
    expect(screen.getByText("DEXCO-TEST")).toBeVisible();
    expect(screen.getByText("동반 배터리")).toBeVisible();
    expect(screen.getByText("30 EA")).toBeVisible();
    expect(screen.queryByText("이전 요청은 예정 변동 정보를 제공하지 않습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "출하에서 열기" })).toHaveAttribute("href", "/mes?tab=shipping&shippingView=requestDetail&shippingRequestId=shipping-work");
  });

  it.each(["desktop", "mobile"] as const)("%s 출하 작업자 미입력은 요청자로 대체하지 않고 표시한다", (layout) => {
    state.list.data = { items: [{ ...shipping, worker_names: null }], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...shipping, worker_names: null, shipping_summary: { invoice_number: null, companion_lines: [] } };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.getByText("작업자 미입력")).toBeVisible();
    expect(screen.queryByText(shipping.requester_name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "작업자 미입력 작업 상세 펼치기" }));
    expect(screen.getByText(shipping.requester_name)).toBeVisible();
    expect(screen.getByText("인보이스 미입력")).toBeVisible();
    expect(screen.queryByText("동반 출하품이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "동반 출하품" })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 전체 목록은 본인 작업에도 상세 조회만 제공한다", (layout) => {
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.queryByRole("button", { name: "내 작업에서 보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 담당자 작업 상세 펼치기" })).toBeVisible();
    expect(screen.queryByText("생산", { exact: true })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 전체 작업은 조사 상태만 보여주고 재개 동작을 제공하지 않는다", (layout) => {
    state.list.data = { items: [{ ...other, stocktake_pause: { token: "pause", round_id: "round", state: "blocked", paused_at: "now", pending_target_count: 1, missing_target_count: 1 } }], total: 1, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.getByText("조사 대상 확인 필요")).toBeVisible();
    expect(screen.queryByRole("button", { name: /작업 재개|남은 수량 확인/ })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 작업명은 완료 내역의 분류를 사용한다", (layout) => {
    state.list.data = { items: [
      { ...other, history_operation: { transaction_type: "PRODUCE", department: "조립" } },
      { ...other, id: "disassembly", sub_type: "disassemble", history_operation: { transaction_type: "DISASSEMBLE", department: "조립" } },
      { ...other, id: "manual", sub_type: "adjust_in", history_operation: { transaction_type: "ADJUST", department: "조립" } },
      { ...other, id: "tube", work_type: "tube_material", sub_type: "tube_outbound_supplier", history_operation: { transaction_type: "MATERIAL_OUT", department: "튜브" } },
      { ...other, id: "as-use", work_type: "internal_use", sub_type: "internal_use_out", history_operation: { transaction_type: "INTERNAL_USE", department: "AS" } },
      { ...other, id: "defect", work_type: "defect", sub_type: "defect_quarantine", history_operation: { transaction_type: "MARK_DEFECTIVE", department: "조립" } },
      { ...other, id: "rework", kind: "stock_request", work_type: null, sub_type: null, request_type: "rework_normal", history_operation: { transaction_type: "DISASSEMBLE", department: "조립" } },
    ], total: 7, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    for (const [label, icon] of [
      ["생산 입고", "hammer"], ["분해 출고", "wrench"], ["부서 입출고", "sliders-vertical"],
      ["튜브 원자재 출고", "arrow-up-from-line"], ["AS 사용", "arrow-up-from-line"],
      ["불량 격리", "shield-alert"], ["재작업", "wrench"],
    ]) {
      expect(screen.getByText(label, { exact: true })).toBeVisible();
      expect(screen.getByText(label, { exact: true }).parentElement?.querySelector("svg")).toHaveClass(`lucide-${icon}`);
    }
  });

  it("전체 작업을 접고 펴도 외부 레일과 표의 고정 열 구조를 유지한다", () => {
    state.detail.data = { ...other, reserved_inputs: [], expected_effects: [] };
    render(<DraftCartPanel {...props} />);
    openAll();
    const viewport = screen.getByRole("region", { name: "전체 작업 중 목록" });
    const table = screen.getByRole("table", { name: "전체 작업" });
    const columns = table.querySelector("colgroup")!.outerHTML;
    const header = table.querySelector("thead")!;
    expect(viewport).toHaveClass("sg", "absolute", "-right-2.5", "overflow-auto", "[scrollbar-gutter:stable]");
    expect(viewport.parentElement).toHaveClass("relative", "min-h-0", "flex-1");
    expect(header).toHaveClass("sticky", "top-0");
    const frame = viewport.parentElement!.querySelector("[data-scrollbar-rail-frame]")!;
    expect(frame).toHaveClass("inset-0", "pointer-events-none");
    expect(frame.parentElement).toBe(viewport.parentElement);
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(screen.getByRole("table", { name: "전체 작업" })).toBe(table);
    expect(table.querySelector("colgroup")!.outerHTML).toBe(columns);
    expect(table.querySelector("thead")).toBe(header);
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 접기" }));
    expect(screen.getByRole("region", { name: "전체 작업 중 목록" })).toBe(viewport);
    expect(table.querySelector("colgroup")!.outerHTML).toBe(columns);
  });

  it("수량 열 없이 작업 수량을 해당 품목명 옆에 표시한다", () => {
    state.list.data = { items: [other], total: 1, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    const table = screen.getByRole("table", { name: "전체 작업" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "", "저장 시각", "담당자 · 부서", "작업", "대상", "메모", "품목코드", "예정 변동",
    ]);
    expect(within(table).queryByText(other.targets[1].item_name)).not.toBeInTheDocument();
    expect(within(table).getByText("외 1개 품목")).toBeVisible();
    expect(within(table).getByText(/첫 줄 메모/)).toHaveClass("line-clamp-2");
    for (const target of other.targets.slice(0, 1)) {
      const row = within(table).getByText(target.item_name).closest("tr")!;
      const name = within(row).getByText(target.item_name);
      const quantity = within(row).getByText(`${target.quantity} ${target.unit}`);
      expect(quantity).toBeVisible();
      expect(quantity.closest("td")).toBe(name.closest("td"));
    }
    expect(within(table).getByRole("cell", { name: "P-1" })).toBeVisible();
    expect(within(table).getByText("감소 13종")).toBeVisible();
    expect(within(table).getByText("증가 1종")).toBeVisible();
    expect(within(table).getByText("이동 2종")).toBeVisible();
    expect(within(table).queryByText("상세", { exact: true })).not.toBeInTheDocument();
  });

  it("전체 작업은 스켈레톤과 강제 대기 없이 준비된 행 위의 덮개를 걷어낸다", () => {
    state.list = { ...state.list, data: undefined, isPending: true };
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    const frame = screen.getByRole("region", { name: "전체 작업 중 목록" });
    const header = within(frame).getByRole("columnheader", { name: "품목코드" });
    const search = screen.getByRole("textbox", { name: "전체 작업 검색" });
    expect(frame).toHaveAttribute("aria-busy", "true");
    expect(within(frame).getByRole("status")).toHaveTextContent("전체 작업 목록 불러오는 중");
    expect(screen.queryByText(other.targets[0].item_name)).not.toBeInTheDocument();
    state.list = { ...state.list, data: { items: [other], total: 1, skip: 0, limit: 30 }, isPending: false };
    rerender(<DraftCartPanel {...props} />);
    expect(screen.getByRole("region", { name: "전체 작업 중 목록" })).toBe(frame);
    expect(within(frame).getByRole("columnheader", { name: "품목코드" })).toBe(header);
    expect(screen.getByRole("textbox", { name: "전체 작업 검색" })).toBe(search);
    expect(frame).toHaveAttribute("aria-busy", "false");
    expect(within(frame).queryByRole("status")).not.toBeInTheDocument();
    const cover = frame.querySelector("[data-work-content-cover]")!;
    expect(cover).toBeInTheDocument();
    expect(cover).toHaveClass("desktop-loading-cover-exit");
    expect(cover).toHaveStyle({ animationDuration: "220ms" });
    expect(cover.querySelector(".animate-pulse, .motion-safe\\:animate-pulse")).not.toBeInTheDocument();
    fireEvent.animationEnd(cover.querySelector("th")!);
    expect(cover).toBeInTheDocument();
    fireEvent.animationEnd(cover);
    expect(cover).not.toBeInTheDocument();
    const row = within(frame).getByText(other.targets[0].item_name).closest("tr");
    state.list = { ...state.list, isFetching: true };
    rerender(<DraftCartPanel {...props} />);
    expect(within(frame).getByText(other.targets[0].item_name).closest("tr")).toBe(row);
    expect(within(frame).queryByRole("status")).not.toBeInTheDocument();
  });

  it("조회 중에는 덮개를 유지하고 준비되면 바로 종료를 시작한다", () => {
    vi.useFakeTimers();
    state.list = { ...state.list, data: undefined, isPending: true };
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    act(() => vi.advanceTimersByTime(220));
    expect(screen.getByRole("region", { name: "전체 작업 중 목록" })).toHaveAttribute("aria-busy", "true");
    state.list = { ...state.list, data: { items: [other], total: 1, skip: 0, limit: 30 }, isPending: false };
    rerender(<DraftCartPanel {...props} />);
    expect(screen.getByText(other.targets[0].item_name)).toBeVisible();
    expect(screen.getByRole("region", { name: "전체 작업 중 목록" })).toHaveAttribute("aria-busy", "false");
  });

  it.each(["desktop", "mobile"] as const)("%s 내 작업으로 돌아올 때도 같은 덮개 전환을 사용한다", (layout) => {
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "내 작업", exact: true }));
    const body = document.querySelector('[data-work-scope="mine"]')!;
    const cover = body.querySelector("[data-work-content-cover]")!;
    expect(cover).toHaveClass("desktop-loading-cover-exit");
    expect(cover).toHaveStyle({ animationDuration: "220ms" });
    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeInTheDocument();
    fireEvent.animationEnd(cover);
    expect(body.querySelector("[data-work-content-cover]")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 작업" })).toHaveAttribute("aria-pressed", "true");
  });

  it("내 작업 최초 조회도 스켈레톤 없이 기다리고 준비된 내용에서 전환한다", () => {
    state.mineLoading = true;
    const { rerender } = render(<DraftCartPanel {...props} />);
    const cover = document.querySelector("[data-work-content-cover]")!;
    expect(cover).not.toHaveClass("desktop-loading-cover-exit");
    expect(cover).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveTextContent("요청 내역을 불러오고 있습니다");
    state.mineLoading = false;
    rerender(<DraftCartPanel {...props} />);
    expect(cover).toHaveClass("desktop-loading-cover-exit");
    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeInTheDocument();
    fireEvent.animationEnd(cover);
    expect(cover).not.toBeInTheDocument();
  });

  it("동작 줄이기에서는 애니메이션 종료 이벤트 없이 덮개를 정리한다", () => {
    vi.useFakeTimers();
    motion.reduced = true;
    state.list = { ...state.list, data: undefined, isPending: true };
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    state.list = { ...state.list, data: { items: [other], total: 1, skip: 0, limit: 30 }, isPending: false };
    rerender(<DraftCartPanel {...props} />);
    act(() => vi.advanceTimersByTime(220));
    expect(document.querySelector("[data-work-content-cover]")).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: new RegExp(other.targets[0].item_name) })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "내 작업", exact: true }));
    expect(document.querySelector("[data-work-content-cover]")).not.toBeInTheDocument();
  });

  it("진입 중 조회 실패는 덮개 없이 바로 알린다", () => {
    vi.useFakeTimers();
    state.list = { ...state.list, data: undefined, isPending: true };
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    state.list = { ...state.list, isPending: false, isError: true, error: new Error("진입 조회 실패") };
    rerender(<DraftCartPanel {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("진입 조회 실패");
    expect(screen.getByRole("region", { name: "전체 작업 중 목록" })).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("전체 작업의 최초 조회 실패도 표 틀 안에서 복구할 수 있다", () => {
    state.list = { ...state.list, data: undefined, isError: true, error: new Error("첫 조회 실패") };
    render(<DraftCartPanel {...props} />);
    openAll();
    const frame = screen.getByRole("region", { name: "전체 작업 중 목록" });
    expect(within(frame).getByRole("alert")).toHaveTextContent("첫 조회 실패");
    fireEvent.click(within(frame).getByRole("button", { name: "다시 시도" }));
    expect(state.list.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("저장된 작업이 없습니다.")).not.toBeInTheDocument();
  });

  it("대상·품목코드와 행 키보드로 펼치며 화살표는 한 번만 토글한다", () => {
    state.list.data = { items: [other], total: 1, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    const row = screen.getByText(other.targets[0].item_name).closest("tr")!;
    fireEvent.click(screen.getByText(other.targets[0].item_name));
    expect(row).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByText("P-1"));
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(row, { key: " " });
    expect(row).toHaveAttribute("aria-expanded", "false");
    const arrow = screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" });
    fireEvent.keyDown(arrow, { key: "Enter" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(arrow);
    expect(row).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 접기" }));
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByText("외 1개 품목"));
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("예정 정보를 모르는 작업을 변동 없음과 구분한다", () => {
    state.list.data = { items: [{ ...other, movement_summary: null }, { ...own, movement_summary: { increase: 0, decrease: 0, move: 0 } }], total: 2, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    expect(screen.getByText("예정 확인 필요")).toBeVisible();
    expect(screen.getByText("변동 없음")).toBeVisible();
  });

  it.each([
    ["desktop", "receive", "receive_supplier"], ["mobile", "receive", "receive_supplier"],
    ["desktop", "process", "produce"], ["mobile", "process", "produce"],
  ] as const)("%s %s 상세는 중복 작업 대상 없이 예정 변동만 표시한다", (layout, work_type, sub_type) => {
    const manyTargets = [...other.targets, { item_id: "third", item_name: "상세에서 확인할 세번째 품목", mes_code: null, unit: "개", quantity: 1 }];
    const summary = { ...other, work_type, sub_type, targets: manyTargets };
    state.list.data = { items: [summary], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...summary, reservation_status: "reserved", reservation_issue: null, forecast_issue: null,
      reserved_inputs: [{ item_id: "material", item_name: "예약한 자재", mes_code: "M-1", unit: "m", quantity: 3, location: { bucket: "warehouse", department: null }, source: "draft", stock_request_id: null, operation_line_ids: [] }],
      expected_effects: [{ item_id: "made", item_name: "완료 예정 품목", mes_code: null, unit: "개", quantity: 2, effect_id: "in-1", operation_line_id: "line-1", bundle_id: "bundle", kind: "in", from: null, to: { bucket: "production", department: "조립" } }],
    };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.getByText("외 2개 품목")).toBeVisible();
    expect(screen.queryByText("상세에서 확인할 세번째 품목")).not.toBeInTheDocument();
    if (layout === "desktop") {
      expect(screen.getByText("10/22 09:30")).toBeVisible();
      expect(screen.getByText("10/22 09:30")).toHaveAttribute("title", "2026년 10월 22일 09시 30분");
    }
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(screen.queryByRole("region", { name: "작업 대상", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("상세에서 확인할 세번째 품목")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "예약 자재" })).not.toBeInTheDocument();
    expect(screen.queryByText("예약한 자재")).not.toBeInTheDocument();
    expect(screen.getByText("완료 예정 품목")).toBeVisible();
    expect(screen.getByText("입고 · 조립")).toBeVisible();
    expect(screen.queryByRole("button", { name: /삭제|이어서|제출/ })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 예정 정보가 없는 구형 작업은 펼쳐서 전체 품목을 확인한다", (layout) => {
    const legacy = { ...other, kind: "stock_request" };
    state.list.data = { items: [legacy], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...legacy, reserved_inputs: null, expected_effects: null };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    const targets = screen.getByRole("region", { name: "작업 대상", exact: true });
    expect(within(targets).getByText(other.targets[1].item_name)).toBeVisible();
  });

  it.each(["desktop", "mobile"] as const)("%s 상세는 입고·출고와 이동을 품목별로 바로 표시한다", (layout) => {
    state.list.data = { items: [other], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...other, reservation_status: "reserved", reservation_issue: null, forecast_issue: null, reserved_inputs: [],
      expected_effects: [
        { item_id: "made", item_name: "완료할 제품", mes_code: "IN-1", unit: "개", quantity: 2, effect_id: "in", operation_line_id: "in", bundle_id: "b", kind: "in", from: null, to: { bucket: "production", department: "조립" } },
        { item_id: "used", item_name: "사용할 자재", mes_code: "OUT-1", unit: "m", quantity: 3, effect_id: "out", operation_line_id: "out", bundle_id: "b", kind: "out", from: { bucket: "warehouse", department: null }, to: null },
        { item_id: "moved", item_name: "이동할 품목", mes_code: "MOVE-1", unit: "BOX", quantity: 4, effect_id: "move", operation_line_id: "move", bundle_id: "b", kind: "move", from: { bucket: "warehouse", department: null }, to: { bucket: "production", department: "튜브" } },
      ],
    };
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    const changes = screen.getByRole("region", { name: "완료 시 재고 변동" });
    expect(within(changes).getAllByText(/^(완료할 제품|사용할 자재|이동할 품목)$/).map((item) => item.textContent))
      .toEqual(["완료할 제품", "사용할 자재", "이동할 품목"]);
    expect(within(changes).getByText("+2 개")).toBeVisible();
    expect(within(changes).getByText("−3 m")).toBeVisible();
    expect(within(changes).queryByRole("columnheader", { name: "수량", exact: true })).not.toBeInTheDocument();
    expect(within(changes).queryByText("2 개", { exact: true })).not.toBeInTheDocument();
    expect(within(changes).queryByText("3 m", { exact: true })).not.toBeInTheDocument();
    expect(within(changes).getAllByText("4 BOX", { exact: true })).toHaveLength(1);
    expect(within(changes).getByText("이동 · 창고 → 튜브")).toBeVisible();
    expect(within(changes).queryByText("+4 BOX")).not.toBeInTheDocument();
    expect(within(changes).getByText("사용할 자재")).toBeVisible();
    for (const label of ["입고 예약", "출고 예약", "이동 예약"]) {
      expect(within(changes).getByText(label, { exact: true })).toBeVisible();
    }
    expect(screen.queryByRole("region", { name: "예약 자재" })).not.toBeInTheDocument();
    expect(screen.queryByText("예약된 자재가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText(/사용 자재 .*건 보기/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제|이어서|제출/ })).not.toBeInTheDocument();
  });

  it("상세의 예정 확인 실패와 실제 빈 계획을 구분하며 재시도할 수 있다", () => {
    state.list.data = { items: [other], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...other, reservation_status: "inactive", reservation_issue: null,
      forecast_issue: { code: "unsupported_legacy_plan", message: "unknown" }, reserved_inputs: [], expected_effects: [] };
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(screen.getByText("예정 수량을 확인할 수 없습니다. 수량이 없는 것은 아닙니다.")).toBeVisible();
    expect(screen.queryByText("확정된 예정이 없습니다.")).not.toBeInTheDocument();
    state.detail = { ...state.detail, isError: true, error: new Error("상세 실패") };
    rerender(<DraftCartPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.detail.refetch).toHaveBeenCalledOnce();
  });

  it.each(["desktop", "mobile"] as const)("%s 필터는 부서 칩만 한 줄로 펼치고 선택한 부서를 유지한다", (layout) => {
    render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    const toggle = screen.getByRole("button", { name: "필터" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const departments = screen.getByRole("group", { name: "부서 구분" });
    expect(departments).toHaveClass("flex", "overflow-x-auto");
    expect(within(departments).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "전체", "창고", "튜브", "고압", "진공", "튜닝", "조립", "출하", "AS",
    ]);
    for (const label of ["품목 코드 기준", "재고 위치 기준", "모델 구분", "공정 구분", "AND", "OR"]) {
      expect(screen.queryByText(label, { exact: true })).not.toBeInTheDocument();
    }
    fireEvent.click(within(departments).getByRole("button", { name: "조립", exact: true }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department", requester_department: "조립" }, null);
    fireEvent.click(toggle);
    expect(screen.queryByRole("group", { name: "부서 구분" })).not.toBeInTheDocument();
    expect(departments.closest("[inert]")).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("group", { name: "부서 구분" })).toBe(departments);
    expect(screen.getByRole("button", { name: "조립", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "전체", exact: true }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department", requester_department: undefined }, null);
    fireEvent.click(screen.getByRole("button", { name: "AS", exact: true }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department", requester_department: "AS" }, null);
  });

  it("필터를 바꾸면 페이지와 상세 선택을 함께 초기화한다", () => {
    state.list.data = { items: [other], total: 65, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30, sort: "department" }, null);
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30, sort: "department" }, { kind: "io", id: "other-work" });
    fireEvent.change(screen.getByRole("textbox", { name: "전체 작업 검색" }), { target: { value: "자재" } });
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department", search: "자재" }, null);
  });

  it("저장 시각 머리글은 시간순을 왕복하며 페이지와 상세 선택을 초기화한다", () => {
    state.list.data = { items: [other], total: 65, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    expect(screen.getByRole("columnheader", { name: "담당자 · 부서" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "저장 시각" })).not.toHaveAttribute("aria-sort");
    fireEvent.click(screen.getByRole("button", { name: "저장 시각 정렬" }));
    expect(screen.getByRole("columnheader", { name: "저장 시각" })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "저장 시각 정렬" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "updated_asc" }, null);
    expect(screen.getByRole("columnheader", { name: "저장 시각" })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "저장 시각 정렬" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "updated_desc" }, null);
    expect(screen.getByRole("columnheader", { name: "저장 시각" })).toHaveAttribute("aria-sort", "descending");
  });

  it("담당자·부서 머리글은 지정 부서순을 요청하고 검색·페이지 이동에도 유지한다", () => {
    state.list.data = { items: [other], total: 65, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.change(screen.getByRole("textbox", { name: "전체 작업 검색" }), { target: { value: "자재" } });
    fireEvent.click(screen.getByRole("button", { name: "담당자 · 부서 정렬" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, search: "자재", sort: "department" }, null);
    expect(screen.getByRole("columnheader", { name: "담당자 · 부서" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "저장 시각" })).not.toHaveAttribute("aria-sort");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30, search: "자재", sort: "department" }, null);
    fireEvent.click(screen.getByRole("button", { name: "저장 시각 정렬" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, search: "자재", sort: "updated_desc" }, null);
  });

  it.each(["desktop", "mobile"] as const)("%s 한 페이지일 때 이동 영역을 숨기고 31건부터 마지막 페이지까지 이동한다", (layout) => {
    state.list.data = { items: [other], total: 30, skip: 0, limit: 30 };
    const { rerender } = render(<DraftCartPanel {...props} layout={layout} />);
    openAll();
    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("작업 목록 페이지 이동")).not.toBeInTheDocument();
    state.list.data = { items: [other], total: 31, skip: 0, limit: 30 };
    rerender(<DraftCartPanel {...props} layout={layout} />);
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30, sort: "department" }, null);
    state.list.data = { items: [own], total: 31, skip: 30, limit: 30 };
    rerender(<DraftCartPanel {...props} layout={layout} />);
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    expect(screen.getByText("31–31 / 31건")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department" }, null);
  });

  it("목록 조회 실패를 0건이나 빈 작업으로 바꾸지 않는다", () => {
    state.list = { ...state.list, data: undefined, isError: true, error: new Error("목록 실패") };
    render(<DraftCartPanel {...props} />);
    openAll();
    expect(screen.getByRole("alert")).toHaveTextContent("목록 실패");
    expect(screen.queryByText("0건")).not.toBeInTheDocument();
    expect(screen.queryByText("저장된 작업이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("작업 목록 페이지 이동")).not.toBeInTheDocument();
  });

  it("다른 작업의 제출·삭제로 마지막 페이지가 사라지면 유효한 페이지로 복귀한다", () => {
    state.list.data = { items: [other], total: 65, skip: 0, limit: 30 };
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    state.list.data = { items: [], total: 29, skip: 30, limit: 30 };
    rerender(<DraftCartPanel {...props} />);
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, sort: "department" }, null);
    expect(screen.queryByText("31–29 / 29건")).not.toBeInTheDocument();
  });

  it("구형 요청은 예정 미제공 안내만 표시하고 예약 행은 생략한다", () => {
    const legacy = { ...other, kind: "stock_request", id: "legacy", work_type: null, sub_type: null, request_type: "raw_receive" };
    state.list.data = { items: [legacy], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...legacy, reservation_status: null, reservation_issue: null, reserved_inputs: null, expected_effects: null, forecast_issue: null };
    render(<DraftCartPanel {...props} layout="mobile" />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(screen.queryByText("이전 요청은 예약 자재 정보를 제공하지 않습니다.")).not.toBeInTheDocument();
    expect(screen.getByText("이전 요청은 예정 변동 정보를 제공하지 않습니다.")).toBeVisible();
    expect(screen.queryByText("예약된 자재가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("0개 항목")).not.toBeInTheDocument();
  });

  it("상세가 사라지면 목록을 갱신하고 변경 알림을 보여준다", () => {
    const { rerender } = render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    state.detail = { ...state.detail, isError: true, error: new ApiError("없음", 404) };
    rerender(<DraftCartPanel {...props} />);
    expect(state.list.refetch).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("작업 상태가 변경되었습니다.");
  });
});
