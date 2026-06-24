# useNotificationsQuery.ts

## 이 파일은 뭐예요?
결재 알림 목록을 30초 간격으로 폴링해서 가져오고, 알림을 읽음 처리하는 React Query 훅입니다.

## 언제 보나요?
- 상단 알림 배지나 알림 패널에서 미읽음 수가 어디서 오는지 확인할 때
- 알림 폴링 주기나 staleTime 설정을 조정할 때

## 중요한 내용
- `useNotificationsQuery(employeeId)` — `refetchInterval: 30_000`으로 30초 폴링, `STALE_TIME.VOLATILE` 적용, `employeeId` 없으면 비활성
- `useMarkNotificationsReadMutation` — `notification_ids` 없으면 전체 읽음 처리, 성공 시 `queryKeys.notifications.all` invalidate
- `notificationsApi.listNotifications` / `markNotificationsRead`에 1:1 대응

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/notifications]] — 실제 API 호출 함수
- [[ERP/frontend/lib/queries/keys.ts]] — 쿼리 키 정의
- [[ERP/frontend/lib/queries/client.tsx]] — STALE_TIME.VOLATILE 상수
