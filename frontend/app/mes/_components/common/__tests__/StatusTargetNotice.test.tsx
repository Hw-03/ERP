import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusTargetNotice } from "../StatusTargetNotice";

describe("StatusTargetNotice", () => {
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
