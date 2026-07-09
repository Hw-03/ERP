"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, ChevronDown, History, Package, StickyNote, XCircle } from "lucide-react";
import { api, type TransactionEditLog, type TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { PROCESS_TYPE_META } from "./historyTheme";
import { formatHistoryDateTimeLong } from "./historyFormat";
import {
  getHistoryActor,
  getHistoryWorkTypeLabel,
  parseTransactionNotes,
} from "./historyBatchInterpreter";
import {
  FlowBadge,
  FlowSummaryCell,
  MovementSummaryCell,
  PeopleStatusCell,
  QuantityStockCell,
  TargetSummaryBlock,
} from "./historyTableHelpers";
import { HistoryDetailEditHistory } from "./HistoryDetailEditHistory";
import { toInventoryEffectRows, type InventoryEffectCell } from "./historyInventoryEffect";
import { formatDefectReason, getHistoryRowPresentation } from "./historyPresentation";

type Props = {
  selected: TransactionLog | null;
  onSelectLog: (log: TransactionLog) => void;
  onLogUpdated: (updated: TransactionLog) => void;
  variant?: "default" | "desktop";
};

type FlowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; batch: IoBatch }
  | { status: "unavailable" };

type CancelState =
  | { step: "idle" }
  | { step: "confirm" }
  | { step: "submitting" }
  | { step: "error"; message: string };

