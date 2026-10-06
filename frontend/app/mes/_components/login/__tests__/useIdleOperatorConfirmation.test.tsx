import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleOperatorConfirmation } from "../useIdleOperatorConfirmation";
import { OperatorConfirmationDialog } from "../OperatorConfirmationDialog";
import { clearCurrentOperator, setCurrentOperator, type Operator } from "../useCurrentOperator";
import { sendClientEvent } from "@/lib/client-events";

vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));

const operator: Operator = {
  employee_id: "emp-1", name: "홍길동", role: "staff", department: "조립", level: "staff",
  employee_code: "E1", warehouse_role: "none", department_role: "none", as_research_approver: false,
  assigned_model_slots: [], io_enabled: true, hidden_sidebar_tabs: [], loginPopupEnabled: false,
};
const activityKey = "dexcowin_mes_operator_activity";

function Harness({ enabled = true, onSave = vi.fn() }: { enabled?: boolean; onSave?: () => void }) {
  const idle = useIdleOperatorConfirmation(enabled);
  return <>
    <input aria-label="작성 내용" defaultValue="작성 중" />
    <button onClick={onSave}>저장</button>
    {idle.operator && <OperatorConfirmationDialog
      operator={idle.operator} dialogRef={idle.dialogRef}
      onContinue={idle.continueAsOperator} onSwitchAccount={clearCurrentOperator}
    />}
  </>;
}

describe("작업자 비활동 확인", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T09:00:00+09:00"));
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    setCurrentOperator(operator, "boot-1");
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("4분 59초에는 표시하지 않고 5분에 표시한다", () => {
    render(<Harness />);
    act(() => vi.advanceTimersByTime(299_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("dialog", { name: "현재 작업자를 확인해 주세요" })).toBeInTheDocument();
  });

  it.each(["pointerdown", "keydown", "wheel", "touchmove", "input"])("%s 조작으로 비활동 시간을 갱신한다", (eventType) => {
    render(<Harness />);
    act(() => vi.advanceTimersByTime(240_000));
    fireEvent(screen.getByLabelText("작성 내용"), new Event(eventType, { bubbles: true }));
    act(() => vi.advanceTimersByTime(240_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("마우스 이동과 자동 스크롤은 시간을 갱신하지 않는다", () => {
    render(<Harness />);
    act(() => vi.advanceTimersByTime(240_000));
    fireEvent.mouseMove(window);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each(["click", "keydown"])("타이머가 늦어져도 복귀 첫 %s을 저장 동작에 전달하지 않는다", (eventType) => {
    const save = vi.fn();
    render(<Harness onSave={save} />);
    const shortcut = (event: KeyboardEvent) => { if (event.key === "Enter") save(); };
    window.addEventListener("keydown", shortcut, true);
    vi.setSystemTime(Date.now() + 300_000);
    if (eventType === "click") fireEvent.click(screen.getByText("저장"));
    else fireEvent.keyDown(screen.getByText("저장"), { key: "Enter" });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    window.removeEventListener("keydown", shortcut, true);
  });

  it("만료를 감지한 pointerdown의 후속 click으로 계속 버튼을 누르지 않는다", () => {
    render(<Harness />);
    vi.setSystemTime(Date.now() + 300_000);
    fireEvent.pointerDown(screen.getByText("저장"));
    fireEvent.click(screen.getByRole("button", { name: "홍길동(으)로 계속" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "홍길동(으)로 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "홍길동(으)로 계속" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("확인 중 배경 단축키와 포커스 복원 핸들러를 차단한다", () => {
    render(<Harness />);
    const backgroundKey = vi.fn();
    const backgroundFocus = vi.fn();
    window.addEventListener("keydown", backgroundKey, true);
    document.addEventListener("focusin", backgroundFocus);
    act(() => vi.advanceTimersByTime(300_000));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.keyDown(dialog, { key: "Enter" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    fireEvent.focusIn(screen.getByRole("button", { name: "홍길동(으)로 계속" }));
    expect(backgroundKey).not.toHaveBeenCalled();
    expect(backgroundFocus).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    window.removeEventListener("keydown", backgroundKey, true);
    document.removeEventListener("focusin", backgroundFocus);
  });

  it("마지막 버튼의 Tab과 첫 버튼의 Shift+Tab을 확인창 안에서 순환시킨다", () => {
    render(<Harness />);
    act(() => vi.advanceTimersByTime(300_000));
    const first = screen.getByRole("button", { name: "홍길동(으)로 계속" });
    const last = screen.getByRole("button", { name: "다른 계정으로 로그인" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("같은 직원으로 계속하면 입력을 유지하고 다음 5분에 다시 확인한다", () => {
    render(<Harness />);
    const auditSession = sessionStorage.getItem("dexcowin_mes_audit_session");
    vi.mocked(sendClientEvent).mockClear();
    fireEvent.change(screen.getByLabelText("작성 내용"), { target: { value: "변경한 내용" } });
    act(() => vi.advanceTimersByTime(300_000));
    fireEvent.click(screen.getByRole("button", { name: "홍길동(으)로 계속" }));
    expect(screen.getByLabelText("작성 내용")).toHaveValue("변경한 내용");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sendClientEvent).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dexcowin_mes_audit_session")).toBe(auditSession);
    act(() => vi.advanceTimersByTime(300_000));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each(["focus", "pageshow", "visibilitychange"])("%s 복귀 때 실제 경과 시간을 확인한다", (eventType) => {
    render(<Harness />);
    vi.setSystemTime(Date.now() + 300_000);
    fireEvent(eventType === "visibilitychange" ? document : window, new Event(eventType));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("새로고침에 해당하는 재마운트로 확인 요구를 해제하지 않는다", () => {
    const first = render(<Harness />);
    act(() => vi.advanceTimersByTime(300_000));
    first.unmount();
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each([null, "broken", "null", JSON.stringify({ employeeId: "emp-2", lastActivityAt: 1, confirmationRequired: false }), JSON.stringify({ employeeId: "emp-1", lastActivityAt: Number.MAX_SAFE_INTEGER, confirmationRequired: false })])("기존 세션 활동 기록이 유효하지 않으면 확인한다: %s", (raw) => {
    if (raw === null) sessionStorage.removeItem(activityKey);
    else sessionStorage.setItem(activityKey, raw);
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("로그인 완료 전에는 감지하지 않고 로그아웃하면 정리한다", () => {
    const { rerender } = render(<Harness enabled={false} />);
    act(() => vi.advanceTimersByTime(300_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));
    expect(sessionStorage.getItem(activityKey)).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("언마운트 후에는 저장 버튼 조작을 차단하지 않는다", () => {
    const { unmount } = render(<Harness />);
    act(() => vi.advanceTimersByTime(300_000));
    unmount();
    const click = vi.fn();
    const button = document.createElement("button");
    button.addEventListener("click", click);
    document.body.appendChild(button);
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
    button.remove();
  });
});
