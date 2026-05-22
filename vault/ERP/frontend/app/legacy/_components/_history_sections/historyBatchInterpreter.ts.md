---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/historyBatchInterpreter.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# historyBatchInterpreter.ts — historyBatchInterpreter.ts 설명

## 이 파일은 무엇을 책임지나

`historyBatchInterpreter.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `getBatchFlowEndpoints`
- `getHistoryOperationLabel`
- `getHistoryWorkTypeLabel`
- `getHistoryDisplayLabel`
- `getHistoryDisplaySubLabel`
- `getHistoryFlowLabel`
- `getHistoryActor`
- `describeBatchFlow`
- `getHistoryBomParentLine`
- `getHistoryLineStatusLabel`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
/**
 * historyBatchInterpreter.ts — IoBatch 기반 해석 모듈 (깊은 모듈).
 * C4: historyShared.ts 에서 추출. batch/log 를 받아 label/flow/sign/summary 를 단일 로직으로 생성.
 * 내부 bucket→라벨 규칙, sub_type/tx 우선순위를 이 모듈에 은닉.
 * 소비자는 historyShared 재export 또는 직접 import.
 */
import type { Department } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";
import { formatQty } from "@/lib/mes/format";

// ──────────────────────────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────────────────────────

function _deptName(dept: Department | string | null | undefined): string | null {
  if (!dept) return null;
  return typeof dept === "string" ? dept : null;
}

type BucketSlot = { bucket: string; dept: string | null };

function _bucketSlotKey(s: BucketSlot): string {
  return `${s.bucket}|${s.dept ?? ""}`;
}

/** none bucket 라벨 — sub_type 컨텍스트 의존. 매핑 안 되면 null. */
function _labelNoneBucket(subType: string | null | undefined, side: "from" | "to"): string | null {
  switch (subType) {
    case "receive_supplier":
      return side === "from" ? "외부" : null;
    case "supplier_return":
      return side === "to" ? "외부" : null;
    case "produce":
      return "생산";
    case "disassemble":
      return "재작업";
    case "adjust_in":
    case "adjust_out":
      return "수량 조정";
    default:
      return null;
  }
}

function _labelBucketSlot(slot: BucketSlot, subType: string | null | undefined, side: "from" | "to"): string | null {
  switch (slot.bucket) {
    case "warehouse": return "창고";
    case "production": return slot.dept || "부서";
    case "defective": return slot.dept ? `${slot.dept} 불량` : "불량";
    case "none": return _labelNoneBucket(subType, side);
    default: return null;
  }
}

// ──────────────────────────────────────────────────────────────────
```
