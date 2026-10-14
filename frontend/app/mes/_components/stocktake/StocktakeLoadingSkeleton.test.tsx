import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StocktakeLoadingSkeleton } from "./StocktakeLoadingSkeleton";
import { StocktakeTargetList } from "./StocktakeTargetList";

describe("stocktake loading layout", () => {
  it.each(["desktop", "mobile"] as const)("%s first entry keeps fixed labels and disabled real controls", variant => {
    render(<StocktakeLoadingSkeleton variant={variant} />);
    const content = within(screen.getByRole("status", { name: "재고 전수조사 준비 중" }));
    for (const label of ["전체 대상", "미확인", "대기", "완료", "조사하기"]) expect(content.getByText(label)).toBeInTheDocument();
    expect(content.queryByRole("button", { name: "회차 이력 관리", hidden: true })).not.toBeInTheDocument();
    expect(content.getByRole("button", { name: "필터 열기", hidden: true })).toBeDisabled();
    expect(content.getByLabelText("품목 검색")).toBeDisabled();
    const table = content.getByRole("table", { hidden: true });
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(within(table).getAllByRole("columnheader", { hidden: true }).filter(header => header.getAttribute("aria-hidden") !== "true").map(header => header.textContent)).toEqual(variant === "mobile"
      ? ["상태", "품목명", "현재 재고"] : ["상태", "이미지", "품목명", "품목 코드", "현재 부서별 재고", "조사 위치", "확인자"]);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(content.queryByText(/불러온 품목 0개|확인 0\//)).not.toBeInTheDocument();
    expect(content.queryByRole("button", { name: "새로고침", hidden: true })).not.toBeInTheDocument();
    const listViewport = screen.getAllByTestId(variant === "mobile" ? "mobile-scroll-viewport" : "stocktake-list-viewport")
      .find(viewport => !viewport.closest("aside"));
    expect(listViewport).toBeInTheDocument();
  });

  it("shows the shared task toolbar without a separate round menu", () => {
    render(<StocktakeLoadingSkeleton variant="desktop" />);
    expect(screen.queryByRole("button", { name: "회차·작업 메뉴", hidden: true })).not.toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "전수조사 메뉴", hidden: true });
    expect(menu.parentElement).toContainElement(screen.getByRole("button", { name: "필터 열기", hidden: true }));
  });

  it.each(["desktop", "mobile"] as const)("%s target requery keeps real headers and does not report an empty count", variant => {
    render(<StocktakeTargetList variant={variant} rows={[]} waiting={false} loading selection={{}} busy={false}
      hasNextPage={false} fetchingNextPage={false} filtered={false} imageManifest={{}}
      onSelect={vi.fn()} onToggle={vi.fn()} onMore={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("columnheader")).toHaveLength(variant === "mobile" ? 3 : 7);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(8);
    expect(screen.queryByText("조건에 맞는 대상이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("불러온 품목 0개")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로고침" })).not.toBeInTheDocument();
  });
});
