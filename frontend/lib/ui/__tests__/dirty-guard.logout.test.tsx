import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider, useConfirmNavigation, useFlushDirtyEntries, useRegisterDirty } from "../dirty-guard";

/** Exercise the same flush-before-logout contract used by both MES shells. */
function LogoutProbe({ save, logout, failure, receiptAfterSave = false, remainsDirty = false }: {
  save: () => Promise<void>; logout: () => void; failure: (error: unknown) => void;
  receiptAfterSave?: boolean; remainsDirty?: boolean;
}) {
  const [dirty, setDirty] = useState(true);
  const [receipt, setReceipt] = useState(false);
  const flush = useFlushDirtyEntries();
  const navigate = useConfirmNavigation();
  useRegisterDirty("draft", dirty, async () => {
    await save();
    setDirty(remainsDirty);
    setReceipt(receiptAfterSave);
  }, undefined, { mode: "auto-save" });
  useRegisterDirty("receipt", receipt, async () => { throw new Error("처리 결과를 먼저 확인해 주세요."); }, undefined, { mode: "auto-save" });
  return <><button type="button" onClick={() => void flush().then(logout).catch(failure)}>로그아웃</button><button onClick={() => navigate(logout)}>탭 이동</button></>;
}

function mount(save: () => Promise<void>, options: { receiptAfterSave?: boolean; remainsDirty?: boolean } = {}) {
  const logout = vi.fn();
  const failure = vi.fn();
  render(<DirtyGuardProvider><LogoutProbe save={save} logout={logout} failure={failure} {...options} /></DirtyGuardProvider>);
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  return { logout, failure };
}

describe("logout dirty flush", () => {
  it("탭 이동도 저장 후 발생한 영수증을 확인하기 전까지 막는다", async () => {
    const leave = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<DirtyGuardProvider><LogoutProbe save={save} logout={leave} failure={vi.fn()} receiptAfterSave /></DirtyGuardProvider>);
    fireEvent.click(screen.getByText("탭 이동"));
    await act(async () => {});
    expect(save).toHaveBeenCalledOnce();
    expect(leave).not.toHaveBeenCalled();
  });
  it("저장 응답과 dirty 해제가 완료된 뒤 로그아웃한다", async () => {
    let complete!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    const { logout, failure } = mount(save);
    expect(logout).not.toHaveBeenCalled();
    await act(async () => complete());
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
  });

  it("저장 실패에서는 로그아웃하지 않는다", async () => {
    const error = new Error("저장 실패");
    const { logout, failure } = mount(vi.fn().mockRejectedValue(error));
    await waitFor(() => expect(failure).toHaveBeenCalledWith(error));
    expect(logout).not.toHaveBeenCalled();
  });

  it("저장 중 새로 등록된 미확인 영수증 guard도 통과해야 한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { logout, failure } = mount(save, { receiptAfterSave: true });
    await waitFor(() => expect(failure).toHaveBeenCalled());
    expect(failure.mock.calls[0][0]).toEqual(new Error("처리 결과를 먼저 확인해 주세요."));
    expect(logout).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("저장 뒤 남은 새로운 입력을 버리지 않고 로그아웃을 차단한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { logout, failure } = mount(save, { remainsDirty: true });
    await waitFor(() => expect(failure).toHaveBeenCalled());
    expect(failure.mock.calls[0][0]).toEqual(new Error("저장되지 않은 변경이 남아 있습니다."));
    expect(logout).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
