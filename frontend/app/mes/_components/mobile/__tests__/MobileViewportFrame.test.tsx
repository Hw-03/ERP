import { render, screen } from "@testing-library/react";
import {
  MOBILE_FRAME_REFERENCE_HEIGHT,
  TABLET_FRAME_WIDTH,
  MOBILE_FRAME_WIDTH,
  MobileViewportFrame,
} from "../MobileViewportFrame";

describe("MobileViewportFrame", () => {
  it("exposes the 430 by 932 mobile reference frame", () => {
    expect(MOBILE_FRAME_WIDTH).toBe(430);
    expect(TABLET_FRAME_WIDTH).toBe(720);
    expect(MOBILE_FRAME_REFERENCE_HEIGHT).toBe(932);
  });

  it("keeps the mobile app full-height and capped at the 430px reference width", () => {
    const { container } = render(
      <MobileViewportFrame>
        <div>mobile content</div>
      </MobileViewportFrame>,
    );

    const shell = container.firstElementChild;
    const frame = shell?.firstElementChild;

    expect(shell).toHaveClass("h-[100dvh]", "overflow-hidden", "bg-[var(--c-bg)]");
    expect(shell).not.toHaveClass("bg-black");
    expect(shell).not.toHaveClass("sm:bg-black");
    expect(frame).toHaveClass("mx-auto", "h-full", "w-full", "max-w-[430px]", "md:max-w-[720px]", "overflow-hidden");
    expect(screen.getByText("mobile content")).toBeInTheDocument();
  });
});
