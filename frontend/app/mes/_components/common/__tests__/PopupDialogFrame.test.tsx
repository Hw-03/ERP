import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PencilLine } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOBILE_MODAL_VIEWPORT_STYLE } from "../../mobile/mobileModalLayout";
import { PopupDialogFrame } from "../PopupDialogFrame";
import { WorkspaceInteractionContext } from "../../login/WorkspaceInteractionContext";

afterEach(() => { document.body.style.overflow = ""; });

describe("PopupDialogFrame", () => {
  it("재인증 중에는 초안을 유지하며 로그인 화면에 포커스를 넘긴다", () => {
    const close = vi.fn();
    const content = (active: boolean) => <><input aria-label="로그인 PIN" /><WorkspaceInteractionContext.Provider value={active}><PopupDialogFrame title="메모" icon={PencilLine} onClose={close}><textarea aria-label="초안" defaultValue="보존" /></PopupDialogFrame></WorkspaceInteractionContext.Provider></>;
    const view = render(content(true));
    fireEvent.change(screen.getByLabelText("초안"), { target: { value: "저장 대기" } });
    view.rerender(content(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const pin = screen.getByLabelText("로그인 PIN");
    pin.focus();
    expect(pin).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    view.rerender(content(true));
    expect(screen.getByLabelText("초안")).toHaveValue("저장 대기");
    expect(screen.getByRole("button", { name: "메모 닫기" })).toHaveFocus();
  });
  it("공유 제목과 아이콘, 부제목을 body 포털의 데스크톱 프레임에 표시한다", () => {
    const onClose = vi.fn();
    const { container } = render(<PopupDialogFrame title="메모" icon={PencilLine} subtitle="자동 저장" onClose={onClose}><textarea aria-label="내용" /></PopupDialogFrame>);
    const dialog = screen.getByRole("dialog", { name: "메모" });
    expect(container).toBeEmptyDOMElement();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("max-w-[640px]", "rounded-[24px]", "min-h-0", "overflow-hidden");
    expect(dialog).toHaveStyle({ maxHeight: "min(720px, calc(100dvh - 48px))", background: "var(--c-popup-bg)" });
    expect(dialog.parentElement).toHaveClass("fixed", "z-[260]", "p-4", "sm:p-6");
    expect(screen.getByText("자동 저장")).toHaveClass("text-right");
    expect(dialog.querySelector("header svg")).toHaveClass("lucide-pencil-line");
    fireEvent.click(screen.getByRole("textbox"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("모바일 높이와 폭, 헤더 배치는 기존 알림 팝업 토큰을 따른다", () => {
    render(<PopupDialogFrame title="메모" icon={PencilLine} subtitle="자동 저장" onClose={vi.fn()} mobilePresentation closeLabel="메모창 닫기"><p>내용</p></PopupDialogFrame>);
    const dialog = screen.getByRole("dialog", { name: "메모" });
    expect(dialog).toHaveClass("h-full", "max-w-[398px]", "md:max-w-[688px]");
    expect(dialog.parentElement).toHaveClass("px-4");
    expect(dialog.parentElement).toHaveStyle(MOBILE_MODAL_VIEWPORT_STYLE);
    expect(dialog.style.maxHeight).toBe("");
    expect(screen.getByText("자동 저장").parentElement).toContainElement(screen.getByRole("heading", { name: "메모" }));
    expect(screen.getByRole("button", { name: "메모창 닫기" })).toHaveFocus();
  });

  it("포커스를 순환시키고 배경 스크롤, Escape, 이전 포커스를 복원한다", () => {
    const visible = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    document.body.style.overflow = "scroll";
    const onClose = vi.fn();
    const { unmount } = render(<PopupDialogFrame title="메모" icon={PencilLine} onClose={onClose}><button>끝</button></PopupDialogFrame>);
    const close = screen.getByRole("button", { name: "메모 닫기" });
    const last = screen.getByRole("button", { name: "끝" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    opener.focus();
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
    opener.remove();
    visible.mockRestore();
  });

  it("비동기 자식 내부에서 포커스한 요소가 사라져도 프레임으로 포커스를 되돌린다", async () => {
    let removeInput!: () => void;
    function Content() {
      const [visible, setVisible] = useState(true);
      removeInput = () => setVisible(false);
      return visible ? <input aria-label="임시 입력" /> : <p>저장됨</p>;
    }
    render(<PopupDialogFrame title="메모" icon={PencilLine} onClose={vi.fn()}><Content /></PopupDialogFrame>);
    screen.getByRole("textbox").focus();
    await act(async () => { removeInput(); });
    expect(screen.getByRole("button", { name: "메모 닫기" })).toHaveFocus();
  });

  it("중첩 프레임에서는 마지막 팝업만 Escape를 받고 닫힌 뒤 아래 팝업의 포커스를 복원한다", () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    function Host() {
      const [child, setChild] = useState(false);
      return <PopupDialogFrame title="알림" icon={PencilLine} onClose={parentClose}>
        <button onClick={() => setChild(true)}>메모 열기</button>
        {child && <PopupDialogFrame title="메모" icon={PencilLine} onClose={() => { childClose(); setChild(false); }}><input aria-label="메모 입력" /></PopupDialogFrame>}
      </PopupDialogFrame>;
    }
    render(<Host />);
    const open = screen.getByRole("button", { name: "메모 열기" });
    open.focus();
    fireEvent.click(open);
    const child = screen.getByRole("dialog", { name: "메모" });
    expect(within(child).getByRole("button", { name: "메모 닫기" })).toHaveFocus();
    screen.getByRole("textbox").focus();
    expect(screen.getByRole("textbox")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
    expect(open).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(parentClose).toHaveBeenCalledOnce();
  });

  it("중첩 프레임 전체를 닫으면 제거된 하위 팝업 대신 최초 실행 버튼에 포커스를 복원한다", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    function Host() {
      const [child, setChild] = useState(false);
      return <PopupDialogFrame title="알림" icon={PencilLine} onClose={vi.fn()}>
        <button onClick={() => setChild(true)}>메모 열기</button>
        {child && <PopupDialogFrame title="메모" icon={PencilLine} onClose={vi.fn()}>내용</PopupDialogFrame>}
      </PopupDialogFrame>;
    }
    const { unmount } = render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "메모 열기" }));
    expect(screen.getByRole("button", { name: "메모 닫기" })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    opener.remove();
  });
});
