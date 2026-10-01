import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileDefectWorkChoice } from "../MobileDefectWorkChoice";

afterEach(() => vi.useRealTimers());

describe("MobileDefectWorkChoice", () => {
  it("출처를 숨길 때 포커스와 접근성 트리에서도 제외한다", () => {
    const { container } = render(<MobileDefectWorkChoice action={null} source={null} onActionChange={vi.fn()} onProceed={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "창고 재고" })).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"][inert]')).not.toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("애니메이션 이벤트가 없어도 160ms 후 한 번만 이동한다", () => {
    vi.useFakeTimers();
    const proceed = vi.fn();
    render(<MobileDefectWorkChoice action="add" source={null} onActionChange={vi.fn()} onProceed={proceed} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "창고 재고" }));
    act(() => vi.advanceTimersByTime(159));
    expect(proceed).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.animationEnd(screen.getByTestId("mobile-defect-work-choice"));
    expect(proceed).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledWith("add", "warehouse");
  });

  it.each(["popstate", "cancel", "unmount"])("%s가 발생하면 대기 중인 이동을 취소한다", (event) => {
    vi.useFakeTimers();
    const proceed = vi.fn();
    const cancel = vi.fn();
    const { unmount } = render(<MobileDefectWorkChoice action="scrap" source={null} onActionChange={vi.fn()} onProceed={proceed} onCancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "부서 재고" }));
    if (event === "popstate") act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    else if (event === "cancel") fireEvent.click(screen.getByRole("button", { name: "이전" }));
    else unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(proceed).not.toHaveBeenCalled();
    if (event === "cancel") expect(cancel).toHaveBeenCalledOnce();
  });
});
