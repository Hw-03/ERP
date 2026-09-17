import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeColor } from "./ThemeColor";

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  document.documentElement.removeAttribute("data-theme");
});

it("updates browser color from the selected app theme", async () => {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.append(meta);
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({
    getPropertyValue: () => document.documentElement.dataset.theme === "dark" ? "#151a21" : "#eff4fb",
  }) as unknown as CSSStyleDeclaration);
  render(<ThemeColor />);
  expect(meta.content).toBe("#eff4fb");
  act(() => { document.documentElement.dataset.theme = "dark"; });
  await waitFor(() => expect(meta.content).toBe("#151a21"));
});
