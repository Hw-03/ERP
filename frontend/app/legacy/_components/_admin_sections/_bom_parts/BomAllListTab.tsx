"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { EmptyState } from "../../common/EmptyState";
import { useAdminBomContext } from "../AdminBomContext";
import { bomCategoryColor } from "../adminShared";

/**
 * AdminBomSection 의 "전체 BOM" 탭.
 *
 * Round-10B (#7) 추출. 그룹화된 BOM 리스트 + "더보기" 페이징을 분리.
 * expandedGroups / allBomLimit 상태는 본 컴포넌트 안에서 관리.
 *
 * 그룹의 [편집] 버튼은 부모로 onSwitchToCompose(parentId) 콜백.
 */
interface Props {
  onSwitchToCompose: (parentId: string) => void;
}

const PAGE_SIZE = 30;

export function BomAllListTab({ onSwitchToCompose }: Props) {
  const { allBomRows } = useAdminBomContext();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allBomLimit, setAllBomLimit] = useState(PAGE_SIZE);

  const groupedAllBom = useMemo(() => {
    const map = new Map<string, {
      parentId: string;
      parentName: string;
      parentCode: string;
      parentCat: string;
      rows: typeof allBomRows;
    }>();
    for (const row of allBomRows) {
      if (!map.has(row.parent_item_id)) {
        map.set(row.parent_item_id, {
          parentId: row.parent_item_id,
          parentName: row.parent_item_name,
          parentCode: row.parent_erp_code ?? "",
          parentCat: row.parent_erp_code?.split("-")[1] ?? "?",
          rows: [],
        });
      }
      map.get(row.parent_item_id)!.rows.push(row);
    }
    return Array.from(map.values());
  }, [allBomRows]);

  const displayedGroups = groupedAllBom.slice(0, allBomLimit);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b px-5 py-3"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          전체 BOM 현황
        </span>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {groupedAllBom.length}개 제품 · {allBomRows.length}개 관계 · 조회 전용
        </span>
      </div>
      {groupedAllBom.length === 0 ? (
        <EmptyState
          variant="no-data"
          compact
          title="등록된 BOM이 없습니다."
          description="BOM 작성 탭에서 상위 품목을 선택해 BOM을 등록할 수 있습니다."
        />
      ) : (
        <div className="min-h-0 overflow-y-auto">
          {displayedGroups.map((group, gIdx) => {
            const isExpanded = expandedGroups.has(group.parentId);
            const catColor = bomCategoryColor(group.parentCat);
            const isLast = gIdx === displayedGroups.length - 1 && groupedAllBom.length <= allBomLimit;
            return (
              <div
                key={group.parentId}
                style={{ borderBottom: isLast ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
              >
                <div className="flex items-center">
                  <button
                    onClick={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.parentId)) next.delete(group.parentId);
                        else next.add(group.parentId);
                        return next;
                      })
                    }
                    className="flex flex-1 items-center gap-2 px-5 py-3 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                    )}
                    <span
                      className="shrink-0 rounded px-1 py-0.5 text-xs font-bold"
                      style={{
                        background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                        color: catColor,
                      }}
                    >
                      {group.parentCat}
                    </span>
                    <span className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
                      {group.parentName}
                    </span>
                    <span className="ml-auto shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {group.rows.length}개 자재
                    </span>
                  </button>
                  <button
                    onClick={() => onSwitchToCompose(group.parentId)}
                    className="shrink-0 px-4 py-2 text-xs font-medium"
                    style={{ color: LEGACY_COLORS.blue }}
                  >
                    편집
                  </button>
                </div>
                {isExpanded && (
                  <div style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 3%, transparent)` }}>
                    {group.rows.map((row) => {
                      const childCat = row.child_erp_code?.split("-")[1] ?? "?";
                      return (
                        <div
                          key={row.bom_id}
                          className="grid grid-cols-[60px_1fr_1fr_80px] items-center border-t px-8 py-2"
                          style={{ borderColor: LEGACY_COLORS.border }}
                        >
                          <span
                            className="rounded px-1 py-0.5 text-xs font-bold w-fit"
                            style={{
                              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 12%, transparent)`,
                              color: LEGACY_COLORS.green,
                            }}
                          >
                            {childCat}
                          </span>
                          <div className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>
                            {row.child_item_name}
                          </div>
                          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {row.child_erp_code}
                          </div>
                          <div className="text-right text-sm" style={{ color: LEGACY_COLORS.text }}>
                            ×{formatQty(row.quantity)}
                            <span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {groupedAllBom.length > allBomLimit && (
            <button
              onClick={() => setAllBomLimit((l) => l + PAGE_SIZE)}
              className="w-full py-3 text-sm font-medium"
              style={{ color: LEGACY_COLORS.blue, borderTop: `1px solid ${LEGACY_COLORS.border}` }}
            >
              더보기 ({groupedAllBom.length - allBomLimit}개 제품 더)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
