"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Package, Recycle } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import {
  INTERNAL_USE_BOM_MODE_LABEL,
} from "../_warehouse_v2/internalUseBom";
import {
  getInternalUseHistoryLineEffectLabel,
  getHistoryBomParentLine,
  getDisplayBundles,
  getHistoryLineExecutionLog,
  isManualOnlyProductionBatch,
} from "./historyBatchInterpreter";
import {
  HISTORY_CELL_TRANSITION,
  HISTORY_CHILD_CELL_CLASS,
  HISTORY_CHILD_ROW_CLASS,
  HISTORY_TABLE_OPERATION_PILL_CLASS,
  InternalUseEffectBadge,
  ItemCodeCell,
  StockSnapshotCell,
} from "./historyTableHelpers";

type Props = {
  batchId: string;
  colSpan: number;
  /** 부모에서 캐시를 관리해 중복 요청을 방지. */
  cache: Map<string, IoBatch>;
  onCached: (batchId: string, batch: IoBatch) => void;
  /** 우측 패널 열림 — 일시/구분 셀 좌우 패딩 압축. */
  compact?: boolean;
  highlightItemId?: string | null;
  controlsId?: string;
  /** 같은 operation_batch의 실제 거래 로그. BOM 줄별 스냅샷 표시용. */
  logs?: TransactionLog[];
  /** 작업 묶음 전체에 맞춘 재고 수량 표기 폭. */
  snapshotQuantityWidth?: number;
};

