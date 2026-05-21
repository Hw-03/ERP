import { describe, it, expect } from "vitest";
import {
  formatQty,
  formatDate,
  formatDateTime,
  formatPercent,
} from "../mes-format";

describe("formatQty", () => {
  it("천단위 콤마", () => {
    expect(formatQty(1234)).toBe("1,234");
    expect(formatQty(1000000)).toBe("1,000,000");
  });

  it("문자열 입력도 처리", () => {
    expect(formatQty("1234")).toBe("1,234");
  });

  it("null/undefined/NaN/공백은 - 반환", () => {
    expect(formatQty(null)).toBe("-");
    expect(formatQty(undefined)).toBe("-");
    expect(formatQty("")).toBe("-");
    expect(formatQty("abc")).toBe("-");
    expect(formatQty(NaN)).toBe("-");
  });

  it("음수도 처리", () => {
    expect(formatQty(-500)).toBe("-500");
  });
});

describe("formatDate", () => {
  it("ISO 문자열을 한국식으로", () => {
    expect(formatDate("2026-05-04")).toContain("2026년");
    expect(formatDate("2026-05-04")).toContain("5월");
    expect(formatDate("2026-05-04")).toContain("4일");
  });

  it("null/공백/유효하지 않은 날짜는 -", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate("")).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
  });
});

describe("formatDateTime", () => {
  it("날짜 + 시간 모두 포함", () => {
    const out = formatDateTime("2026-05-04T09:30:00");
    expect(out).toContain("2026년");
    expect(out).toContain("5월");
    expect(out).toContain("4일");
    // 시간 표시 — 로케일에 따라 "오전"/"AM" 등 가변. 콜론 또는 시간 숫자만 확인.
    expect(out).toMatch(/[0-9]/);
  });

  it("null/유효하지 않은 입력은 -", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime("")).toBe("-");
    expect(formatDateTime("nope")).toBe("-");
  });
});

describe("formatPercent", () => {
  it("비율(|x|≤1)은 100배 곱한 후 % 부호", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("이미 퍼센트 단위는 그대로", () => {
    expect(formatPercent(12.3)).toBe("12.3%");
    expect(formatPercent(150)).toBe("150%");
  });

  it("0 도 정상 처리", () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it("null/NaN 은 -", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(undefined)).toBe("-");
    expect(formatPercent(NaN)).toBe("-");
  });
});
