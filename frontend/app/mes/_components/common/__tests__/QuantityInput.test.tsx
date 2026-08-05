import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuantityInput } from "../QuantityInput";

function quantityInputStyles(): string {
  return readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
}

describe("QuantityInput", () => {
  it("keeps controlled drafts and forwards the supported number input contract", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <QuantityInput
        ref={ref}
        value="1.5"
        min={0}
        max={10}
        step="any"
        aria-label="업무 수량"
        title="수량 입력"
        className="w-24"
        style={{ height: 44 }}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "업무 수량" });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveValue(1.5);
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "10");
    expect(input).toHaveAttribute("step", "any");
    expect(input).toHaveAttribute("title", "수량 입력");
    expect(input).toHaveClass(
      "w-24",
      "quantity-input",
    );
    expect(input).toHaveStyle({ height: "44px" });

    fireEvent.change(input, { target: { value: "2.25" } });
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("supports numeric values and disabled state", () => {
    render(<QuantityInput value={3} disabled aria-label="비활성 수량" readOnly />);

    expect(screen.getByRole("spinbutton", { name: "비활성 수량" })).toBeDisabled();
  });

  it("overlays the native spinner without moving the centered number", () => {
    const css = quantityInputStyles();
    const inputRule = css.match(/\.quantity-input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const spinnerRule = css.match(
      /\.quantity-input::\-webkit-inner-spin-button\s*\{([\s\S]*?)\}/,
    )?.[1] ?? "";
    const outerSpinnerRule = css.match(
      /\.quantity-input::\-webkit-outer-spin-button\s*\{([\s\S]*?)\}/,
    )?.[1] ?? "";
    const darkInputRule = css.match(
      /:root\[data-theme="dark"\]\s+\.quantity-input\s*\{([\s\S]*?)\}/,
    )?.[1] ?? "";

    expect(inputRule).toContain("position: relative");
    expect(inputRule).toContain("appearance: auto");
    expect(inputRule).toContain("color-scheme: light");
    expect(inputRule).toContain("text-align: center");
    expect(spinnerRule).toContain("position: absolute");
    expect(spinnerRule).toContain("inset-inline-end:");
    expect(spinnerRule).toContain("appearance: auto");
    expect(outerSpinnerRule).not.toContain("appearance: none");
    expect(darkInputRule).toContain("color-scheme: dark");
  });
});