export function BomBatchDetail({ batchId, colSpan, cache, onCached, compact, highlightItemId, controlsId, logs = [], snapshotQuantityWidth }: Props) {
  const realtimeRevision = useRealtimeRevision();
  const [batch, setBatch] = useState<IoBatch | null>(cache.get(batchId) ?? null);
  const [loading, setLoading] = useState(!cache.has(batchId));
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const batchRevisionRef = useRef(realtimeRevision);

  useEffect(() => {
    const revisionChanged = batchRevisionRef.current !== realtimeRevision;
    batchRevisionRef.current = realtimeRevision;
    if (cache.has(batchId) && !revisionChanged) {
      setBatch(cache.get(batchId)!);
      setLoading(false);
      return;
    }
    const background = revisionChanged && batch?.batch_id === batchId;
    if (!background) {
      setBatch(null);
      setLoading(true);
    }
    let cancelled = false;
    const controller = new AbortController();
    void ioApi
      .getBatch(batchId, { signal: controller.signal })
      .then((b) => {
        if (cancelled) return;
        onCached(batchId, b);
        setBatch(b);
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        if (!background) setBatch(null);
      })
      .finally(() => {
        if (!cancelled && !background) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [batchId, realtimeRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!batch || !highlightItemId) return;
    const matchedBundle = batch.bundles.find((bundle) =>
      bundle.lines.some((line) => line.item_id === highlightItemId),
    );
    if (!matchedBundle) return;
    setExpandedBundles((prev) => {
      if (prev.has(matchedBundle.bundle_id)) return prev;
      const next = new Set(prev);
      next.add(matchedBundle.bundle_id);
      return next;
    });
  }, [batch, highlightItemId]);

  function toggleBundle(bundleId: string) {
    setExpandedBundles((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) next.delete(bundleId);
      else next.add(bundleId);
      return next;
    });
  }

  if (loading) {
    return (
      <tr id={controlsId} className={HISTORY_CHILD_ROW_CLASS}>
        <td
          colSpan={colSpan}
          className={`${HISTORY_CHILD_CELL_CLASS} text-center text-xs`}
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          작업 묶음 상세 불러오는 중...
        </td>
      </tr>
    );
  }

  if (!batch || batch.bundles.length === 0) return null;
  const displayBundles = getAdjustmentDisplayBundles(batch).filter((bundle) =>
    bundle.lines.some((line) => line.included),
  );

  return (
    <>
      {displayBundles.map((bundle, index) => (
        <BundleRows
          key={bundle.bundle_id}
          bundle={bundle}
          batch={batch}
          expanded={expandedBundles.has(bundle.bundle_id)}
          onToggle={() => toggleBundle(bundle.bundle_id)}
          compact={compact}
          highlightItemId={highlightItemId}
          rowId={index === 0 ? controlsId : undefined}
          logs={logs}
          snapshotQuantityWidth={snapshotQuantityWidth}
        />
      ))}
    </>
  );
}

function getAdjustmentDisplayBundles(batch: IoBatch): IoBundle[] {
  const bundles = getDisplayBundles(batch);
  const isLegacyAdjustmentIn = isManualOnlyProductionBatch(batch);
  const isMultiItemAdjustment = (
    batch.sub_type === "adjust_in"
    || batch.sub_type === "adjust_out"
    || batch.sub_type === "warehouse_adjust_in"
    || batch.sub_type === "warehouse_adjust_out"
    || isLegacyAdjustmentIn
  )
    && bundles.length > 1;

  if (!isMultiItemAdjustment) return bundles;

  const lines = bundles.flatMap((bundle) => bundle.lines.map((line) => ({ ...line })));
  return [{
    bundle_id: `history-adjustment-${batch.batch_id}`,
    source_kind: "manual",
    title: batch.sub_type === "adjust_in"
      || batch.sub_type === "warehouse_adjust_in"
      || isLegacyAdjustmentIn
      ? "수량보정 입고"
      : batch.sub_type === "warehouse_adjust_out"
        ? "수량보정 출고"
        : "출고",
    source_item_id: null,
    source_mes_code: null,
    quantity: lines.reduce((total, line) => total + Math.abs(line.quantity), 0),
    expanded_level: 1,
    lines,
  }];
}

function StatusBadge({ shortage }: { shortage: number }) {
  if (shortage <= 0) return null;
  const color = LEGACY_COLORS.red;
  const label = `부족 ${formatQty(shortage)}`;
  return (
    <span
      className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold leading-none"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      {label}
    </span>
  );
}

function BundleRows({
  bundle,
  batch,
  expanded,
  onToggle,
  compact,
  highlightItemId,
  rowId,
  logs,
  snapshotQuantityWidth,
}: {
  bundle: IoBundle;
  batch: IoBatch;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
  highlightItemId?: string | null;
  rowId?: string;
  logs: TransactionLog[];
  snapshotQuantityWidth?: number;
}) {
  const padX = compact ? "px-2" : "px-4";
  const cancelled = batch.status === "cancelled";
  const isBomParent = bundle.source_kind === "bom_parent";
  const parentLine = getHistoryBomParentLine(bundle);
  const isAdjustmentSummary = bundle.bundle_id === `history-adjustment-${batch.batch_id}`;
  const parentLog = parentLine
    ? getBomLineSnapshotLog(parentLine, logs, batch)
    : isAdjustmentSummary
      ? null
      : bundle.lines.length === 1
        ? getBomLineSnapshotLog(bundle.lines[0], logs, batch)
        : null;
  const isInternalUseBom = batch.sub_type === "internal_use_out" && isBomParent;
  const parentNotExecuted = !!parentLine && !parentLine.included;
  const childLines = (parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines)
    .filter((line) => isInternalUseBom || line.included);
  const isSingleLineDirect = !isBomParent && childLines.length === 1;
  const singleLineCode = isSingleLineDirect ? childLines[0].mes_code : null;
  const canExpand = isBomParent || (!isSingleLineDirect && childLines.length > 0);

  const shortageCount = childLines.filter((line) => line.included && line.shortage > 0).length;
  const detailId = `history-bom-${encodeURIComponent(bundle.bundle_id).replaceAll("%", "_")}`;
  const displayTitle = isBomParent && (batch.sub_type === "warehouse_to_dept" || batch.sub_type === "dept_to_warehouse")
    ? "이동 구성"
    : bundle.title;
  const internalUseModeLabel = isInternalUseBom && bundle.internal_use_bom_mode
    ? INTERNAL_USE_BOM_MODE_LABEL[bundle.internal_use_bom_mode]
    : null;
  const targetPadX = compact ? "px-2" : "px-4";
  const statusPadX = "px-2";

  return (
    <>
      <tr
        id={rowId}
        data-history-cancelled={cancelled || undefined}
        tabIndex={canExpand ? 0 : undefined}
        aria-label={canExpand ? `${isBomParent ? "BOM 구성" : "라인 구성"} ${displayTitle}` : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? detailId : undefined}
        onClick={canExpand ? onToggle : undefined}
        onKeyDown={canExpand ? (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggle();
        } : undefined}
        className={`${HISTORY_CHILD_ROW_CLASS}${canExpand ? " cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" : ""}`}
        style={{ background: "color-mix(in srgb, var(--c-blue) 5%, transparent)" }}
      >
        <td className={`${HISTORY_CHILD_CELL_CLASS} ${padX}`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
        <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
          <span
            className={`inline-flex h-6 items-center justify-center gap-1 rounded-full text-xs font-bold leading-none ${
              `${HISTORY_TABLE_OPERATION_PILL_CLASS} px-3`
            }`}
            style={{
              background: isBomParent
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
              color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
            }}
          >
            {isBomParent ? <GitBranch className="h-3.5 w-3.5 shrink-0" /> : <Package className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0 truncate">{isBomParent ? "BOM" : "단품"}</span>
          </span>
        </td>
        <td className={`${HISTORY_CHILD_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex min-w-0 items-center gap-1.5">
            {canExpand ? (
              <button
                type="button"
                aria-label={`${isBomParent ? "BOM 구성" : "라인 구성"} ${expanded ? "접기" : "펼치기"}`}
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onToggle();
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] hover:brightness-125"
                style={{ background: "color-mix(in srgb, var(--c-blue) 10%, transparent)" }}
              >
                {expanded
                  ? <ChevronDown className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.blue }} />
                  : <ChevronRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />}
              </button>
            ) : <span aria-hidden className="h-5 w-5 shrink-0" />}
            {isBomParent
              ? <GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
              : <Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
            <TruncatedText
              accessibilityLabel={displayTitle}
              className="line-clamp-2 min-w-0 break-words text-xs font-bold leading-snug"
              style={{ color: LEGACY_COLORS.text }}
            >
              {displayTitle}
            </TruncatedText>
            {internalUseModeLabel && (
              <span
                className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-bold leading-none"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                {internalUseModeLabel}
              </span>
            )}
          </div>
        </td>
        <ItemCodeCell
          code={bundle.source_mes_code ?? singleLineCode}
          compact={compact}
          dense
        />
        <StockSnapshotCell log={parentLog} dense quantityWidth={snapshotQuantityWidth} />
        <td className={`${HISTORY_CHILD_CELL_CLASS} ${statusPadX} text-center`} style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex flex-wrap justify-center gap-1">
            {shortageCount > 0 && <StatusBadge shortage={shortageCount} />}
            {shortageCount === 0 && (
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
            )}
          </div>
        </td>
      </tr>

      {canExpand && expanded && childLines.map((line, index) => (
        <BomLineRow
          key={line.line_id}
          line={line}
          batch={batch}
          bundle={bundle}
          compact={compact}
          highlightItemId={highlightItemId}
          rowId={index === 0 ? detailId : undefined}
          log={getBomLineSnapshotLog(line, logs, batch)}
          snapshotQuantityWidth={snapshotQuantityWidth}
        />
      ))}
    </>
  );
}

function BomLineRow({
  line,
  batch,
  bundle,
  compact,
  highlightItemId,
  rowId,
  log,
  snapshotQuantityWidth,
}: {
  line: IoLine;
  batch: IoBatch;
  bundle: IoBundle;
  compact?: boolean;
  highlightItemId?: string | null;
  rowId?: string;
  log: TransactionLog | null;
  snapshotQuantityWidth?: number;
}) {
  const padX = compact ? "px-2" : "px-4";
  const targetPadX = compact ? "px-2" : "px-4";
  const statusPadX = "px-2";
  const cancelled = batch.status === "cancelled";
  const highlighted = highlightItemId === line.item_id;
  const internalUseEffect = batch.sub_type === "internal_use_out" && bundle.source_kind === "bom_parent"
    ? getInternalUseHistoryLineEffectLabel(line, batch)
    : null;
  return (
    <tr
      id={rowId}
      data-history-cancelled={cancelled || undefined}
      className={HISTORY_CHILD_ROW_CLASS}
      data-history-focus-line={highlighted ? "true" : undefined}
      style={{
        background: highlighted
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
          : "color-mix(in srgb, var(--c-blue) 3%, transparent)",
        boxShadow: highlighted ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
      }}
    >
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${padX}`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <LineKindBadge line={line} compact={compact} />
      </td>
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-5 w-5 shrink-0" />
          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <TruncatedText
            accessibilityLabel={line.item_name}
            className="truncate text-xs font-semibold leading-snug"
            style={{ color: LEGACY_COLORS.text }}
          >
            {line.item_name}
          </TruncatedText>
        </div>
      </td>
      <ItemCodeCell
        code={line.mes_code}
        compact={compact}
        dense
      />
      <StockSnapshotCell log={log} dense quantityWidth={snapshotQuantityWidth} />
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex flex-wrap justify-center gap-1">
          {internalUseEffect && <InternalUseEffectBadge label={internalUseEffect} />}
          <StatusBadge shortage={line.shortage} />
        </div>
      </td>
    </tr>
  );
}

function getBomLineSnapshotLog(line: IoLine, logs: TransactionLog[], batch: IoBatch): TransactionLog | null {
  const exactMatches = logs.filter((log) => log.operation_line_id === line.line_id);
  if (exactMatches.length === 1) return exactMatches[0];

  const matchingLines = batch.bundles
    .flatMap((bundle) => bundle.lines)
    .filter((candidate) => candidate.item_id === line.item_id);
  if (matchingLines.length !== 1) return null;

  const legacyMatches = logs.filter(
    (log) => log.item_id === line.item_id
      && (log.operation_line_id === null || log.operation_line_id === undefined),
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

function LineKindBadge({ line, compact }: { line: IoLine; compact?: boolean }) {
  const isAuto = line.origin === "bom_auto" || line.origin === "package_auto";
  const color = isAuto ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2;
  return (
    <span
      className={`inline-flex h-6 items-center justify-center gap-1 rounded-full text-xs font-bold leading-none ${
        `${HISTORY_TABLE_OPERATION_PILL_CLASS} px-3`
      }`}
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: `color-mix(in srgb, ${color} 48%, ${LEGACY_COLORS.text})`,
      }}
    >
      {isAuto ? <Recycle className="h-3.5 w-3.5 shrink-0" /> : <Package className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{isAuto ? "자동차감" : "수동"}</span>
    </span>
  );
}
