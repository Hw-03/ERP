import { REQUEST_TYPE_LABEL } from "@/lib/io/glossary";
import type { AppNotification } from "@/lib/api/types";

export interface NotificationPresentation {
  title: string;
  requester: string | null;
  detail: string | null;
  itemName: string | null;
  additionalItemCount: number;
  status: string | null;
}

const APPROVAL_STATUS: Record<string, string> = {
  approval_request: "결재 요청",
  approval_approved: "승인",
  approval_rejected: "반려",
};

/** Prefer the server's human-readable summary while retaining the legacy body as fallback. */
export function formatNotificationBody(notification: AppNotification): string {
  return (notification.display_body ?? notification.body ?? "")
    .split(" · ")
    .map((token) => REQUEST_TYPE_LABEL[token] ?? token)
    .join(" · ");
}

/** Separate a known request summary into scan-friendly lines without dropping unfamiliar text. */
export function getNotificationPresentation(notification: AppNotification): NotificationPresentation {
  const summary = notification.display_summary;
  if (summary) {
    return {
      title: summary.operation_label,
      requester: summary.requester_name,
      itemName: summary.item_name,
      additionalItemCount: summary.additional_item_count,
      detail: null,
      status: APPROVAL_STATUS[notification.type] ?? null,
    };
  }
  const body = formatNotificationBody(notification);
  const tokens = body.split(" · ");
  const action = tokens[1];
  const isKnownAction = action && (
    Object.prototype.hasOwnProperty.call(REQUEST_TYPE_LABEL, action)
    || Object.values(REQUEST_TYPE_LABEL).includes(action)
    || action === "인수인계"
  );
  const detail = isKnownAction ? tokens.slice(2).join(" · ") : body;
  return {
    title: notification.title,
    requester: isKnownAction ? tokens[0] : null,
    detail: detail || null,
    itemName: null,
    additionalItemCount: 0,
    status: null,
  };
}
