import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlidePanel } from "@/app/mes/_components/common/SlidePanel";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
  it("opens for keyboard focus, links the description, and closes on blur", () => {
    render(
      <Tooltip content="전체 설명">
        <button type="button">대상</button>
      </Tooltip>,
    );

    const button = screen.getByRole("button", { name: "대상" });
    const trigger = button.parentElement!;
    fireEvent.focus(button);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("전체 설명");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(trigger).not.toHaveAttribute("aria-describedby");

    fireEvent.blur(button, { relatedTarget: document.body });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("keeps a hovered nonfocusable text trigger described by its wrapper", () => {
    render(
      <Tooltip content="일반 텍스트 설명">
        <span>일반 텍스트</span>
      </Tooltip>,
    );

    const text = screen.getByText("일반 텍스트");
    const trigger = text.parentElement!;
    fireEvent.mouseEnter(trigger);

    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("closes only a focused tooltip on Escape before a containing SlidePanel", () => {
    const onClose = vi.fn();
    render(
      <SlidePanel open modal={false} onClose={onClose} hideCloseButton>
        <Tooltip content="패널 안 설명">
          <button type="button">패널 안 대상</button>
        </Tooltip>
      </SlidePanel>,
    );

    const button = screen.getByRole("button", { name: "패널 안 대상" });
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    expect(fireEvent.keyDown(button, { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("constrains and force-wraps a long token in multiline mode", () => {
    const longToken = "COMPONENT".repeat(80);
    render(
      <Tooltip content={longToken} multiline>
        <button type="button">Long target</button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Long target" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveStyle({
      maxWidth: "min(220px, calc(100vw - 24px))",
      overflowWrap: "anywhere",
    });
    expect(tooltip).toHaveClass("whitespace-normal", "text-left");
  });

  it("keeps the existing single-line treatment for short text", () => {
    render(
      <Tooltip content="Short text">
        <button type="button">Short target</button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Short target" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveClass("whitespace-nowrap");
    expect(tooltip.style.overflowWrap).toBe("");
  });
});
