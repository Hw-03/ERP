"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Package, Recycle } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import {
  getHistoryBomParentLine,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";
import {
  HISTORY_CELL_TRANSITION,
  HISTORY_CHILD_CELL_CLASS,
  HISTORY_CHILD_ROW_CLASS,
  ItemCodeCell,
  SpacerCell,
} from "./historyTableHelpers";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

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
};

export function BomBatchDetail({ batchId, colSpan, cache, onCached, compact, highlightItemId, controlsId }: Props) {
  const [batch, setBatch] = useState<IoBatch | null>(cache.get(batchId) ?? null);
  const [loading, setLoading] = useState(!cache.has(batchId));
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (cache.has(batchId)) {
      setBatch(cache.get(batchId)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void ioApi
      .getBatch(batchId)
      .then((b) => {
        if (cancelled) return;
        onCached(batchId, b);
        setBatch(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <>
      {batch.bundles.map((bundle, index) => (
        <BundleRows
          key={bundle.bundle_id}
          bundle={bundle}
          batch={batch}
          expanded={expandedBundles.has(bundle.bundle_id)}
          onToggle={() => toggleBundle(bundle.bundle_id)}
          compact={compact}
          highlightItemId={highlightItemId}
          rowId={index === 0 ? controlsId : undefined}
        />
      ))}
    </>
  );
}

function StatusBadge({ included, shortage }: { included: boolean; shortage: number }) {
  const status = getHistoryLineStatusLabel({ included, shortage });
  // 포함(ok) 은 기본값이라 chip 노출 안 함 — 부족/제외만 시각 신호.
  if (status.tone === "ok") return null;
  const color = status.tone === "danger" ? LEGACY_COLORS.red : LEGACY_COLORS.muted2;
  // shortage 표기는 formatQty 적용 — helper 의 정수 라벨을 덮어쓴다.
  const label = status.tone === "danger" ? `부족 ${formatQty(shortage)}` : status.label;
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
}: {
  bundle: IoBundle;
  batch: IoBatch;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
  highlightItemId?: string | null;
  rowId?: string;
}) {
  const padX = compact ? "px-2" : "px-4";
  const isBomParent = bundle.source_kind === "bom_parent";
  const parentLine = getHistoryBomParentLine(bundle);
  const childLines = parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines;
  const isSingleLineDirect = !isBomParent && childLines.length === 1;
  const singleLineCode = isSingleLineDirect ? childLines[0].mes_code : null;
  const canExpand = isBomParent || (!isSingleLineDirect && childLines.length > 0);

  const headerSigned = parentLine
    ? getHistoryLineSignedQuantity(parentLine, batch, bundle)
    : bundle.lines.length === 1
      ? getHistoryLineSignedQuantity(bundle.lines[0], batch, bundle)
      : null;
  const bundleUnit = (() => {
    const units = new Set(bundle.lines.map((l) => (l.unit ?? "").trim()).filter(Boolean));
    return units.size === 1 ? Array.from(units)[0] : null;
  })();
  const headerQtyText = headerSigned
    ? headerSigned.label
    : bundleUnit
      ? `${formatQty(bundle.quantity)} ${bundleUnit}`
      : `${formatQty(bundle.quantity)}`;
  const headerQtyColor = headerSigned ? SIGN_TONE_HEX[headerSigned.tone] : LEGACY_COLORS.muted2;
  const shortageCount = childLines.filter((line) => line.included && line.shortage > 0).length;
  const excludedCount = childLines.filter((line) => !line.included).length;
  const detailId = `history-bom-${encodeURIComponent(bundle.bundle_id).replaceAll("%", "_")}`;
  const targetPadX = compact ? "px-2" : "px-4";
  const flowPadX = "px-2";
  const quantityPadX = compact ? "px-2" : "px-4";
  const statusPadX = compact ? "px-2" : "px-4";

  return (
    <>
      <tr
        id={rowId}
        className={HISTORY_CHILD_ROW_CLASS}
        style={{ background: "color-mix(in srgb, var(--c-blue) 5%, transparent)" }}
      >
        <td className={`${HISTORY_CHILD_CELL_CLASS} ${padX}`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
        <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
          <span
            className={`inline-flex h-6 items-center justify-center gap-1 rounded-full text-xs font-bold leading-none ${
              compact ? "w-full max-w-full min-w-0 px-2" : "min-w-[6.5rem] px-3"
            }`}
            style={{
              background: isBomParent
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
              color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
            }}
          >
            {isBomParent ? <GitBranch className="h-3.5 w-3.5 shrink-0" /> : <Package className="h-3.5 w-3.5 shrink-0" />}
            <span className={compact ? "min-w-0 truncate" : undefined}>{isBomParent ? "BOM" : "단품"}</span>
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
                onClick={onToggle}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onToggle();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] hover:brightness-125"
                style={{ background: "color-mix(in srgb, var(--c-blue) 10%, transparent)" }}
              >
                {expanded
                  ? <ChevronDown className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.blue }} />
                  : <ChevronRight className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />}
              </button>
            ) : null}
            <TruncatedText
              accessibilityLabel={bundle.title}
              className="line-clamp-2 min-w-0 break-words text-xs font-bold leading-snug"
              style={{ color: LEGACY_COLORS.text }}
            >
              {bundle.title}
            </TruncatedText>
          </div>
        </td>
        <ItemCodeCell code={bundle.source_mes_code ?? singleLineCode} compact={compact} dense />
        <SpacerCell compact={compact} dense />
        <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${flowPadX} text-center text-xs font-semibold`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          {isBomParent ? `부품 ${childLines.length}라인` : "단품 라인"}
        </td>
        <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${quantityPadX} text-center text-xs font-bold`} style={{ borderColor: LEGACY_COLORS.border, color: headerQtyColor }}>
          {headerQtyText}
        </td>
        <td className={`${HISTORY_CHILD_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex flex-wrap gap-1">
            {shortageCount > 0 && <StatusBadge included shortage={shortageCount} />}
            {excludedCount > 0 && <StatusBadge included={false} shortage={0} />}
            {shortageCount === 0 && excludedCount === 0 && (
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
}: {
  line: IoLine;
  batch: IoBatch;
  bundle: IoBundle;
  compact?: boolean;
  highlightItemId?: string | null;
  rowId?: string;
}) {
  const padX = compact ? "px-2" : "px-4";
  const targetPadX = compact ? "px-2" : "px-4";
  const flowPadX = "px-2";
  const quantityPadX = compact ? "px-2" : "px-4";
  const statusPadX = compact ? "px-2" : "px-4";
  const dim = !line.included;
  const signed = getHistoryLineSignedQuantity(line, batch, bundle);
  const qtyColor = SIGN_TONE_HEX[signed.tone];
  const highlighted = highlightItemId === line.item_id;
  return (
    <tr
      id={rowId}
      className={HISTORY_CHILD_ROW_CLASS}
      data-history-focus-line={highlighted ? "true" : undefined}
      style={{
        background: highlighted
          ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
          : line.included
            ? "color-mix(in srgb, var(--c-blue) 3%, transparent)"
            : "color-mix(in srgb, var(--c-red) 5%, transparent)",
        boxShadow: highlighted ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
        opacity: dim ? 0.58 : 1,
      }}
    >
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${padX}`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${padX} text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <LineKindBadge line={line} compact={compact} />
      </td>
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${targetPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
          <TruncatedText
            accessibilityLabel={line.item_name}
            className="truncate text-xs font-semibold leading-snug"
            style={{ color: LEGACY_COLORS.text }}
          >
            {line.item_name}
          </TruncatedText>
        </div>
      </td>
      <ItemCodeCell code={line.mes_code} compact={compact} dense />
      <SpacerCell compact={compact} dense />
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${flowPadX} text-center text-xs font-semibold`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        {getLineRoleLabel(line, batch)}
      </td>
      <td className={`whitespace-nowrap ${HISTORY_CHILD_CELL_CLASS} ${quantityPadX} text-center text-xs font-bold`} style={{ borderColor: LEGACY_COLORS.border, color: qtyColor }}>
        {signed.label}
      </td>
      <td className={`${HISTORY_CHILD_CELL_CLASS} ${statusPadX}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <StatusBadge included={line.included} shortage={line.shortage} />
      </td>
    </tr>
  );
}

function LineKindBadge({ line, compact }: { line: IoLine; compact?: boolean }) {
  const isAuto = line.origin === "bom_auto" || line.origin === "package_auto";
  const color = isAuto ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2;
  return (
    <span
      className={`inline-flex h-6 items-center justify-center gap-1 rounded-full text-xs font-bold leading-none ${
        compact ? "w-full max-w-full min-w-0 px-2" : "min-w-[6.5rem] px-3"
      }`}
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: `color-mix(in srgb, ${color} 48%, ${LEGACY_COLORS.text})`,
      }}
    >
      {isAuto ? <Recycle className="h-3.5 w-3.5 shrink-0" /> : <Package className="h-3.5 w-3.5 shrink-0" />}
      <span className={compact ? "min-w-0 truncate" : undefined}>{isAuto ? "자동차감" : "수동"}</span>
    </span>
  );
}

function getLineRoleLabel(line: IoLine, batch: IoBatch): string {
  if (line.origin === "bom_auto" || line.origin === "package_auto") {
    return batch.sub_type === "disassemble" ? "부품 회수" : "부품 차감";
  }
  if (line.direction === "move") return "위치 이동";
  if (line.direction === "adjust") return "수량 조정";
  return line.included ? "적용" : "제외";
}
