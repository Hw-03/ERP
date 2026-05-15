"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Package } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

type Props = {
  batchId: string;
  colSpan: number;
  /** 부모에서 캐시를 관리해 중복 요청을 방지. */
  cache: Map<string, IoBatch>;
  onCached: (batchId: string, batch: IoBatch) => void;
};

export function BomBatchDetail({ batchId, colSpan, cache, onCached }: Props) {
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
          expanded={expandedBundles.has(bundle.bundle_id)}
          onToggle={() => toggleBundle(bundle.bundle_id)}
        />
      ))}
    </>
  );
}

function StatusBadge({ included, shortage }: { included: boolean; shortage: number }) {
  if (!included) {
    return (
      <span
        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 18%, transparent)`, color: LEGACY_COLORS.muted2 }}
      >
        제외
      </span>
    );
  }
  if (shortage > 0) {
    return (
      <span
        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 18%, transparent)`, color: LEGACY_COLORS.red }}
      >
        부족 {formatQty(shortage)}
      </span>
    );
  }
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, transparent)`, color: LEGACY_COLORS.green }}
    >
      포함
    </span>
  );
}

function BundleRows({
  bundle,
  expanded,
  onToggle,
}: {
  bundle: IoBundle;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isBomParent = bundle.source_kind === "bom_parent";
  const includedLines = bundle.lines.filter((l) => l.included);

  return (
    <>
      {/* 번들 헤더 — 6컬럼 정렬 */}
      <tr
        onClick={isBomParent ? onToggle : undefined}
        className={isBomParent ? "cursor-pointer hover:brightness-105" : undefined}
        style={{ background: "rgba(101,169,255,.03)" }}
      >
        {/* 일시 */}
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }} />
        {/* 구분 */}
        <td className="whitespace-nowrap border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
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
        </td>
        {/* 품목명 (toggle + title) */}
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border, paddingLeft: "1.5rem" }}>
          <div className="flex items-center gap-1.5">
            {isBomParent ? (
              expanded
                ? <ChevronDown className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                : <ChevronRight className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            ) : null}
            <span className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
              {bundle.title}
            </span>
          </div>
        </td>
        {/* 수량변화 */}
        <td className="whitespace-nowrap border-b px-4 py-2 text-right text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          × {formatQty(bundle.quantity)}
        </td>
        {/* 담당자 */}
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
        </td>
        {/* 메모 */}
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          {isBomParent && (
            <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
              ({includedLines.length}개 포함)
            </span>
          )}
        </td>
      </tr>

      {/* BOM 하위 라인 — 6컬럼 정렬 */}
      {isBomParent && expanded && bundle.lines.map((line) => (
        <BomLineRow key={line.line_id} line={line} />
      ))}
    </>
  );
}

function BomLineRow({ line }: { line: IoLine }) {
  const dim = !line.included;
  return (
    <tr
      style={{
        background: line.included ? "rgba(101,169,255,.02)" : "rgba(255,100,100,.03)",
        opacity: dim ? 0.55 : 1,
      }}
    >
      {/* 일시 */}
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }} />
      {/* 구분 (상태) */}
      <td className="whitespace-nowrap border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <StatusBadge included={line.included} shortage={line.shortage} />
      </td>
      {/* 품목명 (들여쓰기 + 가이드 + 이름 + erp_code) */}
      <td className="border-b py-1.5 pr-4" style={{ borderColor: LEGACY_COLORS.border, paddingLeft: "3rem" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>└</span>
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {line.item_name}
          </span>
          {line.erp_code && (
            <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{line.erp_code}</span>
          )}
        </div>
      </td>
      {/* 수량변화 */}
      <td className="whitespace-nowrap border-b px-4 py-1.5 text-right text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
        × {formatQty(line.quantity)} {line.unit ?? ""}
      </td>
      {/* 담당자 */}
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>-</span>
      </td>
      {/* 메모 (exclusion_note) */}
      <td className="border-b px-4 py-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {line.exclusion_note ?? "-"}
        </span>
      </td>
    </tr>
  );
}
