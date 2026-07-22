import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSectionTabs } from "../AdminSectionTabs";

describe("AdminSectionTabs", () => {
  it("현재 섹션을 페이지 탭으로 표시하고 다른 탭 선택을 전달한다", () => {
    const onSelect = vi.fn();

    render(
      <AdminSectionTabs
        section="models"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("button", { name: "모델 관리" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "BOM 관리" }));

    expect(onSelect).toHaveBeenCalledWith("bom");
  });

  it("탭 그룹을 구조화해 표시한다", () => {
    const { container } = render(
      <AdminSectionTabs
        section="models"
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("[data-admin-tab-group]")).toHaveLength(3);
  });

  it("renders each group name as a non-interactive caption", () => {
    render(<AdminSectionTabs section="models" onSelect={vi.fn()} />);

    ["\uAE30\uC900 \uC815\uBCF4", "\uAD6C\uC131 \uAD00\uB9AC", "\uC2DC\uC2A4\uD15C"].forEach((label) => {
      const group = screen.getByRole("group", { name: label });
      const caption = within(group).getByText(label);

      expect(caption.tagName).toBe("SPAN");
      expect(caption).toHaveClass("pointer-events-none", "select-none", "text-[12px]");
      expect(caption).not.toHaveAttribute("role", "button");
    });
  });

  it("separates every group after the first with a left divider", () => {
    const { container } = render(<AdminSectionTabs section="models" onSelect={vi.fn()} />);
    const groups = container.querySelectorAll("[data-admin-tab-group]");

    expect(groups[0]).not.toHaveClass("border-l");
    expect(groups[1]).toHaveClass("border-l");
    expect(groups[2]).toHaveClass("border-l");
    expect(groups[1]).toHaveClass("ml-2", "pl-4");
    expect(groups[2]).toHaveClass("ml-2", "pl-4");

    screen.getAllByRole("button").forEach((tab) => {
      expect(tab).toHaveClass("h-11");
    });
  });

  it("fills the desktop row proportionally while retaining a narrow-screen scroll width", () => {
    const { container } = render(<AdminSectionTabs section="models" onSelect={vi.fn()} />);
    const groups = container.querySelectorAll<HTMLElement>("[data-admin-tab-group]");
    const row = container.querySelector("nav > div");

    expect(row).toHaveClass("min-w-[880px]", "lg:min-w-0", "flex-1");
    expect(groups[0]).toHaveStyle({ flexGrow: "4" });
    expect(groups[1]).toHaveStyle({ flexGrow: "1" });
    expect(groups[2]).toHaveStyle({ flexGrow: "3" });
    expect(groups[0]).toHaveStyle({ flexBasis: "0px" });
    expect(groups[1]).toHaveStyle({ flexBasis: "0px" });
    expect(groups[2]).toHaveStyle({ flexBasis: "0px" });

    groups.forEach((group) => {
      within(group).getAllByRole("button").forEach((tab) => {
        expect(tab).toHaveClass("flex-1", "justify-center");
      });
    });
  });

  it("접근 가능한 이름으로 탭 그룹과 소속 탭을 연결한다", () => {
    render(<AdminSectionTabs section="models" onSelect={vi.fn()} />);

    const masterGroup = screen.getByRole("group", { name: "기준 정보" });
    const configurationGroup = screen.getByRole("group", { name: "구성 관리" });
    const systemGroup = screen.getByRole("group", { name: "시스템" });

    expect(within(masterGroup).getByRole("button", { name: "모델 관리" })).toBeInTheDocument();
    expect(within(configurationGroup).getByRole("button", { name: "BOM 관리" })).toBeInTheDocument();
    expect(within(systemGroup).getByRole("button", { name: "보안" })).toBeInTheDocument();
  });
});
