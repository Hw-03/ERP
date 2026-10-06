/**
 * 결재 알림 도메인 타입 — `@/lib/api/types/notifications`.
 *
 * DOM 전역 `Notification` 과 충돌을 피하려 `AppNotification` 으로 명명.
 */

export type NotificationType =
  | "approval_request"
  | "approval_approved"
  | "approval_rejected"
  | "handover_arrived";

export interface AppNotification {
  notification_id: string;
  recipient_employee_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** 과거 본문 원문을 유지하면서 서버가 보완한 표시 내용. */
  display_body?: string | null;
  /** 검증된 요청 스냅샷으로 만든 입출고 내역 형식의 카드 요약. */
  display_summary?: {
    requester_name: string;
    operation_label: string;
    item_name: string;
    additional_item_count: number;
  } | null;
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
