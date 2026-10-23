import type { JSX } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { WorkDraftMovementSummary } from "@/lib/api/types/work-drafts";
import type { IoBatch, IoSubType } from "@/lib/api/types/io";
import type { TransactionType } from "@/lib/api/types/shared";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { transactionColor } from "@/lib/mes/transaction";
import { getHistoryDisplayTransactionType } from "../_history_sections/historyBatchInterpreter";
import { finalizeHistoryGroupLabel, getHistoryListOperationLabel, getHistoryProcessGroupLabel } from "../_history_sections/historyPresentation";

const DRAFT_TRANSACTION_TYPES: Record<IoSubType, TransactionType> = {
  receive_supplier: "RECEIVE", outbound_supplier: "MATERIAL_OUT",
  tube_receive_supplier: "RECEIVE", tube_outbound_supplier: "MATERIAL_OUT",
  warehouse_to_dept: "TRANSFER_TO_PROD", dept_to_warehouse: "TRANSFER_TO_WH", dept_transfer: "TRANSFER_DEPT",
  produce: "PRODUCE", disassemble: "DISASSEMBLE",
  adjust_in: "ADJUST", adjust_out: "ADJUST", warehouse_adjust_in: "ADJUST", warehouse_adjust_out: "ADJUST",
  defect_quarantine: "MARK_DEFECTIVE", defect_restore: "UNMARK_DEFECTIVE",
  defect_process: "DEFECT_SCRAP", supplier_return: "SUPPLIER_RETURN", internal_use_out: "INTERNAL_USE",
};

/** 저장된 예정 방향을 우선하여 완료 내역과 같은 공정 분류를 선택한다. */
export function getIoDraftTransactionType(draft: IoBatch): TransactionType {
  const displayType = getHistoryDisplayTransactionType({ transaction_type: DRAFT_TRANSACTION_TYPES[draft.sub_type] }, draft);
  const effects = draft.effective_plan?.effects;
  if (!draft.display_transaction_type && effects && draft.work_type === "process"
      && (draft.sub_type === "produce" || draft.sub_type === "disassemble")) {
    const hasInbound = effects.some((effect) => effect.kind === "in");
    const hasOutbound = effects.some((effect) => effect.kind === "out");
    if (hasInbound !== hasOutbound) return "ADJUST";
    if (hasInbound && hasOutbound) return draft.sub_type === "disassemble" ? "DISASSEMBLE" : "PRODUCE";
  }
  return displayType;
}

/** 내 작업의 표와 카드에 완료 내역의 거래 색상을 적용한다. */
export function getIoDraftOperationColor(draft: IoBatch): string {
  return transactionColor(getIoDraftTransactionType(draft));
}

/** 메뉴 이름 대신 완료 내역의 대표 작업명을 사용하며 사용 출고의 목적 부서를 보존한다. */
export function getIoDraftOperationLabel(draft: IoBatch): string {
  const displayType = getIoDraftTransactionType(draft);
  const line = draft.bundles.flatMap((bundle) => bundle.lines).find((candidate) => candidate.included);
  const label = (draft.work_type === "process" ? getHistoryProcessGroupLabel(displayType) : null)
    ?? getHistoryListOperationLabel({ transaction_type: displayType,
      department: draft.to_department ?? line?.to_department ?? draft.from_department,
      reference_no: draft.reference_no, notes: draft.notes }, draft);
  return finalizeHistoryGroupLabel(label, displayType);
}

const KST_SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export const WORK_TIMESTAMP_CLASS = "whitespace-nowrap px-2 py-2 text-center text-xs font-semibold tabular-nums";
export const WORK_ITEM_CODE_CLASS = "px-3 py-2 text-center font-mono text-xs font-semibold";
export const WORK_TYPE_BADGE_CLASS = "!w-40 justify-center";

/** 두 작업 표에서 같은 한국 시간 표기를 사용한다. */
export function formatWorkTimestamp(value: string): string {
  const date = new Date(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(KST_SHORT_FORMATTER.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** 행 클릭과 중복 실행되지 않는 공통 펼침 버튼. */
export function WorkExpandButton({ expanded, controlsId, label = "작업 상세", onToggle }: {
  expanded: boolean; controlsId: string; label?: string; onToggle: () => void;
}): JSX.Element {
  return <button type="button" aria-label={`${label} ${expanded ? "접기" : "펼치기"}`} aria-expanded={expanded} aria-controls={controlsId}
    onClick={(event) => { event.stopPropagation(); onToggle(); }}
    className="flex h-11 w-11 items-center justify-center rounded-[10px] font-normal transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
    style={{ color: expanded ? C.blue : C.muted2 }}>
    {expanded ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
  </button>;
}

/** 수량을 합산하지 않고 저장 계획의 변동 종수만 표시한다. null은 미확인이다. */
export function WorkMovementSummary({ counts, shortageCount = 0 }: {
  counts: WorkDraftMovementSummary | null; shortageCount?: number;
}): JSX.Element {
  const items = counts ? [
    { count: counts.decrease, label: "감소", color: C.red },
    { count: counts.increase, label: "증가", color: C.green },
    { count: counts.move, label: "이동", color: C.blue },
  ].filter((item) => item.count > 0) : [];
  return <div className="flex flex-wrap items-center justify-center gap-1.5 lg:flex-nowrap">
    {items.length === 0 && <span style={{ color: C.muted2 }}>{counts ? "변동 없음" : "예정 확인 필요"}</span>}
    {items.map((item) => <span key={item.label} className="inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold" style={{ background: tint(item.color, 12), color: item.color }}>{item.label} {item.count}종</span>)}
    {shortageCount > 0 && <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-bold" style={{ background: tint(C.red, 12), color: C.red }}><AlertTriangle className="h-4 w-4" aria-hidden /> 부족 {shortageCount}종</span>}
  </div>;
}
