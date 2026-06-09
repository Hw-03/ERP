"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { DefectLocation } from "@/lib/api/types/defects";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isOverOneYear(defectiveAt: string | null): boolean {
  if (!defectiveAt) return false;
  const at = new Date(defectiveAt).getTime();
  if (!Number.isFinite(at)) return false;
  return Date.now() - at > ONE_YEAR_MS;
}

function formatDate(iso: string | null): string {
  if (!iso) return "기록 없음";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "기록 없음";
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface Props {
  locations: DefectLocation[];
  onProcess: (location: DefectLocation) => void;
  /** 전체 보기 시 이 부서를 가장 위에 표시. */
  priorityDept?: string;
}

export function DefectDepartmentList({
  locations,
  onProcess,
  priorityDept,
}: Props) {
  // 부서별 그룹핑
  const grouped = groupByDepartment(locations);
  const depts = Object.keys(grouped).sort((a, b) => {
    if (priorityDept) {
      if (a === priorityDept) return -1;
      if (b === priorityDept) return 1;
    }
    return a.localeCompare(b, "ko");
  });

  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  function toggleCollapse(dept: string) {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  }

  if (depts.length === 0) {
    return (
      <div
        className="rounded-[14px] border px-6 py-8 text-center"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        <p className="text-base font-bold">격리된 불량 재고가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {depts.map((dept) => {
        const rows = grouped[dept];
        const isCollapsed = collapsedDepts.has(dept);
        const deptColor = getDepartmentFallbackColor(dept);
        // Pydantic Decimal → JSON 문자열("52.0000") 직렬화 — Number 변환 필수 (string concat 방지)
        return (
          <div
            key={dept}
            className="overflow-hidden rounded-[16px] border"
            style={{ borderColor: tint(deptColor, 40) }}
          >
            {/* 부서 헤더 — 클릭으로 접기/펼치기 */}
            <button
              type="button"
              onClick={() => toggleCollapse(dept)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:brightness-95"
              style={{ background: tint(deptColor, 10) }}
            >
              <span className="text-base font-black" style={{ color: deptColor }}>
                {dept}
              </span>
              <span className="ml-auto" style={{ color: tint(deptColor, 55) }}>
                {isCollapsed
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronUp className="h-4 w-4" />
                }
              </span>
            </button>

            {!isCollapsed && (
            <div className="divide-y" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                {rows.map((loc, idx) => {
                  const warn = isOverOneYear(loc.defective_at);
                  return (
                    <div
                      key={`${loc.item_id}-${idx}`}
                      className="flex items-center gap-4 px-5 py-3"
                    >
                      {/* 품목 정보 */}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                            {loc.mes_code}
                          </span>
                          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                            {loc.item_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: LEGACY_COLORS.muted }}>
                          <span>{formatQty(loc.quantity)}개</span>
                          <span>격리 {formatDate(loc.defective_at)}</span>
                          {warn && (
                            <span
                              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
                              style={{
                                color: LEGACY_COLORS.red,
                                background: tint(LEGACY_COLORS.red, 14),
                                borderColor: tint(LEGACY_COLORS.red, 30),
                              }}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              1년 초과
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 처리 버튼 (Phase 5 placeholder) */}
                      <button
                        type="button"
                        onClick={() => onProcess(loc)}
                        className="shrink-0 rounded-[10px] border px-3 py-1.5 text-xs font-black transition-colors hover:brightness-110"
                        style={{
                          background: tint(LEGACY_COLORS.red, 8),
                          borderColor: tint(LEGACY_COLORS.red, 40),
                          color: LEGACY_COLORS.red,
                        }}
                      >
                        처리
                      </button>
                    </div>
                  );
                })}
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function groupByDepartment(locations: DefectLocation[]): Record<string, DefectLocation[]> {
  return locations.reduce<Record<string, DefectLocation[]>>((acc, loc) => {
    const dept = loc.department;
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(loc);
    return acc;
  }, {});
}
