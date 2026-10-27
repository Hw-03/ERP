import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StocktakeManagement } from "../StocktakeManagement";
import { stocktakeApi } from "@/lib/api/stocktake";

vi.mock("@/lib/api/stocktake", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/stocktake")>(), stocktakeApi: { read: vi.fn(), command: vi.fn() } }));
let realtimeRevision = 0;
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => realtimeRevision }));

const operator = { employee_id: "admin", name: "부서 결재 담당자", role: "staff", level: "staff", department_role: "primary", warehouse_role: "none" } as Parameters<typeof StocktakeManagement>[0]["operator"];
const round = { round_id: "round-1", title: "10월 실사", status: "ACTIVE", epoch: 0, target_generation: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  realtimeRevision = 0;
  vi.mocked(stocktakeApi.read).mockImplementation(async (path: string) => {
    if (path.endsWith("/progress")) return { item_summary: { total: 3, confirmed: 1, applied: 0, unconfirmed: 2 }, summary: { total: 6, confirmed: 2, applied: 0, selected: 0, unconfirmed: 4, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [] };
    if (path.includes("/events")) return { items: [], next_cursor: null };
    if (path.includes("/targets")) return { items: [], next_cursor: null };
    if (path.includes("/rounds")) return { items: [round] };
    return { items: [] };
  });
});

