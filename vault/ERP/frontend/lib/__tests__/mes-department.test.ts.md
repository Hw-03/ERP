---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-department.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-department.test.ts — mes-department.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-department.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-department.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
    expect(getDepartmentFallbackColor("조립")).toBe("#3b82f6");
    expect(getDepartmentFallbackColor("고압")).toBe("#d97706");
    expect(getDepartmentFallbackColor("튜브")).toBe("#16a34a");
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
```
