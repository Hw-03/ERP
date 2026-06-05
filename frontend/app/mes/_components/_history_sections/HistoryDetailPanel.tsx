"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, ChevronDown, History, Pencil, StickyNote } from "lucide-react";
import { api, type TransactionEditLog, type TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { PROCESS_TYPE_META } from "./historyTheme";
import { formatHistoryDateTimeLong } from "./historyFormat";
import {
  getBatchFlowEndpoints,
  getHistoryActor,
  getHistoryDisplayLabel,
  getHistoryWorkTypeLabel,
  getSingleLogMovement,
  parseTransactionNotes,
} from "./historyBatchInterpreter";
import { FlowBadge, MovementSummaryCell } from "./historyTableHelpers";
import {
  QUANTITY_CORRECTABLE_TYPES,
  TransactionEditUnifiedModal,
} from "./TransactionEditUnifiedModal";
import { HistoryDetailEditHistory } from "./HistoryDetailEditHistory";
import { HistoryDetailRecentLogs } from "./HistoryDetailRecentLogs";

const META_CORRECTABLE = new Set([
  "RECEIVE", "SHIP", "ADJUST",
  "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT",
  "MARK_DEFECTIVE", "SUPPLIER_RETURN",
]);

type Props = {
  selected: TransactionLog | null;
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onLogCorrected: (result: { original: TransactionLog; correction: TransactionLog }) => void;
};

type FlowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; batch: IoBatch }
  | { status: "unavailable" };

export function HistoryDetailPanel({
  selected,
  itemRecentLogs,
  onSelectLog,
  onLogUpdated,
  onLogCorrected,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [edits, setEdits] = useState<TransactionEditLog[]>([]);
  const [editsLoaded, setEditsLoaded] = useState(false);
  const [flow, setFlow] = useState<FlowState>({ status: "idle" });

  useEffect(() => {
    if (!selected) {
      setEdits([]);
      setEditsLoaded(false);
      return;
    }
    setEditsLoaded(false);
    api.getTransactionEdits(selected.log_id)
      .then((data) => {
        setEdits(data);
        setEditsLoaded(true);
      })
      .catch(() => setEditsLoaded(true));
    // selected 객체 전체가 아니라 log_id 만 deps — 같은 로그를 가리키는 새 객체로
    // 교체돼도(목록 갱신 등) 수정이력을 불필요하게 재조회하지 않도록 의도적 최소화.
  }, [selected?.log_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) {
      setFlow({ status: "idle" });
      return;
    }
    if (!selected.operation_batch_id) {
      setFlow({ status: "unavailable" });
      return;
    }
    setFlow({ status: "loading" });
    let cancelled = false;
    void ioApi.getBatch(selected.operation_batch_id)
      .then((b) => {
        if (cancelled) return;
        setFlow({ status: "available", batch: b });
      })
      .catch(() => {
        if (cancelled) return;
        setFlow({ status: "unavailable" });
      });
    return () => { cancelled = true; };
    // log_id / operation_batch_id 필드만 deps — selected 객체 identity 가 바뀌어도
    // 두 ID 가 같으면 배치 흐름을 재요청하지 않도록 의도적 최소화.
  }, [selected?.log_id, selected?.operation_batch_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center" style={{ color: LEGACY_COLORS.muted2 }}>
          <Activity className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <div className="text-base">테이블에서 항목을 클릭하면<br />상세 내용이 표시됩니다</div>
        </div>
      </div>
    );
  }

  const canMetaEdit = META_CORRECTABLE.has(selected.transaction_type);
  const canQtyCorrect = QUANTITY_CORRECTABLE_TYPES.has(selected.transaction_type);
  const editCount = selected.edit_count ?? edits.length;

  return (
    <div className="space-y-4">
      <HistoryDetailHero log={selected} flow={flow} editCount={editCount} />

      <HistoryDetailMemo notes={selected.notes} />

      <HistoryDetailMetaStrip
        log={selected}
        canEdit={canMetaEdit || canQtyCorrect}
        onEditClick={() => setEditOpen(true)}
      />

      {editsLoaded && edits.length > 0 && (
        <Collapsible
          icon={<History className="h-3.5 w-3.5" />}
          title="수정 이력"
          count={edits.length}
        >
          <HistoryDetailEditHistory edits={edits} />
        </Collapsible>
      )}

      <Collapsible
        icon={<Activity className="h-3.5 w-3.5" />}
        title="이 품목의 최근 거래"
        count={itemRecentLogs.length}
      >
        <HistoryDetailRecentLogs itemRecentLogs={itemRecentLogs} onSelectLog={onSelectLog} />
      </Collapsible>

      <TransactionEditUnifiedModal
        open={editOpen}
        log={selected}
        canMetaEdit={canMetaEdit}
        canQtyCorrect={canQtyCorrect}
        onClose={() => setEditOpen(false)}
        onMetaSuccess={(updated) => {
          onLogUpdated(updated);
          api.getTransactionEdits(updated.log_id).then(setEdits).catch(() => {});
        }}
        onQtySuccess={(result) => {
          onLogCorrected(result);
          api.getTransactionEdits(result.original.log_id).then(setEdits).catch(() => {});
        }}
      />
    </div>
  );
}

