import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MovementSummaryCell } from "../historyTableHelpers";

describe("history movement pill follow-up", () => {
  it("keeps a three-digit quantity readable without abbreviation", () => {
    render(<MovementSummaryCell summary={{ parts: [{ label: "\uC644\uC81C\uD488 +999 EA", tone: "success" }] }} />);

    expect(screen.getByText("\uC644\uC81C\uD488 +999 EA")).not.toHaveAttribute("title");
  });

  it("abbreviates quantities above three digits while retaining the full tooltip", () => {
    render(<MovementSummaryCell summary={{ parts: [{ label: "\uC644\uC81C\uD488 +1200 EA", tone: "success" }] }} />);

    const pill = screen.getByText("\uC644\uC81C\uD488 +1.2k EA");
    expect(pill).toHaveAttribute("title", "\uC644\uC81C\uD488 +1200 EA");
  });
});
