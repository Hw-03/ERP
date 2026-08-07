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
});
