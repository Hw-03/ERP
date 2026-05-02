import { describe, it, expect } from "vitest";
import {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
  LEGACY_COLORS,
  OPTION_COLOR,
  optionColor,
} from "../mes/color";

describe("mes/color barrel — department exports", () => {
  it("re-exports MES_DEPARTMENT_COLORS with all 11 keys (10 부서 + 기타)", () => {
    const expected = [
      "조립", "고압", "진공", "튜닝", "튜브",
      "서비스", "AS", "연구", "영업", "출하", "기타",
    ];
    for (const key of expected) {
      expect(MES_DEPARTMENT_COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("re-exports getDepartmentFallbackColor with alias absorption", () => {
    expect(getDepartmentFallbackColor("연구소")).toBe("#b45309");
    expect(getDepartmentFallbackColor("AS팀")).toBe("#be185d");
    expect(getDepartmentFallbackColor("미지부서")).toBe("#475569");
  });

  it("re-exports getDepartmentInitial", () => {
    expect(getDepartmentInitial("조립")).toBe("조");
    expect(getDepartmentInitial("미지")).toBe("기");
  });

  it("re-exports normalizeDepartmentName", () => {
    expect(normalizeDepartmentName(null)).toBe("기타");
    expect(normalizeDepartmentName("연구소")).toBe("연구");
  });
});

describe("mes/color barrel — LEGACY_COLORS", () => {
  it("re-exports LEGACY_COLORS with css var tokens", () => {
    expect(LEGACY_COLORS.bg).toBe("var(--c-bg)");
    expect(LEGACY_COLORS.blue).toBe("var(--c-blue)");
    expect(LEGACY_COLORS.green).toBe("var(--c-green)");
    expect(LEGACY_COLORS.red).toBe("var(--c-red)");
    expect(LEGACY_COLORS.muted).toBe("var(--c-muted)");
    expect(LEGACY_COLORS.muted2).toBe("var(--c-muted2)");
  });
});

describe("optionColor", () => {
  it("returns mapped color for known codes", () => {
    expect(optionColor("BG")).toBe(OPTION_COLOR.BG);
    expect(optionColor("WM")).toBe(OPTION_COLOR.WM);
    expect(optionColor("SV")).toBe(OPTION_COLOR.SV);
  });

  it("falls back to muted2 for unknown / empty input", () => {
    expect(optionColor("UNKNOWN")).toBe(LEGACY_COLORS.muted2);
    expect(optionColor("")).toBe(LEGACY_COLORS.muted2);
    expect(optionColor(null)).toBe(LEGACY_COLORS.muted2);
    expect(optionColor(undefined)).toBe(LEGACY_COLORS.muted2);
  });
});
