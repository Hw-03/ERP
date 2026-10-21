// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { adminFadeDuration } from "../adminFadeDuration";

describe("adminFadeDuration", () => {
  it("uses distinct selection and read timings and accepts CSS seconds", () => {
    const element = document.createElement("div");
    document.body.append(element);
    expect(adminFadeDuration(element)).toBe(180);
    expect(adminFadeDuration(element, "read")).toBe(220);
    element.style.setProperty("--admin-selection-duration", ".18s");
    element.style.setProperty("--admin-fade-duration", "220ms");
    expect(adminFadeDuration(element)).toBe(180);
    expect(adminFadeDuration(element, "read")).toBe(220);
    element.remove();
  });
});
