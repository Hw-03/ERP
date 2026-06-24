---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-color.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-color.test.ts — mes-color.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-color.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-color.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/lib/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
import { describe, it, expect } from "vitest";
import {
  MES_DEPARTMENT_COLORS,
  getDepartmentFallbackColor,
  getDepartmentInitial,
  normalizeDepartmentName,
  LEGACY_COLORS,
  OPTION_COLOR,
  optionColor,
  employeeColor,
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

describe("employeeColor (Round-10F 정책 (A))", () => {
  it("returns MES_DEPARTMENT_COLORS hex for known 부서", () => {
    expect(employeeColor("조립")).toBe("#3b82f6");
    expect(employeeColor("고압")).toBe("#d97706");
```
