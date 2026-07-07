import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuantityStepper } from "../QuantityStepper";

describe("QuantityStepper", () => {
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
});
