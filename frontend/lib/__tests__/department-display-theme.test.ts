import { describe, expect, it } from "vitest";
import { departmentDisplayColor, getDepartmentFallbackColor } from "../mes-department";

describe("standard production department display colors", () => {
  it("uses the approved light source and themed display token for each production department", () => {
    const expected = [
      ["\uD29C\uBE0C", "#2f805d", "var(--c-department-tube)"],
      ["\uACE0\uC555", "#85630d", "var(--c-department-high-pressure)"],
      ["\uC9C4\uACF5", "#7052a8", "var(--c-department-vacuum)"],
      ["\uD29C\uB2DD", "#5c5c5c", "var(--c-department-tuning)"],
      ["\uC870\uB9BD", "#2f6faf", "var(--c-department-assembly)"],
      ["\uCD9C\uD558", "#9f4d43", "var(--c-department-shipping)"],
    ] as const;

    for (const [name, color, token] of expected) {
      expect(getDepartmentFallbackColor(name)).toBe(color);
      expect(departmentDisplayColor(color, name)).toBe(token);
    }
  });

  it("keeps an administrator-specified custom color on the generic display path", () => {
    expect(departmentDisplayColor("#123456", "\uD29C\uB2DD")).toBe(
      "color-mix(in srgb, #123456 var(--c-department-color-source-weight), var(--c-department-color-neutral))",
    );
  });
});
