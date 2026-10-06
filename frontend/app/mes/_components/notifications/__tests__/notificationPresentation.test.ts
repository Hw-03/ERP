import { describe, expect, it } from "vitest";
import type { AppNotification } from "@/lib/api/types";
import { formatNotificationBody, getNotificationPresentation } from "../notificationPresentation";

function notification(overrides: Partial<AppNotification> & { display_body?: string | null } = {}): AppNotification {
  return {
    notification_id: "n-1", recipient_employee_id: "e-1", type: "approval_request",
    title: "새 결재 요청", body: "김영희 · warehouse_to_dept · 볼트 외 2건 · 총 1,200개",
    target_tab: null, target_section: null, related_request_id: null,
    is_read: false, created_at: "2026-07-01T01:00:00Z", ...overrides,
  } as AppNotification;
}

describe("notification presentation", () => {
  it("요청자를 분리하고 원시 작업 코드는 본문에서만 표시명으로 바꾼다", () => {
    expect(getNotificationPresentation(notification())).toEqual({
      title: "새 결재 요청", requester: "김영희",
      detail: "볼트 외 2건 · 총 1,200개",
      itemName: null, additionalItemCount: 0, status: null,
    });
    expect(formatNotificationBody(notification())).toBe("김영희 · 창고 → 부서 · 볼트 외 2건 · 총 1,200개");
  });

  it("알 수 없는 작업 형식은 전체 본문을 유지한다", () => {
    expect(getNotificationPresentation(notification({ body: "창고→고압 · 인수 문서" }))).toEqual({
      title: "새 결재 요청", requester: null, detail: "창고→고압 · 인수 문서",
      itemName: null, additionalItemCount: 0, status: null,
    });
  });

  it("표시 본문을 우선하고 원본 요청번호는 표시하지 않는다", () => {
    const n = notification({
      body: "김영희 · warehouse_to_dept · 볼트 · 총 3개 · REQ-2026-001",
      display_body: "김영희 · 창고 → 부서 · 볼트 · 총 3개",
    });
    expect(getNotificationPresentation(n)).toEqual({
      title: "새 결재 요청", requester: "김영희", detail: "볼트 · 총 3개",
      itemName: null, additionalItemCount: 0, status: null,
    });
    expect(formatNotificationBody(n)).toBe("김영희 · 창고 → 부서 · 볼트 · 총 3개");
  });

  it("서버 요약의 이력 업무명·작성자·대표 품목을 수량 상세 대신 사용한다", () => {
    const n = {
      ...notification(),
      display_summary: { requester_name: "김영희", operation_label: "창고 입출고", item_name: "볼트", additional_item_count: 2 },
    };
    expect(getNotificationPresentation(n)).toEqual({
      title: "창고 입출고", requester: "김영희", itemName: "볼트", additionalItemCount: 2,
      detail: null, status: "결재 요청",
    });
  });

  it("인수인계는 표시 본문이 없어도 내용을 빠뜨리지 않는다", () => {
    const n = notification({ body: "고압→진공 · 인수 문서", title: "새 인수인계 도착" });
    expect(formatNotificationBody(n)).toBe("고압→진공 · 인수 문서");
  });
});
