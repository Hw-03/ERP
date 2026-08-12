import { fireEvent, render, screen } from "@testing-library/react";
import { PackageCheck } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { DesktopWorkHubCard } from "../DesktopWorkHubCard";

describe("DesktopWorkHubCard", () => {
  it("keeps one card structure for title, optional meta, and complete work guidance", () => {
    const onClick = vi.fn();

    render(
      <DesktopWorkHubCard
        dataTestId="hub-card"
        icon={PackageCheck}
        title="창고 입출고"
        description="창고와 부서 간 재고를 이동합니다."
        tone="var(--c-blue)"
        meta={<span>7</span>}
        onClick={onClick}
      />,
    );

    const card = screen.getByTestId("hub-card");
    expect(card).toHaveClass("no-btn-inset");
    expect(card).toHaveTextContent("창고 입출고");
    expect(card).toHaveTextContent("창고와 부서 간 재고를 이동합니다.");
    expect(card).toHaveTextContent("7");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("uses a theme-aware hover hook instead of fixed brightening", () => {
    render(
      <DesktopWorkHubCard
        dataTestId="hub-card"
        icon={PackageCheck}
        title="창고 입출고"
        description="창고와 부서 간 재고를 이동합니다."
        tone="var(--c-blue)"
        onClick={vi.fn()}
      />,
    );

    const card = screen.getByTestId("hub-card");
    expect(card).toHaveClass("desktop-work-hub-card");
    expect(card).not.toHaveClass("hover:brightness-110");
  });

  it("keeps default and large card descriptions at the same 20px size", () => {
    render(
      <>
        <DesktopWorkHubCard
          icon={PackageCheck}
          title="출하 관리"
          description="요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다."
          tone="var(--c-blue)"
          onClick={vi.fn()}
        />
        <DesktopWorkHubCard
          icon={PackageCheck}
          title="창고 입출고"
          description="창고와 부서 간 재고를 이동합니다."
          tone="var(--c-blue)"
          size="large"
          onClick={vi.fn()}
        />
      </>,
    );

    expect(
      screen.getByText("요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다."),
    ).toHaveClass("text-xl");
    expect(screen.getByText("창고와 부서 간 재고를 이동합니다.")).toHaveClass("text-xl");
  });
});
