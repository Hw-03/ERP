"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
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

  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  function toggleDeptFilter(dept: string) {
    setDeptFilter((prev) => (prev === dept ? null : dept));
  }

  const visibleDepts = deptFilter ? depts.filter((d) => d === deptFilter) : depts;

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
      {deptFilter && (
        <div
          className="flex items-center justify-between rounded-[12px] border px-4 py-2 text-xs font-bold"
          style={{ borderColor: tint(LEGACY_COLORS.blue, 30), background: tint(LEGACY_COLORS.blue, 8), color: LEGACY_COLORS.blue }}
        >
          <span>{deptFilter} 부서만 표시 중</span>
          <button
            type="button"
            onClick={() => setDeptFilter(null)}
            className="font-black hover:underline"
          >
            전체 보기
          </button>
        </div>
      )}
      {visibleDepts.map((dept) => {
        const rows = grouped[dept];
        const isActive = deptFilter === dept;
        const deptColor = getDepartmentFallbackColor(dept);
        // Pydantic Decimal → JSON 문자열("52.0000") 직렬화 — Number 변환 필수 (string concat 방지)
        return (
          <div
            key={dept}
            className="overflow-hidden rounded-[16px] border"
            style={{ borderColor: isActive ? deptColor : tint(deptColor, 40) }}
          >
            {/* 부서 헤더 — 클릭으로 해당 부서 필터 토글 */}
            <button
              type="button"
              onClick={() => toggleDeptFilter(dept)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:brightness-95"
              style={{ background: tint(deptColor, isActive ? 20 : 10) }}
            >
              <span className="text-base font-black" style={{ color: deptColor }}>
                {dept}
              </span>
              {!isActive && depts.length > 1 && (
                <span className="ml-auto text-xs font-bold" style={{ color: tint(deptColor, 60) }}>
                  클릭해서 필터
                </span>
              )}
            </button>

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
