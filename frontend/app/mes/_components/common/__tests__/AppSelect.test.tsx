import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSelect } from "../AppSelect";

function setMobileViewport(width = 393) {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
  window.dispatchEvent(new Event("resize"));
}

const options = [
  { value: "visual", label: "외관 불량" },
  { value: "dimension", label: "치수 불량" },
  { value: "wave", label: "파형 불량" },
  { value: "etc", label: "기타" },
];

describe("AppSelect mobile sheet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens an opt-in select as a fixed mobile sheet", () => {
    const onChange = vi.fn();
    setMobileViewport();

    render(
      <AppSelect
        value=""
        onChange={onChange}
        options={options}
        placeholder="카테고리 선택"
        mobileSheet
        sheetTitle="사유 카테고리"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "사유 카테고리" }));

    expect(screen.getByTestId("app-select-mobile-sheet")).toHaveClass("fixed", "z-[260]");
    expect(screen.getByRole("heading", { name: "사유 카테고리" })).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toHaveClass("max-h-[min(62dvh,420px)]", "overflow-y-auto");
    expect(screen.getByRole("option", { name: "기타" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "기타" }));

    expect(onChange).toHaveBeenCalledWith("etc");
    expect(screen.queryByTestId("app-select-mobile-sheet")).not.toBeInTheDocument();
  });

  it("keeps the inline dropdown on desktop even when mobileSheet is enabled", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    const onChange = vi.fn();

    render(
      <AppSelect
        value=""
        onChange={onChange}
        options={options}
        placeholder="카테고리 선택"
        mobileSheet
        sheetTitle="사유 카테고리"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "사유 카테고리" }));

    expect(screen.queryByTestId("app-select-mobile-sheet")).not.toBeInTheDocument();
    expect(screen.getByRole("listbox")).toHaveClass("absolute");
  });
});
