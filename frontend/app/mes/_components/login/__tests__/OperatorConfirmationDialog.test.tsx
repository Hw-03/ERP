import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorConfirmationDialog } from "../OperatorConfirmationDialog";
import type { Operator } from "../useCurrentOperator";

const operator = { name: "홍길동", department: "조립" } as Operator;
const props = () => ({ operator, dialogRef: createRef<HTMLDialogElement>(), onContinue: vi.fn(), onSwitchAccount: vi.fn() });

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("직원 확인창과 덱스레이 자리", () => {
  it("이미지 요청 없이 장식 공간을 예약하고 제목에 포커스를 둔다", () => {
    const { container } = render(<OperatorConfirmationDialog {...props()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByRole("heading", { name: "현재 작업자를 확인해 주세요" })).toHaveFocus();
    expect(document.querySelector('[data-mascot-slot]')).toHaveClass("h-24", "w-24", "lg:h-32", "lg:w-32");
    expect(document.querySelector('[data-mascot-slot] img')).toBeNull();
    expect(screen.getByText(/직원으로 로그인되어 있습니다/)).toHaveTextContent("현재 홍길동 직원으로 로그인되어 있습니다.");
    expect(screen.queryByText(/· 조립/)).not.toBeInTheDocument();
    expect(screen.getByText("다른 계정으로 로그인하면 저장하지 않은 내용은 사라집니다.")).toBeInTheDocument();
  });

  it("이미지를 연결하면 장식 이미지로 표시하고 실패하면 공간만 유지한다", () => {
    render(<OperatorConfirmationDialog {...props()} mascotSrc="/images/test.webp" />);
    const image = document.querySelector('[data-mascot-slot] img')!;
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveClass("object-contain");
    fireEvent.error(image);
    expect(document.querySelector('[data-mascot-slot] img')).toBeNull();
    expect(document.querySelector('[data-mascot-slot]')).toBeInTheDocument();
  });

  it("배경과 네이티브 cancel로 닫지 않고 명시적으로 선택한다", () => {
    const p = props();
    render(<OperatorConfirmationDialog {...p} />);
    const dialog = screen.getByRole("dialog");
    expect(fireEvent(dialog, new Event("cancel", { cancelable: true }))).toBe(false);
    fireEvent.click(dialog);
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(p.onSwitchAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "홍길동(으)로 계속" }));
    expect(p.onContinue).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));
    expect(p.onSwitchAccount).toHaveBeenCalledOnce();
  });
});
