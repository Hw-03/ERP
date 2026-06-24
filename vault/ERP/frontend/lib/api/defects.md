# defects.ts

## 이 파일은 뭐예요?
불량 처리 허브 API 모듈입니다. 부서·품목별 DEFECTIVE 목록 조회, KPI 카드 4개 카운트, 결재 없이 즉시 격리/복귀 처리를 제공합니다.

## 언제 보나요?
- 불량 처리 화면(격리·복귀·KPI)을 개발하거나 디버깅할 때
- `defectsApi` 메소드 시그니처가 필요할 때

## 중요한 내용
- `defectsApi.listDefects(department?)` — `/api/defects/locations`, `DefectLocation[]`
- `defectsApi.getDefectKpi()` — `/api/defects/kpi`, `DefectKpi` (카운트 4개)
- `defectsApi.quarantine(payload)` — 즉시 격리 (결재 없음)
- `defectsApi.unquarantine(payload)` — 즉시 정상 복귀 (결재 없음)
- 타입: `DefectKpi`, `DefectLocation`, `QuarantinePayload`, `UnquarantinePayload` → `./types/defects`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/defects.ts]] — 불량 관련 타입 정의
- [[ERP/backend/app/routers/defects.py]] — 백엔드 불량 라우터