export function HistoryDetailPanel({
  selected,
  onSelectLog,
  onLogUpdated,
  variant = "default",
}: Props) {
  const operator = useCurrentOperator();
  const [cancelState, setCancelState] = useState<CancelState>({ step: "idle" });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPin, setCancelPin] = useState("");
  const [edits, setEdits] = useState<TransactionEditLog[]>([]);
  const [editsLoaded, setEditsLoaded] = useState(false);
  const [flow, setFlow] = useState<FlowState>({ status: "idle" });

  useEffect(() => {
    if (!selected) {
      setEdits([]);
      setEditsLoaded(false);
      return;
    }
    setEdits([]);
    setEditsLoaded(false);
    let cancelled = false;
    const controller = new AbortController();
    api.getTransactionEdits(selected.log_id, { signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        setEdits(data);
        setEditsLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setEditsLoaded(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
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
    const controller = new AbortController();
    void ioApi.getBatch(selected.operation_batch_id, { signal: controller.signal })
      .then((b) => {
        if (cancelled) return;
        setFlow({ status: "available", batch: b });
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setFlow({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
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

  const editCount = selected.edit_count ?? edits.length;
  const isCancelled = selected.cancelled;

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim() || !cancelPin) return;
    if (!operator?.employee_code) {
      setCancelState({ step: "error", message: "로그인 정보가 없습니다. 다시 로그인해 주세요." });
      return;
    }
    setCancelState({ step: "submitting" });
    try {
      const updated = await api.cancelTransaction(selected.log_id, {
        reason: cancelReason.trim(),
        employee_code: operator.employee_code,
        pin: cancelPin,
      });
      setCancelState({ step: "idle" });
      setCancelReason("");
      setCancelPin("");
      onLogUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "취소 처리 중 오류가 발생했습니다.";
      setCancelState({ step: "error", message: msg });
    }
  };

  return (
    <div className="space-y-4">
      <HistoryDetailHero log={selected} flow={flow} editCount={editCount} />

      {variant === "desktop" && (
        <HistoryDetailDecisionSummary
          log={selected}
          batch={flow.status === "available" ? flow.batch : null}
        />
      )}

      {isCancelled && (
        <div
          className="rounded-[16px] border px-4 py-3 text-sm font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          <XCircle className="mr-1.5 inline h-4 w-4" />
          취소된 거래 — {selected.cancel_reason}
        </div>
      )}

      <HistoryDetailReason log={selected} />

      <HistoryDetailMemo notes={selected.notes} />

      <HistoryInventoryEffectPanel effect={selected.inventory_effect} />

      <HistoryDetailMetaStrip
        log={selected}
        onCancelClick={() => setCancelState({ step: "confirm" })}
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

      {cancelState.step !== "idle" && !isCancelled && (
        <div
          className="rounded-[20px] border p-4 space-y-3"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.text }}>
            취소 범위 확인
          </div>
          <div className="rounded-[12px] border px-3 py-2 text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}>
            {selected.operation_batch_id ? "이 작업 묶음에 포함된 재고 변동을 함께 취소합니다." : "선택한 이력 1건의 재고 변동만 취소합니다."}
          </div>
          <textarea
            className="w-full rounded-[12px] border px-3 py-2 text-[13px] resize-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            rows={2}
            placeholder="취소 사유를 입력하세요 (필수)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-[12px] border px-3 py-2 text-[13px]"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            placeholder="PIN 입력"
            value={cancelPin}
            onChange={(e) => setCancelPin(e.target.value)}
          />
          {cancelState.step === "error" && (
            <div className="text-[12px]" style={{ color: LEGACY_COLORS.red }}>{cancelState.message}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelSubmit}
              disabled={cancelState.step === "submitting" || !cancelReason.trim() || !cancelPin}
              className="flex-1 rounded-[12px] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: LEGACY_COLORS.red }}
            >
              {cancelState.step === "submitting" ? "처리 중…" : "범위 확인 후 취소"}
            </button>
            <button
              type="button"
              onClick={() => { setCancelState({ step: "idle" }); setCancelReason(""); setCancelPin(""); }}
              className="rounded-[12px] border px-3 py-2 text-[13px] font-bold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryDetailDecisionSummary({
  log,
  batch,
}: {
  log: TransactionLog;
  batch: IoBatch | null;
}) {
  const presentation = getHistoryRowPresentation(log, batch ?? undefined);
  return (
    <div className="grid gap-2 rounded-[20px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <TargetSummaryBlock
        presentation={presentation}
        icon={<Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
      />
      <div className="grid gap-2 xl:grid-cols-2">
        <div className="rounded-[14px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>흐름</div>
          <FlowSummaryCell presentation={presentation} />
        </div>
        <div className="rounded-[14px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>수량 · 재고</div>
          <QuantityStockCell presentation={presentation} />
        </div>
      </div>
      <div className="rounded-[14px] border px-3 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <PeopleStatusCell presentation={presentation} />
      </div>
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
  const batch = flow.status === "available" ? flow.batch : null;
  const presentation = getHistoryRowPresentation(log, batch ?? undefined);
  const heroStyle = {
    background: `color-mix(in srgb, ${tcolor} 5%, ${LEGACY_COLORS.s2})`,
    borderColor: `color-mix(in srgb, ${tcolor} 22%, ${LEGACY_COLORS.border})`,
  };

  const workType = flow.status === "available" ? getHistoryWorkTypeLabel(flow.batch.work_type) : null;

  const qBefore = log.quantity_before;
  const qAfter = log.quantity_after;
  const isTransfer = ["TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT"].includes(log.transaction_type);
  const hasWqSplit = isTransfer && log.warehouse_qty_before != null && log.warehouse_qty_after != null;
  const hasStockDelta = !isTransfer && (qBefore != null || qAfter != null);

  return (
    <div className="rounded-[20px] border p-4 space-y-3" style={heroStyle}>
      {/* 1줄: 정체 + 변동요약 + 수정됨 */}
      <div className="flex flex-wrap items-center gap-2">
        <FlowBadge
          type={log.transaction_type}
          label={presentation.operation.label}
          color={tcolor}
        />
        <MovementSummaryCell summary={presentation.movement} />
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
      {presentation.flow.label && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className="rounded-full border px-2.5 py-0.5 font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            {presentation.flow.from ?? presentation.flow.label}
          </span>
          {presentation.flow.from && presentation.flow.to && presentation.flow.from !== presentation.flow.to && (
            <>
              <ArrowRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
              <span
                className="rounded-full border px-2.5 py-0.5 font-bold"
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {presentation.flow.to}
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
      {hasWqSplit && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StockSplitChip
            label="창고"
            before={log.warehouse_qty_before!}
            after={log.warehouse_qty_after!}
            color={LEGACY_COLORS.muted2}
          />
          <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>·</span>
          <StockSplitChip
            label="부서"
            before={(qBefore ?? 0) - log.warehouse_qty_before!}
            after={(qAfter ?? 0) - log.warehouse_qty_after!}
            color={tcolor}
          />
        </div>
      )}
      {!hasWqSplit && hasStockDelta && (
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
      {presentation.stock && (
        <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          처리 후 기준 재고 · {presentation.stock.label}
        </div>
      )}
    </div>
  );
}

function HistoryDetailMetaStrip({
  log,
  onCancelClick,
}: {
  log: TransactionLog;
  onCancelClick: () => void;
}) {
  const processMeta = PROCESS_TYPE_META[log.item_process_type_code ?? ""];
  const reqName = getHistoryActor(log);
  const rawApproverName = (log.approver_name ?? "").trim();
  const approverName = rawApproverName && rawApproverName !== reqName ? rawApproverName : null;
  const cancelScopeLabel = log.operation_batch_id ? "작업 묶음 전체 취소" : "이 이력 1건 취소";

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
          <span>
            요청자{" "}
            <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>{reqName}</span>
            {" "}
            {formatHistoryDateTimeLong(log.requested_at ?? log.created_at)}
          </span>
          {approverName && (
            <span>
              승인자{" "}
              <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>{approverName}</span>
              {" "}
              {formatHistoryDateTimeLong(log.approved_at ?? log.created_at)}
            </span>
          )}
        </div>
      </div>
      {!log.cancelled && (
        <button
          onClick={onCancelClick}
          className="inline-flex items-center gap-1 rounded-[12px] border px-3 py-1.5 text-xs font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.red }}
        >
          <XCircle className="h-3.5 w-3.5" />
          {cancelScopeLabel}
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

function HistoryDetailReason({ log }: { log: TransactionLog }) {
  const reason = formatDefectReason(log);
  if (!reason) return null;
  return (
    <div className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="mb-2 text-xs font-bold" style={{ color: LEGACY_COLORS.yellow }}>사유</div>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: LEGACY_COLORS.text }}>
        {reason}
      </div>
    </div>
  );
}
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

function HistoryInventoryEffectPanel({
  effect,
}: {
  effect: InventoryEffectCell[] | null | undefined;
}) {
  const rows = toInventoryEffectRows(effect);
  if (rows.length === 0) return null;

  return (
    <Collapsible
      icon={<Activity className="h-3.5 w-3.5" />}
      title="재고 영향"
      count={rows.length}
      defaultOpen
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => {
          const isIncrease = row.delta > 0;
          const color = isIncrease ? LEGACY_COLORS.green : LEGACY_COLORS.red;
          return (
            <div
              key={row.key}
              className="flex items-center justify-between rounded-[12px] border px-3 py-2 text-xs"
              style={{
                background: `color-mix(in srgb, ${color} 7%, ${LEGACY_COLORS.s1})`,
                borderColor: `color-mix(in srgb, ${color} 24%, ${LEGACY_COLORS.border})`,
              }}
            >
              <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
                {row.label}
              </span>
              <span className="font-black" style={{ color }}>
                {row.deltaLabel}
              </span>
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}

function StockSplitChip({ label, before, after, color }: { label: string; before: number; after: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[10px] border px-2 py-1" style={{
      background: `color-mix(in srgb, ${color} 8%, transparent)`,
      borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
    }}>
      <span className="text-[10px] font-bold tracking-wide" style={{ color }}>{label}</span>
      <span className="font-black" style={{ color }}>{formatQty(before)}</span>
      <ArrowRight className="h-3 w-3" style={{ color }} />
      <span className="font-black" style={{ color }}>{formatQty(after)}</span>
    </span>
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
        className="flex w-full items-center justify-between border-0 bg-transparent px-4 py-3 shadow-none outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
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
