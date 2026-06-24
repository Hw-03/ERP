# 알림 삭제 기능 설계

**날짜:** 2026-06-25  
**요청자:** 권동환  
**상태:** 승인됨

---

## 요구사항

- 알림 항목별 개별 삭제 (X 버튼)
- 읽은 알림 전체 삭제 버튼
- 삭제는 하드 삭제 (DB에서 즉시 제거, 복구 없음)
- 전체 삭제 대상: 읽은 알림만 (미읽은 알림은 유지)

---

## 백엔드

### 신규 엔드포인트 (`backend/app/routers/notifications.py`)

#### `DELETE /api/notifications/{notification_id}`
- 쿼리 파라미터: `recipient_employee_id` (소유 확인용)
- 본인 소유 알림인지 확인 후 하드 삭제
- 응답: 204 No Content

#### `DELETE /api/notifications/read`
- 쿼리 파라미터: `recipient_employee_id`
- `is_read=True` 인 해당 직원 알림 전부 삭제
- 응답: 204 No Content

> OpenAPI baseline 재생성 필요 (`_dev/baselines/openapi.json`)

---

## 프론트엔드

### API 레이어 (`frontend/lib/api/notifications.ts`)
- `deleteNotification(notificationId, employeeId)` — DELETE 개별
- `deleteReadNotifications(employeeId)` — DELETE 읽은 것 전체

### React Query 훅 (`frontend/lib/queries/useNotificationsQuery.ts`)
- `useDeleteNotificationMutation()` — 성공 시 notifications 캐시 무효화
- `useDeleteReadNotificationsMutation()` — 성공 시 notifications 캐시 무효화

### UI (`frontend/app/mes/_components/notifications/NotificationPanel.tsx`)
- 각 알림 항목 우측에 X 버튼 (항상 표시, 소형)
- 패널 상단 "읽은 알림 삭제" 버튼 ("모두 읽음" 옆에 배치)
