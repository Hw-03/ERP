---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-inventory.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-inventory.test.ts — mes-inventory.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-inventory.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-inventory.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
  getStockState,
  LEGACY_FILE_TYPES,
  LEGACY_PARTS,
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

});
```
