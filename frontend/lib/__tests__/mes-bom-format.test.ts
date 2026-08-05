import { describe, expect, it } from "vitest";
import { formatBomQuantity } from "@/lib/mes/bomFormat";

describe("formatBomQuantity", () => {
  it("renders BOM quantities without a multiplication prefix or unit spacing", () => {
    expect(formatBomQuantity(1, "EA")).toBe("1EA");
    expect(formatBomQuantity(1.5, " EA ")).toBe("1.5EA");
  });

  it("falls back to EA for an empty BOM unit", () => {
    expect(formatBomQuantity(0, "")).toBe("0EA");
  });
});
