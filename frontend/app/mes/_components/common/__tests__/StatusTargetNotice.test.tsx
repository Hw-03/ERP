import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusTargetNotice, useStatusTargetNotice } from "../StatusTargetNotice";

function NoticeHarness() {
  const { notice, showNotice, dismissNotice } = useStatusTargetNotice();

  return (
    <>
      <button type="button" onClick={() => showNotice("메모를 입력하세요.", "error")}>
        오류 표시
      </button>
      {notice && (
        <StatusTargetNotice
          key={notice.id}
          notice={notice}
          onArrive={dismissNotice}
        />
      )}
    </>
  );
}

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

  it("shows an error notice with alert semantics and dismisses it after animation", () => {
    render(<NoticeHarness />);

    fireEvent.click(screen.getByRole("button", { name: "오류 표시" }));

    const notice = screen.getByRole("alert");
    expect(notice).toHaveClass("status-target-notice");
    expect(notice).toHaveTextContent("메모를 입력하세요.");

    fireEvent.animationEnd(notice);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stays centered without target coordinates until it fades out", () => {
    render(
      <StatusTargetNotice
        notice={{ id: 8, message: "saved", tone: "success" }}
        onArrive={vi.fn()}
      />,
    );

    const notice = screen.getByRole("status");
    expect(notice.style.getPropertyValue("--status-target-notice-x")).toBe("");
    expect(notice.style.getPropertyValue("--status-target-notice-y")).toBe("");
  });
});
