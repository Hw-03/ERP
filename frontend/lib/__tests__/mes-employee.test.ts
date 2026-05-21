import { describe, it, expect } from "vitest";
import { firstEmployeeLetter } from "../mes/employee";

describe("firstEmployeeLetter", () => {
  it("returns the first character of trimmed input", () => {
    expect(firstEmployeeLetter("김현우")).toBe("김");
    expect(firstEmployeeLetter("  Park")).toBe("P");
  });

  it("returns '?' for empty / null / undefined", () => {
    expect(firstEmployeeLetter(undefined)).toBe("?");
    expect(firstEmployeeLetter(null)).toBe("?");
    expect(firstEmployeeLetter("")).toBe("?");
  });
});
