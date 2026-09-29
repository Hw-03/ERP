import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "../ConfirmModal";

describe("확인 팝업 키보드 동작", () => {
  it("취소 버튼의 Enter는 전역 확인을 실행하지 않는다", () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(<ConfirmModal open title="처리 확인" onClose={close} onConfirm={confirm} />);
    const cancel = screen.getByRole("button", { name: "취소" });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Enter" });
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("확인 버튼의 Enter는 버튼 기본 동작과 전역 확인을 중복 실행하지 않는다", () => {
    const confirm = vi.fn();
    render(<ConfirmModal open title="처리 확인" onClose={vi.fn()} onConfirm={confirm} />);
    const button = screen.getByRole("button", { name: "확인" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("버튼 외부 Enter와 Escape 단축키는 유지한다", () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(<ConfirmModal open title="처리 확인" onClose={close} onConfirm={confirm} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
