import type { WorkReservationIssue } from "@/lib/api/types/work-reservations";

/** 예약 확인 사유를 직원의 다음 행동으로 안내한다. */
export function reservationIssueMessage(issue: WorkReservationIssue): string {
  switch (issue.code) {
    case "stock_shortage": return "예약할 재고가 부족합니다. 자재와 수량을 확인한 뒤 다시 저장해 주세요.";
    case "inactive_owner": return "담당자가 현재 작업할 수 없는 상태입니다. 관리자에게 담당자 확인을 요청해 주세요.";
    case "unsupported_source": return "자재를 가져올 위치를 확인해야 합니다. 작업 내용을 확인한 뒤 다시 저장해 주세요.";
    case "returned_after_rejection": return "반려 후 다시 저장하여 예약해야 합니다.";
    default: return "작업 내용을 확인해야 자재를 예약할 수 있습니다. 내용을 확인한 뒤 다시 저장해 주세요.";
  }
}
