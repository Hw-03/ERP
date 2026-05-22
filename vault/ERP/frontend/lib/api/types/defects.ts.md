# defects.ts (types)

## 이 파일은 뭐예요?

불량 처리 허브 도메인 타입 정의. 백엔드 Phase 2 API 응답 / 요청 바디와 1:1 대응한다.
`defectsApi` 함수들이 이 타입을 직접 사용한다.

## 언제 보나요?

- 불량 관련 타입 오류가 날 때
- 백엔드 스키마가 바뀌어서 프론트 타입을 동기화해야 할 때
- 새 필드를 추가할 때

## 중요한 내용

### DefectLocation

격리된 재고 항목 1건. `listDefects()` 응답 원소.

```ts
export interface DefectLocation {
  item_id: string;
  item_name: string;
  item_code: string;
  department: string;
  quantity: number;
  defective_at: string;      // ISO 8601 datetime string
  reason_category?: string | null;
  reason_memo?: string | null;
}
```

### DefectKpi

KPI 카드 4개에 표시되는 집계 숫자. `getDefectKpi()` 응답.

```ts
export interface DefectKpi {
  quarantined: number;       // 현재 격리 총 건수
  over_one_year: number;     // 1년 이상 격리된 건수
  pending_approval: number;  // 결재 대기 중인 건수
  processed_today: number;   // 오늘 처리 완료 건수
}
```

### QuarantinePayload

`defectsApi.quarantine()` 요청 바디.

```ts
export interface QuarantinePayload {
  item_id: string;
  qty: number;
  source: "warehouse" | "production";  // 재고 차감 출처
  source_dept?: string;                // production 모드일 때만 필요
  target_dept: string;                 // 격리 대상 부서
  reason_category: string;
  reason_memo: string;
  actor_employee_id: string;
}
```

### UnquarantinePayload

`defectsApi.unquarantine()` 요청 바디 (즉시 정상 복귀).

```ts
export interface UnquarantinePayload {
  item_id: string;
  qty: number;
  dept: string;
  reason_category: string;
  reason_memo: string;
  actor_employee_id: string;
}
```

### 타입 관계 요약

```
listDefects()   → DefectLocation[]
getDefectKpi()  → DefectKpi
quarantine()    ← QuarantinePayload
unquarantine()  ← UnquarantinePayload
```

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api/defects.ts]] — 이 타입을 import해서 사용하는 API 클라이언트
- [[ERP/backend/app/schemas.py]] — 대응하는 백엔드 Pydantic 스키마

> [!info]- 더 연결된 파일
> - [[ERP/frontend/app/legacy/_components/_defect_hub/DefectHubPanel.tsx]] — `DefectKpi`, `DefectLocation` 사용
> - [[ERP/frontend/app/legacy/_components/_defect_hub/AddQuarantineModal.tsx]] — `QuarantinePayload` 사용
> - [[ERP/frontend/app/legacy/_components/_defect_hub/PaPfDefectWizard.tsx]] — `DefectLocation`, `UnquarantinePayload` 사용
