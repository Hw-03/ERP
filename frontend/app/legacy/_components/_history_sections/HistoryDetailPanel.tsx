"use client";

import { useEffect, useState } from "react";
import { Activity, History, Pencil, Wrench } from "lucide-react";
import { api, type TransactionEditLog, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, transactionColor, transactionLabel } from "../legacyUi";
import { PROCESS_TYPE_META, formatHistoryDate, parseUtc } from "./historyShared";
import { TransactionEditModal } from "./TransactionEditModal";
import {
  QUANTITY_CORRECTABLE_TYPES,
  TransactionQuantityCorrectModal,
} from "./TransactionQuantityCorrectModal";

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

export function HistoryDetailPanel({
  selected,
  itemRecentLogs,
  onSelectLog,
  onLogUpdated,
  onLogCorrected,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [edits, setEdits] = useState<TransactionEditLog[]>([]);
  const [editsLoaded, setEditsLoaded] = useState(false);

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
            {transactionLabel(selected.transaction_type)}
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
          {Number(selected.quantity_change) >= 0 ? "+" : ""}
          {formatNumber(selected.quantity_change)}
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
                {selected.quantity_before != null ? formatNumber(selected.quantity_before) : "-"}
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
                {selected.quantity_after != null ? formatNumber(selected.quantity_after) : "-"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 상세 정보 */}
      <div
        className="space-y-2.5 rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {(
          [
            ["품목명", selected.item_name],
            ["품목 코드", selected.erp_code ?? "-"],
            ["분류", (PROCESS_TYPE_META[selected.item_process_type_code ?? ""] ?? { label: selected.item_process_type_code ?? "-" }).label],
            ["단위", selected.item_unit],
            ["담당자", selected.produced_by ?? "-"],
            ["참조번호", selected.reference_no ?? "-"],
            ["메모", selected.notes ?? "-"],
            ["일시", parseUtc(selected.created_at).toLocaleString("ko-KR")],
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

      {/* 수정 / 수량 보정 액션 */}
      {(canMetaEdit || canQtyCorrect) && (
        <div className="grid grid-cols-2 gap-2">
          {canMetaEdit && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-[14px] border px-3 py-2.5 text-sm font-bold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
            >
              <Pencil className="h-3.5 w-3.5" />
              정보 수정
            </button>
          )}
          {canQtyCorrect && (
            <button
              onClick={() => setQtyOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-[14px] border px-3 py-2.5 text-sm font-bold"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
                color: LEGACY_COLORS.yellow,
              }}
            >
              <Wrench className="h-3.5 w-3.5" />
              수량 보정
            </button>
          )}
          {!canQtyCorrect && canMetaEdit && (
            <span
              className="flex items-center justify-center text-xs"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              수량 보정 불가
            </span>
          )}
        </div>
      )}

      {/* 수정 이력 */}
      {editsLoaded && edits.length > 0 && (
        <div
          className="rounded-[24px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
            <History className="h-3.5 w-3.5" />
            수정 이력 ({edits.length})
          </div>
          <div className="space-y-2">
            {edits.map((e) => (
              <div
                key={e.edit_id}
                className="rounded-[12px] border p-3 text-sm"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {e.edited_by_name}
                  </span>
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {parseUtc(e.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  사유: <span style={{ color: LEGACY_COLORS.text }}>{e.reason}</span>
                </div>
                {e.correction_log_id && (
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.yellow }}>
                    수량 보정 거래 생성됨
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 이 품목의 최근 거래 */}
      <div
        className="rounded-[24px] border p-4"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
          이 품목의 최근 거래
        </div>
        {itemRecentLogs.length === 0 ? (
          <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 거래 없음</div>
        ) : (
          <div className="space-y-2">
            {itemRecentLogs.map((log) => (
              <button
                key={log.log_id}
                onClick={() => onSelectLog(log)}
                className="flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-flex rounded px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: `color-mix(in srgb, ${transactionColor(log.transaction_type)} 14%, transparent)`,
                      color: transactionColor(log.transaction_type),
                    }}
                  >
                    {transactionLabel(log.transaction_type)}
                  </span>
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {formatHistoryDate(log.created_at)}
                  </div>
                  {(log.quantity_before != null || log.quantity_after != null) && (
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {log.quantity_before != null ? formatNumber(log.quantity_before) : "-"} →{" "}
                      {log.quantity_after != null ? formatNumber(log.quantity_after) : "-"}
                    </div>
                  )}
                </div>
                <div
                  className="shrink-0 ml-2 text-base font-bold text-right"
                  style={{ color: transactionColor(log.transaction_type) }}
                >
                  {Number(log.quantity_change) >= 0 ? "+" : ""}
                  {formatNumber(log.quantity_change)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <TransactionEditModal
        open={editOpen}
        log={selected}
        onClose={() => setEditOpen(false)}
        onSuccess={(updated) => {
          onLogUpdated(updated);
          // 이력 재로드
          api.getTransactionEdits(updated.log_id).then(setEdits).catch(() => {});
        }}
      />

      <TransactionQuantityCorrectModal
        open={qtyOpen}
        log={selected}
        onClose={() => setQtyOpen(false)}
        onSuccess={(result) => {
          onLogCorrected(result);
          api.getTransactionEdits(result.original.log_id).then(setEdits).catch(() => {});
        }}
      />
    </div>
  );
}
