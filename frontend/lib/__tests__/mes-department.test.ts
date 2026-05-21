import { describe, it, expect } from "vitest";
import {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
  DEPARTMENT_LABELS,
  DEPARTMENT_ICONS,
  normalizeDepartment,
} from "../mes-department";

describe("normalizeDepartmentName", () => {
  it("null/undefined/공백은 '기타'", () => {
    expect(normalizeDepartmentName(null)).toBe("기타");
    expect(normalizeDepartmentName(undefined)).toBe("기타");
    expect(normalizeDepartmentName("")).toBe("기타");
    expect(normalizeDepartmentName("   ")).toBe("기타");
  });

  it("별칭 흡수: 연구소 → 연구", () => {
    expect(normalizeDepartmentName("연구소")).toBe("연구");
    expect(normalizeDepartmentName("AS팀")).toBe("AS");
    expect(normalizeDepartmentName("출하팀")).toBe("출하");
  });

  it("표준 키는 그대로", () => {
    expect(normalizeDepartmentName("조립")).toBe("조립");
    expect(normalizeDepartmentName("고압")).toBe("고압");
  });
});

describe("getDepartmentFallbackColor", () => {
  it("부서명 기준 hex 반환", () => {
    expect(getDepartmentFallbackColor("조립")).toBe("#1d4ed8");
    expect(getDepartmentFallbackColor("고압")).toBe("#c2410c");
    expect(getDepartmentFallbackColor("연구")).toBe("#b45309");
  });

  it("별칭도 동일 색", () => {
    expect(getDepartmentFallbackColor("연구소")).toBe("#b45309");
    expect(getDepartmentFallbackColor("AS팀")).toBe("#be185d");
  });

  it("미지 부서는 slate fallback", () => {
    expect(getDepartmentFallbackColor("없는부서")).toBe("#475569");
    expect(getDepartmentFallbackColor("")).toBe("#475569");
  });
});

describe("getDepartmentInitial", () => {
  it("한 글자 이니셜", () => {
    expect(getDepartmentInitial("조립")).toBe("조");
    expect(getDepartmentInitial("AS")).toBe("A");
    expect(getDepartmentInitial("연구")).toBe("연");
  });

  it("미지 부서는 '기'", () => {
    expect(getDepartmentInitial("없는부서")).toBe("기");
    expect(getDepartmentInitial("")).toBe("기");
  });
});

describe("MES_DEPARTMENT_COLORS", () => {
  it("11개 부서 + 기타 모두 정의", () => {
    const expected = [
      "조립", "고압", "진공", "튜닝", "튜브",
      "서비스", "AS", "연구", "영업", "출하", "기타",
    ];
    for (const key of expected) {
      expect(MES_DEPARTMENT_COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("DEPARTMENT_LABELS (Round-10F 정책 (A))", () => {
  it("'연구' identity (기존 '연구소' 매핑 폐기)", () => {
    expect(DEPARTMENT_LABELS["연구"]).toBe("연구");
  });
  it("나머지 부서도 모두 identity", () => {
    expect(DEPARTMENT_LABELS["조립"]).toBe("조립");
    expect(DEPARTMENT_LABELS["AS"]).toBe("AS");
    expect(DEPARTMENT_LABELS["출하"]).toBe("출하");
  });
  it("10 부서 키", () => {
    expect(Object.keys(DEPARTMENT_LABELS).length).toBe(10);
  });
});

describe("DEPARTMENT_ICONS", () => {
  it("부서 한 글자 아이콘", () => {
    expect(DEPARTMENT_ICONS["조립"]).toBe("조");
    expect(DEPARTMENT_ICONS["연구"]).toBe("연");
    expect(DEPARTMENT_ICONS["AS"]).toBe("A");
  });
});

describe("normalizeDepartment", () => {
  it("null/undefined/empty → '기타'", () => {
    expect(normalizeDepartment(null)).toBe("기타");
    expect(normalizeDepartment(undefined)).toBe("기타");
    expect(normalizeDepartment("")).toBe("기타");
  });
  it("등록 부서는 라벨 (정책 (A) - identity)", () => {
    expect(normalizeDepartment("조립")).toBe("조립");
    expect(normalizeDepartment("연구")).toBe("연구");
  });
  it("미등록 키는 입력 그대로", () => {
    expect(normalizeDepartment("없는부서")).toBe("없는부서");
  });
});
