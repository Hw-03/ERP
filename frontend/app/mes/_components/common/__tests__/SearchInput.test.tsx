import { createRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "../SearchInput";
import { matchesItemSearch } from "@/lib/itemSearch";

afterEach(cleanup);

describe("SearchInput", () => {
  it("조합 Enter는 폼 submit과 외부 선택 핸들러로 전달하지 않는다", () => {
    const onKeyDown = vi.fn();
    const onSubmit = vi.fn();
    render(<form onSubmit={onSubmit}><SearchInput value="" onChange={vi.fn()} ariaLabel="검색" onKeyDown={onKeyDown} /></form>);
    const input = screen.getByRole("textbox", { name: "검색" });
    fireEvent.compositionStart(input);
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(false);
    expect(onKeyDown).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("조합 중 입력을 보존하면서 부모 검색어도 즉시 갱신한다", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} ariaLabel="검색" />);
    const input = screen.getByRole("textbox", { name: "검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㅎ" } });
    rerender(<SearchInput value="외부" onChange={onChange} ariaLabel="검색" />);
    expect(input).toHaveValue("ㅎ");
    expect(onChange).toHaveBeenCalledWith("ㅎ");
    fireEvent.compositionEnd(input, { target: { value: "한" } });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith("한");
    rerender(<SearchInput value="" onChange={onChange} ariaLabel="검색" />);
    expect(input).toHaveValue("");
  });

  it("마지막 한글이 조합 중이어도 포커스 이동 없이 영문 동의어 결과를 표시한다", () => {
    function Harness() {
      const [value, setValue] = useState("");
      const matches = matchesItemSearch({ item_id: "battery-cover", item_name: "BATTERY COVER" }, value, {
        version: "v1", item_aliases: {}, synonym_groups: [{ group_id: "battery", version: 1, terms: ["battery", "배터리"] }],
      });
      return <><SearchInput value={value} onChange={setValue} ariaLabel="자재 검색" />{value && matches && <p>BATTERY COVER</p>}</>;
    }
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "자재 검색" });
    input.focus();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "배터리" } });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("배터리");
    expect(screen.getByText("BATTERY COVER")).toBeVisible();
  });

  it("지우기는 키보드 포커스를 입력에 돌려주며 44px 터치 영역을 제공한다", () => {
    function Harness() {
      const [value, setValue] = useState("메모");
      return <SearchInput value={value} onChange={setValue} ariaLabel="검색" />;
    }
    render(<Harness />);
    const button = screen.getByRole("button", { name: "검색어 지우기" });
    expect(button).toHaveClass("min-h-11", "min-w-11");
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole("textbox", { name: "검색" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "검색" })).toHaveValue("");
  });

  it("ref와 HTML 입력 의미 및 이벤트를 전달하고 disabled 지우기를 막는다", () => {
    const inputRef = createRef<HTMLInputElement>();
    const onKeyDown = vi.fn();
    const onFocus = vi.fn();
    const onClick = vi.fn();
    const props = { value: "입력", onChange: vi.fn(), inputRef, maxLength: 24,
      inputProps: { role: "combobox", "aria-expanded": false, id: "selection" } as const,
      onKeyDown, onFocus, onClick };
    const { rerender } = render(<SearchInput {...props} disabled />);
    const input = screen.getByRole("combobox");
    expect(inputRef.current).toBe(input);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("maxlength", "24");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "검색어 지우기" })).toBeDisabled();
    rerender(<SearchInput {...props} />);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.focus(input);
    fireEvent.click(input);
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
