# transactions.ts

## 이 파일은 뭐예요?
MSW 테스트용 트랜잭션 이력 API 핸들러로, 월별 건수·목록·요약·편집 이력 조회와 메타 편집·수량 보정 엔드포인트를 가짜 응답으로 제공합니다.

## 이 파일은 위험해요?
## 위험도
🔴 높음 — 수량 보정(`quantity-correction`)과 메타 편집(`meta-edit`) 두 가지 재고 변경 경로를 모두 포함하며, PIN 검증 로직이 포함되어 있어 인증 우회 테스트에 영향을 줍니다.

## 언제 보나요?
- 입출고 이력 화면(`History`) 또는 월별 트랜잭션 캘린더를 테스트할 때
- 트랜잭션 편집 이력(`/edits`) 및 수량 보정 플로우를 테스트할 때

## 중요한 내용
- `transactionsHandlers` — export되는 핸들러 배열
- `TransactionLog`, `TransactionEditLog` 타입을 `@/lib/api/types/production`에서 import
- 샘플: `RECEIVE(log-1, 메인 커버, +10)`, `SHIP(log-2, 하우징, -5)` 2건
- `GET /monthly-counts` — `year` 파라미터 없거나 범위 이탈 시 422 반환
- `POST /meta-edit`, `POST /quantity-correction` — `edited_by_pin !== "0000"` → 403
- `GET /edits` — `log-1`이면 샘플 편집 이력, 그 외 빈 배열
- `production.ts`와 트랜잭션 관련 경로 일부 중복(setup에서 어느 쪽 핸들러를 사용하는지 확인 필요)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/production.ts]] — `TransactionLog`, `TransactionEditLog` 타입 정의
- [[ERP/frontend/lib/__tests__/msw/handlers/production.ts]] — 트랜잭션 경로 일부 중복 파일