function HistoryDetailHero({
  log,
  flow,
  editCount,
}: {
  log: TransactionLog;
  flow: FlowState;
  editCount: number;
}) {
  const tcolor = transactionColor(log.transaction_type);
  const movement = getSingleLogMovement(log);
  const heroStyle = {
    background: `color-mix(in srgb, ${tcolor} 5%, ${LEGACY_COLORS.s2})`,
    borderColor: `color-mix(in srgb, ${tcolor} 22%, ${LEGACY_COLORS.border})`,
  };

  const eps = flow.status === "available" ? getBatchFlowEndpoints(flow.batch) : null;
  const workType = flow.status === "available" ? getHistoryWorkTypeLabel(flow.batch.work_type) : null;

  const qBefore = log.quantity_before;
  const qAfter = log.quantity_after;
  const hasStockDelta = qBefore != null || qAfter != null;

  return (
    <div className="rounded-[20px] border p-4 space-y-3" style={heroStyle}>
      {/* 1줄: 정체 + 변동요약 + 수정됨 */}
      <div className="flex flex-wrap items-center gap-2">
        <FlowBadge
          type={log.transaction_type}
          label={getHistoryDisplayLabel(log)}
          color={tcolor}
        />
        <MovementSummaryCell summary={{ parts: [movement] }} />
        {editCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            <History className="h-3 w-3" />
            수정됨 {editCount}
          </span>
        )}
      </div>

      {/* 2줄: 흐름 — available + eps 있을 때만, loading 시 skeleton, unavailable 시 미렌더 */}
      {flow.status === "available" && eps && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className="rounded-full border px-2.5 py-0.5 font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            {eps.from}
          </span>
          {eps.from !== eps.to && (
            <>
              <ArrowRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
              <span
                className="rounded-full border px-2.5 py-0.5 font-bold"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {eps.to}
              </span>
            </>
          )}
          {workType && (
            <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              ({workType})
            </span>
          )}
        </div>
      )}
      {flow.status === "loading" && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          작업 흐름 로딩…
        </div>
      )}

      {/* 3줄: 재고 영향 chip */}
      {hasStockDelta && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className="rounded-[10px] border px-2 py-1"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 25%, transparent)`,
            }}
          >
            <span className="font-bold tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
              처리 전{" "}
            </span>
            <span className="font-black" style={{ color: LEGACY_COLORS.muted2 }}>
              {qBefore != null ? formatQty(qBefore) : "-"}
            </span>
          </span>
          <ArrowRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
          <span
            className="rounded-[10px] border px-2 py-1"
            style={{
              background: `color-mix(in srgb, ${tcolor} 8%, transparent)`,
              borderColor: `color-mix(in srgb, ${tcolor} 30%, transparent)`,
            }}
          >
            <span className="font-bold tracking-wider" style={{ color: tcolor }}>
              처리 후{" "}
            </span>
            <span className="font-black" style={{ color: tcolor }}>
              {qAfter != null ? formatQty(qAfter) : "-"}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function HistoryDetailMetaStrip({
  log,
  canEdit,
  onEditClick,
}: {
  log: TransactionLog;
  canEdit: boolean;
  onEditClick: () => void;
}) {
  const processMeta = PROCESS_TYPE_META[log.item_process_type_code ?? ""];
  const reqName = getHistoryActor(log);
  // 승인자: 백엔드가 stock_request 있으면 그 approved_by_name, 없으면 요청자 자신.
  const approverName = log.approver_name ?? reqName;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border px-4 py-3"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex flex-wrap items-center gap-x-2">
          {processMeta && (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, ${processMeta.color} 16%, transparent)`,
                color: processMeta.color,
              }}
            >
              {processMeta.label}
            </span>
          )}
          <span style={{ color: LEGACY_COLORS.muted2 }}>
            {log.mes_code ?? "-"}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          <span>{formatHistoryDateTimeLong(log.created_at)}</span>
          <span>
            요청자{" "}
            <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>{reqName}</span>
          </span>
          <span>
            승인자{" "}
            <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>{approverName}</span>
          </span>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={onEditClick}
          className="inline-flex items-center gap-1 rounded-[12px] border px-3 py-1.5 text-xs font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
        >
          <Pencil className="h-3.5 w-3.5" />
          정정
        </button>
      )}
    </div>
  );
}

/**
 * 메모 섹션 — 사용자가 직접 입력한 메모만 노출. 시스템 자동 생성 노트
 * (요청 승인 처리, [dept_adj], [격리] 등)는 parseTransactionNotes 가 걸러냄.
 * HistoryBatchDetailPanel 에서도 재사용.
 */
export function HistoryDetailMemo({ notes }: { notes: string | null | undefined }) {
  const { userMemo } = parseTransactionNotes(notes);
  if (!userMemo) return null;
  return (
    <div
      className="rounded-[20px] border p-4"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, ${LEGACY_COLORS.s2})`,
        borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 22%, ${LEGACY_COLORS.border})`,
      }}
    >
      <div
        className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide"
        style={{ color: LEGACY_COLORS.blue }}
      >
        <StickyNote className="h-3.5 w-3.5" />
        메모
      </div>
      <div
        className="whitespace-pre-wrap break-words text-sm leading-relaxed"
        style={{ color: LEGACY_COLORS.text }}
      >
        {userMemo}
      </div>
    </div>
  );
}

function Collapsible({
  icon,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-[20px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {icon}
          {title}
          <span style={{ color: LEGACY_COLORS.text }}>({count})</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: LEGACY_COLORS.muted2 }}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
