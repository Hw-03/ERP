import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-core";
import { DraftCartPanel } from "../DraftCartPanel";

const state = vi.hoisted(() => ({
  mine: { stockDrafts: [] as unknown[], ioDrafts: [] as unknown[] },
  mineLoading: false,
  list: { data: undefined as unknown, isPending: false, isFetching: false, isError: false, error: null as unknown, refetch: vi.fn() },
  detail: { data: undefined as unknown, isPending: false, isFetching: false, isError: false, error: null as unknown, refetch: vi.fn() },
  query: vi.fn(),
}));
const motion = vi.hoisted(() => ({ reduced: false }));
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
  work_type: "process", sub_type: "produce", request_type: null,
  movement_summary: { increase: 1, decrease: 13, move: 2 },
  targets: [
    { item_id: "item-1", item_name: "긴 이름의 작업 대상 품목", mes_code: "P-1", quantity: 2, unit: "개" },
    { item_id: "item-2", item_name: "길이 자재", mes_code: null, quantity: 3, unit: "m" },
  ],
  created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:30:00Z",
};
const own = { ...other, id: "my-work", requester_employee_id: "emp-1", requester_name: "내 담당자" };
const props = { layout: "desktop" as const, employeeId: "emp-1", refreshNonce: 0, onContinue: vi.fn(), onChanged: vi.fn() };
function openAll(): void { fireEvent.click(screen.getByRole("button", { name: "전체 작업" })); }

describe("공유 작업함", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  beforeEach(() => {
    vi.clearAllMocks();
    motion.reduced = false;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: motion.reduced })));
    state.mine = { stockDrafts: [], ioDrafts: [] };
    state.mineLoading = false;
    state.list = { ...state.list, data: { items: [other, own], total: 2, skip: 0, limit: 30 }, isPending: false, isFetching: false, isError: false, error: null };
    state.detail = { ...state.detail, data: undefined, isPending: false, isError: false, error: null };
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
    expect(within(otherCard).getByText("3 m")).toBeVisible();
    expect(screen.queryByText("2건")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 저장순")).not.toBeInTheDocument();
    expect(count).toHaveBeenLastCalledWith(0);
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30 }, null);
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
    expect(state.query).toHaveBeenLastCalledWith("emp-3", { skip: 0, limit: 30 }, null);
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
      "", "저장 시각", "담당자 · 부서", "작업", "대상", "품목코드", "예정 변동",
    ]);
    for (const target of other.targets) {
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
    expect(screen.getByRole("cell", { name: `${other.targets[0].item_name} ${other.targets[0].quantity} ${other.targets[0].unit}` })).toBeVisible();
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
    fireEvent.click(screen.getByText(other.targets[1].item_name));
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("예정 정보를 모르는 작업을 변동 없음과 구분한다", () => {
    state.list.data = { items: [{ ...other, movement_summary: null }, { ...own, movement_summary: { increase: 0, decrease: 0, move: 0 } }], total: 2, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    expect(screen.getByText("예정 확인 필요")).toBeVisible();
    expect(screen.getByText("변동 없음")).toBeVisible();
  });

  it("전체 상세에서 작업 대상과 예정 변동만 표시하고 별도 예약 행은 생략한다", () => {
    const manyTargets = [...other.targets, { item_id: "third", item_name: "상세에서 확인할 세번째 품목", mes_code: null, unit: "개", quantity: 1 }];
    const summary = { ...other, targets: manyTargets };
    state.list.data = { items: [summary], total: 1, skip: 0, limit: 30 };
    state.detail.data = { ...summary, reservation_status: "reserved", reservation_issue: null, forecast_issue: null,
      reserved_inputs: [{ item_id: "material", item_name: "예약한 자재", mes_code: "M-1", unit: "m", quantity: 3, location: { bucket: "warehouse", department: null }, source: "draft", stock_request_id: null, operation_line_ids: [] }],
      expected_effects: [{ item_id: "made", item_name: "완료 예정 품목", mes_code: null, unit: "개", quantity: 2, effect_id: "in-1", operation_line_id: "line-1", bundle_id: "bundle", kind: "in", from: null, to: { bucket: "production", department: "조립" } }],
    };
    render(<DraftCartPanel {...props} />);
    openAll();
    expect(screen.getByText("외 1개 품목")).toBeVisible();
    expect(screen.queryByText("상세에서 확인할 세번째 품목")).not.toBeInTheDocument();
    expect(screen.getByText("10/22 09:30")).toBeVisible();
    expect(screen.getByText("10/22 09:30")).toHaveAttribute("title", "2026년 10월 22일 09시 30분");
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(screen.getByText("상세에서 확인할 세번째 품목")).toBeVisible();
    expect(screen.queryByRole("region", { name: "예약 자재" })).not.toBeInTheDocument();
    expect(screen.queryByText("예약한 자재")).not.toBeInTheDocument();
    expect(screen.getByText("완료 예정 품목")).toBeVisible();
    expect(screen.getByText("입고 · 조립")).toBeVisible();
    expect(screen.queryByRole("button", { name: /삭제|이어서|제출/ })).not.toBeInTheDocument();
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
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, requester_department: "조립" }, null);
    fireEvent.click(toggle);
    expect(screen.queryByRole("group", { name: "부서 구분" })).not.toBeInTheDocument();
    expect(departments.closest("[inert]")).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("group", { name: "부서 구분" })).toBe(departments);
    expect(screen.getByRole("button", { name: "조립", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "전체", exact: true }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, requester_department: undefined }, null);
    fireEvent.click(screen.getByRole("button", { name: "AS", exact: true }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, requester_department: "AS" }, null);
  });

  it("필터를 바꾸면 페이지와 상세 선택을 함께 초기화한다", () => {
    state.list.data = { items: [other], total: 65, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30 }, null);
    fireEvent.click(screen.getByRole("button", { name: "다른 담당자 작업 상세 펼치기" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30 }, { kind: "io", id: "other-work" });
    fireEvent.change(screen.getByRole("textbox", { name: "전체 작업 검색" }), { target: { value: "자재" } });
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30, search: "자재" }, null);
  });

  it("저장 시각 머리글은 시간순을 왕복하며 페이지와 상세 선택을 초기화한다", () => {
    state.list.data = { items: [other], total: 65, skip: 0, limit: 30 };
    render(<DraftCartPanel {...props} />);
    openAll();
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
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 30, limit: 30 }, null);
    state.list.data = { items: [own], total: 31, skip: 30, limit: 30 };
    rerender(<DraftCartPanel {...props} layout={layout} />);
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    expect(screen.getByText("31–31 / 31건")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30 }, null);
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
    expect(state.query).toHaveBeenLastCalledWith("emp-1", { skip: 0, limit: 30 }, null);
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
