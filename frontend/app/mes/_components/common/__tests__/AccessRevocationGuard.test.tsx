import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider, useRegisterDirty } from "@/lib/ui/dirty-guard";
import { AccessRevocationGuard } from "../AccessRevocationGuard";

function Editor({ save, action, auto = false }: { save: () => Promise<void>; action: () => void; auto?: boolean }) {
  const [dirty, setDirty] = useState(true);
  useRegisterDirty("editor", dirty, async () => { await save(); setDirty(false); }, undefined, { mode: auto ? "auto-save" : "save" });
  return <><input aria-label="작성 내용" defaultValue="보존할 내용" /><button onClick={action}>업무 실행</button>{createPortal(<button onClick={action}>팝업 실행</button>, document.body)}</>;
}
function fixture(save = vi.fn(async () => {}), auto = false) {
  const leave = vi.fn();
  const action = vi.fn();
  const tree = (allowed: boolean) => <DirtyGuardProvider><AccessRevocationGuard allowed={allowed} onLeave={leave}><Editor save={save} action={action} auto={auto} /></AccessRevocationGuard></DirtyGuardProvider>;
  const view = render(tree(true));
  return { ...view, leave, action, revoke: () => view.rerender(tree(false)), restore: () => view.rerender(tree(true)) };
}

describe("AccessRevocationGuard", () => {
  it("메뉴와 승인함이 함께 회수되면 상위 보호막만 임시저장한다", async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const outer = vi.fn();
    const inner = vi.fn();
    const tree = (allowed: boolean) => <DirtyGuardProvider><AccessRevocationGuard allowed={allowed} onLeave={outer}><AccessRevocationGuard allowed={allowed} onLeave={inner}><Editor save={save} action={vi.fn()} auto /></AccessRevocationGuard></AccessRevocationGuard></DirtyGuardProvider>;
    const view = render(tree(true));
    view.rerender(tree(false));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await act(async () => finish());
    await waitFor(() => expect(outer).toHaveBeenCalledOnce());
    expect(inner).not.toHaveBeenCalled();
  });
  it("회수 즉시 본문·팝업 실행을 막고 취소해도 입력을 보존한다", async () => {
    const view = fixture();
    view.revoke();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "계속 작성", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "내용 보존 후 이동" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "업무 실행", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "팝업 실행" }));
    expect(view.action).not.toHaveBeenCalled();
    expect(view.leave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("작성 내용")).toHaveValue("보존할 내용");
    expect(screen.getByLabelText("작성 내용").closest("[inert]")).toBeInTheDocument();
  });

  it("사용자가 저장을 선택한 뒤에만 이동한다", async () => {
    const save = vi.fn(async () => {});
    const view = fixture(save);
    view.revoke();
    fireEvent.click(await screen.findByRole("button", { name: "저장하고 이동" }));
    await waitFor(() => expect(view.leave).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledOnce();
  });

  it("보존 실패 시 이동하지 않고 입력과 차단 상태를 유지한다", async () => {
    const view = fixture(vi.fn(async () => { throw new Error("임시저장 실패"); }), true);
    view.revoke();
    await screen.findByText("임시저장 실패");
    expect(view.leave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("작성 내용")).toHaveValue("보존할 내용");
    expect(screen.getByRole("button", { name: "내용 보존 후 이동" })).toBeEnabled();
  });

  it("임시저장 대기 중 권한이 복구되면 이전 이동을 취소한다", async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const view = fixture(save, true);
    view.revoke();
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    view.restore();
    await act(async () => finish());
    expect(view.leave).not.toHaveBeenCalled();
    expect(screen.queryByText("접근 권한이 변경되었습니다.")).not.toBeInTheDocument();
  });
});
