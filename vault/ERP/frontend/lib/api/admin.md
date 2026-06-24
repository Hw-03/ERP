# admin.ts

## 이 파일은 뭐예요?
관리자 설정 도메인 API 모듈입니다. 관리자 PIN 검증·변경, DB 초기화, audit CSV 파일 조회·다운로드·백필 기능을 제공합니다.

## 언제 보나요?
- 관리자 PIN 관련 기능(검증, 변경, 직원 PIN 초기화)을 구현하거나 디버깅할 때
- audit CSV 백필 또는 다운로드 URL 생성 로직을 볼 때
- DB 초기화 기능 연결이 필요할 때

## 중요한 내용
- `adminApi.verifyAdminPin(pin)` — `/api/settings/verify-pin`
- `adminApi.resetDatabase(pin)` — `/api/settings/reset` (DB 초기화)
- `adminApi.updateAdminPin(payload)` — `/api/settings/admin-pin`
- `adminApi.listAuditCsvFiles()` — audit CSV 목록 반환, `AuditCsvFile[]`
- `adminApi.auditCsvDownloadUrl(month)` / `auditXlsxDownloadUrl(month)` — URL 문자열 반환(fetch 없음)
- `adminApi.triggerAuditCsvBackfill()` — `/api/admin/audit-csv/backfill`

## 위험도
🔴 높음 — `resetDatabase`는 실제 DB 초기화 엔드포인트를 호출함. PIN 없이 실수로 연결하면 데이터 전체 삭제.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — fetcher, postJson, putJson, toApiUrl 구현체
- [[ERP/backend/app/routers/settings.py]] — verify-pin / reset / admin-pin 백엔드 라우터
