import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadLoading } from "../ReadState";
import { LoadingSkeleton } from "../LoadingSkeleton";
import { AsyncState } from "../../mobile/primitives/AsyncState";

describe("조회 중 화면 구조", () => {
  it("업무 화면의 골격을 상태 안내 안에 유지하고 공용 목록으로 덮어쓰지 않는다", () => {
    render(<ReadLoading label="요청 목록 조회 중" skeleton={<div data-testid="request-shape">요청 카드 골격</div>} />);
    const status = screen.getByRole("status", { name: "요청 목록 조회 중" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toContainElement(screen.getByTestId("request-shape"));
    expect(status.querySelectorAll(".rounded-full")).toHaveLength(0);
  });

  it("움직임 감소 설정에서 공용 로딩 행의 pulse를 강제하지 않는다", () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(container.querySelectorAll(".motion-safe\\:animate-pulse").length).toBeGreaterThan(0);
  });

  it("모바일 비동기 영역이 실제 조회 중임을 알린다", () => {
    render(<AsyncState loading skeleton={<div>목록 골격</div>}>완료 내용</AsyncState>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("완료 내용")).not.toBeInTheDocument();
  });
});
