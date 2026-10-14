import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeEvent, StocktakeRound } from "@/lib/api/types/stocktake";
import { StocktakeRoundHistory } from "./StocktakeRoundHistory";

vi.mock("@/lib/api/stocktake", () => ({ stocktakeApi: { read: vi.fn(), command: vi.fn() } }));
let revision = 0;
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => revision }));
const active: StocktakeRound = { round_id: "active", title: "현재 조사", status: "ACTIVE", epoch: 1, target_generation: 1, started_by: "worker", started_at: "2026-10-08T01:00:00Z", closed_at: null };
const closed: StocktakeRound = { ...active, round_id: "closed", title: "이전 조사", status: "CLOSED_PARTIAL", closed_at: "2026-10-08T02:00:00Z" };
const proof = { mode: "PARTIAL", reason: "미확인 품목을 남겨 종료", actor_name: "승인자", closed_at: closed.closed_at, manifest_id: "sealed-proof" };
function event(id: string, patch: Partial<StocktakeEvent> = {}): StocktakeEvent {
  return { event_id: id, count_id: "count", kind: "COUNT_CONFIRMED", actor_id: "worker", actor_name: "조사자", created_at: "2026-10-08T01:15:00Z", item_name: id, item_code: "8-TR-001", scope_name: "튜브", unit: "개", payload: { quantities: { normal: 0, defect: 2, b_grade: 3 } }, ...patch };
}
function mount(round: StocktakeRound | null = active, expandHistory = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const select = vi.fn();
  const tree = (current: StocktakeRound | null) => <QueryClientProvider client={client}><StocktakeRoundHistory token="token" round={current} rounds={current ? [active, closed] : []} admin={false} onSelectRound={select} /></QueryClientProvider>;
  const view = render(tree(round));
  if (round && expandHistory && !screen.getByRole("heading", { name: "작업 이력" }).closest("details")!.open) fireEvent.click(screen.getByRole("heading", { name: "작업 이력" }).closest("summary")!);
  return { ...view, tree, select, client };
}
beforeEach(() => {
  vi.resetAllMocks(); revision = 0;
  vi.mocked(stocktakeApi.read).mockImplementation(async path => path.endsWith("/close-evidence") ? proof : { items: [event("기록 품목")], next_cursor: null });
});

