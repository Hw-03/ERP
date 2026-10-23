import { useState } from "react";
import type { IoBatch } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { reservationIssueMessage } from "@/lib/io/reservation-message";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { Button } from "@/lib/ui/Button";
import { StatusPill } from "../common/StatusPill";
import { stocktakePauseLabel } from "../common/StocktakePauseNotice";

export function reservationStatusLabel(batch: IoBatch | null | undefined): string {
  if (batch?.stocktake_pause) return stocktakePauseLabel(batch.stocktake_pause);
  switch (batch?.reservation_status) {
    case "reserved": return batchStatusLabel(batch.status);
    case "not_required": return batchStatusLabel(batch.status);
    case "inactive": return batch.status === "cancelled" ? "예약 해제"
      : batch.status === "rejected" || batch.reservation_issue?.code === "returned_after_rejection" ? "반려됨"
      : batchStatusLabel(batch.status);
    default: return "예약 상태 확인 필요";
  }
}

function batchStatusLabel(status: IoBatch["status"]): string {
  const labels: Record<IoBatch["status"], string> = {
    draft: "작업 중", submitted: "승인 대기", reserved: "승인 대기", completed: "완료",
    partially_completed: "일부 완료", rejected: "반려", cancelled: "취소", failed: "처리 실패",
  };
  return labels[status];
}

/** 데스크톱과 모바일에서 저장된 예약과 세션의 미저장 변경을 구분한다. */
export function WorkReservationNotice({ batch, latestBatch, onReturn, busy = false }: {
  batch?: IoBatch | null;
  latestBatch?: IoBatch | null;
  onReturn?: (() => void) | null;
  busy?: boolean;
}) {
  const [confirmReturn, setConfirmReturn] = useState(false);
  if (!batch && !latestBatch && !onReturn) return null;
  const currentBatch = latestBatch ?? batch;
  return <>
    <div className="shrink-0 space-y-3 rounded-[20px] border px-4 py-3 text-sm leading-6" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}>
      {currentBatch && <div><p className="flex flex-wrap items-center gap-x-2 gap-y-1"><StatusPill label={reservationStatusLabel(currentBatch)} tone={currentBatch.reservation_status === "reserved" ? "success" : "neutral"} showDot={false} className="!px-2.5 !py-1" />{!currentBatch.stocktake_pause && currentBatch.reservation_status === "reserved" && <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>자재 예약 완료</span>}{!currentBatch.stocktake_pause && currentBatch.reservation_status === "not_required" && <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>예약 대상 없음</span>}</p>{currentBatch.status === "draft" && !currentBatch.stocktake_pause && <p className="mt-1" style={{ color: LEGACY_COLORS.muted2 }}>변경한 내용은 ‘작업 내용 반영’을 눌러 적용하세요.</p>}</div>}
      {currentBatch?.reservation_issue && <p className="rounded-[12px] px-3 py-2" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg }}>{reservationIssueMessage(currentBatch.reservation_issue)}</p>}
      {latestBatch && <p role="status">현재 상태: {batchStatusLabel(latestBatch.status)}. 입력한 내용은 남아 있습니다. 작업 중 목록에서 최신 상태를 확인해 주세요.</p>}
      {onReturn && <div className={currentBatch ? "border-t pt-3" : ""} style={{ borderColor: LEGACY_COLORS.border }}>
        <p>원래 작업에서 예약한 자재는 유지됩니다. 미저장 변경은 예약되지 않았습니다.</p>
        <p className="mt-2" style={{ color: LEGACY_COLORS.muted2 }}>원래 작업에서 바꾼 내용은 이 화면에만 남아 있습니다. 화면을 떠나기 전에 돌아가서 저장해 주세요.</p>
        <p className="mt-2 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>창고 이동이 승인 대기 중이면 아직 재고가 도착하지 않은 상태입니다. 이동이 끝난 뒤 원래 작업을 다시 저장해 주세요.</p>
        <Button variant="secondary" disabled={busy} className="mt-3 min-h-11 rounded-[12px] px-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]" style={{ borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.blue }} onClick={() => setConfirmReturn(true)}>원작업으로 돌아가기</Button>
      </div>}
    </div>
    <ConfirmModal open={confirmReturn} title="원작업으로 돌아가기" confirmLabel="돌아가기" busy={busy} onClose={() => setConfirmReturn(false)} onConfirm={() => { if (busy) return; setConfirmReturn(false); onReturn?.(); }}>
      지금 작성 중인 창고 작업에서 저장하지 않은 내용은 사라집니다. 저장하거나 제출한 창고 작업과 원래 작업의 자재 예약은 유지됩니다.
    </ConfirmModal>
  </>;
}
