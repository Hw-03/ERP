---
type: file-explanation
source_path: "frontend/app/legacy/_components/notifications/NotificationBell.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# NotificationBell.tsx — 상단 종 아이콘과 안 읽은 알림 배지

## 이 파일은 무엇을 책임지나

데스크톱 화면 상단의 종 아이콘을 그리고, 안 읽은 알림 개수를 빨간 배지로 보여 줍니다. 종을 누르면 알림 목록 패널([[ERP/frontend/app/legacy/_components/notifications/NotificationPanel.tsx]])을 열고, 알림을 클릭하면 읽음 처리 + 연결된 화면으로 이동시킵니다.

## 업무 흐름에서의 의미

이 종은 "내가 지금 처리할 일이 있나"를 한눈에 알려 주는 신호등입니다. 결재 요청·승인·반려, 인수인계 도착 같은 일이 생기면 안 읽은 개수가 배지로 뜨고 종이 깜빡입니다. 알림을 누르면 그 알림과 관련된 탭·섹션으로 바로 넘어가, 어느 화면인지 찾아 헤맬 필요가 없습니다. "모두 읽음"을 누르면 한 번에 정리됩니다.

## 언제 보면 좋나

- 배지 숫자가 안 맞거나 갱신이 느릴 때 (30초 폴링)
- 알림 클릭 후 읽음 처리/화면 이동이 안 될 때
- 로그인 작업자에 따라 종이 보이고/안 보이는 동작을 확인할 때

## 중요한 내용

- `useCurrentOperator()` 로 로그인 작업자를 얻고, `employee_id` 가 없으면 종을 아예 렌더하지 않습니다(`return null`).
- `useNotificationsQuery(employeeId)` — 알림 목록과 안 읽은 개수를 받아옵니다(쿼리 훅 쪽에서 30초 폴링).
- `useMarkNotificationsReadMutation()` — 알림 읽음 처리. 한 건(`notification_ids: [id]`) 또는 전체(인자 없이) 둘 다 지원.
- `handleItemClick(n)` — 안 읽음이면 그 한 건만 읽음 처리하고, `n.target_tab` 이 있으면 `onNavigate(tab, section)` 으로 화면 이동.
- `handleMarkAll()` — "모두 읽음".
- 안 읽은 개수(`unread`)가 있으면 종이 `statusFlash` 애니메이션으로 깜빡이고, 99 초과는 "99+"로 표기.
- 패널 바깥을 클릭하면 닫히도록 `mousedown` 으로 바깥 클릭을 감지합니다.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/notifications/NotificationPanel.tsx]] — 종을 눌렀을 때 뜨는 목록 드롭다운.
- [[ERP/frontend/app/legacy/_components/DesktopTopbar.tsx]] — 이 종을 상단 바에 배치하고 `onNavigate` 를 넘겨 줍니다.

## 조심할 점

- 알림은 실시간이 아니라 30초 폴링입니다. 방금 생긴 알림이 곧장 안 뜰 수 있습니다.
- 화면 이동은 알림 데이터의 `target_tab`/`target_section` 값에 달려 있습니다. 이동이 이상하면 알림을 만든 서버 쪽 값부터 확인하세요.

## 핵심 발췌

```tsx
function handleItemClick(n: AppNotification) {
  if (employeeId && !n.is_read) {
    markRead.mutate({ recipient_employee_id: employeeId, notification_ids: [n.notification_id] });
  }
  setOpen(false);
  if (n.target_tab) onNavigate?.(n.target_tab, n.target_section ?? null);
}
```
