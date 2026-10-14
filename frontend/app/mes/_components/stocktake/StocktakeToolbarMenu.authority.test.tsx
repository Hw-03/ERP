import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StocktakeToolbarMenu } from "./StocktakeToolbarMenu";

describe("round history authority", () => {
  it("does not expose history before department authority is known", () => {
    render(<StocktakeToolbarMenu variant="mobile" section="count" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "회차 이력 관리" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
