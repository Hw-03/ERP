# NotificationBell.tsx

## 이 파일은 뭐예요?
상단 헤더에 표시되는 종(Bell) 아이콘 버튼 컴포넌트입니다. 30초 폴링으로 알림을 받아오고, 읽지 않은 알림 수를 빨간 배지로 표시하며, 클릭하면 드롭다운 패널(NotificationPanel)을 열어줍니다.

## 언제 보나요?
- 데스크톱 헤더에서 알림 배지나 종 아이콘을 찾을 때
- 알림 클릭 후 특정 탭/섹션으로 이동하는 네비게이션 흐름을 추적할 때
- 읽음 처리(markRead) 로직이 어디서 호출되는지 볼 때

## 중요한 내용
- `NotificationBell({ onNavigate })` — `onNavigate(tab, section)` 콜백으로 알림 클릭 시 특정 탭·섹션 이동
- `useNotificationsQuery(employeeId)` — 30초 폴링, `data.items` / `data.unread_count` 반환
- `useMarkNotificationsReadMutation()` — 개별 알림 또는 전체 읽음 처리
- 미로그인(`!employeeId`) 시 null 반환(렌더 안 됨)
- 언읽음 수가 있으면 종 아이콘에 `statusFlash` 애니메이션 + 빨간 배지(99+ 캡)
- 패널 외부 클릭 시 `mousedown` 이벤트로 닫힘

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/notifications/NotificationPanel.tsx]] — 드롭다운 패널 UI
- [[ERP/frontend/lib/queries/useNotificationsQuery.ts]] — 알림 폴링 쿼리 및 읽음 처리 뮤테이션
- [[ERP/frontend/app/mes/_components/login/useCurrentOperator.ts]] — 현재 로그인 직원 정보
- [[ERP/frontend/lib/api/types/📁_types]] — `AppNotification` 타입 정의
