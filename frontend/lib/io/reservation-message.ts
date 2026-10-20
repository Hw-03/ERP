import type { WorkReservationIssue } from "@/lib/api/types/work-reservations";

/** 과거 작업의 전환 표시도 직원이 이해할 수 있는 안내로 보여준다. */
export function reservationIssueMessage(issue: WorkReservationIssue): string {
  switch (issue.code) {
    case "legacy_unprocessed": return "아직 재고를 예약하지 않은 작업입니다. 다시 저장하면 자재를 확보합니다.";
    case "stock_shortage": return "예약할 재고가 부족합니다. 자재와 수량을 확인한 뒤 다시 저장해 주세요.";
    case "inactive_owner": return "담당자가 현재 작업할 수 없는 상태입니다. 관리자에게 담당자 확인을 요청해 주세요.";
    case "unsupported_source": return "자재를 가져올 위치를 확인해야 합니다. 작업 내용을 확인한 뒤 다시 저장해 주세요.";
    case "returned_after_rejection": return "반려 후 다시 저장하여 예약해야 합니다.";
    default: return "작업 내용을 확인해야 자재를 예약할 수 있습니다. 내용을 확인한 뒤 다시 저장해 주세요.";
  }
}
