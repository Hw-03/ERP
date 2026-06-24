# weekly.ts

## 이 파일은 뭐예요?
주간 보고 API 모듈입니다. `getWeeklyReport` 하나만 있으며, 백엔드 Pydantic Decimal이 JSON에서 문자열로 직렬화되는 버그를 `normalizeMatrix()`로 보정합니다.

## 언제 보나요?
- 주간보고 화면이 숫자 합산 대신 문자열 연결을 하는 버그를 추적할 때 (`"022.00008…"` 형태)
- 주간보고 데이터 흐름(프론트→백엔드→응답 정규화)을 볼 때

## 중요한 내용
- `weeklyApi.getWeeklyReport({ week_start, week_end })` — `/api/inventory/weekly-report`
- `normalizeMatrix(rows)` — `tf_qty/hf_qty/vf_qty/nf_qty/af_qty/pf_qty/total_qty` 모두 `Number()` 강제 변환
- 타입: `WeeklyProductionModelRow`, `WeeklyReportResponse` → `./types/weekly`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/weekly.ts]] — 주간보고 타입
- [[ERP/backend/app/routers/inventory/weekly_report.py]] — 백엔드 주간보고 라우터 (frozen)
