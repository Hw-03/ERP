import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeCount, StocktakeRound, StocktakeTarget } from "@/lib/api/types/stocktake";
import type { Operator } from "../login/useCurrentOperator";
import { StocktakeView } from "./StocktakeView";
import { ApiError } from "@/lib/api-core";
import { SearchConfigProvider } from "@/lib/queries/useItemSearch";
import { queryKeys } from "@/lib/queries/keys";
import { itemSearchApi } from "@/lib/api/item-search";

const state = vi.hoisted(() => ({
  actor: { employee_id: "employee-a", name: "계수 작업자", level: "staff", department_role: "primary", warehouse_role: "none" },
  validate: vi.fn(), restore: vi.fn(), current: vi.fn(), issue: vi.fn(),
}));
vi.mock("../login/useCurrentOperator", () => ({ readCurrentOperator: () => state.actor }));
vi.mock("@/lib/auth/operator-session", () => ({
  validateTabOwnership: state.validate, restoreOperatorSession: state.restore,
  readOperatorSession: state.current, issueSession: state.issue,
}));
vi.mock("@/lib/api/stocktake", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/stocktake")>(), stocktakeApi: { read: vi.fn(), command: vi.fn() },
  listPendingStocktakeCommands: () => [], subscribePendingStocktakeCommands: () => () => {}, recoverStocktakeCommand: vi.fn(),
}));
vi.mock("./StocktakeManagement", () => ({ StocktakeManagement: ({ focusStart, onStarted }: { focusStart?: boolean; onStarted?: () => void }) => <div><p data-focus-start={focusStart}>회차 관리</p>{onStarted && <button onClick={onStarted}>시작 완료 알림</button>}</div> }));
vi.mock("@/lib/api/item-search", () => ({ itemSearchApi: { getConfig: vi.fn() } }));
vi.mock("./StocktakeMenuVisibilityCard", () => ({ StocktakeMenuVisibilityCard: () => <p>참여 직원 메뉴 표시</p> }));
vi.mock("../_hooks/useItemImageManifest", () => ({ useItemImageManifest: () => ({}) }));
vi.mock("../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "var(--c-green)" }));
vi.mock("@/lib/queries/useModelsQuery", () => ({ useModelsQuery: () => ({ data: [
  { slot: 1, model_name: "DX3000", symbol: "1" }, { slot: 2, model_name: "COCOON", symbol: "2" },
], error: null }) }));

const quantities = { normal: 7, defect: 0, b_grade: 0, obsolete: 0 };
const rounds: StocktakeRound[] = [
  { round_id: "round-a", title: "진행 조사", status: "ACTIVE", epoch: 3, target_generation: 1, started_by: "employee-a", started_at: "2026-10-06T00:00:00Z", closed_at: null },
  { round_id: "round-b", title: "이전 조사", status: "CLOSED_FULL", epoch: 2, target_generation: 1, started_by: "employee-a", started_at: "2026-10-05T00:00:00Z", closed_at: "2026-10-05T02:00:00Z" },
];

function count(overrides: Partial<StocktakeCount> = {}): StocktakeCount {
  return { count_id: "count-a", round_id: "round-a", target_id: "target-a", owner_id: "employee-a", owner_name: "계수 작업자", status: "DRAFT", version: 2, fence: 1, quantities: { ...quantities }, confirmation_revision_id: null, event_id: "event-a", ...overrides };
}

function target(overrides: Partial<StocktakeTarget> = {}): StocktakeTarget {
  return { target_id: "target-a", item_id: "item-a", scope_id: "warehouse", scope_name: "창고", item_code: "M-A", item_name: "시험 품목 A", current_item_code: "M-A", current_item_name: "시험 품목 A", unit: "개", target_version: 1, version: 2, fence: 1, status: "DRAFT", quantities: { ...quantities }, confirmation_revision_id: null, count: count(), ...overrides };
}

function confirmedTarget(overrides: Partial<StocktakeTarget> = {}): StocktakeTarget {
  return target({ status: "CONFIRMED", confirmation_revision_id: "revision-a", count: count({ status: "CONFIRMED", confirmation_revision_id: "revision-a" }), ...overrides });
}

function session(employeeId = state.actor.employee_id) {
  return { token: `token-${employeeId}`, employee_id: employeeId, tab_id: "tab-a", expires_at: new Date(Date.now() + 3600_000).toISOString() };
}

function preview() {
  return { preview_id: "preview-a", preview_hash: "hash-a", can_apply: true, expires_at: new Date(Date.now() + 600_000).toISOString(), entries: [{ target_id: "target-a", scope_id: "warehouse", confirmed_name: "계수 작업자", confirmation_revision_id: "revision-a", before: quantities, after: quantities, deltas: { normal: 0, defect: 0, b_grade: 0, obsolete: 0 }, reservations: { normal: 0, defect: 0, b_grade: 0, obsolete: 0 }, held: [] }] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function isStagePath(path: string, stage: "rounds" | "progress" | "targets"): boolean {
  return stage === "targets" ? path.includes("/targets?") : path.endsWith("/" + stage);
}

let targets: StocktakeTarget[];
function readFixture(path: string): unknown {
  if (path === "/api/stocktakes/rounds/latest-summary") return { summary: { round_id: "round-b", title: "이전 조사", status: "CLOSED_FULL", closed_at: rounds[1].closed_at, item_summary: { total: 120, confirmed: 100, applied: 90, unconfirmed: 20 } } };
  if (path === "/api/stocktakes/rounds") return { items: rounds };
  if (path === "/api/stocktakes/rounds?active_only=true") return { items: rounds.filter(round => round.status === "ACTIVE") };
  if (path.includes("/events?")) return { items: [], next_cursor: null };
  if (path.endsWith("/close-evidence")) return { mode: "FULL", reason: "조사 완료", actor_name: "관리자", closed_at: "2026-10-05T02:00:00Z", manifest_id: "sealed" };
  if (path.includes("/waiting-selection?")) {
    const items = targets.flatMap(row => row.location_targets ?? [row]).filter(location =>
      location.status === "CONFIRMED" && location.count?.owner_id === state.actor.employee_id);
    return { items, total_items: new Set(items.map(row => row.item_id)).size };
  }
  if (path.includes("/waiting-targets?")) {
    const search = new URL(path, "https://test.invalid").searchParams.get("search");
    const items = targets.filter(row => (!search || row.item_name.includes(search)) &&
      (row.location_targets ?? [row]).some(location => location.status === "CONFIRMED" && location.count?.owner_id === state.actor.employee_id));
    return { items, next_cursor: null, total_items: items.length };
  }
  if (path.endsWith("/progress")) return { my_waiting: { items: 42, locations: 58 }, summary: { total: 240, unconfirmed: 160, confirmed: 80, applied: 30, selected: 0, confirmed_excluded: 0, held: 0, pending: 0 }, item_summary: { total: 120, unconfirmed: 80, confirmed: 40, applied: 15 }, by_scope: [{ scope_id: "warehouse", scope_name: "창고" }, { scope_id: "assembly", scope_name: "조립" }] };
  if (path.includes("/targets?")) {
    const url = new URL(path, "https://test.invalid");
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");
    const departments = url.searchParams.getAll("departments");
    const group = url.searchParams.get("status_group");
    return { items: targets.filter(row => (!search || row.item_name.includes(search)) && (!status || row.status === status)
      && (!departments.length || departments.includes("튜브"))
      && (!group || (group === "UNCONFIRMED" ? ["UNCOUNTED", "DRAFT", "ABANDONED"] : ["CONFIRMED"]).includes(row.count?.status ?? row.status))), next_cursor: null };
  }
  if (path === "/api/stocktakes/counts/count-a") return targets[0]?.count ?? count();
  if (path.includes("/commands/")) return { application_id: "application-a", operation_id: "operation-a" };
  throw new Error(`Unexpected read: ${path}`);
}

function mount(variant: "desktop" | "mobile" = "desktop", withSearchConfig = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = (operator: Operator) => {
    const workspace = <DirtyGuardProvider><StocktakeView operator={operator} variant={variant} /></DirtyGuardProvider>;
    return <QueryClientProvider client={client}>{withSearchConfig ? <SearchConfigProvider>{workspace}</SearchConfigProvider> : workspace}</QueryClientProvider>;
  };
  const view = render(tree({ ...state.actor } as Operator));
  return { ...view, client, changeOperator: (operator: Operator) => view.rerender(tree(operator)) };
}

async function openWaiting(): Promise<void> {
  await screen.findByRole("region", { name: "조사 대상 목록" });
  fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "시험 품목 A 선택" }));
}

