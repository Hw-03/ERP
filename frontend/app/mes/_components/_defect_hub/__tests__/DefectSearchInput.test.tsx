import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectSearchInput } from "../DefectSearchInput";

describe("DefectSearchInput", () => {
  it("보관 목록 검색 이름과 안내를 지정하고 지울 수 있다", () => {
    const onChange = vi.fn();
    render(<DefectSearchInput value="B급" onChange={onChange} ariaLabel="B급·구형 검색" placeholder="보관 검색" />);
    expect(screen.getByRole("searchbox", { name: "B급·구형 검색" })).toHaveAttribute("placeholder", "보관 검색");
    fireEvent.click(screen.getByRole("button", { name: "B급·구형 검색 지우기" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
  it("불량 검색도 한글 조합 중 검색을 갱신한다", () => {
    const onChange = vi.fn();
    render(<DefectSearchInput value="" onChange={onChange} />);
    const input = screen.getByRole("searchbox", { name: "불량 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "불" } });
    expect(onChange).toHaveBeenCalledWith("불");
    fireEvent.compositionEnd(input, { data: "불" });
    expect(onChange).toHaveBeenCalledWith("불");
  });

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
