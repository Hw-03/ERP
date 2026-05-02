import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";

describe("ConfirmModal", () => {
  it("open=true 시 title 과 children 렌더", () => {
    render(
      <ConfirmModal
        open
        title="삭제하시겠습니까?"
        onClose={() => {}}
        onConfirm={() => {}}
      >
        <p>되돌릴 수 없습니다</p>
      </ConfirmModal>
    );
    expect(screen.getByText("삭제하시겠습니까?")).toBeInTheDocument();
    expect(screen.getByText("되돌릴 수 없습니다")).toBeInTheDocument();
  });

  it("Escape 키 onClose 호출", () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open
        title="확인"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("busy=true 면 backdrop 클릭 무시 + Escape 무시", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfirmModal
        open
        busy
        title="처리 중"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    // backdrop 클릭
    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("open=false 면 아무것도 렌더 안 함", () => {
    const { container } = render(
      <ConfirmModal
        open={false}
        title="hidden"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
