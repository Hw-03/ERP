import { describe, it, expect } from "vitest";
import { getStockState } from "../mes/inventory";
import { LEGACY_COLORS } from "../mes/color";

describe("getStockState", () => {
  it("returns 품절 (red) when quantity <= 0", () => {
    expect(getStockState(0)).toEqual({ label: "품절", color: LEGACY_COLORS.red });
    expect(getStockState(-3)).toEqual({ label: "품절", color: LEGACY_COLORS.red });
  });

  it("returns 부족 (yellow) when 0 < quantity < minStock", () => {
    expect(getStockState(5, 10)).toEqual({ label: "부족", color: LEGACY_COLORS.yellow });
  });

  it("returns 정상 (green) when quantity >= minStock", () => {
    expect(getStockState(10, 10)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
    expect(getStockState(20, 10)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
  });

  it("returns 정상 when minStock is null / undefined and quantity > 0", () => {
    expect(getStockState(5)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
    expect(getStockState(5, null)).toEqual({ label: "정상", color: LEGACY_COLORS.green });
  });
});
