"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Package, Recycle } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  getHistoryBomParentLine,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";
import { HISTORY_CELL_TRANSITION, ItemCodeCell, SpacerCell } from "./historyTableHelpers";

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
};

export function BomBatchDetail({ batchId, colSpan, cache, onCached, compact }: Props) {
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
      <tr>
        <td
          colSpan={colSpan}
          className="py-3 text-center text-xs"
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
      {batch.bundles.map((bundle) => (
        <BundleRows
          key={bundle.bundle_id}
          bundle={bundle}
          batch={batch}
          expanded={expandedBundles.has(bundle.bundle_id)}
          onToggle={() => toggleBundle(bundle.bundle_id)}
          compact={compact}
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
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
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
}: {
  bundle: IoBundle;
  batch: IoBatch;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
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

  return (
    <>
      <tr
        onClick={canExpand ? onToggle : undefined}
        className={canExpand ? "cursor-pointer hover:brightness-105" : undefined}
        style={{ background: "color-mix(in srgb, var(--c-blue) 5%, transparent)" }}
      >
        <td className={`border-b ${padX} py-2`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
        <td className={`whitespace-nowrap border-b ${padX} py-2 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
          <span
            className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
            style={{
              background: isBomParent
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
              color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
            }}
          >
            {isBomParent ? <GitBranch className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
            {isBomParent ? "BOM" : "단품"}
          </span>
        </td>
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex min-w-0 items-start gap-1.5">
            {canExpand ? (
              expanded
                ? <ChevronDown className="mt-0.5 h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                : <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
                {bundle.title}
              </div>
            </div>
          </div>
        </td>
        <ItemCodeCell code={bundle.source_mes_code ?? singleLineCode} compact={compact} dense />
        <SpacerCell compact={compact} dense />
        <td className="whitespace-nowrap border-b px-5 py-2 text-center text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          {isBomParent ? `하위 ${childLines.length}라인` : "단품 라인"}
        </td>
        <td className="whitespace-nowrap border-b px-4 py-2 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: headerQtyColor }}>
          {headerQtyText}
        </td>
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex flex-wrap gap-1">
            {shortageCount > 0 && <StatusBadge included shortage={shortageCount} />}
            {excludedCount > 0 && <StatusBadge included={false} shortage={0} />}
            {shortageCount === 0 && excludedCount === 0 && (
              <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
            )}
          </div>
        </td>
      </tr>

      {canExpand && expanded && childLines.map((line) => (
        <BomLineRow key={line.line_id} line={line} batch={batch} bundle={bundle} compact={compact} />
      ))}
    </>
  );
}

function BomLineRow({ line, batch, bundle, compact }: { line: IoLine; batch: IoBatch; bundle: IoBundle; compact?: boolean }) {
  const padX = compact ? "px-2" : "px-4";
  const dim = !line.included;
  const signed = getHistoryLineSignedQuantity(line, batch, bundle);
  const qtyColor = SIGN_TONE_HEX[signed.tone];
  return (
    <tr
      style={{
        background: line.included ? "color-mix(in srgb, var(--c-blue) 3%, transparent)" : "color-mix(in srgb, var(--c-red) 5%, transparent)",
        opacity: dim ? 0.58 : 1,
      }}
    >
      <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <LineKindBadge line={line} />
      </td>
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
              {line.item_name}
            </div>
          </div>
        </div>
      </td>
      <ItemCodeCell code={line.mes_code} compact={compact} dense />
      <SpacerCell compact={compact} dense />
      <td className="whitespace-nowrap border-b px-5 py-1.5 text-center text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        {getLineRoleLabel(line, batch)}
      </td>
      <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: qtyColor }}>
        {signed.label}
      </td>
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <StatusBadge included={line.included} shortage={line.shortage} />
      </td>
    </tr>
  );
}

function LineKindBadge({ line }: { line: IoLine }) {
  const isAuto = line.origin === "bom_auto" || line.origin === "package_auto";
  const color = isAuto ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2;
  return (
    <span
      className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: `color-mix(in srgb, ${color} 48%, ${LEGACY_COLORS.text})`,
      }}
    >
      {isAuto ? <Recycle className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
      {isAuto ? "자동차감" : "수동"}
    </span>
  );
}

function getLineRoleLabel(line: IoLine, batch: IoBatch): string {
  if (line.origin === "bom_auto" || line.origin === "package_auto") {
    return batch.sub_type === "disassemble" ? "하위 회수" : "하위 차감";
  }
  if (line.direction === "move") return "위치 이동";
  if (line.direction === "adjust") return "수량 조정";
  return line.included ? "적용" : "제외";
}
