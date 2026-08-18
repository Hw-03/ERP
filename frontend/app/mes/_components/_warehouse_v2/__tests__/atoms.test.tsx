import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WizardStepCard } from "../_atoms";

describe("WizardStepCard", () => {
  it("keeps the active step surface flat without card shadow or panel glow", () => {
    render(
      <WizardStepCard n={1} title="작업 유형" state="active">
        내용
      </WizardStepCard>,
    );

    const card = screen.getByTestId("wizard-active-step-title").closest("section");
    expect(card).not.toBeNull();
    expect(card?.style.boxShadow).toBe("");
    expect(card?.style.backgroundImage).toBe("");
  });
});
