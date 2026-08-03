import { render, screen } from "@testing-library/react";
import { Layers } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AdminPageHeader } from "../AdminPageHeader";

describe("AdminPageHeader", () => {
  it("제목 옆 헤더 요약 영역에 KPI를 렌더링한다", () => {
    render(
      <AdminPageHeader
        icon={Layers}
        title="모델 관리"
        summary={<div data-testid="header-summary">전체 모델 6</div>}
      />,
    );

    expect(screen.getByTestId("header-summary")).toHaveTextContent("전체 모델 6");
  });

  it("vertically centers the header's primary content and sibling regions", () => {
    const { container } = render(
      <AdminPageHeader
        icon={Layers}
        title="Model management"
        summary={<div data-testid="header-summary">6 models</div>}
        actions={<button type="button">Add model</button>}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Model management" });
    const primary = heading.parentElement?.parentElement?.parentElement;
    const header = primary?.parentElement;
    const iconContainer = container.querySelector("svg")?.parentElement;

    expect(header).toHaveClass("items-center");
    expect(primary).toHaveClass("items-center");
    expect(iconContainer).not.toHaveClass("mt-0.5");
  });

  it("기본 제목 크기와 여백을 유지한다", () => {
    const { container } = render(<AdminPageHeader icon={Layers} title="내보내기" />);

    const heading = screen.getByRole("heading", { name: "내보내기" });
    const primary = heading.parentElement?.parentElement?.parentElement;
    const header = primary?.parentElement;
    const iconContainer = container.querySelector("svg")?.parentElement;

    expect(header).toHaveClass("mb-4");
    expect(heading).toHaveClass("text-[22px]");
    expect(iconContainer).toHaveClass("h-10", "w-10");
  });
});
