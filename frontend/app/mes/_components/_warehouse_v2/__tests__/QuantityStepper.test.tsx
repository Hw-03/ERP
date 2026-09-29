import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuantityStepper } from "../QuantityStepper";

describe("QuantityStepper", () => {
  it("화살표를 길게 누르면 반복 조정하고 손을 떼면 멈춘다", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} label="기준 수량" />);

    const increase = screen.getByRole("button", { name: "기준 수량 1 증가" });
    fireEvent.pointerDown(increase);
    vi.advanceTimersByTime(510);
    fireEvent.pointerUp(increase);
    fireEvent.click(increase);
    vi.advanceTimersByTime(200);

    expect(onChange.mock.calls).toEqual([[2], [3], [4]]);
    vi.useRealTimers();
  });

  it("통합 화살표는 1씩 조정하고 세 자리 수량을 직접 입력한다", () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={123} onChange={onChange} label="기준 수량" />);

    fireEvent.click(screen.getByRole("button", { name: "기준 수량 1 증가" }));
    fireEvent.click(screen.getByRole("button", { name: "기준 수량 1 감소" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "기준 수량" }), {
      target: { value: "999" },
    });

    expect(onChange.mock.calls).toEqual([[124], [122], [999]]);
    expect(screen.getByRole("spinbutton", { name: "기준 수량" })).toHaveAttribute("inputmode", "numeric");
  });

  it("통합 화살표도 최소 수량과 편집 잠금을 지킨다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuantityStepper value={0} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "수량 1 감소" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "수량 1 증가" })).toBeEnabled();

    rerender(<QuantityStepper value={1} onChange={onChange} disabled />);
    expect(screen.getByRole("button", { name: "수량 1 감소" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "수량 1 증가" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "수량 1 증가" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits safe quantities from step buttons and input", () => {
    const onChange = vi.fn();

    render(<QuantityStepper value={3} onChange={onChange} label="수량" />);

    fireEvent.click(screen.getByRole("button", { name: "-10" }));
    fireEvent.click(screen.getByRole("button", { name: "-1" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "수량" }), {
      target: { value: "-4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+1" }));
    fireEvent.click(screen.getByRole("button", { name: "+10" }));

    expect(onChange).toHaveBeenNthCalledWith(1, 0);
    expect(onChange).toHaveBeenNthCalledWith(2, 2);
    expect(onChange).toHaveBeenNthCalledWith(3, 0);
    expect(onChange).toHaveBeenNthCalledWith(4, 4);
    expect(onChange).toHaveBeenNthCalledWith(5, 13);
  });

  it("keeps mobile controls at the shared touch size and supports disabled states", () => {
    render(
      <QuantityStepper
        value={0}
        onChange={() => {}}
        label="기준 수량"
        decrementDisabled
        incrementDisabled
      />,
    );

    expect(screen.getByRole("button", { name: "-10" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "-1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+10" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "기준 수량" })).toHaveClass(
      "min-h-[44px]",
    );
    expect(screen.getByRole("button", { name: "-1" })).toHaveClass("min-h-[44px]");
  });

  it("enforces a supplied minimum and exposes its input ref", () => {
    const onChange = vi.fn();
    const inputRef = createRef<HTMLInputElement>();

    render(
      <QuantityStepper
        value={1}
        onChange={onChange}
        label="출하 수량"
        min={1}
        step={1}
        inputRef={inputRef}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "출하 수량" });
    expect(inputRef.current).toBe(input);
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("step", "1");
    expect(screen.getByRole("button", { name: "-10" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "-1" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "-4" } });

    expect(onChange).toHaveBeenNthCalledWith(1, 1);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it("기본 입력은 정수 단위이며 소수 값을 전달하지 않는다", () => {
    const onChange = vi.fn();

    render(<QuantityStepper value={3} onChange={onChange} label="정수 수량" />);

    const input = screen.getByRole("spinbutton", { name: "정수 수량" });
    expect(input).toHaveAttribute("step", "1");

    fireEvent.change(input, { target: { value: "1.5" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("uses the shared quantity-input surface with the existing quick controls", () => {
    render(<QuantityStepper value={12} onChange={() => {}} label="공통 수량" />);

    const input = screen.getByRole("spinbutton", { name: "공통 수량" });
    expect(input).toHaveClass("quantity-input", "h-11", "w-[72px]");
    expect(input).not.toHaveClass(
      "[appearance:textfield]",
      "[&::-webkit-inner-spin-button]:appearance-none",
      "[&::-webkit-outer-spin-button]:appearance-none",
    );
    expect(screen.getByRole("button", { name: "-10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+10" })).toBeInTheDocument();
  });
});
