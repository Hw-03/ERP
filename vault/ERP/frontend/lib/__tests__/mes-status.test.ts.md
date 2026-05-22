---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-status.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-status.test.ts — mes-status.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-status.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-status.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MesTone`

## 연결되는 파일

- [[ERP/frontend/lib/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
import { describe, it, expect } from "vitest";
import {
  toMesTone,
  inferTone,
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
  transactionColor,
  type MesTone,
} from "../mes-status";
import { LEGACY_COLORS } from "../mes/color";

describe("toMesTone", () => {
  it("동일한 키는 그대로", () => {
    expect(toMesTone("success")).toBe("success");
    expect(toMesTone("warning")).toBe("warning");
    expect(toMesTone("danger")).toBe("danger");
    expect(toMesTone("info")).toBe("info");
    expect(toMesTone("neutral")).toBe("neutral");
    expect(toMesTone("muted")).toBe("muted");
  });

  it("StatusBadge 별칭 흡수: ok→success, warn→warning", () => {
    expect(toMesTone("ok")).toBe("success");
    expect(toMesTone("warn")).toBe("warning");
  });

  it("null/공백/모르는 값은 info", () => {
    expect(toMesTone(null)).toBe("info");
    expect(toMesTone(undefined)).toBe("info");
    expect(toMesTone("")).toBe("info");
    expect(toMesTone("nonsense")).toBe("info");
  });
});

describe("inferTone", () => {
  it("DEXCOWIN MES System 은 neutral", () => {
    expect(inferTone("DEXCOWIN MES System")).toBe("neutral");
  });

  it("'방금 완료' prefix 는 success", () => {
    expect(inferTone("방금 완료된 작업")).toBe("success");
  });

  it("실패/오류/에러는 danger", () => {
    expect(inferTone("실패했습니다")).toBe("danger");
    expect(inferTone("오류 발생")).toBe("danger");
    expect(inferTone("에러: 코드 500")).toBe("danger");
    expect(inferTone("불러오지 못했습니다")).toBe("danger");
  });

  it("주의/경고/부족/품절은 warning", () => {
    expect(inferTone("주의 필요")).toBe("warning");
    expect(inferTone("경고")).toBe("warning");
    expect(inferTone("재고 부족")).toBe("warning");
```
