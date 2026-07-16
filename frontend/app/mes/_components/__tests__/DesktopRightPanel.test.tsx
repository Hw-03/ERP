import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesktopRightPanel } from "../DesktopRightPanel";

describe("DesktopRightPanel", () => {
  it("exposes a labelled title target while keeping the two-line clamp", () => {
    const title = "ADX6000s_80kV, 5mA_USA_Dexcowin Global 전체 품목명";
    render(
      <DesktopRightPanel title={title} titleId="history-detail-title">
        상세 내용
      </DesktopRightPanel>,
    );

    const titleText = screen.getByText(title);
    const labelledTitle = document.getElementById("history-detail-title");
    expect(labelledTitle).toContainElement(titleText);
    expect(labelledTitle).toHaveAttribute("aria-label", title);
    expect(titleText).toHaveClass("line-clamp-2");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("keeps the detail body scrollbar visible and draggable", () => {
    const { container } = render(
      <DesktopRightPanel title="상세">
        <div>내용</div>
      </DesktopRightPanel>,
    );

    const scroller = container.querySelector(".overflow-y-auto");
    expect(scroller).toHaveClass("sg");
    expect(scroller).not.toHaveClass("scrollbar-hide");
  });
});
