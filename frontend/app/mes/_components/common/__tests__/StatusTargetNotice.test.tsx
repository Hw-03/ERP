import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusTargetNotice } from "../StatusTargetNotice";

describe("StatusTargetNotice", () => {
  it("positions itself from the production-safe status target attribute", () => {
    const target = document.createElement("span");
    target.setAttribute("data-status-target", "desktop");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 40,
      height: 20,
      right: 140,
      bottom: 70,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });
    document.body.append(target);

    try {
      render(
        <StatusTargetNotice
          notice={{ id: 8, message: "saved" }}
          onArrive={vi.fn()}
        />,
      );

      const notice = screen.getByRole("status");
      expect(notice.style.getPropertyValue("--status-target-notice-x")).toBe(
        `${120 - window.innerWidth / 2}px`,
      );
      expect(notice.style.getPropertyValue("--status-target-notice-y")).toBe(
        `${60 - window.innerHeight / 2}px`,
      );
    } finally {
      target.remove();
    }
  });

  it("ignores animation completion bubbled from its icon", () => {
    const onArrive = vi.fn();
    render(
      <StatusTargetNotice
        notice={{ id: 7, message: "saved" }}
        onArrive={onArrive}
      />,
    );

    const notice = screen.getByRole("status");
    const icon = notice.querySelector("svg");
    if (!icon) throw new Error("status notice icon is missing");

    fireEvent.animationEnd(icon);
    expect(onArrive).not.toHaveBeenCalled();

    fireEvent.animationEnd(notice);
    expect(onArrive).toHaveBeenCalledWith(7);
  });
});
