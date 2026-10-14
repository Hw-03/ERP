import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider, useFlushDirtyEntries } from "@/lib/ui/dirty-guard";
import { StocktakeCommandRecovery } from "./StocktakeCommandRecovery";

const journal = vi.hoisted(() => ({ list: vi.fn(), recover: vi.fn(), retry: vi.fn(), resolve: vi.fn(), subscribe: vi.fn(), active: vi.fn() }));
vi.mock("@/lib/api/stocktake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/stocktake")>();
  return {
  listPendingStocktakeCommands: journal.list,
  recoverStocktakeCommand: journal.recover,
  retryStocktakeCommand: journal.retry,
  resolveStocktakeCommand: journal.resolve,
  stocktakeCommandRequiresAdmin: actual.stocktakeCommandRequiresAdmin,
  stocktakeCommandRequiresRoundManager: actual.stocktakeCommandRequiresRoundManager,
  subscribePendingStocktakeCommands: journal.subscribe,
  isStocktakeCommandInFlight: journal.active,
  };
});
const pending = { actor_employee_id: "worker-a", kind: "application_apply", key: "original-key", path: "/api/stocktakes/rounds/round-a/applications", payload: { preview_id: "preview-a" } };

function mount(token = "restored-token", canManageRounds = false) {
  const onRecovered = vi.fn();
  const tree = (nextToken: string) => <DirtyGuardProvider><StocktakeCommandRecovery token={nextToken} enabled canManageRounds={canManageRounds} onRecovered={onRecovered} /></DirtyGuardProvider>;
  const view = render(tree(token));
  return { ...view, onRecovered, changeToken: (nextToken: string) => view.rerender(tree(nextToken)) };
}

async function findRecoveryAction(name: string) {
  if (!screen.queryByRole("dialog")) fireEvent.click(await screen.findByRole("button", { name: /확인할 요청/ }));
  return screen.findByRole("button", { name });
}

function FlushProbe({ onDone, onFailed }: { onDone: () => void; onFailed: (error: unknown) => void }) {
  const flush = useFlushDirtyEntries();
  return <button onClick={() => void flush().then(onDone, onFailed)}>로그아웃 전 확인</button>;
}

function mountWithLogout() {
  const onDone = vi.fn();
  const onFailed = vi.fn();
  render(<DirtyGuardProvider>
    <StocktakeCommandRecovery token="restored-token" enabled onRecovered={vi.fn()} />
    <FlushProbe onDone={onDone} onFailed={onFailed} />
  </DirtyGuardProvider>);
  return { onDone, onFailed };
}