describe("round history", () => {
  it("표시 관리 영역을 회차 관리 옆에 두고 종료 결과·작업 이력을 유지한다", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><StocktakeRoundHistory token="token" round={active} rounds={[active]} admin={false} onSelectRound={vi.fn()}
      management={<section aria-label="회차 관리 테스트"><input aria-label="보존할 입력" defaultValue="기존 입력" /></section>}
      menuVisibility={<section aria-label="메뉴 표시 관리 테스트">표시 설정</section>} /></QueryClientProvider>);
    const management = screen.getByRole("region", { name: "회차 관리 테스트" });
    const visibility = screen.getByRole("region", { name: "메뉴 표시 관리 테스트" });
    expect(management.compareDocumentPosition(visibility)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(visibility.compareDocumentPosition(screen.getByRole("region", { name: "회차 종료 결과" }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByLabelText("보존할 입력")).toHaveValue("기존 입력");
    expect(screen.getByRole("region", { name: "회차 작업 이력" })).toBeVisible();
  });
  it("작업 이력은 처음에 펼쳐지고 사용자가 접은 상태를 갱신 중에도 유지한다", async () => {
    const view = mount(active, false);
    const heading = screen.getByRole("heading", { name: "작업 이력" });
    const disclosure = heading.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).toHaveAttribute("open");
    expect(await screen.findByText("기록 품목")).toBeVisible();
    expect(screen.getByLabelText("자동저장 포함")).toBeVisible();
    fireEvent.click(heading.closest("summary")!);
    expect(disclosure).not.toHaveAttribute("open");
    expect(screen.getByText("기록 품목")).not.toBeVisible();
    expect(screen.getByLabelText("자동저장 포함")).not.toBeVisible();
    view.rerender(view.tree({ ...active }));
    expect(disclosure).not.toHaveAttribute("open");
  });
  it.each([true, false])("제공된 관리 영역을 회차 정보 다음에 배치한다: %s", admin => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><StocktakeRoundHistory token="token" round={active} rounds={[active]} admin={admin} onSelectRound={vi.fn()} management={<section aria-label="회차 관리 테스트">관리 작업</section>} /></QueryClientProvider>);
    const management = screen.queryByRole("region", { name: "회차 관리 테스트" });
    expect(screen.getByRole("region", { name: "선택한 조사 회차" }).compareDocumentPosition(management!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(management!.compareDocumentPosition(screen.getByRole("region", { name: "회차 작업 이력" }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
  it("shows the selected round and does not read closing evidence for an active round", async () => {
    mount();
    await screen.findByText("기록 품목");
    expect(screen.getByText("진행 중인 회차입니다.")).toBeInTheDocument();
    expect(stocktakeApi.read).not.toHaveBeenCalledWith(expect.stringContaining("close-evidence"), expect.anything(), expect.anything());
    expect(stocktakeApi.read).toHaveBeenCalledWith(expect.stringContaining("order=latest&include_saves=false"), "token", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });
  it("keeps the choices open until round navigation actually succeeds", async () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "회차 변경" }));
    expect(screen.getByRole("button", { name: /현재 조사/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /이전 조사/ }));
    expect(view.select).toHaveBeenCalledWith("closed");
    expect(screen.getByRole("button", { name: "회차 변경" })).toHaveAttribute("aria-expanded", "true");
    view.rerender(view.tree(closed));
    await waitFor(() => expect(screen.getByRole("button", { name: "회차 변경" })).toHaveAttribute("aria-expanded", "false"));
  });
  it.each(["FULL", "PARTIAL"])("uses the saved %s closing evidence", async mode => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path.endsWith("/close-evidence") ? { ...proof, mode } : { items: [], next_cursor: null });
    mount({ ...closed, status: mode === "FULL" ? "CLOSED_FULL" : "CLOSED_PARTIAL" });
    const result = screen.getByRole("region", { name: "회차 종료 결과" });
    expect(await within(result).findByText(proof.reason)).toBeInTheDocument();
    expect(within(result).getByText("승인자", { selector: "dd" })).toBeInTheDocument();
    expect(within(result).getByText(mode === "FULL" ? "전체 종료" : "부분 종료")).toBeInTheDocument();
    expect(within(result).queryByText(/증빙 ID|상세 증빙/)).not.toBeInTheDocument();
  });
  it("distinguishes a missing historical seal from a failed read", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.endsWith("/close-evidence")) throw Object.assign(new Error("없음"), { code: "NOT_FOUND" });
      return { items: [], next_cursor: null };
    });
    mount(closed);
    await screen.findByText("이 회차의 종료 증빙이 없습니다.");
    expect(screen.queryByRole("button", { name: "종료 결과 다시 불러오기" })).not.toBeInTheDocument();
  });
  it("retries only failed evidence without removing the activity", async () => {
    let failing = true;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (!path.endsWith("/close-evidence")) return { items: [event("보존할 이력")], next_cursor: null };
      if (failing) throw new Error("증빙 연결 실패");
      return proof;
    });
    mount(closed);
    await screen.findByText("증빙 연결 실패");
    await screen.findByText("보존할 이력");
    const activityReads = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/events")).length;
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "종료 결과 다시 불러오기" }));
    await screen.findByText(proof.reason);
    expect(vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/events"))).toHaveLength(activityReads);
  });
  it("reads no history for an empty round list", () => {
    mount(null);
    expect(screen.getByText("아직 조사 회차가 없습니다.")).toBeInTheDocument();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
  });
  it("shows an empty activity list independently of round metadata", async () => {
    vi.mocked(stocktakeApi.read).mockResolvedValue({ items: [], next_cursor: null });
    mount();
    await screen.findByText("이 회차에 기록된 작업이 없습니다.");
    expect(screen.getByRole("heading", { name: "현재 조사" })).toBeInTheDocument();
  });
  it("expands stored quantities and leaves missing values explicit", async () => {
    mount();
    fireEvent.click((await screen.findByText("기록 품목")).closest("summary")!);
    expect(screen.getByText("0 개")).toBeVisible();
    expect(screen.getByText("수량 기록 없음")).toBeVisible();
    expect(screen.queryByText("원본 증빙")).not.toBeInTheDocument();
  });
  it("does not fabricate counted quantities for an applied event", async () => {
    vi.mocked(stocktakeApi.read).mockResolvedValue({ items: [event("반영 품목", { kind: "COUNT_APPLIED", payload: { application_id: "apply-1" } })], next_cursor: null });
    mount();
    fireEvent.click((await screen.findByText("반영 품목")).closest("summary")!);
    expect(screen.getByText("이 작업에는 계수 수량 기록이 없습니다.")).toBeVisible();
    expect(screen.queryByText("0 개")).not.toBeInTheDocument();
  });
  it("paginates without duplicating overlap and preserves prior rows on retry", async () => {
    let failNext = true;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (!path.includes("cursor=")) return { items: [event("첫 기록")], next_cursor: "next" };
      if (failNext) throw new Error("다음 페이지 연결 실패");
      return { items: [event("첫 기록"), event("다음 기록")], next_cursor: null };
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "이력 더 보기" }));
    await screen.findByText("다음 페이지 연결 실패");
    expect(screen.getByText("첫 기록")).toBeInTheDocument();
    failNext = false;
    fireEvent.click(screen.getByRole("button", { name: "작업 이력 다시 불러오기" }));
    await screen.findByText("다음 기록");
    expect(screen.getAllByText("첫 기록")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "이력 더 보기" })).not.toBeInTheDocument();
  });
  it("ignores a late page after the round changes", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation(path => path.includes("/active/events")
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(path.endsWith("/close-evidence") ? proof : { items: [event("새 회차 기록")], next_cursor: null }));
    const view = mount();
    await waitFor(() => expect(finish).toBeDefined());
    view.rerender(view.tree(closed));
    await screen.findByText("새 회차 기록");
    await act(async () => finish({ items: [event("늦은 이전 기록")], next_cursor: "old" }));
    expect(screen.queryByText("늦은 이전 기록")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이력 더 보기" })).not.toBeInTheDocument();
  });
  it("resets the cursor when including saves and ignores the old pending page", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(stocktakeApi.read).mockImplementation(path => {
      if (path.includes("cursor=")) return new Promise(resolve => { finish = resolve; });
      return Promise.resolve({ items: [event(path.includes("include_saves=true") ? "저장 포함 기록" : "확인 기록")], next_cursor: path.includes("include_saves=true") ? null : "next" });
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "이력 더 보기" }));
    await waitFor(() => expect(finish).toBeDefined());
    fireEvent.click(screen.getByLabelText("자동저장 포함"));
    await screen.findByText("저장 포함 기록");
    await act(async () => finish({ items: [event("늦은 과거 페이지")], next_cursor: "old" }));
    expect(screen.queryByText("늦은 과거 페이지")).not.toBeInTheDocument();
    expect(vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("include_saves=true")).every(([path]) => !path.includes("cursor="))).toBe(true);
  });
  it("retains the loaded activity during a realtime refresh", async () => {
    let finish!: (value: unknown) => void;
    const view = mount();
    await screen.findByText("기록 품목");
    vi.mocked(stocktakeApi.read).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    revision = 1;
    view.rerender(view.tree(active));
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByText("기록 품목")).toBeInTheDocument();
    await act(async () => finish({ items: [event("갱신 기록")], next_cursor: null }));
    await screen.findByText("갱신 기록");
  });
});
