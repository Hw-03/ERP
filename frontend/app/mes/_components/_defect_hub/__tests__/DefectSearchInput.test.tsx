import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectSearchInput } from "../DefectSearchInput";

describe("DefectSearchInput", () => {
  it("uses the dashboard search treatment and clears its controlled value", () => {
    const onChange = vi.fn();
    render(<DefectSearchInput value="메모" onChange={onChange} />);

    const input = screen.getByRole("searchbox", { name: "불량 검색" });
    expect(input).toHaveAttribute("placeholder", "품명 · 품목 코드 · 부서 · 사유 · 처리자 검색");
    expect(input.parentElement).toHaveClass("min-h-11", "rounded-[14px]", "border");
    expect(input.parentElement?.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "불량 검색 지우기" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