describe("StocktakeView integration", () => {
  it("LAN HTTP에서도 선택한 계수의 검토와 재고 반영을 전송한다", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      targets = [confirmedTarget()];
      mount();
      await openWaiting();
      fireEvent.click(await screen.findByRole("button", { name: "재고 반영", exact: true }));
      await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledWith("application_bulk_apply", expect.any(String), "token-employee-a", expect.any(Object), expect.any(Object)));
      const calls = vi.mocked(stocktakeApi.command).mock.calls;
      for (const call of calls) expect(call[4]?.key).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(["desktop", "mobile"] as const)("%s 검색 사전 갱신은 대상 재조회와 계수 입력 보존을 함께 수행한다", async variant => {
    const { client } = mount(variant, true);
    await waitFor(() => expect(client.getQueryData(queryKeys.itemSearch.config())).toMatchObject({ version: "search-v1" }));
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "19" } });
    await waitFor(() => expect(client.isFetching({ predicate: query => query.queryKey.includes("targets") })).toBe(0));
    const callsBefore = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/targets?")).length;
    act(() => client.setQueryData(queryKeys.itemSearch.config(), { version: "search-v2", synonym_groups: [], item_aliases: { "item-a": [{ alias_id: "alias-a", alias: "새 검색용 이름" }] } }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/targets?")).length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(client.isFetching({ predicate: query => query.queryKey.includes("targets") })).toBe(0));
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("19");
  });

  it.each(["desktop", "mobile"] as const)("%s 검색 사전 갱신은 반영 대기를 재조회하고 품목 선택을 유지한다", async variant => {
    targets = [confirmedTarget()];
    const { client } = mount(variant, true);
    await waitFor(() => expect(client.getQueryData(queryKeys.itemSearch.config())).toMatchObject({ version: "search-v1" }));
    await openWaiting();
    if (variant === "desktop") await screen.findByRole("button", { name: "재고 반영", exact: true });
    await waitFor(() => expect(client.isFetching({ predicate: query => query.queryKey.includes("targets") })).toBe(0));
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).toBeChecked();
    const callsBefore = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/waiting-targets?")).length;
    act(() => client.setQueryData(queryKeys.itemSearch.config(), { version: "search-v2", synonym_groups: [{ group_id: "g", version: 2, terms: ["시험", "test"] }], item_aliases: {} }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/waiting-targets?")).length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(client.isFetching({ predicate: query => query.queryKey.includes("targets") })).toBe(0));
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).toBeChecked();
    expect(screen.getByRole("button", { name: variant === "desktop" ? "재고 반영" : "선택 1개 검토", exact: true })).toBeVisible();
  });
  it.each(["APPLIED", "UNCOUNTED"] as const)("%s 위치의 계수 시작 버튼에만 처리 상태를 표시한다", async status => {
    targets = [target({ status, count: status === "UNCOUNTED" ? null : count({ status }) })];
    const delivery = deferred<StocktakeCount>();
    vi.mocked(stocktakeApi.command).mockReturnValue(delivery.promise);
    mount("mobile");
    const list = await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(await within(list).findByRole("button", { name: /시험 품목 A/ }));
    fireEvent.click(screen.getByRole("button", { name: status === "UNCOUNTED" ? "계수 시작" : "재조사", exact: true }));
    const processing = screen.getByRole("button", { name: "처리 중…", exact: true });
    expect(processing).toBeDisabled();
    expect(processing).toHaveAttribute("aria-busy", "true");
    fireEvent.click(processing);
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
    await act(async () => delivery.resolve(count()));
    await waitFor(() => expect(screen.queryByRole("button", { name: "처리 중…", exact: true })).not.toBeInTheDocument());
  });

  it.each([
    ["APPLIED", "APPLIED", "green"], ["CONFIRMED", "CONFIRMED", "yellow"],
    ["APPLIED", "UNCOUNTED", "blue"],
  ] as const)("모바일 조사 시트는 %s/%s 위치의 품목 행 상태 색을 사용한다", async (firstStatus, secondStatus, tone) => {
    const first = target({ status: firstStatus });
    const second = target({ target_id: "target-b", scope_id: "tube", scope_name: "튜브", status: secondStatus });
    targets = [{ ...first, location_targets: [first, second] }];
    mount("mobile");
    const list = await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(await within(list).findByRole("button", { name: /시험 품목 A/ }));
    const sheet = screen.getByRole("dialog", { name: "조사 작업" }).querySelector<HTMLElement>('[data-anim="sheetUp"]')!;
    expect(sheet.style.backgroundImage).toContain(`var(--c-${tone})`);
    expect(sheet.style.backgroundColor).toBe("var(--c-bg)");
  });

  it.each([
    ["admin", "none", "none"], ["staff", "none", "primary"], ["staff", "none", "deputy"],
  ])("%s·부서 %s·창고 %s는 회차 이력을 숨기고 활성 회차만 조회한다", async (level, department_role, warehouse_role) => {
    state.actor = { ...state.actor, level, department_role, warehouse_role };
    mount("mobile");
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.queryByRole("button", { name: "회차 이력 관리" })).not.toBeInTheDocument();
    expect(stocktakeApi.read).toHaveBeenCalledWith("/api/stocktakes/rounds?active_only=true", "token-employee-a", expect.anything());
  });

  it.each(["primary", "deputy"])("부서 %s는 일반 직원이어도 회차 이력을 표시한다", async department_role => {
    state.actor = { ...state.actor, level: "staff", department_role, warehouse_role: "none" };
    mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.getByRole("button", { name: "회차 이력 관리" })).toBeVisible();
  });

  it("열린 이력도 부서 결재 역할이 해제되면 숨긴다", async () => {
    const view = mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: "회차 이력 관리" }));
    await screen.findByRole("region", { name: "선택한 조사 회차" });
    state.actor = { ...state.actor, department_role: "none" };
    view.changeOperator({ ...state.actor } as Operator);
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.queryByRole("region", { name: "선택한 조사 회차" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "회차 이력 관리" })).not.toBeInTheDocument();
  });

  it("본인 품목의 부서와 창고를 함께 선택하고 검토를 자동 조회한다", async () => {
    const tube = confirmedTarget({ target_id: "tube-a", scope_id: "tube", scope_name: "튜브", confirmation_revision_id: "revision-tube" });
    targets = [confirmedTarget({ location_targets: [confirmedTarget(), tube] })];
    vi.mocked(stocktakeApi.command).mockResolvedValue(preview());
    mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "시험 품목 A 선택" }));
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    expect(stocktakeApi.command).toHaveBeenCalledWith("application_bulk_preview", expect.stringContaining("application-bulk-previews"),
      "token-employee-a", { confirmation_revision_ids: ["revision-a", "revision-tube"] }, expect.anything());
    expect(screen.queryByRole("combobox", { name: "반영 위치" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "선택 반영 미리보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "선택 해제" })).not.toBeInTheDocument();
  });

  it("전체 선택은 아직 불러오지 않은 품목도 포함하고 일부 해제를 표시한다", async () => {
    const next = confirmedTarget({ target_id: "target-b", item_id: "item-b", item_name: "다음 품목", current_item_name: "다음 품목", confirmation_revision_id: "revision-b" });
    targets = [confirmedTarget()];
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.includes("/waiting-selection?")) return { items: [...targets, next], total_items: 2 };
      if (path.includes("/waiting-targets?")) return { items: targets, total_items: 2, next_cursor: "next" };
      return readFixture(path);
    });
    vi.mocked(stocktakeApi.command).mockResolvedValue(preview());
    mount("mobile");
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "전체 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "선택 2개 검토" }));
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    expect(vi.mocked(stocktakeApi.command).mock.calls[0][3]).toEqual({ confirmation_revision_ids: ["revision-a", "revision-b"] });
  });

  it("타인 위치는 체크하지 않으며 차이의 음수는 빨강으로 표시한다", async () => {
    const foreign = confirmedTarget({ target_id: "foreign", scope_id: "tube", scope_name: "튜브",
      confirmation_revision_id: "foreign-revision", count: count({ status: "CONFIRMED", owner_id: "employee-b" }) });
    targets = [confirmedTarget({ location_targets: [confirmedTarget(), foreign] })];
    vi.mocked(stocktakeApi.command).mockResolvedValue({ ...preview(), entries: [{ ...preview().entries[0], deltas: { ...quantities, normal: -7 } }] });
    mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "시험 품목 A 선택" }));
    expect(await screen.findByText("-7")).toHaveClass("text-[var(--c-red)]");
    expect(vi.mocked(stocktakeApi.command).mock.calls[0][3]).toEqual({ confirmation_revision_ids: ["revision-a"] });
  });

  it("전체 선택 후 일부 해제는 중간 상태를 표시하고 전체 해제할 수 있다", async () => {
    targets = [confirmedTarget(), confirmedTarget({ target_id: "target-b", item_id: "item-b", item_name: "시험 품목 B", current_item_name: "시험 품목 B", confirmation_revision_id: "revision-b" })];
    mount("mobile");
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
    const all = await screen.findByRole("checkbox", { name: "전체 선택" });
    fireEvent.click(all);
    await screen.findByRole("button", { name: "선택 2개 검토" });
    expect(all).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "시험 품목 A 선택" }));
    expect(all).toBePartiallyChecked();
    fireEvent.click(all);
    await screen.findByRole("button", { name: "선택 2개 검토" });
    fireEvent.click(all);
    expect(screen.queryByRole("button", { name: /선택 \d+개 검토/ })).not.toBeInTheDocument();
  });

  it("늦은 전체 선택 응답은 바뀐 검색 조건에 합쳐지지 않는다", async () => {
    targets = [confirmedTarget()];
    const delayed = deferred<unknown>();
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path.includes("/waiting-selection?") ? delayed.promise : readFixture(path));
    mount("mobile");
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "전체 선택" }));
    fireEvent.change(screen.getByLabelText("품목 검색"), { target: { value: "시험" } });
    await act(async () => delayed.resolve({ items: targets, total_items: 1 }));
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).not.toBeChecked();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });

  it("다음 페이지와 새 대기 배경 갱신은 이미 선택한 revision만 보존한다", async () => {
    targets = [confirmedTarget()];
    const next = confirmedTarget({ target_id: "target-b", item_id: "item-b", item_name: "시험 품목 B", current_item_name: "시험 품목 B", confirmation_revision_id: "revision-b" });
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.includes("/waiting-targets?")) return new URL(path, "https://test.invalid").searchParams.has("cursor")
        ? { items: [next], total_items: 2, next_cursor: null }
        : { items: targets, total_items: 2, next_cursor: "next" };
      return readFixture(path);
    });
    const { client } = mount("mobile"); await openWaiting();
    fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
    const other = await screen.findByRole("checkbox", { name: "시험 품목 B 선택" });
    expect(other).not.toBeChecked();
    await act(async () => client.invalidateQueries({ queryKey: ["stocktake"] }));
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).toBeChecked();
    expect(other).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 검토" }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.command).mock.calls[0][3]).toEqual({ confirmation_revision_ids: ["revision-a"] }));
  });

  it("배경 조회에서 확인 revision이 바뀌면 재선택 전 반영을 잠근다", async () => {
    targets = [confirmedTarget()];
    const { client } = mount(); await openWaiting();
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    targets = [confirmedTarget({ confirmation_revision_id: "revision-new" })];
    await act(async () => client.invalidateQueries({ queryKey: ["stocktake"] }));
    await screen.findByText("확인 결과가 변경된 품목을 다시 선택해 주세요.");
    expect(screen.queryByRole("button", { name: "재고 반영", exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "시험 품목 A 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "시험 품목 A 선택" }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.command).mock.calls.at(-1)?.[3]).toEqual({ confirmation_revision_ids: ["revision-new"] }));
  });

  it.each(["desktop", "mobile"] as const)("%s 작업 탭과 화면에 맞는 필터 도구줄을 표시하고 회차 선택은 이력에 둔다", async variant => {
    mount(variant);
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.queryByRole("button", { name: "회차·작업 메뉴" })).not.toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "전수조사 메뉴" });
    const filterButton = screen.getByRole("button", { name: "필터 열기" });
    if (variant === "desktop") expect(menu.parentElement).toContainElement(filterButton);
    else expect(screen.getByRole("search", { name: "품목 검색 및 필터" })).toContainElement(filterButton);
    expect(screen.queryByRole("combobox", { name: "조사 회차" })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("button", { name: "회차 이력 관리" }));
    const current = await screen.findByRole("region", { name: "선택한 조사 회차" });
    expect(within(current).getByRole("heading", { name: "진행 조사" })).toBeInTheDocument();
    expect(within(current).getByRole("button", { name: "회차 변경" })).toHaveAttribute("aria-expanded", "false");
  });
  it.each(["desktop", "mobile"] as const)("%s 작업 메뉴를 항상 보여 주고 진행에서도 KPI를 맨 위에 유지한다", async variant => {
    mount(variant);
    const summary = await screen.findByRole("region", { name: "조사 요약" });
    const menu = screen.getByRole("navigation", { name: "전수조사 메뉴" });
    expect(menu).toBeVisible();
    fireEvent.click(within(menu).getByRole("button", { name: "진행", exact: true }));
    await screen.findByText("회차 관리");
    expect(screen.getAllByRole("region", { name: "조사 요약" })).toHaveLength(1);
    expect(summary.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("반영 검토에는 선택 품목만 표시하고 개별 조사·중단 화면을 섞지 않는다", async () => {
    targets = [confirmedTarget()];
    mount();
    await openWaiting();
    fireEvent.click(screen.getByRole("button", { name: /시험 품목 A/ }));
    const panel = screen.getByRole("complementary", { name: "선택 반영 검토" });
    expect(within(panel).queryByRole("region", { name: "입력할 조사 위치" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("region", { name: "이전 조사 결과" })).not.toBeInTheDocument();
    expect(within(panel).queryByText("확인 취소·작업 중단")).not.toBeInTheDocument();
  });
  it.each(["rounds", "progress", "targets"] as const)("%s 초기 조회를 기다리는 동안 콘텐츠 스켈레톤을 유지한다", async stage => {
    const delayed = deferred<unknown>();
    vi.mocked(stocktakeApi.read).mockImplementation(async path => isStagePath(path, stage) ? delayed.promise : readFixture(path));
    mount();
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.some(([path]) => isStagePath(path, stage))).toBe(true));
    expect(screen.getByRole("status", { name: "재고 전수조사 준비 중" })).toBeInTheDocument();
    expect(screen.getByText("전체 대상")).toBeInTheDocument();
    expect(screen.getByLabelText("품목 검색")).toBeDisabled();
    expect(screen.getByText("조사하기")).toBeInTheDocument();
    expect(screen.queryByLabelText("작업자 PIN")).not.toBeInTheDocument();
    const path = vi.mocked(stocktakeApi.read).mock.calls.find(([path]) => isStagePath(path, stage))![0];
    await act(async () => delayed.resolve(readFixture(path)));
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.queryByRole("status", { name: "재고 전수조사 준비 중" })).not.toBeInTheDocument();
  });

  it.each(["rounds", "progress", "targets"] as const)("%s 첫 조회 실패는 다시 시도로 복구한다", async stage => {
    let failed = false;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (isStagePath(path, stage) && !failed) { failed = true; throw new Error("첫 조회 실패"); }
      return readFixture(path);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await screen.findByRole("region", { name: "조사 대상 목록" });
  });

  it("회차가 없으면 준비 스켈레톤에서 빈 회차 안내로 전환한다", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path.endsWith("/latest-summary") ? { summary: null } : { items: [] });
    mount();
    await screen.findByRole("heading", { name: "전수조사 시작 대기" });
    await screen.findByText("아직 완료된 전수조사가 없습니다.");
    expect(screen.queryByRole("status", { name: "재고 전수조사 준비 중" })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 일반 직원에게 과거 상세 대신 최근 요약만 표시한다", async variant => {
    state.actor.department_role = "none";
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path.includes("/rounds?") ? { items: [] } : readFixture(path));
    mount(variant);
    await screen.findByText("이전 조사");
    expect(screen.getByRole("region", { name: "최근 회차 결과" })).toHaveTextContent("90");
    for (const name of ["조사하기", "반영 대기", "진행", "새 회차 시작", "결과 상세 보기", "회차 이력 관리", "필터 열기"]) {
      expect(screen.queryByRole("button", { name, exact: true })).not.toBeInTheDocument();
    }
    expect(vi.mocked(stocktakeApi.read).mock.calls.every(([path]) => !path.includes("/round-b/"))).toBe(true);
  });

  it("담당자의 과거 회차는 명시적 상세 진입에서만 선택하고 대기 화면으로 복귀한다", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path === "/api/stocktakes/rounds" ? { items: [rounds[1]] } : readFixture(path));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "결과 상세 보기" }));
    await screen.findByRole("region", { name: "선택한 조사 회차" });
    fireEvent.click(screen.getByRole("button", { name: "대기 화면으로" }));
    await screen.findByRole("heading", { name: "전수조사 시작 대기" });
    fireEvent.click(screen.getByRole("button", { name: "새 회차 시작" }));
    expect(await screen.findByText("회차 관리")).toHaveAttribute("data-focus-start", "true");
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });

  it("요약 실패는 빈 상태와 구분하며 재시도하고 새 활성 회차로 전환한다", async () => {
    let active = false, failed = true;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path === "/api/stocktakes/rounds") return { items: active ? rounds : [] };
      if (path.endsWith("/latest-summary") && failed) throw new Error("최근 결과 조회 실패");
      return readFixture(path);
    });
    const { client } = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("최근 결과 조회 실패");
    expect(screen.queryByText("아직 완료된 전수조사가 없습니다.")).not.toBeInTheDocument();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await screen.findByText("이전 조사");
    active = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ["stocktake"] }); });
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.queryByRole("heading", { name: "전수조사 시작 대기" })).not.toBeInTheDocument();
  });

  it("직원 전환 후 늦은 요약 응답을 표시하지 않는다", async () => {
    const delayed = deferred<unknown>();
    state.actor.department_role = "none";
    vi.mocked(stocktakeApi.read).mockImplementation(async (path, token) => {
      if (path.includes("/rounds?")) return { items: [] };
      if (path.endsWith("/latest-summary")) return token === "token-employee-a" ? delayed.promise
        : { summary: { ...(readFixture(path) as { summary: object }).summary, title: "새 로그인에서 조회한 회차" } };
      return readFixture(path);
    });
    const { changeOperator } = mount();
    await screen.findByRole("status", { name: "최근 회차 결과를 불러오는 중입니다" });
    state.actor = { ...state.actor, employee_id: "employee-b" };
    changeOperator(state.actor as Operator);
    await screen.findByText("새 로그인에서 조회한 회차");
    await act(async () => delayed.resolve(readFixture("/api/stocktakes/rounds/latest-summary")));
    expect(screen.queryByText("이전 조사")).not.toBeInTheDocument();
  });

  it("담당자 권한이 회수되면 과거 상세를 닫고 공개 요약만 남긴다", async () => {
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path === "/api/stocktakes/rounds" ? { items: [rounds[1]] }
      : path.includes("/rounds?") ? { items: [] } : readFixture(path));
    const { changeOperator } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "결과 상세 보기" }));
    await screen.findByRole("region", { name: "선택한 조사 회차" });
    state.actor.department_role = "none";
    changeOperator({ ...state.actor } as Operator);
    await screen.findByRole("heading", { name: "전수조사 시작 대기" });
    await screen.findByRole("region", { name: "최근 회차 결과" });
    expect(screen.queryByRole("button", { name: "결과 상세 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "선택한 조사 회차" })).not.toBeInTheDocument();
  });

  it("대기 중 시작 준비 뒤 새 활성 회차가 생기면 조사 화면으로 이동한다", async () => {
    let active = false;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path === "/api/stocktakes/rounds" ? { items: active ? rounds : [] } : readFixture(path));
    const { client } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "새 회차 시작" }));
    await screen.findByText("회차 관리");
    active = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ["stocktake"] }); });
    // A new round alone must not unmount a possibly unresolved start request.
    expect(screen.getByText("회차 관리")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시작 완료 알림" }));
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.getByRole("button", { name: "조사하기", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  it("빈 대상도 준비를 끝내고 빈 목록으로 표시한다", async () => {
    targets = [];
    mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    expect(screen.queryByRole("status", { name: "재고 전수조사 준비 중" })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 긴 회차명에서도 회차 선택과 필터 동작을 유지한다", async variant => {
    const title = "부서별 실수량을 확인하는 재고 전수조사 회차 ".repeat(8);
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path === "/api/stocktakes/rounds"
      ? { items: [{ ...rounds[0], title }, rounds[1]] } : readFixture(path));
    mount(variant);
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: "회차 이력 관리" }));
    const picker = await screen.findByRole("region", { name: "선택한 조사 회차" });
    expect(within(picker).getByRole("heading", { name: title.trim() })).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: "회차 변경" }));
    expect(within(picker).getByRole("button", { name: new RegExp(title.trim()) })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "조사하기", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "고압", exact: true }));
    await screen.findByText("조건에 맞는 대상이 없습니다.");
    expect(screen.getByRole("button", { name: "필터 닫기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "고압", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  it("모바일 검색과 AND/OR를 필터 카드 위의 공통 도구줄에 모으고 기존 필터 기능을 유지한다", async () => {
    mount("mobile");
    await screen.findByRole("textbox", { name: "품목 검색" });
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    const toolbar = screen.getByRole("search", { name: "품목 검색 및 필터" });
    expect(within(toolbar).getByRole("textbox", { name: "품목 검색" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "AND", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(toolbar).getByRole("button", { name: "OR", exact: true }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.some(([path]) => path.includes("/targets?") && path.includes("logic=OR"))).toBe(true));
    const departmentCard = screen.getByText("부서 구분").parentElement!.parentElement!;
    expect(toolbar.compareDocumentPosition(departmentCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("textbox", { name: "품목 검색" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "품목 코드 기준" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재고 위치 기준" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "창고", exact: true })).not.toBeInTheDocument();
  });

  it("부서 변경은 커서를 초기화하고 늦은 응답을 합치지 않으며 초안을 보존한다", async () => {
    const delayed = deferred<unknown>();
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (!path.includes("/targets?")) return readFixture(path);
      const params = new URL(path, "https://test.invalid").searchParams;
      if (params.getAll("departments").includes("고압")) return delayed.promise;
      if (params.has("cursor")) return { items: [target({ target_id: "page-two", item_id: "second", item_name: "다음 품목", current_item_name: "다음 품목" })], next_cursor: null };
      return { items: targets, next_cursor: params.has("departments") ? null : "first-next" };
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "19" } });
    fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
    await screen.findByRole("button", { name: /다음 품목/ });
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "고압", exact: true }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.some(([path]) => new URL(path, "https://test.invalid").searchParams.has("departments"))).toBe(true));
    expect(screen.queryByRole("status", { name: "재고 전수조사 준비 중" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(input).toHaveValue("19");
    fireEvent.click(screen.getByRole("button", { name: "고압", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "튜브", exact: true }));
    await screen.findByRole("button", { name: /시험 품목 A/ });
    await act(async () => delayed.resolve({ items: [target({ target_id: "stale", item_id: "stale", item_name: "이전 조건 품목", current_item_name: "이전 조건 품목" })], next_cursor: null }));
    expect(screen.queryByRole("button", { name: /이전 조건 품목/ })).not.toBeInTheDocument();
    expect(input).toHaveValue("19");
    const filteredCalls = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => new URL(path, "https://test.invalid").searchParams.has("departments"));
    expect(filteredCalls.every(([path]) => !new URL(path, "https://test.invalid").searchParams.has("cursor"))).toBe(true);
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(itemSearchApi.getConfig).mockResolvedValue({ version: "search-v1", synonym_groups: [], item_aliases: {} });
    state.actor = { employee_id: "employee-a", name: "계수 작업자", level: "staff", department_role: "primary", warehouse_role: "none" };
    targets = [target()];
    state.validate.mockResolvedValue(true);
    state.restore.mockImplementation((id?: string) => id === state.actor.employee_id ? session(id) : null);
    state.current.mockImplementation(async () => ({ employee_id: state.actor.employee_id }));
    state.issue.mockImplementation(async (id: string) => session(id));
    vi.mocked(stocktakeApi.read).mockImplementation(async (path) => readFixture(path));
    vi.mocked(stocktakeApi.command).mockImplementation(async (kind, _path, _token, body) => {
      if (kind === "application_bulk_preview") return preview();
      if (kind === "count_save") return count({ version: 3, quantities: (body as { quantities: StocktakeCount["quantities"] }).quantities });
      return { application_id: "application-a" };
    });
  });

  it("서버 회차 요약과 일부 페이지만 불러온 목록 건수를 구분한다", async () => {
    mount();
    const summary = await screen.findByRole("region", { name: "조사 요약" });
    await waitFor(() => expect(within(summary).getByText("120")).toBeInTheDocument());
    expect(within(summary).getByText("80")).toBeInTheDocument();
    expect(within(summary).getByText("25")).toBeInTheDocument();
    expect(within(summary).getByText("15")).toBeInTheDocument();
    expect(within(summary).getByText("대기")).toBeInTheDocument();
    expect(within(summary).getByRole("navigation", { name: "전수조사 메뉴" })).toBeVisible();
    expect(screen.queryByText(/불러온 품목/)).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 목록은 시작자가 아닌 위치별 확인자를 표시한다", async variant => {
    const warehouse = confirmedTarget({ confirmed_name: "창고 확인자" });
    const code = confirmedTarget({ target_id: "target-code", scope_id: "tube", scope_name: "튜브", confirmed_name: "부서 확인자" });
    const draftLocation = target({ target_id: "target-draft", scope_id: "assembly", scope_name: "조립", confirmed_name: "무효 확인자" });
    targets = [{ ...warehouse, location_targets: [code, warehouse, draftLocation] }];
    mount(variant);
    const list = await screen.findByRole("region", { name: "조사 대상 목록" });
    const row = await within(list).findByRole("button", { name: /시험 품목 A/ });
    expect(row).toHaveTextContent("부서 확인자 · 창고 확인자");
    expect(row).not.toHaveTextContent("계수 작업자");
    expect(row).not.toHaveTextContent("무효 확인자");
    if (variant === "desktop") expect(within(list).getByRole("columnheader", { name: "확인자" })).toBeInTheDocument();
    else expect(row).not.toHaveTextContent("M-A");
  });

  it.each(["desktop", "mobile"] as const)("%s 품목 한 행에서 위치를 바꾸면 현재 위치만 저장하고 선택을 보존한다", async variant => {
    const warehouse = target();
    const code = target({ target_id: "target-code", scope_id: "tube", scope_name: "튜브", count: null, status: "UNCOUNTED" });
    targets = [{ ...warehouse, location_targets: [code, warehouse] }];
    vi.mocked(stocktakeApi.command).mockImplementation(async (kind, _path, _token, body) => {
      expect(kind).toBe("count_save");
      const saved = count({ version: 3, quantities: (body as { quantities: StocktakeCount["quantities"] }).quantities });
      const updated = { ...warehouse, count: saved, version: 3 };
      targets = [{ ...updated, location_targets: [code, updated] }];
      return saved;
    });
    mount(variant);
    const row = await screen.findByRole("button", { name: /시험 품목 A/ });
    expect(row).toHaveTextContent("확인 0/2");
    expect(screen.queryByText(/불러온 품목/)).not.toBeInTheDocument();
    expect(vi.mocked(stocktakeApi.read).mock.calls.find(([path]) => path.includes("/targets?"))?.[0]).toContain("group_by_item=true");
    fireEvent.click(row);
    fireEvent.change(await screen.findByLabelText("정상 수량"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "튜브 미확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "튜브 미확인" })).toHaveAttribute("aria-pressed", "true"));
    expect(stocktakeApi.command).toHaveBeenCalledWith("count_save", "/api/stocktakes/counts/count-a", expect.any(String),
      expect.objectContaining({ quantities: { ...quantities, normal: 9 } }), expect.any(Object));
    fireEvent.click(screen.getByRole("button", { name: "창고 계수 중" }));
    await waitFor(() => expect(screen.getByLabelText("정상 수량")).toHaveValue("9"));
    fireEvent.click(screen.getByRole("button", { name: variant === "mobile" ? "시트 닫기 핸들" : "작업 패널 닫기" }));
    await waitFor(() => expect(row).toHaveFocus());
    fireEvent.click(row);
    expect(screen.getByRole("button", { name: "창고 계수 중" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["desktop", undefined], ["mobile", undefined],
    ["desktop", "COMMAND_RESULT_UNKNOWN"], ["mobile", "COMMAND_RESULT_UNKNOWN"],
    ["desktop", "VERSION_CONFLICT"], ["mobile", "VERSION_CONFLICT"],
  ] as const)("%s 위치 전환은 저장 실패 %s에서 입력과 현재 위치를 보존한다", async (variant, code) => {
    const warehouse = target();
    const other = target({ target_id: "target-code", scope_id: "tube", scope_name: "튜브", count: null, status: "UNCOUNTED" });
    targets = [{ ...warehouse, location_targets: [other, warehouse] }];
    vi.mocked(stocktakeApi.command).mockRejectedValue(Object.assign(new Error("위치 전환 저장 실패"), { code }));
    mount(variant);
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "튜브 미확인" }));
    await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("9");
    expect(screen.getByRole("button", { name: "창고 계수 중" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole(variant === "mobile" ? "dialog" : "complementary", { name: variant === "mobile" ? "조사 작업" : "시험 품목 A" })).toBeVisible();
  });

  it("부서 필터로 대표 대상이 바뀌어도 코드상 위치의 편집기를 유지한다", async () => {
    const code = target({ target_id: "target-code", scope_id: "tube", scope_name: "튜브" });
    const warehouse = target({ count: null, status: "UNCOUNTED" });
    targets = [{ ...code, location_targets: [code, warehouse] }];
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.includes("/targets?") && new URL(path, "https://test.invalid").searchParams.has("departments")) {
        return { items: [{ ...warehouse, location_targets: [code, warehouse] }], next_cursor: null };
      }
      return readFixture(path);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "튜브", exact: true }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "조사 대상 목록" })).getByRole("button", { name: /시험 품목 A/ })).toHaveTextContent("계수 중"));
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("9");
    expect(screen.getByRole("button", { name: "튜브 계수 중" })).toHaveAttribute("aria-pressed", "true");
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });

  it("검색 조건을 바꾸면 반영 선택과 검토를 초기화한다", async () => {
    targets = [confirmedTarget()];
    mount(); await openWaiting();
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    fireEvent.change(screen.getByLabelText("품목 검색"), { target: { value: "시험" } });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).not.toBeChecked());
    expect(screen.queryByRole("button", { name: "재고 반영", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /반영 대기 42/ })).toBeVisible();
  });

  it("품목 전체 선택은 반영된 위치를 제외하고 서로 다른 위치를 함께 검토한다", async () => {
    const warehouse = confirmedTarget();
    const tube = confirmedTarget({ target_id: "target-tube", scope_id: "tube", scope_name: "튜브", confirmation_revision_id: "revision-tube" });
    const otherWarehouse = confirmedTarget({ target_id: "target-b", item_id: "item-b", item_name: "시험 품목 B", current_item_name: "시험 품목 B", confirmation_revision_id: "revision-b" });
    const appliedTube = target({ ...otherWarehouse, target_id: "target-b-tube", scope_id: "tube", scope_name: "튜브", status: "APPLIED" });
    targets = [{ ...warehouse, location_targets: [tube, warehouse] }, { ...otherWarehouse, location_targets: [appliedTube, otherWarehouse] }];
    mount("mobile");
    await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(screen.getByRole("button", { name: /^반영 대기/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "전체 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "선택 2개 검토" }));
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    expect(stocktakeApi.command).toHaveBeenCalledWith("application_bulk_preview", expect.any(String), expect.any(String),
      { confirmation_revision_ids: ["revision-tube", "revision-a", "revision-b"] }, expect.any(Object));
  });

  it("복수 부서·모델·공정과 AND/OR를 서버에 보내며 전체 KPI는 검색을 유지한다", async () => {
    mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    const search = screen.getByLabelText("품목 검색");
    fireEvent.change(search, { target: { value: "시험" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "튜브", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "고압", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "COCOON", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "원자재", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "불용", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "OR", exact: true }));
    const summary = screen.getByRole("region", { name: "조사 요약" });
    fireEvent.click(within(summary).getByRole("button", { name: /^미확인 / }));
    await waitFor(() => expect(vi.mocked(stocktakeApi.read).mock.calls.some(([path]) => path.includes("status_group=UNCONFIRMED") && path.includes("logic=OR"))).toBe(true));
    fireEvent.click(within(summary).getByRole("button", { name: /^전체 대상 / }));
    await waitFor(() => {
      const path = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/targets?")).at(-1)![0];
      const params = new URL(path, "https://test.invalid").searchParams;
      expect(params.get("status_group")).toBeNull();
      expect(params.get("search")).toBe("시험");
      expect(params.get("scope_kind")).toBeNull();
      expect(params.get("scope_id")).toBeNull();
      expect(params.getAll("departments")).toEqual(["고압", "튜브"]);
      expect(params.get("logic")).toBe("OR");
      expect(params.getAll("model_slots")).toEqual(["1", "2"]);
      expect(params.getAll("process_steps")).toEqual(["OBSOLETE", "R"]);
      expect(params.get("cursor")).toBeNull();
    });
    expect(search).toHaveValue("시험");
    expect(screen.queryByRole("button", { name: "계수 중", exact: true })).not.toBeInTheDocument();
  });

  it("필터에서 선택 대상이 사라져도 초안과 편집기 인스턴스를 유지한다", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "19" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "고압", exact: true }));
    await screen.findByText("조건에 맞는 대상이 없습니다.");
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("19");
    expect(screen.getByRole("complementary", { name: "시험 품목 A" })).toBeVisible();
  });

  it("거절된 커서는 첫 페이지부터 재조회하고 열린 편집기를 유지한다", async () => {
    let firstPages = 0;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (!path.includes("/targets?")) return readFixture(path);
      const params = new URL(path, "https://test.invalid").searchParams;
      if (params.has("cursor")) throw Object.assign(new Error("목록 조건 변경"), { code: "TARGET_CURSOR_STALE" });
      firstPages += 1;
      return { items: targets, next_cursor: firstPages === 1 ? "old-cursor" : null };
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
    await waitFor(() => expect(firstPages).toBe(2));
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("7");
    expect(screen.queryByRole("button", { name: "더 불러오기" })).not.toBeInTheDocument();
  });

  it("더 불러오기와 배경 갱신은 기존 행과 열린 계수 입력을 유지한다", async () => {
    const more = deferred<unknown>();
    const refreshed = deferred<unknown>();
    let background = false;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (!path.includes("/targets?")) return readFixture(path);
      const params = new URL(path, "https://test.invalid").searchParams;
      if (params.has("cursor")) return more.promise;
      if (background) return refreshed.promise;
      return { items: targets, next_cursor: "next-page" };
    });
    const { client } = mount();
    const row = await screen.findByRole("button", { name: /시험 품목 A/ });
    fireEvent.click(row);
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "불러오는 중…", exact: true })).toBeDisabled());
    expect(row).toBeInTheDocument();
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("11");
    expect(screen.getByRole("table")).not.toHaveAttribute("aria-busy");
    await act(async () => more.resolve({ items: [target({ target_id: "next", item_id: "next", item_name: "추가 품목", current_item_name: "추가 품목" })], next_cursor: null }));
    await screen.findByRole("button", { name: /추가 품목/ });
    background = true;
    void client.invalidateQueries({ predicate: query => query.queryKey.includes("targets") });
    await waitFor(() => expect(client.isFetching({ predicate: query => query.queryKey.includes("targets") })).toBeGreaterThan(0));
    expect(row).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "재고 전수조사 준비 중" })).not.toBeInTheDocument();
    expect(screen.getByRole("table")).not.toHaveAttribute("aria-busy");
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("11");
    await act(async () => refreshed.resolve({ items: targets, next_cursor: "next-page" }));
    await waitFor(() => expect(client.isFetching({ predicate: query => query.queryKey.includes("targets") })).toBe(0));
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("11");
  });

  it("현재 재고는 계수 초안과 구분하며 서버 순서를 UUID로 다시 정렬하지 않는다", async () => {
    const inventory = { quantity: 50, warehouse_qty: 50, pending_quantity: 5, department_pending_quantity: 0, available_quantity: 45, locations: [], defective_breakdown: [] };
    targets = [target({ target_id: "z-first", current_inventory: inventory }), target({ target_id: "a-second", item_id: "item-b", item_name: "두번째 대상", current_item_name: "두번째 대상", count: null, status: "UNCOUNTED" })];
    mount("mobile");
    const list = await screen.findByRole("region", { name: "조사 대상 목록" });
    await within(list).findByRole("button", { name: /시험 품목 A/ });
    const rows = within(list).getAllByRole("button");
    const first = rows.find(row => row.tagName === "TR")!;
    expect(first).toHaveTextContent("시험 품목 A");
    expect(first).toHaveTextContent("창고 50");
    expect(first).toHaveTextContent("예약 5");
    expect(first).not.toHaveTextContent("창고 7");
    expect(within(list).getByText("현재 재고 확인 필요")).toBeInTheDocument();
  });

  it("모바일 목록 복귀·검색·재선택에도 같은 편집기와 입력을 유지한다", async () => {
    mount("mobile");
    await screen.findByRole("region", { name: "조사 대상 목록" });
    const search = screen.getByLabelText("품목 검색");
    fireEvent.change(search, { target: { value: "시험 품목" } });
    const row = await screen.findByRole("button", { name: /시험 품목 A/ });
    const viewport = screen.getAllByTestId("mobile-scroll-viewport")[0];
    viewport.scrollTop = 130;
    fireEvent.scroll(viewport);
    fireEvent.click(row);
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "시트 닫기 핸들" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "조사 작업" })).not.toBeInTheDocument());
    expect(search).toHaveValue("시험 품목");
    expect(viewport.scrollTop).toBe(130);
    expect(row).toHaveFocus();
    fireEvent.change(search, { target: { value: "목록에 없음" } });
    await screen.findByText("조건에 맞는 대상이 없습니다.");
    expect(input).toHaveValue("9");
    fireEvent.change(search, { target: { value: "시험 품목" } });
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    expect(screen.getByLabelText("정상 수량")).toBe(input);
    expect(input).toHaveValue("9");
    expect(vi.mocked(stocktakeApi.command).mock.calls.filter(([kind]) => kind === "count_save")).toHaveLength(1);
  });

  it.each(["desktop", "mobile"] as const)("%s KPI는 전체 상태 그룹을 조회하고 펼친 필터와 함께 선택 표시한다", async variant => {
    targets = [target(), confirmedTarget({ target_id: "target-b", item_id: "item-b", item_name: "확인 품목", current_item_name: "확인 품목" }), target({ target_id: "target-c", item_id: "item-c", item_name: "반영 품목", current_item_name: "반영 품목", status: "APPLIED", count: count({ status: "APPLIED" }) })];
    mount(variant);
    const summary = await screen.findByRole("region", { name: "조사 요약" });
    const list = await screen.findByRole("region", { name: "조사 대상 목록" });
    await within(list).findByRole("button", { name: /시험 품목 A/ });
    fireEvent.click(within(summary).getByRole("button", { name: /^미확인 / }));
    await waitFor(() => expect(within(list).queryByRole("button", { name: /반영 품목/ })).not.toBeInTheDocument());
    expect(within(summary).getByRole("button", { name: /^미확인 / })).toHaveAttribute("aria-pressed", "true");
    const calls = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("/targets?")).map(([path]) => new URL(path, "https://test.invalid").searchParams.get("status_group"));
    expect(calls).toContain("UNCONFIRMED");
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    expect(within(summary).queryByRole("button", { name: "미확인", exact: true })).not.toBeInTheDocument();
    fireEvent.click(within(summary).getByRole("button", { name: /^대기 / }));
    await waitFor(() => expect(within(list).queryByRole("button", { name: /반영 품목/ })).not.toBeInTheDocument());
    expect(within(list).getByRole("button", { name: /확인 품목/ })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /시험 품목 A/ })).not.toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: /^대기 / })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(summary).getByRole("button", { name: /^완료 / }));
    await within(list).findByRole("button", { name: /반영 품목/ });
    await waitFor(() => expect(within(list).queryByRole("button", { name: /확인 품목/ })).not.toBeInTheDocument());
    expect(within(list).getByRole("button", { name: /반영 품목/ })).toBeInTheDocument();
    fireEvent.click(within(summary).getByRole("button", { name: /^전체 대상 / }));
    await within(list).findByRole("button", { name: /시험 품목 A/ });
    expect(within(summary).getByRole("button", { name: /^전체 대상 / })).toHaveAttribute("aria-pressed", "true");
  });

  it("닫힌 데스크톱 공통 패널은 편집기를 유지하고 Escape와 표 필터는 안전하게 동작한다", async () => {
    mount();
    const list = await screen.findByRole("region", { name: "조사 대상 목록" });
    fireEvent.click(await within(list).findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    const panel = screen.getByRole("complementary", { name: "시험 품목 A" });
    expect(within(panel).getByTestId("desktop-right-panel")).toBeInTheDocument();
    expect(panel.parentElement).toHaveStyle({ transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "시험 품목 A" })).not.toBeInTheDocument());
    expect(input).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "튜브", exact: true }));
    fireEvent.click(await within(list).findByRole("button", { name: /시험 품목 A/ }));
    expect(screen.getByLabelText("정상 수량")).toBe(input);
  });

  it("KPI 그룹은 서버 커서 하나로 다음 페이지와 전역 순서를 유지한다", async () => {
    targets = [target(), confirmedTarget({ target_id: "target-b", item_id: "item-b", item_name: "두번째 확인", current_item_name: "두번째 확인" }), target({ target_id: "target-c", item_id: "item-c", item_name: "반영 품목", current_item_name: "반영 품목", status: "APPLIED", count: count({ status: "APPLIED" }) })];
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (!path.includes("/targets?")) return readFixture(path);
      const params = new URL(path, "https://test.invalid").searchParams;
      if (params.get("status_group") === "CONFIRMED_WAITING") return params.get("cursor") ? { items: [targets[2]], next_cursor: null } : { items: [targets[1]], next_cursor: "group-next" };
      return readFixture(path);
    });
    mount();
    const summary = await screen.findByRole("region", { name: "조사 요약" });
    fireEvent.click(await within(summary).findByRole("button", { name: /^대기 / }));
    fireEvent.click(await screen.findByRole("button", { name: "더 불러오기" }));
    await screen.findByRole("button", { name: /반영 품목/ });
    const groupCalls = vi.mocked(stocktakeApi.read).mock.calls.filter(([path]) => path.includes("status_group=CONFIRMED_WAITING"));
    expect(groupCalls).toHaveLength(2);
    expect(groupCalls[1][0]).toContain("cursor=group-next");
    const list = screen.getByRole("region", { name: "조사 대상 목록" });
    expect(within(list).getAllByRole("button").filter(row => row.tagName === "TR").map(row => row.textContent)).toEqual([
      expect.stringContaining("두번째 확인"), expect.stringContaining("반영 품목"),
    ]);
  });

  it.each(["desktop", "mobile"] as const)("%s 대상 조회 실패를 표시하고 새로고침으로 복구한다", async variant => {
    let failTargets = true;
    vi.mocked(stocktakeApi.read).mockImplementation(async path => {
      if (path.includes("/targets?") && failTargets) throw new Error("대상 조회 실패");
      return readFixture(path);
    });
    mount(variant);
    await screen.findByText(/대상 조회 실패/);
    expect(screen.queryByLabelText("작업자 PIN")).not.toBeInTheDocument();
    failTargets = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("button", { name: /시험 품목 A/ });
    await waitFor(() => expect(screen.queryByText(/대상 조회 실패/)).not.toBeInTheDocument());
    expect(screen.queryByText(/불러온 품목/)).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s 저장 실패 시 새 닫기·복귀 동작을 차단한다", async variant => {
    vi.mocked(stocktakeApi.command).mockRejectedValueOnce(new Error("저장 연결 실패"));
    mount(variant);
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: variant === "mobile" ? "시트 닫기 핸들" : "작업 패널 닫기" }));
    await screen.findByText("저장 연결 실패");
    expect(screen.getByRole(variant === "mobile" ? "dialog" : "complementary", { name: variant === "mobile" ? "조사 작업" : "시험 품목 A" })).toBeVisible();
    expect(input).toHaveValue("9");
    vi.mocked(stocktakeApi.command).mockResolvedValue(count({ version: 3, quantities: { ...quantities, normal: 9 } }));
    fireEvent.click(screen.getByRole("button", { name: variant === "mobile" ? "시트 닫기 핸들" : "작업 패널 닫기" }));
    await waitFor(() => expect(screen.queryByRole(variant === "mobile" ? "dialog" : "complementary", { name: variant === "mobile" ? "조사 작업" : "시험 품목 A" })).not.toBeInTheDocument());
    expect(input).toHaveValue("9");
  });

  it("모바일 결과 불명에서는 목록 복귀와 재전송을 차단한다", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValue(Object.assign(new Error("저장 결과 불명"), { code: "COMMAND_RESULT_UNKNOWN" }));
    mount("mobile");
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "시트 닫기 핸들" }));
    await screen.findByRole("button", { name: "처리 결과 확인" });
    fireEvent.click(screen.getByRole("button", { name: "시트 닫기 핸들" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "조사 작업" })).toBeVisible();
    expect(input).toHaveValue("9");
    expect(stocktakeApi.command).toHaveBeenCalledTimes(1);
  });

  it("모바일 선택 행이 목록에서 사라지면 검색으로 포커스를 복원한다", async () => {
    const { client } = mount("mobile");
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    await screen.findByLabelText("정상 수량");
    await act(async () => client.setQueriesData({ predicate: query => query.queryKey.includes("targets") }, { pages: [{ items: [], next_cursor: null }], pageParams: [null] }));
    fireEvent.click(screen.getByRole("button", { name: "시트 닫기 핸들" }));
    await waitFor(() => expect(screen.getByLabelText("품목 검색")).toHaveFocus());
  });

  it("종료된 회차의 미계수 대상은 상세 안내를 표시하고 계수 시작을 노출하지 않는다", async () => {
    targets = [target({ status: "CLOSED_UNAPPLIED", count: null })];
    vi.mocked(stocktakeApi.read).mockImplementation(async path => path === "/api/stocktakes/rounds" ? { items: [rounds[1]] } : readFixture(path));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "결과 상세 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "조사하기", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    expect(screen.getByText(/종료된 회차입니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계수 시작" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재조사" })).not.toBeInTheDocument();
  });

  it.each(["desktop", "mobile"] as const)("%s에서 로그인한 작업자를 자동 확인하고 별도 인증 버튼 없이 조사 목록을 조회한다", async variant => {
    const ownership = deferred<boolean>();
    state.validate.mockReturnValue(ownership.promise);
    const authentication = deferred<{ employee_id: string }>();
    state.current.mockReturnValue(authentication.promise);
    mount(variant);
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("작업자 PIN")).not.toBeInTheDocument();
    expect(state.current).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "재고 전수조사 준비 중" })).toBeInTheDocument();
    expect(screen.getByLabelText("품목 검색")).toBeDisabled();
    await act(async () => ownership.resolve(true));
    await waitFor(() => expect(state.current).toHaveBeenCalledWith("token-employee-a"));
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "재고 전수조사 준비 중" })).toBeInTheDocument();
    expect(screen.getByText("조사하기")).toBeInTheDocument();
    await act(async () => authentication.resolve({ employee_id: "employee-a" }));
    expect(await screen.findByRole("button", { name: /시험 품목 A/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "조사하기", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(state.validate).toHaveBeenCalledTimes(1);
    expect(stocktakeApi.read).toHaveBeenCalledWith("/api/stocktakes/rounds", "token-employee-a", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(state.issue).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "작업자 인증 다시 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
  });

  it("작업자가 바뀐 뒤 도착한 이전 인증 응답은 작업 화면을 열지 않는다", async () => {
    const oldAuthentication = deferred<{ employee_id: string }>();
    state.current.mockReturnValueOnce(oldAuthentication.promise).mockResolvedValue({ employee_id: "employee-b" });
    const view = mount();
    await waitFor(() => expect(state.current).toHaveBeenCalledTimes(1));
    state.actor = { ...state.actor, employee_id: "employee-b", name: "새 작업자" };
    view.changeOperator({ ...state.actor } as Operator);
    await screen.findByRole("region", { name: "조사 대상 목록" });
    await act(async () => oldAuthentication.resolve({ employee_id: "employee-a" }));
    expect(vi.mocked(stocktakeApi.read).mock.calls.every(([, token]) => token === "token-employee-b")).toBe(true);
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
  });

  it("인증된 작업자가 교체되면 새 신원이 확인되기 전 구토큰으로 새 작업자 조회를 시작하지 않는다", async () => {
    const view = mount();
    await screen.findByRole("region", { name: "조사 대상 목록" });
    await waitFor(() => expect(view.client.isFetching()).toBe(0));
    vi.mocked(stocktakeApi.read).mockClear();
    const nextAuthentication = deferred<{ employee_id: string }>();
    state.current.mockReturnValue(nextAuthentication.promise);
    state.actor = { ...state.actor, employee_id: "employee-b", name: "새 작업자" };
    view.changeOperator({ ...state.actor } as Operator);
    await waitFor(() => expect(state.current).toHaveBeenCalledWith("token-employee-b"));
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
    await act(async () => nextAuthentication.resolve({ employee_id: "employee-b" }));
    await waitFor(() => expect(stocktakeApi.read).toHaveBeenCalled());
    expect(vi.mocked(stocktakeApi.read).mock.calls.every(([, token]) => token === "token-employee-b")).toBe(true);
  });

  it("만료된 로그인은 일반 MES 로그인으로 복구하고 전수조사 PIN을 요구하지 않는다", async () => {
    const login = vi.fn();
    window.addEventListener("dexcowin_operator_login_required", login);
    state.current.mockRejectedValue(new ApiError("expired", 401, "OPERATOR_SESSION_INVALID"));
    mount();
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(screen.queryByLabelText("작업자 PIN")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
    expect(state.issue).not.toHaveBeenCalled();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
    window.removeEventListener("dexcowin_operator_login_required", login);
  });

  it("로그인 세션 만료 후 같은 작업자로 재인증하면 미저장 계수 입력을 보존한다", async () => {
    const timers = vi.spyOn(window, "setTimeout");
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    fireEvent.change(await screen.findByLabelText("정상 수량"), { target: { value: "9" } });
    const expiry = timers.mock.calls.find(([, delay]) => delay != null && delay > 3_500_000)?.[0];
    expect(expiry).toBeTypeOf("function");
    act(() => { if (typeof expiry === "function") expiry(); });
    timers.mockRestore();
    expect(screen.queryByRole("region", { name: "조사 작업자 인증" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("정상 수량")).toHaveValue("9");
    expect(screen.getByLabelText("정상 수량")).toHaveAttribute("readonly");
    state.restore.mockReturnValue({ ...session(), token: "renewed-token" });
    act(() => window.dispatchEvent(new Event("dexcowin_operator_change")));
    await waitFor(() => expect(state.current).toHaveBeenCalledWith("renewed-token"));
    await waitFor(() => expect(screen.getByLabelText("정상 수량")).not.toHaveAttribute("readonly"));
    expect(screen.getByLabelText("정상 수량")).toHaveValue("9");
    expect(state.issue).not.toHaveBeenCalled();
  });

  it("로그인 확인의 통신 실패는 PIN 대신 재시도로 복구한다", async () => {
    state.current.mockRejectedValueOnce(new Error("offline"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("region", { name: "조사 대상 목록" })).toBeInTheDocument();
    expect(state.issue).not.toHaveBeenCalled();
  });

  it("목록 필터와 실패한 회차 이동은 미저장 입력을 보존한다", async () => {
    vi.mocked(stocktakeApi.command).mockRejectedValueOnce(new Error("저장 연결 실패"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("품목 검색"), { target: { value: "목록에 없음" } });
    await screen.findByText("조건에 맞는 대상이 없습니다.");
    expect(input).toHaveValue("9");
    fireEvent.click(screen.getByRole("button", { name: "회차 이력 관리" }));
    await screen.findByText("저장 연결 실패");
    expect(screen.queryByRole("combobox", { name: "조사 회차" })).not.toBeInTheDocument();
    expect(input).toHaveValue("9");
    vi.mocked(stocktakeApi.command).mockResolvedValue(count({ version: 3, quantities: { ...quantities, normal: 9 } }));
    fireEvent.click(screen.getByRole("button", { name: "회차 이력 관리" }));
    fireEvent.click(await screen.findByRole("button", { name: "회차 변경" }));
    fireEvent.click(screen.getByRole("button", { name: /이전 조사/ }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "선택한 조사 회차" })).getByRole("heading", { name: "이전 조사" })).toBeInTheDocument());
    expect(screen.queryByLabelText("정상 수량")).not.toBeInTheDocument();
  });

  it("늦게 도착한 과거 계수 조회가 로컬 입력과 새 서버 버전을 덮지 않는다", async () => {
    const oldCount = deferred<StocktakeCount>();
    vi.mocked(stocktakeApi.read).mockImplementation(async (path) => path === "/api/stocktakes/counts/count-a" ? oldCount.promise : readFixture(path));
    const { client } = mount();
    fireEvent.click(await screen.findByRole("button", { name: /시험 품목 A/ }));
    const input = await screen.findByLabelText("정상 수량");
    fireEvent.change(input, { target: { value: "9" } });
    await act(async () => client.setQueryData(["stocktake", "employee-a", "count", "count-a"], count({ version: 4, quantities: { ...quantities, normal: 10 } })));
    await screen.findByText(/서버 버전 4/);
    await act(async () => oldCount.resolve(count()));
    expect(input).toHaveValue("9");
    expect(screen.getByText(/서버 버전 4/)).toBeInTheDocument();
    expect(stocktakeApi.command).not.toHaveBeenCalled();
  });

  it.each(["desktop", "mobile"] as const)("%s 자동 검토·반영 중 중복 클릭을 한 번만 전송한다", async variant => {
    targets = [confirmedTarget()];
    const prepared = deferred<ReturnType<typeof preview>>();
    const applied = deferred<{ application_id: string }>();
    vi.mocked(stocktakeApi.command).mockImplementation(async kind => kind === "application_bulk_preview" ? prepared.promise : applied.promise);
    mount(variant); await openWaiting();
    if (variant === "mobile") {
      const review = screen.getByRole("button", { name: "선택 1개 검토" });
      act(() => { fireEvent.click(review); fireEvent.click(review); });
    }
    await waitFor(() => expect(stocktakeApi.command).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).toBeDisabled();
    await act(async () => prepared.resolve(preview()));
    const applyButton = await screen.findByRole("button", { name: "재고 반영", exact: true });
    act(() => { fireEvent.click(applyButton); fireEvent.click(applyButton); });
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
    expect(vi.mocked(stocktakeApi.command).mock.calls[1][3]).toEqual({ preview_id: "preview-a", preview_hash: "hash-a" });
    await act(async () => applied.resolve({ application_id: "application-a" }));
    expect(await screen.findByText("선택한 확인 결과를 재고에 반영했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).not.toBeChecked();
  });

  it.each(["desktop", "mobile"] as const)("%s PREVIEW_STALE이면 기존 확정 버튼을 제거하고 새 미리보기를 요구한다", async variant => {
    targets = [confirmedTarget()];
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce(preview()).mockRejectedValueOnce(Object.assign(new Error("미리보기가 만료되었습니다."), { code: "PREVIEW_STALE" }));
    mount(variant); await openWaiting();
    if (variant === "mobile") fireEvent.click(screen.getByRole("button", { name: "선택 1개 검토" }));
    fireEvent.click(await screen.findByRole("button", { name: "재고 반영" }));
    await screen.findByText("미리보기가 만료되었습니다.");
    expect(screen.queryByRole("button", { name: "재고 반영" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 검토" })).toBeEnabled();
    expect(screen.getByLabelText("시험 품목 A 선택")).toBeChecked();
  });

  it("반영 결과 불명 시 동일 키의 영수증만 조회하고 재전송하지 않는다", async () => {
    targets = [confirmedTarget()];
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce(preview()).mockRejectedValueOnce(Object.assign(new Error("결과 불명"), { code: "COMMAND_RESULT_UNKNOWN" }));
    mount(); await openWaiting();
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    fireEvent.click(await screen.findByRole("button", { name: "재고 반영" }));
    const recover = await screen.findByRole("button", { name: "처리 결과 확인" });
    expect(screen.getByLabelText("품목 검색")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "회차 이력 관리" })).toBeDisabled();
    const key = vi.mocked(stocktakeApi.command).mock.calls[1][4].key;
    fireEvent.click(recover);
    await screen.findByText("선택한 확인 결과를 재고에 반영했습니다.");
    expect(stocktakeApi.read).toHaveBeenCalledWith(`/api/stocktakes/commands/${key}?kind=application_bulk_apply`, "token-employee-a");
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
  });

  it("결과 불명 뒤 영수증 404는 실패 확정으로 보지 않고 선택과 전송 잠금을 유지한다", async () => {
    targets = [confirmedTarget()];
    vi.mocked(stocktakeApi.command).mockResolvedValueOnce(preview()).mockRejectedValueOnce(Object.assign(new Error("결과 불명"), { code: "COMMAND_RESULT_UNKNOWN" }));
    vi.mocked(stocktakeApi.read).mockImplementation(async (path) => {
      if (path.includes("/commands/")) throw Object.assign(new Error("영수증 없음"), { status: 404 });
      return readFixture(path);
    });
    mount(); await openWaiting();
    await screen.findByRole("button", { name: "재고 반영", exact: true });
    fireEvent.click(await screen.findByRole("button", { name: "재고 반영" }));
    fireEvent.click(await screen.findByRole("button", { name: "처리 결과 확인" }));
    await screen.findByText(/성공 기록을 아직 확인하지 못했습니다/);
    expect(screen.getByRole("checkbox", { name: "시험 품목 A 선택" })).toBeChecked();
    expect(screen.getByRole("button", { name: "재고 반영" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "처리 결과 확인" })).toBeEnabled();
    expect(stocktakeApi.command).toHaveBeenCalledTimes(2);
  });
});
