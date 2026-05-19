"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, History, Pencil, Workflow } from "lucide-react";
import { api, type TransactionEditLog, type TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { PROCESS_TYPE_META } from "./historyTheme";
import { formatHistoryDateTimeLong, parseUtc } from "./historyFormat";
import {
  getBatchFlowEndpoints,
  getHistoryDisplayLabel,
  getHistoryWorkTypeLabel,
} from "./historyBatchInterpreter";
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
  | { status: "unavailable"; reason: "no_batch_id" | "fetch_failed" };

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

  // 선택 거래가 바뀌면 수정 이력 로드
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
  }, [selected?.log_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택 거래가 바뀌면 흐름(IoBatch) lazy fetch
  useEffect(() => {
    if (!selected) {
      setFlow({ status: "idle" });
      return;
    }
    if (!selected.operation_batch_id) {
      setFlow({ status: "unavailable", reason: "no_batch_id" });
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
        setFlow({ status: "unavailable", reason: "fetch_failed" });
      });
    return () => { cancelled = true; };
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

  const tcolor = transactionColor(selected.transaction_type);
  const canMetaEdit = META_CORRECTABLE.has(selected.transaction_type);
  const canQtyCorrect = QUANTITY_CORRECTABLE_TYPES.has(selected.transaction_type);
  const editCount = selected.edit_count ?? edits.length;

  return (
    <div className="space-y-4">
      {/* 거래 유형 + 수량 강조 */}
      <div
        className="rounded-[24px] border p-5 text-center"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className="inline-flex rounded-full px-4 py-1.5 text-sm font-bold"
            style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
          >
            {getHistoryDisplayLabel(selected)}
          </span>
          {editCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
                color: LEGACY_COLORS.yellow,
              }}
            >
              <History className="h-3 w-3" />
              수정됨 ({editCount})
            </span>
          )}
        </div>
        <div className="mt-3 text-4xl font-black" style={{ color: tcolor }}>
          {selected.transfer_qty != null
            ? `이동 ${formatQty(selected.transfer_qty)}`
            : `${Number(selected.quantity_change) >= 0 ? "+" : ""}${formatQty(selected.quantity_change)}`}
          <span className="ml-2 text-base font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
            {selected.item_unit}
          </span>
        </div>
        {(selected.quantity_before != null || selected.quantity_after != null) && (
          <div className="mt-3 flex items-center gap-2">
            <div
              className="flex-1 rounded-[14px] border px-3 py-2 text-center"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 25%, transparent)`,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
                처리 전
              </div>
              <div className="mt-1 text-lg font-black" style={{ color: LEGACY_COLORS.muted2 }}>
                {selected.quantity_before != null ? formatQty(selected.quantity_before) : "-"}
              </div>
            </div>
            <span className="text-lg" style={{ color: LEGACY_COLORS.muted2 }}>→</span>
            <div
              className="flex-1 rounded-[14px] border px-3 py-2 text-center"
              style={{
                background: `color-mix(in srgb, ${tcolor} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${tcolor} 30%, transparent)`,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tcolor }}>
                처리 후
              </div>
              <div className="mt-1 text-lg font-black" style={{ color: tcolor }}>
                {selected.quantity_after != null ? formatQty(selected.quantity_after) : "-"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 흐름 카드 */}
      <FlowCard flow={flow} log={selected} />

      {/* 상세 정보 — 식별 헤더 1줄(품목·구분·일시, 목록 중복은 여기로 압축) + 목록에 없는 항목만 */}
      <div
        className="space-y-2.5 rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b pb-2.5 text-sm font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          <span className="truncate">{selected.item_name}</span>
          <span style={{ color: LEGACY_COLORS.muted2 }}>·</span>
          <span style={{ color: LEGACY_COLORS.muted2 }}>{getHistoryDisplayLabel(selected)}</span>
          <span style={{ color: LEGACY_COLORS.muted2 }}>·</span>
          <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
            {formatHistoryDateTimeLong(selected.created_at)}
          </span>
        </div>
        {(
          [
            ["품목 코드", selected.erp_code ?? "-"],
            ["분류", (PROCESS_TYPE_META[selected.item_process_type_code ?? ""] ?? { label: selected.item_process_type_code ?? "-" }).label],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {label}
            </span>
            <span className="text-right text-base font-semibold break-all" style={{ color: LEGACY_COLORS.text }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* 정정 — 정보·수량 한 화면(통합 모달) */}
      {(canMetaEdit || canQtyCorrect) && (
        <div className="rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
          <div className="px-4 pt-3 pb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            정정 작업
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => setEditOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-[14px] border px-3 py-2.5 text-sm font-bold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
            >
              <Pencil className="h-3.5 w-3.5" />
              정보 · 수량 정정
            </button>
          </div>
        </div>
      )}

      {editsLoaded && edits.length > 0 && <HistoryDetailEditHistory edits={edits} />}

      <HistoryDetailRecentLogs itemRecentLogs={itemRecentLogs} onSelectLog={onSelectLog} />

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

function FlowCard({ flow, log }: { flow: FlowState; log: TransactionLog }) {
  const baseClass = "rounded-[20px] border p-4";
  const baseStyle = { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border };

  if (flow.status === "loading") {
    return (
      <div className={baseClass} style={baseStyle}>
        <div className="flex items-center gap-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          <Workflow className="h-3.5 w-3.5" />
          흐름 정보 불러오는 중...
        </div>
      </div>
    );
  }

  if (flow.status === "available") {
    const batch = flow.batch;
    const eps = getBatchFlowEndpoints(batch);
    let bundleCount = batch.bundles.length;
    let lineCount = 0, included = 0, excluded = 0;
    for (const b of batch.bundles) {
      lineCount += b.lines.length;
      for (const l of b.lines) {
        if (l.included) included++; else excluded++;
      }
    }
    // helper 가 명확한 흐름을 못 만들면 의도 라벨로.
    const fallbackLabel = !eps ? getHistoryDisplayLabel(log, batch) : null;
    return (
      <div className={baseClass} style={baseStyle}>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
          <Workflow className="h-3.5 w-3.5" />
          작업 흐름
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {eps ? (
            <>
              <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
                {eps.from}
              </span>
              <ArrowRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
              <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
                {eps.to}
              </span>
            </>
          ) : (
            <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              {fallbackLabel}
            </span>
          )}
          <span className="ml-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
({getHistoryWorkTypeLabel(batch.work_type)})
          </span>
        </div>
        <div className="mt-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          총 {bundleCount}개 묶음 / {lineCount}개 라인 · 포함 {included} · 제외 {excluded}
          {batch.requester_name && <> · 요청자 {batch.requester_name}</>}
        </div>
      </div>
    );
  }

  // unavailable
  return (
    <div className={baseClass} style={baseStyle}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
        <Workflow className="h-3.5 w-3.5" />
        작업 흐름
      </div>
      <div className="mt-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
        {getHistoryDisplayLabel(log)}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {flow.status === "unavailable" && flow.reason === "no_batch_id"
          ? "이 거래는 작업 묶음 정보가 없습니다 (단건 거래 또는 레거시 데이터)"
          : "작업 묶음 정보를 불러올 수 없습니다 — 거래 타입 기반 추정"}
      </div>
    </div>
  );
}
