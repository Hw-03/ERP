# admin.ts

## 이 파일은 뭐예요?
MSW 테스트용 어드민 API 핸들러로, PIN 검증(`/api/settings/verify-pin`)과 감사 CSV 파일 목록 조회·백필 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 어드민 PIN 검증 로직을 테스트할 때
- 감사 CSV 백필(`audit-csv/backfill`) 관련 컴포넌트를 테스트할 때

## 중요한 내용
- `adminHandlers` — export되는 핸들러 배열
- PIN `"0000"` → 200 OK, 그 외 → 403 `PIN 불일치`
- `GET */api/admin/audit-csv/files` — 샘플 월별 CSV 파일 목록 1건 반환
- `POST */api/admin/audit-csv/backfill` — `{ total_rows: 50, months: ["2026-04"] }` 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/__tests__/msw/handlers/settings.ts]] — 동일한 verify-pin 엔드포인트를 더 많은 설정 API와 함께 포함(두 파일이 같은 경로를 핸들링하므로 setup에서 어느 쪽을 쓰는지 확인 필요)
