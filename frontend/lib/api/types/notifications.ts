/**
 * 결재 알림 도메인 타입 — `@/lib/api/types/notifications`.
 *
 * DOM 전역 `Notification` 과 충돌을 피하려 `AppNotification` 으로 명명.
 */

export type NotificationType =
  | "approval_request"
  | "approval_approved"
  | "approval_rejected";

export interface AppNotification {
  notification_id: string;
  recipient_employee_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  target_tab: string | null;
  target_section: string | null;
  related_request_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  unread_count: number;
}

export interface NotificationMarkReadPayload {
  recipient_employee_id: string;
  /** 없으면 안 읽은 알림 전체를 읽음 처리. */
  notification_ids?: string[];
}
