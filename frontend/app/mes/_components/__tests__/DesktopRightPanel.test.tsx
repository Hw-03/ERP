import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesktopRightPanel, DesktopRightPanelFooter } from "../DesktopRightPanel";

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

  it("renders a metadata badge beside the subtitle without using the title action slot", () => {
    render(
      <DesktopRightPanel
        title="선택 품목"
        subtitle="46-AA-0080"
        subtitleBadge={<span>정상</span>}
      >
        <div>상세 내용</div>
      </DesktopRightPanel>,
    );

    const code = screen.getByText("46-AA-0080");
    expect(code.parentElement).toContainElement(screen.getByText("정상"));
  });

  it("renders a footer outside the scrolling detail body", () => {
    render(
      <DesktopRightPanel title="Detail">
        <div>Scrollable body</div>
        <DesktopRightPanelFooter>
          <button type="button">Cancel this record</button>
        </DesktopRightPanelFooter>
      </DesktopRightPanel>,
    );

    const footer = screen.getByTestId("desktop-right-panel-footer");
    const body = screen.getByTestId("desktop-right-panel-body");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Cancel this record" }));
    expect(body).not.toContainElement(screen.getByRole("button", { name: "Cancel this record" }));
  });
});