describe("StocktakeCommandRecovery", () => {
  it("복구는 작은 버튼으로 시작하고 원키는 창의 상세 보기에 숨긴다", async () => {
    mount();
    const launcher = await screen.findByRole("button", { name: "확인할 요청 1건" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/original-key/)).not.toBeInTheDocument();
    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "확인할 요청" })).toBeVisible();
    expect(screen.getByText(/original-key/)).not.toBeVisible();
    fireEvent.click(screen.getByText("상세 정보"));
    expect(screen.getByText(/original-key/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "닫기", exact: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인할 요청 1건" })).toBeVisible();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    journal.list.mockReturnValue([pending]);
    journal.subscribe.mockReturnValue(() => {});
    journal.active.mockReturnValue(false);
  });

  it("현재 실행 중인 요청은 숨겨도 로그아웃 보호는 유지한다", async () => {
    journal.active.mockReturnValue(true);
    const { onDone, onFailed } = mountWithLogout();
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "미확인 요청 복구" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃 전 확인" }));
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("실행이 끝나도 기록이 남으면 결과 확인 안내를 표시한다", async () => {
    let wake!: () => void;
    journal.subscribe.mockImplementation((listener: () => void) => { wake = listener; return () => {}; });
    journal.active.mockReturnValue(true);
    mount();
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "미확인 요청 복구" })).not.toBeInTheDocument();
    journal.active.mockReturnValue(false);
    await act(async () => wake());
    expect(await screen.findByRole("button", { name: "확인할 요청 1건" })).toBeInTheDocument();
    expect(screen.queryByText(/original-key/)).not.toBeInTheDocument();
  });

  it("정상 완료 후 새 저장소 조회가 늦어도 이전 기록을 잠깐 표시하지 않는다", async () => {
    let wake!: () => void;
    let finish!: (rows: object[]) => void;
    journal.subscribe.mockImplementation((listener: () => void) => { wake = listener; return () => {}; });
    journal.active.mockReturnValue(true);
    const view = mount();
    await act(async () => {});
    journal.active.mockReturnValue(false);
    journal.list.mockReturnValue(new Promise(done => { finish = done; }));
    await act(async () => wake());
    view.changeToken("restored-token");
    expect(screen.queryByRole("region", { name: "미확인 요청 복구" })).not.toBeInTheDocument();
    await act(async () => finish([]));
    expect(screen.queryByRole("region", { name: "미확인 요청 복구" })).not.toBeInTheDocument();
  });

  it("이미 표시한 복구 영역은 원키 재시도 중에도 유지한다", async () => {
    let finish!: (value: object) => void;
    journal.retry.mockReturnValue(new Promise(done => { finish = done; }));
    mount();
    fireEvent.click(await findRecoveryAction("같은 요청 재시도"));
    expect(screen.getByRole("region", { name: "미확인 요청 복구" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "같은 요청 재시도" })).toBeDisabled();
    journal.list.mockResolvedValue([]);
    await act(async () => finish({ receipt_id: "done" }));
  });

  it("부서 역할이 없으면 회차 요청은 결과 조회만 허용한다", async () => {
    journal.list.mockResolvedValue([{ ...pending, kind: "round_close" }]);
    mount();
    expect(await findRecoveryAction("저장된 요청 결과 확인")).toBeEnabled();
    expect(screen.getByRole("button", { name: "같은 요청 재시도" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("요청 정리 사유"), { target: { value: "복구" } });
    expect(screen.getByRole("button", { name: "미확인 요청 정리" })).toBeDisabled();
    expect(journal.retry).not.toHaveBeenCalled();
  });

  it("부서 결재 담당자는 회차 요청을 PIN 없이 재시도한다", async () => {
    journal.list.mockResolvedValue([{ ...pending, kind: "round_close" }]);
    journal.retry.mockImplementation(async () => { journal.list.mockResolvedValue([]); return { receipt_id: "done" }; });
    mount("restored-token", true);
    fireEvent.click(await findRecoveryAction("같은 요청 재시도"));
    await waitFor(() => expect(journal.retry).toHaveBeenCalledWith("restored-token", "round_close", "original-key", undefined));
    expect(screen.queryByLabelText("복구 관리자 PIN")).not.toBeInTheDocument();
  });

  it.each(["count_force_release", "correction_preview", "correction_approve", "correction_reject"])("%s 요청은 PIN이 있어도 부서 역할 없이는 재실행하거나 정리하지 않는다", async (kind) => {
    journal.list.mockResolvedValue([{ ...pending, kind }]);
    mount();
    expect(await findRecoveryAction("저장된 요청 결과 확인")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("복구 관리자 PIN"), { target: { value: "4321" } });
    fireEvent.change(screen.getByLabelText("요청 정리 사유"), { target: { value: "복구" } });
    expect(screen.getByRole("button", { name: "같은 요청 재시도" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "미확인 요청 정리" })).toBeDisabled();
    expect(journal.retry).not.toHaveBeenCalled();
    expect(journal.resolve).not.toHaveBeenCalled();
  });

  it("새로고침으로 복원한 원래 키를 조회하고 성공 후 화면을 갱신한다", async () => {
    journal.recover.mockImplementation(async () => { journal.list.mockReturnValue([]); return { application_id: "done" }; });
    const view = mount();
    fireEvent.click(await findRecoveryAction("저장된 요청 결과 확인"));
    await waitFor(() => expect(journal.recover).toHaveBeenCalledWith("restored-token", "application_apply", "original-key"));
    expect(view.onRecovered).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "같은 요청 재시도" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("완료 결과");
  });

  it("영수증이 없으면 요청을 유지하고 재전송하지 않는다", async () => {
    journal.recover.mockRejectedValue(new Error("not found"));
    mount();
    fireEvent.click(await findRecoveryAction("저장된 요청 결과 확인"));
    expect(await screen.findByRole("alert")).toHaveTextContent("아직 확인하지 못했습니다");
    expect(screen.getByRole("region", { name: "미확인 요청 복구" })).toBeInTheDocument();
    expect(journal.recover).toHaveBeenCalledTimes(1);
  });

  it("복구 중 작업자가 바뀌면 이전 응답으로 새 작업자 화면을 갱신하지 않는다", async () => {
    let resolve!: (value: object) => void;
    journal.recover.mockReturnValue(new Promise((done) => { resolve = done; }));
    journal.list.mockImplementation((token: string) => token === "other-token" ? [] : [pending]);
    const view = mount();
    fireEvent.click(await findRecoveryAction("저장된 요청 결과 확인"));
    view.changeToken("other-token");
    await act(async () => resolve({ application_id: "old-result" }));
    expect(view.onRecovered).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "미확인 요청 복구" })).not.toBeInTheDocument();
  });

  it("복구 기록을 읽을 수 없으면 기록을 지우지 않고 오류를 표시한다", async () => {
    journal.list.mockImplementation(() => { throw new Error("복구 기록을 읽을 수 없습니다."); });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("복구 기록을 읽을 수 없습니다");
    expect(journal.recover).not.toHaveBeenCalled();
  });

  it("같은 요청 재시도는 원래 키를 사용하고 관리자 PIN을 새로 받는다", async () => {
    journal.list.mockResolvedValue([{ ...pending, kind: "count_force_release" }]);
    journal.retry.mockImplementation(async () => { journal.list.mockResolvedValue([]); return { receipt_id: "done" }; });
    const view = mount("restored-token", true);
    const retry = await findRecoveryAction("같은 요청 재시도");
    expect(retry).toBeDisabled();
    fireEvent.change(screen.getByLabelText("복구 관리자 PIN"), { target: { value: "4321" } });
    fireEvent.click(retry);
    await waitFor(() => expect(journal.retry).toHaveBeenCalledWith("restored-token", "count_force_release", "original-key", "4321"));
    expect(view.onRecovered).toHaveBeenCalledWith(expect.objectContaining({ resolution: "COMPLETED", result: { receipt_id: "done" } }));
  });

  it("사유를 받아 미반영을 확정하고 업무 성공과 구분한다", async () => {
    journal.resolve.mockImplementation(async () => { journal.list.mockResolvedValue([]); return { resolution: "NOT_APPLIED", receipt_id: "fenced" }; });
    const view = mount();
    const resolve = await findRecoveryAction("미확인 요청 정리");
    expect(resolve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("요청 정리 사유"), { target: { value: "잘못 시작한 요청" } });
    fireEvent.click(resolve);
    await waitFor(() => expect(journal.resolve).toHaveBeenCalledWith("restored-token", "application_apply", "original-key", "잘못 시작한 요청", undefined));
    expect(await screen.findByRole("status")).toHaveTextContent("미반영");
    expect(view.onRecovered).toHaveBeenCalledWith(expect.objectContaining({ resolution: "NOT_APPLIED" }));
  });

  it("늦은 저장소 조회가 새 작업자 목록을 덮어쓰지 않는다", async () => {
    let finish!: (rows: object[]) => void;
    journal.list.mockImplementation((token: string) => token === "other-token" ? Promise.resolve([]) : new Promise(done => { finish = done; }));
    const view = mount();
    view.changeToken("other-token");
    await act(async () => finish([pending]));
    expect(screen.queryByRole("button", { name: "같은 요청 재시도" })).not.toBeInTheDocument();
  });
  it("완료된 명령의 늦은 화면 알림은 저장소를 재확인한 뒤 로그아웃을 허용한다", async () => {
    const { onDone, onFailed } = mountWithLogout();
    await findRecoveryAction("같은 요청 재시도");
    journal.list.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃 전 확인" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onFailed).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "같은 요청 재시도" })).not.toBeInTheDocument();
  });
  it("실제로 미확인 요청이 남으면 로그아웃을 막고 원키를 유지한다", async () => {
    const { onDone, onFailed } = mountWithLogout();
    await findRecoveryAction("같은 요청 재시도");
    fireEvent.click(screen.getByRole("button", { name: "로그아웃 전 확인" }));
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/original-key/)).toBeInTheDocument();
  });
  it("로그아웃 재검사에서 저장소 읽기가 실패하면 요청 화면을 보존한다", async () => {
    const { onDone, onFailed } = mountWithLogout();
    await findRecoveryAction("같은 요청 재시도");
    journal.list.mockRejectedValue(new Error("storage unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃 전 확인" }));
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/original-key/)).toBeInTheDocument();
  });
});
