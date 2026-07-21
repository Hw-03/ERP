import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

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
    render(
      <ConfirmModal
        open
        busy
        title="처리 중"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );
    // backdrop 클릭 (portal 로 document.body 에 그려지므로 screen 으로 조회)
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    // Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("viewer에서만 backdrop을 닫고 확인 버튼을 숨김", () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open
        viewer
        title="BOM 구성 보기"
        onClose={onClose}
      >
        <p>읽기 전용 구성</p>
      </ConfirmModal>
    );

    expect(screen.queryByRole("button", { name: "확인" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("기본 확인창은 backdrop 클릭으로 닫히지 않음", () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open
        title="확인"
        onClose={onClose}
        onConfirm={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("open=false 면 아무것도 렌더 안 함", () => {
    render(
      <ConfirmModal
        open={false}
        title="hidden"
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter 키 onConfirm 호출", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        title="확인"
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("busy=true 면 Enter 무시", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        busy
        title="처리 중"
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Enter 타깃이 TEXTAREA 면 onConfirm 호출 안 함 (줄바꿈 유지)", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        title="사유 입력"
        onClose={() => {}}
        onConfirm={onConfirm}
      >
        <textarea data-testid="ta" />
      </ConfirmModal>
    );
    const ta = screen.getByTestId("ta");
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
