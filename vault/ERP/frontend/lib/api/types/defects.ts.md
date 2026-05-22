---
type: file-explanation
source_path: "frontend/lib/api/types/defects.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# defects.ts — defects.ts 설명

## 이 파일은 무엇을 책임지나

`defects.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectLocation`
- `DefectKpi`
- `QuarantinePayload`
- `UnquarantinePayload`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/defects.py]] — `defects.py`는 `defects` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * 불량 처리 허브 도메인 타입 — `@/lib/api/types/defects`.
 * Phase 2 백엔드 API 와 1:1 대응.
 */

export interface DefectLocation {
  item_id: string;
  item_name: string;
  item_code: string;
  department: string;
  quantity: number;
  defective_at: string; // ISO 8601 datetime string
  reason_category?: string | null;
  reason_memo?: string | null;
}

export interface DefectKpi {
  quarantined: number;
  over_one_year: number;
  pending_approval: number;
  processed_today: number;
}

export interface QuarantinePayload {
  item_id: string;
  qty: number;
  source: "warehouse" | "production";
  source_dept?: string;
  target_dept: string;
  reason_category: string;
  reason_memo: string;
  actor_employee_id: string;
}

export interface UnquarantinePayload {
  item_id: string;
  qty: number;
  dept: string;
  reason_category: string;
  reason_memo: string;
  actor_employee_id: string;
}
```
