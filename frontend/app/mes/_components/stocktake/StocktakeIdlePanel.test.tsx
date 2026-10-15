import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StocktakeIdlePanel } from "./StocktakeIdlePanel";

const summary = { round_id: "previous", title: "지난 전수조사", status: "CLOSED_PARTIAL" as const,
  closed_at: "2026-10-14T06:00:00Z", item_summary: { total: 100, confirmed: 80, applied: 60, unconfirmed: 20 } };

describe("StocktakeIdlePanel", () => {
  it("keeps the counting illustration decorative alongside the waiting instructions", () => {
    render(<StocktakeIdlePanel onRetry={vi.fn()} />);
    const waiting = screen.getByRole("region", { name: "전수조사 시작 대기" });
    const illustration = waiting.querySelector("img");
    expect(illustration).toHaveAttribute("alt", "");
    expect(illustration).toHaveAttribute("width", "840");
    expect(illustration).toHaveAttribute("height", "560");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(within(waiting).getByText("진행 중인 회차가 없습니다.")).toBeVisible();
  });

  it("shows frozen item counts without history actions for workers", () => {
    render(<StocktakeIdlePanel summary={summary} onRetry={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "전수조사 시작 대기" })).toBeInTheDocument();
    const result = screen.getByRole("region", { name: "최근 회차 결과" });
    expect(within(result).getByText("지난 전수조사")).toBeInTheDocument();
    expect(within(result).getByText("부분 종료")).toBeInTheDocument();
    for (const value of ["100", "80", "60"]) expect(within(result).getByText(value)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "결과 상세 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새 회차 시작" })).not.toBeInTheDocument();
  });

  it("offers existing management entry points without executing commands", () => {
    const start = vi.fn(), history = vi.fn(), details = vi.fn();
    render(<StocktakeIdlePanel summary={summary} onRetry={vi.fn()} onStart={start} onHistory={history} onDetails={details} />);
    fireEvent.click(screen.getByRole("button", { name: "새 회차 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "회차 이력 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "결과 상세 보기" }));
    expect(start).toHaveBeenCalledOnce();
    expect(history).toHaveBeenCalledOnce();
    expect(details).toHaveBeenCalledWith("previous");
  });

  it("distinguishes first use, missing legacy counts, loading and retry", () => {
    const retry = vi.fn();
    const { rerender } = render(<StocktakeIdlePanel summary={null} onRetry={retry} />);
    expect(screen.getByText("아직 완료된 전수조사가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    rerender(<StocktakeIdlePanel summary={{ ...summary, item_summary: null }} onRetry={retry} />);
    expect(screen.getByText("집계 정보가 없습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    rerender(<StocktakeIdlePanel loading onRetry={retry} />);
    expect(screen.getByRole("status", { name: "최근 회차 결과를 불러오는 중입니다" })).toBeInTheDocument();
    expect(screen.queryByText("아직 완료된 전수조사가 없습니다.")).not.toBeInTheDocument();
    rerender(<StocktakeIdlePanel error={new Error("조회 실패")} onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("조회 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps all management actions disabled while a result is unresolved", () => {
    render(<StocktakeIdlePanel summary={summary} disabled onRetry={vi.fn()} onStart={vi.fn()} onHistory={vi.fn()} onDetails={vi.fn()} />);
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
    expect(screen.getByRole("list", { name: "조사 진행 방법" }).children).toHaveLength(3);
  });
});
