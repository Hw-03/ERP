"use client";

import { useEffect, useState } from "react";
import { GitBranch, Package } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import {
  describeBatchFlow,
  getBatchFlowEndpoints,
  getHistoryActor,
  getHistoryBomParentLine,
  getHistoryDisplayLabel,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  getHistoryMovementSummary,
  getHistoryWorkTypeLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";
import { formatHistoryDateTimeLong } from "./historyFormat";
import { FlowBadge, MovementSummaryCell } from "./historyTableHelpers";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

type Props = {
  batchId: string;
  logs: TransactionLog[];
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  onSelectLog: (log: TransactionLog) => void;
};

type FetchState =
  | { status: "loading" }
  | { status: "available"; batch: IoBatch }
  | { status: "unavailable" };

/**
 * BOM/op_batch 묶음 조회 전용 우측 상세 패널.
 * 정정/수량 보정 액션 없음 (조회 전용 — kind="log" 분기에서만 노출).
 */
export function HistoryBatchDetailPanel({
  batchId,
  logs,
  batchCache,
  setBatchCache,
  onSelectLog,
}: Props) {
  const cached = batchCache.get(batchId) ?? null;
  const [state, setState] = useState<FetchState>(
    cached ? { status: "available", batch: cached } : { status: "loading" },
  );

  useEffect(() => {
    const hit = batchCache.get(batchId);
    if (hit) {
      setState({ status: "available", batch: hit });
      return;
    }
    setState({ status: "loading" });
    let cancelled = false;
    void ioApi.getBatch(batchId)
      .then((b) => {
        if (cancelled) return;
        setBatchCache((prev) => {
          if (prev.has(batchId)) return prev;
          const m = new Map(prev);
          m.set(batchId, b);
          return m;
        });
        setState({ status: "available", batch: b });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "unavailable" });
      });
    return () => { cancelled = true; };
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = logs[0];
  const batch = state.status === "available" ? state.batch : null;

  const logByItemId = new Map<string, TransactionLog>();
  for (const l of logs) logByItemId.set(l.item_id, l);

  function handleLineClick(line: IoLine) {
    const matched = logByItemId.get(line.item_id);
    if (matched) onSelectLog(matched);
  }

  return (
    <div className="space-y-4">
      <HistoryBatchHero first={first} logs={logs} batch={batch} loading={state.status === "loading"} />

      {batch && batch.bundles.length > 0 && (
        <div
          className="rounded-[20px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: LEGACY_COLORS.muted2 }}>
            <GitBranch className="h-3.5 w-3.5" />
            구성 라인
          </div>
          <div className="flex flex-col gap-3">
            {batch.bundles.map((bundle) => (
              <BundleBlock
                key={bundle.bundle_id}
                bundle={bundle}
                batch={batch}
                onLineClick={handleLineClick}
                isLineClickable={(line) => logByItemId.has(line.item_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryBatchHero({
  first,
  logs,
  batch,
  loading,
}: {
  first: TransactionLog;
  logs: TransactionLog[];
  batch: IoBatch | null;
  loading: boolean;
}) {
  const tcolor = transactionColor(first.transaction_type);
  const heroStyle = {
    background: `color-mix(in srgb, ${tcolor} 5%, ${LEGACY_COLORS.s2})`,
    borderColor: `color-mix(in srgb, ${tcolor} 22%, ${LEGACY_COLORS.border})`,
  };

  const summary = getHistoryMovementSummary(first, batch ?? undefined, logs.length);
  const eps = batch ? getBatchFlowEndpoints(batch) : null;
  const flow = batch ? describeBatchFlow(first, batch) : null;
  const workType = batch ? getHistoryWorkTypeLabel(batch.work_type) : null;

  let lineCount = 0;
  let included = 0;
  let excluded = 0;
  let shortage = 0;
  let bundleCount = 0;
  if (batch) {
    bundleCount = batch.bundles.length;
    for (const b of batch.bundles) {
      const parent = getHistoryBomParentLine(b);
      for (const l of b.lines) {
        if (l === parent) continue;
        lineCount += 1;
        if (l.included) included++; else excluded++;
        if (l.shortage > 0) shortage++;
      }
    }
  }

  const refNo = batch?.reference_no ?? first.reference_no;
  const reqName = batch?.requester_name ?? getHistoryActor(first);
  const procName = first.produced_by ?? null;
  const actorText = procName && procName !== reqName ? `${reqName} · 처리 ${procName}` : reqName;

  return (
    <div className="rounded-[20px] border p-4 space-y-3" style={heroStyle}>
      {/* 1줄: 정체 + 변동요약 + work_type */}
      <div className="flex flex-wrap items-center gap-2">
        <FlowBadge
          type={first.transaction_type}
          label={getHistoryDisplayLabel(first, batch ?? undefined)}
          color={tcolor}
        />
        <MovementSummaryCell summary={summary} />
        {workType && (
          <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            ({workType})
          </span>
        )}
      </div>

      {/* 2줄: 흐름 — endpoints 우선, 없으면 flow.secondary, 둘 다 없으면 미렌더 */}
      {eps ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className="rounded-full border px-2.5 py-0.5 font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            {eps.from}
          </span>
          <span style={{ color: LEGACY_COLORS.muted2 }}>→</span>
          <span
            className="rounded-full border px-2.5 py-0.5 font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            {eps.to}
          </span>
        </div>
      ) : flow?.secondary ? (
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {flow.secondary}
        </div>
      ) : loading ? (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          작업 흐름 로딩…
        </div>
      ) : null}

      {/* 3줄: 라인 카운트 (batch 있을 때만) */}
      {batch && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          총 {bundleCount}묶음 / {lineCount}라인 · 포함 {included} · 제외 {excluded}
          {shortage > 0 && (
            <span style={{ color: LEGACY_COLORS.red }}> · 부족 {shortage}</span>
          )}
        </div>
      )}
      {!batch && !loading && (
        <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 거래 {logs.length}건
        </div>
      )}

      {/* 4줄: 메타 — 일시 · 담당자 · refNo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
        <span>{formatHistoryDateTimeLong(first.created_at)}</span>
        <span>·</span>
        <span>
          담당자{" "}
          <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {actorText}
          </span>
        </span>
        {refNo && (
          <span
            className="rounded-full border px-2 py-0.5"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            Ref {refNo}
          </span>
        )}
      </div>
    </div>
  );
}

function BundleBlock({
  bundle,
  batch,
  onLineClick,
  isLineClickable,
}: {
  bundle: IoBundle;
  batch: IoBatch;
  onLineClick: (line: IoLine) => void;
  isLineClickable: (line: IoLine) => boolean;
}) {
  const isBomParent = bundle.source_kind === "bom_parent";
  const parentLine = getHistoryBomParentLine(bundle);
  const childLines = parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines;
  const headerSigned = parentLine ? getHistoryLineSignedQuantity(parentLine, batch, bundle) : null;
  const headerQtyText = headerSigned ? headerSigned.label : formatQty(bundle.quantity);
  const headerQtyColor = headerSigned ? SIGN_TONE_HEX[headerSigned.tone] : LEGACY_COLORS.muted2;

  return (
    <div className="rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(101,169,255,.05)" }}>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: isBomParent
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
            color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
        >
          {isBomParent ? <GitBranch className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {isBomParent ? "BOM" : "단품"}
        </span>
        <span className="flex-1 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
          {bundle.title}
        </span>
        <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: headerQtyColor }}>
          {headerQtyText}
        </span>
      </div>

      <div>
        {childLines.map((line) => {
          const clickable = isLineClickable(line);
          const dim = !line.included;
          const signed = getHistoryLineSignedQuantity(line, batch, bundle);
          const qtyColor = SIGN_TONE_HEX[signed.tone];
          return (
            <button
              key={line.line_id}
              type="button"
              onClick={() => clickable && onLineClick(line)}
              disabled={!clickable}
              className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left transition-colors disabled:cursor-default enabled:hover:brightness-125"
              style={{
                borderColor: LEGACY_COLORS.border,
                background: line.included
                  ? "transparent"
                  : "rgba(255,100,100,.04)",
                opacity: dim ? 0.6 : 1,
              }}
            >
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
              <span className="flex-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
                {line.item_name}
              </span>
              {line.erp_code && (
                <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {line.erp_code}
                </span>
              )}
              <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: qtyColor }}>
                {signed.label}
              </span>
              <LineStatusBadge included={line.included} shortage={line.shortage} />
              {!clickable && (
                <span
                  className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
                    color: LEGACY_COLORS.muted2,
                  }}
                  title="이 라인에 대응하는 거래 행이 현재 표시 목록에 없습니다."
                >
                  목록 외
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LineStatusBadge({ included, shortage }: { included: boolean; shortage: number }) {
  const status = getHistoryLineStatusLabel({ included, shortage });
  // 포함(ok) 은 기본값이라 chip 노출 안 함 — 부족/제외만 시각 신호.
  if (status.tone === "ok") return null;
  const color = status.tone === "danger" ? LEGACY_COLORS.red : LEGACY_COLORS.muted2;
  const label = status.tone === "danger" ? `부족 ${formatQty(shortage)}` : status.label;
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      {label}
    </span>
  );
}
