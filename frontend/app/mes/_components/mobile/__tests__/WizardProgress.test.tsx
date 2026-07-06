import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WizardProgress } from "../primitives/WizardProgress";

const steps = [
  { key: "1", label: "step 1" },
  { key: "2", label: "step 2" },
  { key: "3", label: "step 3" },
];

describe("WizardProgress", () => {
  it("keeps the stacked layout by default", () => {
    const { container } = render(<WizardProgress steps={steps} current={1} />);

    expect(screen.getByText("Step 2 / 3")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("flex-col");
  });

  it("renders the inline layout in one row when requested", () => {
    const { container } = render(<WizardProgress steps={steps} current={1} variant="inline" />);

    expect(screen.getByText("Step 2 / 3")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("flex-row");
    expect(container.firstElementChild).not.toHaveClass("flex-col");
  });
});