describe("StocktakeManagement", () => {
  it("LAN HTTP에서도 시작 검토와 회차 시작 요청을 보낸다", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const started = vi.fn();
      vi.mocked(stocktakeApi.command).mockResolvedValue({ preview_id: "start-preview", preview_hash: "hash", target_count: 1 });
      render(<StocktakeManagement token="t" operator={operator} round={null} onChanged={vi.fn()} section="rounds" focusStart onStarted={started} />);
      fireEvent.change(screen.getByRole("textbox", { name: "회차 이름" }), { target: { value: "새 조사" } });
      fireEvent.click(screen.getByRole("button", { name: "시작 대상 확인", exact: true }));
      fireEvent.click(await screen.findByRole("button", { name: "회차 시작", exact: true }));
      await waitFor(() => expect(started).toHaveBeenCalledOnce());
      const calls = vi.mocked(stocktakeApi.command).mock.calls;
      expect(calls.map(([kind]) => kind)).toEqual(["round_start_preview", "round_start"]);
      for (const call of calls) expect(call[4]?.key).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
      expect(calls[0][4]?.key).not.toBe(calls[1][4]?.key);
    } finally { vi.unstubAllGlobals(); }
  });
  it("대기 화면의 시작 진입은 회차 이름에 초점을 두고 명령을 보내지 않는다", () => {
    render(<StocktakeManagement token="t" operator={operator} round={null} onChanged={vi.fn()} section="rounds" focusStart />);
    expect(screen.getByRole("textbox", { name: "회차 이름" })).toHaveFocus();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
  it("시작 미리보기는 머무르고 확정 성공 후에만 조사 화면 이동을 알린다", async () => {
    const started = vi.fn();
    vi.mocked(stocktakeApi.command).mockResolvedValue({ preview_id: "start-preview", preview_hash: "hash", target_count: 1 });
    render(<StocktakeManagement token="t" operator={operator} round={null} onChanged={vi.fn()} section="rounds" focusStart onStarted={started} />);
    fireEvent.change(screen.getByRole("textbox", { name: "회차 이름" }), { target: { value: "새 조사" } });
    fireEvent.click(screen.getByRole("button", { name: "시작 대상 확인", exact: true }));
    const confirm = await screen.findByRole("button", { name: "회차 시작", exact: true });
    expect(started).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(started).toHaveBeenCalledOnce());
  });
  it("부분 종료에서 제외되는 예약 부족은 종료 오류로 오인하지 않게 안내한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: true,
      summary: { total: 6, applied: 3, unconfirmed: 1, confirmed_excluded: 2, pending: 0 } });
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation((path, token) => path.includes("/close-previews/") ? Promise.resolve({ items: [
      { target_id: "target", item_name: "예약 부족 품목", scope_name: "출하", unit: "EA", classification: "CONFIRMED_EXCLUDED",
        held_details: [{ code: "RESERVATION_SHORTAGE", category: "normal", counted: 0, reserved: 1 }] },
    ], next_offset: null }) : read(path, token));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "잔여 항목 제외" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    expect(await screen.findByText("미완료 항목은 남기고, 재고를 변경하지 않은 채 종료합니다.")).toBeVisible();
    expect(await screen.findByText("수량 확인이 필요합니다.")).toBeVisible();
    expect(screen.getByText(/확인 수량 0 EA · 예약 수량 1 EA/)).toBeVisible();
    expect(screen.getByText(/실제 수량을 다시 확인하고, 예약 내역은 담당자에게 확인을 요청/)).toBeVisible();
    expect(screen.getByText(/이 품목은 이번 부분 종료에서 재고에 반영되지 않습니다/)).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)).toBeEnabled());
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });

  it("상세 수량이 없는 재고 분류 불일치도 직원이 할 일을 안내한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: false });
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation((path, token) => path.includes("/close-previews/") ? Promise.resolve({ items: [
      { target_id: "target", item_name: "분류 확인 품목", scope_name: "창고", classification: "CONFIRMED_EXCLUDED", held_reasons: ["POOL_MISMATCH"], held_details: [] },
    ], next_offset: null }) : read(path, token));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    expect(await screen.findByText("불량 재고의 분류별 수량이 서로 맞지 않습니다.")).toBeVisible();
    expect(screen.getByText(/재고 담당자에게 불량·B급·구형 수량 확인을 요청/)).toBeVisible();
    expect(screen.queryByText(/보류 코드 · POOL_MISMATCH/)).not.toBeInTheDocument();
  });

  it("추가 대상이 없으면 정상 안내만 표시하고 확정 버튼을 만들지 않는다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ no_targets: true, target_count: 0, receipt_id: "empty-receipt" });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "새 조사 대상 확인", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "추가 대상 확인", exact: true }));
    await screen.findByText("추가할 조사 대상이 없습니다.");
    expect(screen.getByRole("status")).toHaveTextContent("추가할 조사 대상이 없습니다.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "회차 관리 검토" })).not.toBeInTheDocument();
  });
  it("추가 후보의 품목과 위치를 보여주고 현재 회차에 추가를 구분한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "append-preview", preview_hash: "hash", target_count: 1,
      targets: [{ item_id: "new-item", scope_key: "warehouse", item_name: "신규 품목", item_code: "8-TR-0999", scope_name: "창고" }] });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "새 조사 대상 확인", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "추가 대상 확인", exact: true }));
    expect(await screen.findByRole("list", { name: "추가할 조사 대상" })).toHaveTextContent("신규 품목 · 창고");
    expect(screen.getByRole("button", { name: "현재 회차에 추가", exact: true })).toBeEnabled();
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });
  it("shows the progress body skeleton until its first read finishes", async () => {
    let finish!: (value: unknown) => void;
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/progress") ? new Promise(resolve => { finish = resolve; }) : read(path, "t"));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    const skeleton = screen.getByRole("status", { name: "진행 현황을 불러오는 중입니다" });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: round.title })).toBeVisible();
    expect(skeleton.querySelectorAll('[data-location-skeleton-row]')).toHaveLength(7);
    expect(skeleton.querySelectorAll('[data-worker-skeleton-row]')).toHaveLength(8);
    expect(screen.queryByText("참여한 작업자가 없습니다.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("heading", { name: "최근 활동" }).closest("summary")!);
    await act(async () => finish(await read("/progress", "t")));
    expect(screen.queryByRole("status", { name: "진행 현황을 불러오는 중입니다" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("value", "2");
    expect(screen.getByRole("heading", { name: "최근 활동" }).closest("details")).toHaveAttribute("open");
  });

  it("ends the skeleton on failure and exposes retry outside collapsed activity", async () => {
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/progress") ? Promise.reject(new Error("진행 조회 실패")) : read(path, "t"));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await screen.findByText("진행 조회 실패");
    expect(screen.queryByRole("status", { name: "진행 현황을 불러오는 중입니다" })).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "진행 현황 다시 불러오기" });
    expect(retry).toBeVisible();
    expect(retry.closest("details")).toBeNull();
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/progress") ? new Promise(resolve => { finish = resolve; }) : read(path, "t"));
    fireEvent.click(retry);
    expect(screen.getByRole("status", { name: "진행 현황을 불러오는 중입니다" })).toBeInTheDocument();
    await act(async () => finish(await read("/progress", "t")));
    expect(screen.queryByText("진행 조회 실패")).not.toBeInTheDocument();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });

  it("keeps loaded progress, quantity mode and activity disclosure during realtime refresh", async () => {
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    const stats = { ...await read("/progress", "t") as object, worker_items: [{ owner_id: "staff", owner_name: "참여자", surveyed: 1, confirmed: 1, applied: 0, quantities_by_unit: [{ unit: "EA", surveyed: 100, confirmed: 100, applied: 0 }] }] };
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/progress") ? Promise.resolve(stats) : read(path, "t"));
    const props = { token: "t", operator, round, onChanged: vi.fn(), section: "progress" as const };
    const { rerender } = render(<StocktakeManagement {...props} />);
    await screen.findByRole("table", { name: "작업자별 품목 수" });
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    fireEvent.click(screen.getByRole("heading", { name: "최근 활동" }).closest("summary")!);
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/progress") ? new Promise(resolve => { finish = resolve; }) : read(path, "t"));
    realtimeRevision++;
    rerender(<StocktakeManagement {...props} />);
    expect(screen.queryByRole("status", { name: "진행 현황을 불러오는 중입니다" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "작업자별 실셈 수량 · 개" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "최근 활동" }).closest("details")).toHaveAttribute("open");
    await act(async () => finish(stats));
    expect(screen.getByRole("heading", { name: "최근 활동" }).closest("details")).toHaveAttribute("open");
  });

  it("ignores a rejected retry from a previous round while the new round is loading", async () => {
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/progress") ? Promise.reject(new Error("첫 조회 실패")) : read(path, "t"));
    const props = { token: "t", operator, round, onChanged: vi.fn(), section: "progress" as const };
    const { rerender } = render(<StocktakeManagement {...props} />);
    await screen.findByText("첫 조회 실패");
    let rejectOld!: (cause: Error) => void;
    let finishNew!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.includes("round-1/progress") ? new Promise((_, reject) => { rejectOld = reject; }) : path.endsWith("/progress") ? new Promise(resolve => { finishNew = resolve; }) : read(path, "t"));
    fireEvent.click(screen.getByRole("button", { name: "진행 현황 다시 불러오기" }));
    rerender(<StocktakeManagement {...props} round={{ ...round, round_id: "round-2", title: "다음 회차" }} />);
    await act(async () => rejectOld(new Error("이전 회차 오류")));
    expect(screen.queryByText("이전 회차 오류")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "진행 현황을 불러오는 중입니다" })).toHaveAttribute("aria-busy", "true");
    await act(async () => finishNew(await read("/progress", "t")));
    expect(screen.getByRole("heading", { name: "다음 회차" })).toBeVisible();
  });

  it("keeps the no-round state without a progress skeleton or reads", () => {
    render(<StocktakeManagement token="t" operator={operator} round={null} onChanged={vi.fn()} section="progress" />);
    expect(screen.getByText("활성 회차가 없습니다.")).toBeVisible();
    expect(screen.queryByRole("status", { name: "진행 현황을 불러오는 중입니다" })).not.toBeInTheDocument();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
  });

  it("keeps the loaded closed-round progress when evidence fails", async () => {
    const read = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.endsWith("/close-evidence") ? Promise.reject(new Error("종료 증빙 조회 실패")) : read(path, "t"));
    render(<StocktakeManagement token="t" operator={operator} round={{ ...round, status: "CLOSED_PARTIAL" }} onChanged={vi.fn()} section="progress" />);
    await screen.findByText("종료 증빙 조회 실패");
    expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("value", "2");
    expect(screen.queryByRole("status", { name: "진행 현황을 불러오는 중입니다" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "진행 현황 다시 불러오기" })).toBeVisible();
  });

  it("keeps quantity mode through loading a different round without fetching on mode changes", async () => {
    const stats = { round_id: round.round_id, status: "ACTIVE", summary: { total: 1, confirmed: 1, applied: 0, selected: 0, unconfirmed: 0, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [], worker_items: [{ owner_id: "staff", owner_name: "담당자", surveyed: 1, confirmed: 1, applied: 0, quantities_by_unit: [{ unit: "EA", surveyed: 100, confirmed: 100, applied: 0 }] }] };
    let finishNewRound!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.includes("round-2/progress")) return new Promise(resolve => { finishNewRound = resolve; });
      if (path.endsWith("/progress")) return stats;
      return { items: [], next_cursor: null };
    });
    const props = { token: "t", operator, round, onChanged: vi.fn(), section: "progress" as const };
    const { rerender, unmount } = render(<StocktakeManagement {...props} />);
    await screen.findByRole("table", { name: "작업자별 품목 수" });
    const reads = vi.mocked(stocktakeApi.read).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "실셈 수량" }));
    expect(screen.getByRole("table", { name: "작업자별 실셈 수량 · 개" })).toBeInTheDocument();
    expect(stocktakeApi.read).toHaveBeenCalledTimes(reads);
    rerender(<StocktakeManagement {...props} round={{ ...round, round_id: "round-2" }} />);
    expect(screen.queryByRole("table", { name: /작업자별/ })).not.toBeInTheDocument();
    await act(async () => finishNewRound({ ...stats, round_id: "round-2" }));
    expect(screen.getByRole("table", { name: "작업자별 실셈 수량 · 개" })).toBeInTheDocument();
    unmount();
    render(<StocktakeManagement {...props} />);
    expect(await screen.findByRole("table", { name: "작업자별 품목 수" })).toBeInTheDocument();
  });
  it("수량 범위 보류를 쉬운 문장으로 표시하고 기술 코드는 노출하지 않는다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: false });
    const originalRead = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation((path, token) => path.includes("/close-previews/") ? Promise.resolve({ items: [
      { target_id: "target", item_name: "범위 보류 품목", scope_name: "창고", classification: "SELECTED_APPLY", held_details: [{ code: "TOTAL_OUT_OF_RANGE", total_after: -1 }] },
    ], next_offset: null }) : originalRead(path, token));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByText(/재고 합계가 허용 범위를 벗어났습니다/);
    expect(screen.getByText(/예상 합계 -1/)).toBeVisible();
    expect(screen.queryByText(/보류 코드 · TOTAL_OUT_OF_RANGE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/확인 - \/ 예약 -/)).not.toBeInTheDocument();
  });

  it("검토 대상의 상태도 화면 용어로 표시하고 저장된 계수 수량을 보존한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: true });
    const originalRead = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation((path, token) => path.includes("/close-previews/") ? Promise.resolve({ items: [
      { target_id: "draft", item_name: "계수 품목", scope_name: "튜브", classification: "DRAFT", quantities: { normal: 7, defect: null, b_grade: 0, obsolete: 0 } },
      { target_id: "stopped", item_name: "중단 품목", scope_name: "창고", classification: "ABANDONED" },
      { target_id: "pending", item_name: "추가 품목", scope_name: "창고", classification: "PENDING_UNADMITTED" },
    ], next_offset: null }) : originalRead(path, token));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    const review = await screen.findByRole("region", { name: "회차 관리 검토" });
    fireEvent.click(within(review).getByText("조사 대상별 결과", { selector: "summary" }));
    fireEvent.click(within(review).getByText("조사 수량", { selector: "summary" }));
    expect(await within(review).findByText(/조사 수량: 정상 7, 불량 미입력/)).toBeVisible();
    expect(within(review).getByText("미확인 · 담당 미지정")).toBeVisible();
    expect(within(review).getByText("조사 대상 추가 대기 · 담당 미지정")).toBeVisible();
    expect(within(review).queryByText(/미편입|포기|초안/)).not.toBeInTheDocument();
  });

  it("전체 종료가 보류되면 미확인 수량을 접지 않고 표시한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: false, summary: { total: 6, selected: 0, unconfirmed: 4, confirmed_excluded: 2, pending: 0 } });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    const review = await screen.findByRole("region", { name: "회차 관리 검토" });
    expect(within(review).getByText(/미확인 4곳/)).toBeVisible();
    expect(within(review).getByText(/남은 조사 위치를 반영하거나 부분 종료를 선택/)).toBeVisible();
  });

  it("회차가 바뀐 뒤 도착한 검토 실패를 새 회차에 표시하지 않는다", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(stocktakeApi.command).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const view = render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    view.rerender(<StocktakeManagement token="t" operator={operator} round={{ ...round, round_id: "new-round" }} onChanged={vi.fn()} section="rounds" />);
    await act(async () => reject(new Error("이전 회차의 검토 실패")));
    expect(screen.queryByText("이전 회차의 검토 실패")).not.toBeInTheDocument();
  });

  it("회차가 바뀐 뒤 도착한 확정 성공을 새 회차에 표시하지 않는다", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: true })
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const onChanged = vi.fn();
    const view = render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={onChanged} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByRole("region", { name: "회차 관리 검토" });
    await waitFor(() => expect(screen.queryByText("회차 관리 요청을 처리하는 중입니다.")).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)!);
    view.rerender(<StocktakeManagement token="t" operator={operator} round={{ ...round, round_id: "new-round" }} onChanged={onChanged} section="rounds" />);
    await act(async () => finish({ status: "CLOSED_FULL" }));
    expect(screen.queryByText("회차를 종료했습니다.")).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it.each(["primary", "deputy"] as const)("부서 %s는 관리자 PIN 없이 시작 대상을 확인한다", async department_role => {
    vi.mocked(stocktakeApi.command).mockResolvedValue({ preview_id: "p", preview_hash: "h", target_count: 2 });
    render(<StocktakeManagement token="t" operator={{ ...operator, department_role }} round={null} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("회차 이름"), { target: { value: "새 조사" } });
    fireEvent.click(screen.getByRole("button", { name: "시작 대상 확인" }));
    await screen.findByRole("region", { name: "회차 관리 검토" });
    expect(stocktakeApi.command).toHaveBeenCalledWith("round_start_preview", "/api/stocktakes/round-start-previews", "t", { title: "새 조사" }, { key: expect.any(String) });
    expect(screen.queryByLabelText("관리자 PIN")).not.toBeInTheDocument();
  });

  it.each(["admin", "staff"] as const)("부서 결재가 없는 %s는 관리 폼과 관리 조회를 숨긴다", async level => {
    render(<StocktakeManagement token="t" operator={{ ...operator, level, department_role: "none", warehouse_role: "primary" }} round={round} onChanged={vi.fn()} section="rounds" />);
    await act(async () => {});
    expect(screen.queryByText("회차 관리")).not.toBeInTheDocument();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
  it.each(["PREVIEW_STALE", "FORBIDDEN"])("확정 실패 %s에서 안전하게 재검토한다", async failureCode => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: true })
      .mockRejectedValueOnce(Object.assign(new Error("확정 실패"), { code: failureCode }));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByRole("region", { name: "회차 관리 검토" });
    await waitFor(() => expect(screen.queryByText("회차 관리 요청을 처리하는 중입니다.")).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)!);
    await screen.findByText("확정 실패");
    if (failureCode === "PREVIEW_STALE") {
      expect(screen.queryByRole("region", { name: "회차 관리 검토" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "종료 내용 확인" })).toBeVisible();
    } else expect(screen.getByRole("region", { name: "회차 관리 검토" })).toBeVisible();
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
  });

  it("종료 영수증을 복구하면 작업에 맞는 완료 문구를 표시한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: true })
      .mockRejectedValueOnce(Object.assign(new Error("결과 불명"), { code: "COMMAND_RESULT_UNKNOWN" }));
    const originalRead = vi.mocked(stocktakeApi.read).getMockImplementation()!;
    vi.mocked(stocktakeApi.read).mockImplementation((path, token) => path.includes("/commands/") ? Promise.resolve({ receipt_id: "receipt-1" }) : originalRead(path, token));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByRole("region", { name: "회차 관리 검토" });
    await waitFor(() => expect(screen.queryByText("회차 관리 요청을 처리하는 중입니다.")).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)!);
    fireEvent.click(await screen.findByRole("button", { name: "영수증 조회" }));
    await screen.findByText("회차를 종료했습니다.");
    expect(stocktakeApi.read).toHaveBeenCalledWith(expect.stringContaining("kind=round_close"), "t");
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
  });

  it("작업을 바꿔도 부분 종료 사유는 보존하고 미리보기만 폐기한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValue({ preview_id: "p", preview_hash: "h", can_close: true });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "잔여 품목 이월" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByRole("region", { name: "회차 관리 검토" });
    fireEvent.click(screen.getByRole("button", { name: "새 조사 대상 확인" }));
    expect(screen.queryByRole("region", { name: "회차 관리 검토" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "회차 종료" }));
    expect(screen.getByLabelText("종료 방식")).toHaveValue("PARTIAL");
    expect(screen.getByLabelText("종료 사유")).toHaveValue("잔여 품목 이월");
  });

  it("부분 종료 사유 누락은 명령을 보내지 않는다", async () => {
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    expect(screen.getByRole("alert")).toHaveTextContent("부분 종료 사유");
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
  it("종료를 기본 작업으로 보여주고 작업 전환에도 사유를 보존한다", () => {
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    expect(screen.getByRole("button", { name: "종료 내용 확인" })).toBeVisible();
    expect(screen.queryByLabelText("관리자 PIN")).not.toBeInTheDocument();
    expect(screen.queryByText("관리자 명령")).not.toBeInTheDocument();
    expect(screen.getByLabelText("종료 사유").closest('[aria-hidden="true"]')).toHaveAttribute("inert");
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "작성 중인 사유" } });
    fireEvent.click(screen.getByRole("button", { name: "새 조사 대상 확인", exact: true }));
    expect(screen.getByRole("button", { name: "추가 대상 확인" })).toBeVisible();
    expect(screen.getByLabelText("종료 사유").closest('[aria-hidden="true"]')).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "회차 종료", exact: true }));
    expect(screen.getByLabelText("종료 사유")).toHaveValue("작성 중인 사유");
  });

  it("검토 요청 중에는 다른 관리 작업을 선택할 수 없다", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.command).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    expect(screen.getByRole("button", { name: "새 조사 대상 확인", exact: true })).toBeDisabled();
    await act(async () => finish({ preview_id: "close-preview", preview_hash: "a".repeat(64), can_close: false }));
    expect(screen.queryByText("확정하려면 PIN을 다시 입력해 주세요.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)!).toBeDisabled();
  });
  it("keeps round management visible without losing its input when folded", () => {
    render(<StocktakeManagement token="t" operator={operator} round={null} onChanged={vi.fn()} section="rounds" />);
    const disclosure = screen.getByText("회차 관리").closest("details")!;
    expect(disclosure).toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("회차 이름"), { target: { value: "입력 중 회차" } });
    fireEvent.click(disclosure.querySelector("summary")!);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(screen.getByLabelText("회차 이름")).toHaveValue("입력 중 회차");
  });

  it("starts recent activity collapsed and lets the user expand it", async () => {
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await screen.findByText("표시할 활동이 없습니다.");
    const heading = screen.getByRole("heading", { name: "최근 활동" });
    expect(heading.closest("details")).not.toBeNull();
    expect(heading.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByLabelText("자동저장 포함")).not.toBeVisible();
    fireEvent.click(heading.closest("summary")!);
    expect(screen.getByLabelText("자동저장 포함")).toBeVisible();
  });
  it("requests latest activity and resets its cursor when autosave visibility changes", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.endsWith("/progress")) return { summary: { total: 0, confirmed: 0, applied: 0, unconfirmed: 0, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [] };
      return { items: [{ event_id: path.includes("include_saves=true") ? "save" : "confirm", kind: path.includes("include_saves=true") ? "DRAFT_SAVED" : "COUNT_CONFIRMED", actor_name: "담당자", created_at: "2026-10-08T01:23:00Z", payload: {} }], next_cursor: path.includes("include_saves=true") ? null : "cursor-a" };
    });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await screen.findByText("계수 확인");
    fireEvent.click(screen.getByRole("heading", { name: "최근 활동" }).closest("summary")!);
    fireEvent.click(screen.getByLabelText("자동저장 포함"));
    await screen.findByText("계수 저장");
    expect(screen.queryByRole("button", { name: "활동 더 보기" })).not.toBeInTheDocument();
    expect(stocktakeApi.read).toHaveBeenCalledWith(expect.stringContaining("order=latest&include_saves=true"), "t");
  });
  it("retries failed progress reads without issuing a command", async () => {
    let failed = true;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (failed) throw new Error("조회 연결 실패");
      return path.endsWith("/progress")
        ? { summary: { total: 0, confirmed: 0, applied: 0, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [] }
        : { items: [], next_cursor: null };
    });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await screen.findByText("조회 연결 실패");
    fireEvent.click(screen.getByRole("heading", { name: "최근 활동" }).closest("summary")!);
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "진행 현황 다시 불러오기" }));
    await screen.findByText("표시할 활동이 없습니다.");
    expect(screen.queryByText("조회 연결 실패")).not.toBeInTheDocument();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });

  it("appends the next activity page with the same query options", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.endsWith("/progress")) return { summary: { total: 0, confirmed: 0, applied: 0, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [] };
      const next = path.includes("cursor=");
      return { items: [{ event_id: next ? "older" : "newer", kind: next ? "COUNT_STARTED" : "COUNT_CONFIRMED", actor_name: "담당자", created_at: "2026-10-08T01:23:00Z", payload: {} }], next_cursor: next ? null : "page-one" };
    });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    fireEvent.click(screen.getByRole("heading", { name: "최근 활동" }).closest("summary")!);
    fireEvent.click(await screen.findByRole("button", { name: "활동 더 보기" }));
    await screen.findByText("조사 시작");
    expect(screen.getByText("계수 확인")).toBeInTheDocument();
    expect(stocktakeApi.read).toHaveBeenCalledWith(expect.stringContaining("order=latest&include_saves=false&cursor=page-one"), "t");
    expect(screen.queryByRole("button", { name: "활동 더 보기" })).not.toBeInTheDocument();
  });

  it("shows every blocked preparation item and its reason without offering a start seal", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValue(Object.assign(new Error("대상 준비 보류"), { code: "TARGET_SET_CHANGED", extra: { items: [
      { item_code: "3-AR-0038", item_name: "잔존 품목", scope_id: "warehouse", reason: "삭제된 품목에 재고가 남았습니다." },
      { item_code: "9-TR-0040", item_name: "매핑 품목", reason: "조사 위치 매핑이 없습니다." },
    ] } }));
    render(<StocktakeManagement token="t" operator={operator} round={null} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("회차 이름"), { target: { value: "QA 준비" } });
    fireEvent.click(screen.getByRole("button", { name: "시작 대상 확인" }));
    const issues = await screen.findByRole("region", { name: "조사 대상 준비 보류" });
    expect(within(issues).getByText("3-AR-0038 · 잔존 품목")).toBeInTheDocument();
    expect(within(issues).getByText("9-TR-0040 · 매핑 품목")).toBeInTheDocument();
    expect(screen.queryByText("회차 시작 검토")).not.toBeInTheDocument();
  });

  it("회차 종료는 반영 대상을 조회하거나 선택하지 않고 종료 가능 여부만 검토한다", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "p", preview_hash: "h", can_close: false });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    expect(screen.queryByText("종료하면서 재고 반영")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByRole("region", { name: "회차 관리 검토" });
    expect(stocktakeApi.read).not.toHaveBeenCalledWith(expect.stringContaining("/targets"), expect.anything());
    expect(stocktakeApi.command).toHaveBeenCalledWith("round_close_preview", expect.stringContaining("/close-previews"), "t", { mode: "FULL", reason: "", confirmation_revision_ids: [] }, expect.anything());
    expect(screen.getByText("아직 회차를 종료할 수 없습니다.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)).toBeDisabled();
  });

  it("shows location rates and distinct worker item counts", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async (path: string) => path.includes("/progress")
      ? { summary: { total: 4, confirmed: 2, applied: 1, selected: 0, unconfirmed: 2, confirmed_excluded: 0, held: 0, pending: 1 }, by_scope: [{ scope_id: "warehouse", scope_name: "창고", total: 4, confirmed: 2, applied: 1 }], by_employee: [{ owner_id: "staff", owner_name: "담당자", total: 2, confirmed: 1, applied: 1 }], worker_items: [{ owner_id: "staff", owner_name: "담당자", surveyed: 1, confirmed: 1, applied: 1 }] }
      : { items: [], next_cursor: null });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("max", "4"));
    expect(within(screen.getByRole("region", { name: "조사 회차 정보" })).getByRole("heading", { name: round.title })).toBeInTheDocument();
    const scopeRow = screen.getByRole("row", { name: /창고/ });
    expect(within(scopeRow).getByText("4건")).toBeInTheDocument();
    expect(within(scopeRow).getByRole("progressbar", { name: "확인" })).toHaveAttribute("value", "2");
    expect(within(scopeRow).getByRole("progressbar", { name: "반영" })).toHaveAttribute("value", "1");
    const workers = screen.getByRole("region", { name: "작업자별 현황" });
    expect(within(workers).getByRole("row", { name: "담당자 1 1" })).toBeInTheDocument();
    expect(within(workers).queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("shows stored progress and does not display a stale round response", async () => {
    let resolveOld!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation((path: string) => {
      if (path.includes("round-1/progress")) return new Promise(resolve => { resolveOld = resolve; });
      if (path.includes("round-2/progress")) return Promise.resolve({ item_summary: { total: 8, confirmed: 0, applied: 0, unconfirmed: 8 }, summary: { total: 16, confirmed: 0, applied: 0, selected: 0, unconfirmed: 16, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [] });
      return Promise.resolve({ items: [], next_cursor: null });
    });
    const { rerender } = render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    rerender(<StocktakeManagement token="t" operator={operator} round={{ ...round, round_id: "round-2" }} onChanged={vi.fn()} section="progress" />);
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("max", "16"));
    expect(screen.queryByRole("region", { name: "조사 요약" })).not.toBeInTheDocument();
    await act(async () => resolveOld({ summary: { total: 3 }, by_scope: [], by_employee: [] }));
    expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("max", "16");
  });

  it("previews a partial close, then sends its exact seal once", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "preview-1", preview_hash: "a".repeat(64), can_close: true, summary: { total: 3, selected: 0, confirmed_excluded: 1 }, expires_at: "2099-01-01T00:00:00Z" }).mockResolvedValueOnce({ status: "CLOSED_PARTIAL" });
    const onChanged = vi.fn();
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={onChanged} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "미확인 품목 제외" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByText(/종료 검토/);
    fireEvent.click(screen.getAllByRole("button", { name: "회차 종료", exact: true }).at(-1)!);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(stocktakeApi.command).toHaveBeenNthCalledWith(2, "round_close", "/api/stocktakes/rounds/round-1/close", "t", { preview_id: "preview-1", preview_hash: "a".repeat(64) }, { key: expect.any(String) });
  });

  it("keeps an unknown command result for receipt lookup without automatic resubmit", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValueOnce(Object.assign(new Error("응답 불명확"), { code: "COMMAND_RESULT_UNKNOWN" }));
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "미확인 품목 제외" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByText(/영수증 조회/);
    fireEvent.click(screen.getByRole("heading", { name: "회차 관리" }).closest("summary")!);
    expect(screen.getByText("회차 관리").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: /영수증 조회/ }).closest("details")).toBeNull();
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });

  it("discards a late close preview after the active round changes", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.command).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "미확인 품목 제외" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    rerender(<StocktakeManagement token="t" operator={operator} round={{ ...round, round_id: "round-2" }} onChanged={vi.fn()} section="rounds" />);
    await act(async () => { finish({ preview_id: "old-preview", preview_hash: "c".repeat(64), can_close: true }); });
    expect(screen.queryByText("종료 검토")).not.toBeInTheDocument();
  });

  it("shows start preview when the selected historical round is closed", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce({ preview_id: "start-preview", preview_hash: "d".repeat(64), target_count: 10 });
    render(<StocktakeManagement token="t" operator={operator} round={{ ...round, status: "CLOSED_FULL" }} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("회차 이름"), { target: { value: "새 회차" } });
    fireEvent.click(screen.getByRole("button", { name: "시작 대상 확인" }));
    await screen.findByText("회차 시작 검토");
  });

  it("refreshes stored KPI when another worker changes the realtime revision", async () => {
    let total = 3;
    vi.mocked(stocktakeApi.read).mockImplementation(async (path: string) => path.includes("/progress")
      ? { item_summary: { total, confirmed: 0, applied: 0, unconfirmed: total }, summary: { total: total * 2, confirmed: 0, applied: 0, selected: 0, unconfirmed: total * 2, confirmed_excluded: 0, held: 0, pending: 0 }, by_scope: [], by_employee: [] }
      : { items: [], next_cursor: null });
    const { rerender } = render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("max", "6"));
    total = 5; realtimeRevision = 1;
    rerender(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="progress" />);
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "전체 위치 확인" })).toHaveAttribute("max", "10"));
  });

  it("shows confirmed exclusion and reservation evidence before partial close", async () => {
    vi.mocked(stocktakeApi.command).mockResolvedValue({ preview_id: "preview-1", preview_hash: "a".repeat(64), can_close: true, summary: { total: 1, selected: 0, confirmed_excluded: 1, pending: 0 } });
    vi.mocked(stocktakeApi.read).mockImplementation(async (path: string) => path.includes("/close-previews/")
      ? { items: [{ target_id: "target-1", item_code: "CODE", item_name: "품목", scope_name: "창고", classification: "CONFIRMED_EXCLUDED", version: 2, owner_name: "담당자", confirmation_revision_id: "revision-1", quantities: { normal: 1, defect: 0, b_grade: 0, obsolete: 0 }, held_details: [{ code: "RESERVATION_SHORTAGE", category: "normal", counted: 1, reserved: 2 }] }], next_offset: null }
      : { items: [], next_cursor: null });
    render(<StocktakeManagement token="t" operator={operator} round={round} onChanged={vi.fn()} section="rounds" />);
    fireEvent.change(screen.getByLabelText("종료 방식"), { target: { value: "PARTIAL" } });
    fireEvent.change(screen.getByLabelText("종료 사유"), { target: { value: "조사 미완료" } });
    fireEvent.click(screen.getByRole("button", { name: "종료 내용 확인" }));
    await screen.findByText("이 품목은 이번 부분 종료에서 재고에 반영되지 않습니다.");
    expect(within(screen.getByRole("region", { name: "회차 관리 검토" })).getByText("조사 미완료")).toBeVisible();
    expect(screen.getByText(/확인 수량 1 · 예약 수량 2/)).toBeVisible();
    fireEvent.click(screen.getByText("조사 수량", { selector: "summary" }));
    expect(screen.getByText(/조사 수량: 정상 1, 불량 0, B급 0, 구형 0/)).toBeVisible();
    expect(screen.queryByText(/계수 버전|확인 증빙 ID|보류 코드/)).not.toBeInTheDocument();
  });
});
