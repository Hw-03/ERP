import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopPanelCloseButton, DesktopRightPanel, DesktopRightPanelFooter } from "../DesktopRightPanel";

describe("DesktopRightPanel", () => {
  it("keeps a full-width metadata row below the title and close-button row", () => {
    render(<DesktopRightPanel title="Item" subtitle="CODE" subtitleAction={<button>Copy</button>} subtitleFullWidth onClose={vi.fn()}>Body</DesktopRightPanel>);
    const header = screen.getByTestId("desktop-right-panel-header");
    const titleRow = screen.getByText("Item").closest(".flex")!;
    const metadata = screen.getByText("CODE").parentElement!.parentElement!;
    expect(titleRow).toContainElement(screen.getByRole("button", { name: "패널 닫기" }));
    expect(titleRow).not.toContainElement(metadata);
    expect(metadata.parentElement).toBe(header);
    expect(metadata).toHaveClass("pr-1.5");
    expect(metadata).toContainElement(screen.getByRole("button", { name: "Copy" }));
    expect(titleRow.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps an external rail outside the fixed panel surface and all decorative clipping", () => {
    render(<DesktopRightPanel title="품목" collapsibleHeader bodyScrollbarOutset>본문</DesktopRightPanel>);
    const panel = screen.getByTestId("desktop-right-panel");
    const body = screen.getByTestId("desktop-right-panel-body");
    const surfaceClip = screen.getByTestId("desktop-panel-surface-clip");
    expect(panel).toHaveClass("w-[420px]", "overflow-visible");
    expect(body).toHaveClass("sg", "-mr-[31px]", "pr-[31px]");
    expect(surfaceClip).toHaveClass("overflow-hidden", "rounded-[31px]", "pointer-events-none");
    expect(surfaceClip).not.toContainElement(body);
    expect(surfaceClip).toContainElement(screen.getByTestId("desktop-panel-title-backdrop"));
    expect(surfaceClip).toContainElement(screen.getByTestId("desktop-panel-card-edge-top"));
  });

  it("scrolls optional header content with the body while keeping the title sticky and the close button outside", () => {
    render(<DesktopRightPanel title="선택 품목" subtitle="CODE" collapsibleHeader onClose={vi.fn()} topContent={<button>탭</button>}>
      본문
      <DesktopRightPanelFooter><button>입고</button></DesktopRightPanelFooter>
    </DesktopRightPanel>);
    const body = screen.getByTestId("desktop-right-panel-body");
    expect(body).toContainElement(screen.getByText("탭"));
    expect(body).toContainElement(screen.getByText("CODE"));
    expect(screen.getByTestId("desktop-right-panel-sticky-title")).toHaveClass("sticky", "top-0");
    expect(body).not.toContainElement(screen.getByRole("button", { name: "패널 닫기" }));
    expect(body).not.toContainElement(screen.getByRole("button", { name: "입고" }));
  });

  it("resets scroll only when the reset key changes and reveals focused header controls", () => {
    const panel = (key: string) => <DesktopRightPanel title="품목" collapsibleHeader scrollResetKey={key} topContent={<button>탭</button>} subtitleAction={<button>복사</button>}>본문</DesktopRightPanel>;
    const { rerender } = render(panel("detail"));
    const body = screen.getByTestId("desktop-right-panel-body");
    body.scrollTop = 160;
    rerender(panel("detail"));
    expect(body.scrollTop).toBe(160);
    rerender(panel("history"));
    expect(body.scrollTop).toBe(0);
    body.scrollTop = 160;
    fireEvent.focus(screen.getByRole("button", { name: "탭" }));
    expect(body.scrollTop).toBe(0);
    body.scrollTop = 160;
    fireEvent.focus(screen.getByRole("button", { name: "복사" }));
    expect(body.scrollTop).toBe(0);
  });

  it("fades measured header areas without changing their height and restores them toward the top", () => {
    render(<DesktopRightPanel title="품목" collapsibleHeader subtitle="CODE" topContent={<button>탭</button>}>본문</DesktopRightPanel>);
    const body = screen.getByTestId("desktop-right-panel-body");
    const top = screen.getByText("탭").parentElement!;
    const title = screen.getByTestId("desktop-right-panel-sticky-title");
    const metadata = screen.getByTestId("desktop-right-panel-header");
    Object.defineProperty(top, "offsetHeight", { value: 68 });
    Object.defineProperty(metadata, "offsetHeight", { value: 48 });
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect);
    vi.spyOn(title, "getBoundingClientRect").mockReturnValue({ height: 66 } as DOMRect);
    vi.spyOn(metadata, "getBoundingClientRect").mockImplementation(() => ({ bottom: 182 - body.scrollTop }) as DOMRect);
    body.scrollTop = 34;
    fireEvent.scroll(body);
    expect(top).toHaveStyle({ opacity: "0.5" });
    expect(metadata).toHaveStyle({ opacity: "1" });
    body.scrollTop = 150;
    fireEvent.scroll(body);
    expect(top).toHaveStyle({ opacity: "0" });
    expect(metadata).toHaveStyle({ opacity: "0" });
    expect(top.style.height).toBe("");
    body.scrollTop = 130;
    fireEvent.scroll(body);
    expect(top).toHaveStyle({ opacity: "0" });
    body.scrollTop = 0;
    fireEvent.scroll(body);
    expect(top).toHaveStyle({ opacity: "1" });
    expect(metadata).toHaveStyle({ opacity: "1" });
  });

  it("keeps rounded card edges at both visible scroll boundaries and removes them between cards", () => {
    render(<DesktopRightPanel title="품목" collapsibleHeader><section data-panel-scroll-card style={{ borderTopLeftRadius: 28 }}>카드</section></DesktopRightPanel>);
    const panel = screen.getByTestId("desktop-right-panel");
    const body = screen.getByTestId("desktop-right-panel-body");
    const title = screen.getByTestId("desktop-right-panel-sticky-title");
    const card = screen.getByText("카드");
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ top: 20, bottom: 700 } as DOMRect);
    vi.spyOn(title, "getBoundingClientRect").mockReturnValue({ bottom: 86, height: 66 } as DOMRect);
    const cardRect = vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: -100, bottom: 1000, left: 20, width: 360 } as DOMRect);
    fireEvent.scroll(body);
    const top = screen.getByTestId("desktop-panel-card-edge-top");
    const bottom = screen.getByTestId("desktop-panel-card-edge-bottom");
    expect(top).toHaveStyle({ display: "block", top: "86px", left: "20px", width: "360px", height: "28px" });
    expect(bottom).toHaveStyle({ display: "block", top: "672px" });
    expect(top.style.getPropertyValue("--card-edge-radius")).toBe("28px");
    expect(bottom.style.getPropertyValue("--card-edge-radius")).toBe("28px");
    expect(top).toHaveClass("pointer-events-none");
    expect(top).toHaveAttribute("aria-hidden", "true");
    expect(body).not.toContainElement(top);
    cardRect.mockReturnValue({ top: 100, bottom: 600, left: 20, width: 360 } as DOMRect);
    fireEvent.scroll(body);
    expect(top).toHaveStyle({ display: "none" });
    expect(bottom).toHaveStyle({ display: "none" });
  });

  it("covers both title sides within the fixed surface independently of the external rail", () => {
    render(<DesktopRightPanel title="품목" collapsibleHeader>본문</DesktopRightPanel>);
    const body = screen.getByTestId("desktop-right-panel-body");
    const panel = screen.getByTestId("desktop-right-panel");
    const title = screen.getByTestId("desktop-right-panel-sticky-title");
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ top: 100, left: 0 } as DOMRect);
    vi.spyOn(title, "getBoundingClientRect").mockReturnValue({ top: 120, bottom: 186, height: 66 } as DOMRect);
    fireEvent.scroll(body);
    const backdrop = screen.getByTestId("desktop-panel-title-backdrop");
    expect(body).not.toContainElement(backdrop);
    expect(backdrop).toHaveClass("inset-x-px", "pointer-events-none");
    expect(backdrop).toHaveStyle({ top: "20px", height: "66px" });
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop.style.background).toContain("var(--c-bg)");
  });

  it("places an optional action at the right edge of the metadata row", () => {
    render(<DesktopRightPanel title="품목" subtitle="CODE" subtitleBadge={<span>정상</span>} subtitleAction={<button>복사</button>}>내용</DesktopRightPanel>);
    const button = screen.getByRole("button", { name: "복사" });
    expect(button.parentElement).toHaveClass("ml-auto", "shrink-0");
    expect(screen.getByText("CODE").parentElement?.parentElement).toContainElement(button);
    expect(screen.getByText("CODE").parentElement).toContainElement(screen.getByText("정상"));
  });

  it("forwards its button ref and uses the default panel-close label", () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(<DesktopPanelCloseButton ref={ref} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "패널 닫기" });
    expect(ref.current).toBe(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

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

  it("renders optional top content before the shared item header", () => {
    render(
      <DesktopRightPanel title="선택 품목" topContent={<div data-testid="panel-top-content">탭</div>}>
        상세 내용
      </DesktopRightPanel>,
    );

    const topContent = screen.getByTestId("panel-top-content");
    const title = screen.getByText("선택 품목");
    expect(topContent.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps a danger panel surface neutral and signals warning through its border only", () => {
    render(
      <DesktopRightPanel title="내역 취소" tone="danger">
        상세 내용
      </DesktopRightPanel>,
    );

    expect(screen.getByTestId("desktop-right-panel")).toHaveStyle({ background: LEGACY_COLORS.s1 });
    expect(screen.getByTestId("desktop-right-panel-header")).toHaveStyle({
      background: "transparent",
    });
    expect(screen.getByTestId("desktop-right-panel-header")).not.toHaveClass("-mx-5");
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
