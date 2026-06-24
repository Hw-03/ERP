---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-transaction.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-transaction.test.ts — mes-transaction.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-transaction.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-transaction.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
  TRANSACTION_META,
  getTransactionLabel,
  getTransactionTone,
} from "../mes/transaction";

describe("mes/transaction barrel", () => {
  it("re-exports TRANSACTION_META with 13 keys", () => {
    const required = [
      "RECEIVE", "PRODUCE", "SHIP", "ADJUST", "BACKFLUSH",
      "DISASSEMBLE",
      "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT",
      "MARK_DEFECTIVE", "UNMARK_DEFECTIVE", "DEFECT_SCRAP", "SUPPLIER_RETURN",
    ];
    expect(Object.keys(TRANSACTION_META).sort()).toEqual(required.sort());
  });

  it("getTransactionLabel returns Korean label for known type", () => {
    expect(getTransactionLabel("RECEIVE")).toBe("원자재 입고");
    expect(getTransactionLabel("MARK_DEFECTIVE")).toBe("새 불량");
    expect(getTransactionLabel("TRANSFER_DEPT")).toBe("부서 → 부서");
  });

  it("getTransactionLabel returns input as-is for unknown type", () => {
    expect(getTransactionLabel("UNKNOWN")).toBe("UNKNOWN");
  });

  it("getTransactionTone matches MesTone for each meta entry", () => {
    expect(getTransactionTone("RECEIVE")).toBe("success");
    expect(getTransactionTone("MARK_DEFECTIVE")).toBe("danger");
    expect(getTransactionTone("UNKNOWN")).toBe("info");
  });
});
```
