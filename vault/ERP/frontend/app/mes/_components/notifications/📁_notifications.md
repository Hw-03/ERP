# 📁 notifications

## 이 폴더는 뭐예요?

결재 알림 UI입니다. 상단 바의 알림 벨 아이콘과 알림 목록 패널이 여기 있습니다.

## 주요 파일

- `NotificationBell.tsx` — 상단 바 알림 벨 (읽지 않은 수 배지)
- `NotificationPanel.tsx` — 알림 목록 슬라이드 패널

## 언제 여기를 보나요?

- 결재 알림이 뜨지 않거나 읽음 처리가 이상할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/routers/notifications.py.md]] — 알림 API
- [[ERP/backend/app/services/notifications.py.md]] — 알림 발송 서비스
- [[ERP/frontend/lib/queries/useNotificationsQuery.ts.md]] — 알림 React Query 훅
