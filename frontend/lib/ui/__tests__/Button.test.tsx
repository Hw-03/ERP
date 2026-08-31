import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  it("uses the shared standard hover hook instead of a fixed brightness utility", () => {
    render(<Button>저장</Button>);

    const button = screen.getByRole("button", { name: "저장" });
    expect(button).toHaveClass("standard-hover");
    expect(button).not.toHaveClass("hover:brightness-110");
  });
});
