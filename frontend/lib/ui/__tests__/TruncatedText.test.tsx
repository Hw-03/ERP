import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TruncatedText } from "../TruncatedText";

function setBoxMetrics(
  element: HTMLElement,
  metrics: { clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number },
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
  fireEvent(window, new Event("resize"));
}

describe("TruncatedText", () => {
  it("detects horizontal overflow and exposes the full text on hover", async () => {
    render(
      <TruncatedText id="target-name" className="truncate" accessibilityLabel="전체 품목 이름">
        전체 품목 이름
      </TruncatedText>,
    );
    const text = screen.getByText("전체 품목 이름");
    setBoxMetrics(text, { clientWidth: 100, scrollWidth: 180, clientHeight: 20, scrollHeight: 20 });

    const trigger = text.parentElement!;
    await waitFor(() => expect(trigger).toHaveAttribute("tabindex", "0"));
    expect(trigger).toHaveAttribute("id", "target-name");
    expect(trigger).toHaveAttribute("aria-label", "전체 품목 이름");

    fireEvent.mouseEnter(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("전체 품목 이름");
  });

  it("detects vertical line-clamp overflow and exposes the full text on focus", async () => {
    render(
      <TruncatedText className="line-clamp-2" accessibilityLabel="두 줄을 넘는 패널 제목">
        두 줄을 넘는 패널 제목
      </TruncatedText>,
    );
    const text = screen.getByText("두 줄을 넘는 패널 제목");
    setBoxMetrics(text, { clientWidth: 160, scrollWidth: 160, clientHeight: 36, scrollHeight: 60 });

    const trigger = text.parentElement!;
    await waitFor(() => expect(trigger).toHaveAttribute("tabindex", "0"));
    fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("두 줄을 넘는 패널 제목");
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });

  it("does not add a focus stop or tooltip when the text fits", () => {
    render(<TruncatedText className="truncate">짧은 이름</TruncatedText>);
    const text = screen.getByText("짧은 이름");
    setBoxMetrics(text, { clientWidth: 120, scrollWidth: 120, clientHeight: 20, scrollHeight: 20 });

    const trigger = text.parentElement!;
    expect(trigger).not.toHaveAttribute("tabindex");
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
