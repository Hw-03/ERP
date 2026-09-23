import { describe, expect, it } from "vitest";
import { blockBrowserSaveShortcut } from "../blockBrowserSaveShortcut";

describe("MES 브라우저 저장 단축키", () => {
  it.each([
    { key: "s", ctrlKey: true, metaKey: false },
    { key: "S", ctrlKey: false, metaKey: true },
  ])("Ctrl/⌘+S의 브라우저 저장 동작을 막는다", (shortcut) => {
    const event = {
      ...shortcut,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    } as unknown as KeyboardEvent;

    blockBrowserSaveShortcut(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("일반 S 입력은 막지 않는다", () => {
    const event = {
      key: "s",
      ctrlKey: false,
      metaKey: false,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    } as unknown as KeyboardEvent;

    blockBrowserSaveShortcut(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
