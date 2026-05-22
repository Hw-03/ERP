---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-barrels.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-barrels.test.ts — mes-barrels.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-barrels.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-barrels.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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

/**
 * Round-12 (#1) — barrel 모듈 smoke 테스트.
 *
 * `lib/mes/{department,format,status}.ts` 등 단순 re-export barrel 들의 import path
 * 를 테스트 — runtime 검증보다는 coverage 카운트 + 회귀 (re-export 누락) 방어 목적.
 */

describe("lib/mes barrel re-exports", () => {
  it("@/lib/mes/department exposes mes-department API", async () => {
    const mod = await import("../mes/department");
    expect(typeof mod.normalizeDepartmentName).toBe("function");
    expect(typeof mod.getDepartmentFallbackColor).toBe("function");
    expect(typeof mod.normalizeDepartment).toBe("function");
    expect(mod.MES_DEPARTMENT_COLORS).toBeDefined();
    expect(mod.DEPARTMENT_LABELS).toBeDefined();
  });

  it("@/lib/mes/format exposes mes-format API", async () => {
    const mod = await import("../mes/format");
    expect(typeof mod.formatQty).toBe("function");
    expect(typeof mod.formatItemCode).toBe("function");
    expect(typeof mod.formatDateTime).toBe("function");
    expect(typeof mod.formatPercent).toBe("function");
  });

  it("@/lib/mes/status exposes mes-status API", async () => {
    const mod = await import("../mes/status");
    expect(typeof mod.toMesTone).toBe("function");
    expect(typeof mod.inferTone).toBe("function");
    expect(typeof mod.getTransactionLabel).toBe("function");
    expect(typeof mod.transactionColor).toBe("function");
  });
});
```
