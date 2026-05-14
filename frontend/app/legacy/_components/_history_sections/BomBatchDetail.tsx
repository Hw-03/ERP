"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Package, GitBranch } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle } from "@/lib/api/types";
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
    void ioApi
      .getBatch(batchId)
      .then((b) => {
        onCached(batchId, b);
        setBatch(b);
      })
      .finally(() => setLoading(false));
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
          BOM 구조 불러오는 중...
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
          colSpan={colSpan}
        />
      ))}
    </>
  );
}

function BundleRows({
  bundle,
  expanded,
  onToggle,
  colSpan,
}: {
  bundle: IoBundle;
  expanded: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  const isBomParent = bundle.source_kind === "bom_parent";
  const includedLines = bundle.lines.filter((l) => l.included);

  return (
    <>
      {/* 번들 헤더 행 */}
      <tr
        onClick={isBomParent ? onToggle : undefined}
        className={isBomParent ? "cursor-pointer hover:brightness-105" : undefined}
        style={{ background: "rgba(101,169,255,.03)" }}
      >
        <td
          colSpan={colSpan}
          className="border-b px-6 py-2"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex items-center gap-2">
            {isBomParent ? (
              expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
              )
            ) : (
              <Package className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
            )}
            {isBomParent && (
              <GitBranch className="h-3 w-3 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            )}
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.text }}>
              {bundle.title}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: isBomParent
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                  : "transparent",
                color: isBomParent ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
              }}
            >
              {isBomParent ? "BOM" : "단품"}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              × {formatQty(bundle.quantity)}
            </span>
            {isBomParent && (
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                ({includedLines.length}개 품목)
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* BOM 하위 품목 라인 */}
      {isBomParent &&
        expanded &&
        bundle.lines.map((line) => (
          <tr
            key={line.line_id}
            style={{
              background: line.included
                ? "rgba(101,169,255,.02)"
                : "rgba(255,100,100,.03)",
            }}
          >
            <td
              colSpan={colSpan}
              className="border-b py-1.5 pr-4"
              style={{ borderColor: LEGACY_COLORS.border, paddingLeft: "3rem" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  └
                </span>
                <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
                  {line.item_name}
                </span>
                {line.erp_code && (
                  <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {line.erp_code}
                  </span>
                )}
                <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  × {formatQty(line.quantity)} {line.unit ?? ""}
                </span>
                {line.shortage > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
                      color: LEGACY_COLORS.red,
                    }}
                  >
                    부족 {formatQty(line.shortage)}
                  </span>
                )}
                {!line.included && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ color: LEGACY_COLORS.muted2, opacity: 0.6 }}
                  >
                    제외됨
                  </span>
                )}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}
