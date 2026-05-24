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
import { HISTORY_CELL_TRANSITION } from "./historyTableHelpers";

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
  // BOM 부모 라인은 헤더로 흡수 — 자식 목록에서 제외. helper 단일 진입.
  const parentLine = getHistoryBomParentLine(bundle);
  const childLines = parentLine ? bundle.lines.filter((l) => l !== parentLine) : bundle.lines;
  const includedChildLines = childLines.filter((l) => l.included);
  // 회귀 fix: source_kind 가 "bom_parent" 가 아니어도 lines 가 여럿이면 펼쳐서 표시.
  // 백엔드 응답의 source_kind 변경 또는 origin 누락에도 견디게 한다.
  const canExpand = isBomParent || childLines.length > 0;

  // 헤더 우측 수량 — 부모 라인 있으면 sub_type 기반 부호+색.
  // 단품(BOM 아님)은 bundle.quantity 가 라인 수(1)로 들어가는 경우가 있어 의미 없음 →
  // bundle.lines 가 1개면 그 line 의 signed.label 사용(예: "+4 EA"). 그 외엔 bundle.quantity fallback.
  const headerSigned = parentLine
    ? getHistoryLineSignedQuantity(parentLine, batch, bundle)
    : bundle.lines.length === 1
      ? getHistoryLineSignedQuantity(bundle.lines[0], batch, bundle)
      : null;
  const headerQtyText = headerSigned ? headerSigned.label : `${formatQty(bundle.quantity)}`;
  const headerQtyColor = headerSigned ? SIGN_TONE_HEX[headerSigned.tone] : LEGACY_COLORS.muted2;

  return (
    <>
      {/* 번들 헤더 — 5컬럼 정렬 */}
      <tr
        onClick={canExpand ? onToggle : undefined}
        className={canExpand ? "cursor-pointer hover:brightness-105" : undefined}
        style={{ background: "rgba(101,169,255,.03)" }}
      >
        {/* 일시 — 부모 헤더 행은 비워둠(자동차감 라벨은 자식 행 구분 열로 이동) */}
        <td className={`border-b ${padX} py-2`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
        {/* 구분 */}
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
        {/* 품목명 — chevron 들여쓰기 px-4 로 통일(parent Layers 아이콘과 같은 x),
            (N개 포함)은 우측 고정폭 슬롯에 좌측 정렬해서 item_code 와 동일 패턴 */}
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center gap-1.5">
            {canExpand ? (
              expanded
                ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                : <ChevronRight className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
              {bundle.title}
            </span>
            {canExpand && (
              <span className="w-[6rem] shrink-0 text-right text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                ({includedChildLines.length}개 포함)
              </span>
            )}
          </div>
        </td>
        {/* 수량변화 — 부모 라인 있으면 실제 입고 수량(파랑), 없으면 bundle.quantity */}
        <td className="whitespace-nowrap border-b px-4 py-2 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: headerQtyColor }}>
          {headerQtyText}
        </td>
        {/* 담당자 */}
        <td className="hidden sm:table-cell border-b px-4 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        </td>
        {/* 메모 — 빈 셀(서식 유지) */}
        <td className="hidden sm:table-cell border-b px-4 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        </td>
      </tr>

      {/* BOM 하위 라인 — 부모 자기 자신 제외, 6컬럼 정렬 */}
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
        background: line.included ? "rgba(101,169,255,.02)" : "rgba(255,100,100,.03)",
        opacity: dim ? 0.55 : 1,
      }}
    >
      {/* 일시 */}
      <td className={`border-b ${padX} py-1.5`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }} />
      {/* 구분 — 자동차감 알약(BACKFLUSH 톤 통일) + 상태(부족/제외) 인라인 */}
      <td className={`whitespace-nowrap border-b ${padX} py-1.5 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <div className="inline-flex flex-col items-center gap-1">
          <span
            className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
            style={{
              background: "color-mix(in srgb, #fb923c 14%, transparent)",
              color: "#fb923c",
            }}
          >
            <Recycle className="h-3.5 w-3.5" />
            자동차감
          </span>
          <StatusBadge included={line.included} shortage={line.shortage} />
        </div>
      </td>
      {/* 품목명 — └ 들여쓰기 px-4 로 통일(parent Layers/chevron 과 같은 x),
          item_code 는 우측 고정폭 슬롯에 좌측 정렬해서 행 간 코드 열 정렬 */}
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {line.item_name}
          </span>
          {line.item_code && (
            <span className="w-[6rem] shrink-0 text-right text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {line.item_code}
            </span>
          )}
        </div>
      </td>
      {/* 수량변화 — sub_type + 부모/자식 역할 기반 부호 + 색 */}
      <td className="whitespace-nowrap border-b px-4 py-1.5 text-center text-xs font-bold" style={{ borderColor: LEGACY_COLORS.border, color: qtyColor }}>
        {signed.label}
      </td>
      {/* 담당자 */}
      <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
      {/* 메모 — 빈 셀(서식 유지) */}
      <td className="hidden sm:table-cell border-b px-4 py-1.5 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
    </tr>
  );
}
