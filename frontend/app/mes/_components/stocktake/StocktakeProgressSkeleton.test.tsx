import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StocktakeProgressPanel } from "./StocktakeProgressPanel";

describe("progress loading presentation", () => {
  it("announces loading once and keeps placeholders decorative without false empty counts", () => {
    const { container } = render(<StocktakeProgressPanel loading active roundInfo={<h2>선택한 회차</h2>} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: "선택한 회차" })).toBeVisible();
    expect(screen.getByRole("region", { name: "위치별 진행" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "작업자별 현황" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/집계된 대상이 없습니다|참여한 작업자가 없습니다|0건/)).not.toBeInTheDocument();
    const blocks = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every(block => block.classList.contains("motion-safe:animate-pulse"))).toBe(true);
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it("retains the selected quantity mode in disabled controls and previews the mobile quantity rows", () => {
    const { container } = render(<StocktakeProgressPanel loading active={false} workerQuantityMode />);
    expect(screen.getByText("종료 시 미반영 위치")).toBeInTheDocument();
    const workers = within(screen.getByRole("region", { name: "작업자별 현황" }));
    expect(workers.getByRole("button", { name: "품목 수", hidden: true })).toBeDisabled();
    expect(workers.getByRole("button", { name: "실셈 수량", hidden: true })).toBeDisabled();
    expect(container.querySelector('[data-worker-skeleton-row] > span')).toHaveClass("col-span-2");
  });

  it("preserves the expanded activity while changing from skeleton to failure", () => {
    const activity = <details><summary>최근 활동</summary>기록</details>;
    const { rerender } = render(<StocktakeProgressPanel loading active activity={activity} />);
    fireEvent.click(screen.getByText("최근 활동"));
    rerender(<StocktakeProgressPanel active activity={activity} />);
    expect(screen.getByText("최근 활동").closest("details")).toHaveAttribute("open");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
