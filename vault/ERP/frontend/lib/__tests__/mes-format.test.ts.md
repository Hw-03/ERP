---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-format.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-format.test.ts — mes-format.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-format.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-format.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
```
