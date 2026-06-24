# useTransactions.test.tsx

## 이 파일은 뭐예요?
`useTransactions` 훅의 단위 테스트. `api.getTransactions`를 모킹하여 초기 fetch 결과 반영, `hasMore` 판정(100개=true / 20개=false), 에러 상태 처리를 검증한다.

## 언제 보나요?
- `useTransactions` 훅의 페이징(`hasMore`) 로직이나 에러 처리를 수정할 때
- 페이지 크기 기준(100개)이 바뀌어 `hasMore` 판정 계약이 달라졌는지 확인할 때

## 중요한 내용
- `makeLogs(count)` 헬퍼로 dummy 로그 배열 생성 — `log_id`, `item_id`, `quantity_change`, `transaction_type`, `created_at` 포함
- `hasMore=true` 기준: 응답 길이 ≥ 100(페이지 사이즈)
- 검증 케이스 3개: ①100개 fetch → `hasMore=true` ②20개 → `hasMore=false` ③에러 → `error` state

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/hooks/useTransactions.ts]] — 테스트 대상 훅
- [[ERP/frontend/lib/api.ts]] — 모킹되는 `api.getTransactions` 원본
