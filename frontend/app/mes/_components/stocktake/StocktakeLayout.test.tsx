import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StocktakeLayout } from "./StocktakeLayout";

describe("mobile stocktake sheet", () => {
  it("overlays the preserved list and keeps the editor mounted after closing", () => {
    const close = vi.fn();
    const props = { variant: "mobile" as const, detailOpen: true, onClose: close,
      detail: <input aria-label="draft" defaultValue="9" />, children: <p>target list</p> };
    const { rerender } = render(<StocktakeLayout {...props} />);
    const sheet = screen.getByRole("dialog", { name: "조사 작업" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("target list")).toBeVisible();
    expect(screen.queryByRole("button", { name: "목록으로" })).not.toBeInTheDocument();
    const input = screen.getByLabelText("draft");
    fireEvent.click(screen.getByRole("button", { name: "시트 닫기 핸들" }));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<StocktakeLayout {...props} detailOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(input).toBeInTheDocument();
    rerender(<StocktakeLayout {...props} />);
    expect(screen.getByLabelText("draft")).toBe(input);
  });
});
