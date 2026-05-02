import { describe, it, expect } from "vitest";
import {
  getStockState,
  LEGACY_FILE_TYPES,
  LEGACY_PARTS,
  LEGACY_MODELS,
} from "../mes/inventory";
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

describe("legacy filter constants", () => {
  it("LEGACY_FILE_TYPES contains '전체'", () => {
    expect(LEGACY_FILE_TYPES).toContain("전체");
  });

  it("LEGACY_PARTS includes 전체 + 5 부서 파트", () => {
    expect(LEGACY_PARTS[0]).toBe("전체");
    expect(LEGACY_PARTS).toContain("자재창고");
    expect(LEGACY_PARTS).toContain("조립출하");
    expect(LEGACY_PARTS.length).toBe(6);
  });

  it("LEGACY_MODELS includes 전체 + 5 X-Ray 모델", () => {
    expect(LEGACY_MODELS[0]).toBe("전체");
    expect(LEGACY_MODELS).toContain("DX3000");
    expect(LEGACY_MODELS).toContain("ADX6000");
    expect(LEGACY_MODELS.length).toBe(6);
  });
});
