"use client";

import { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation } from "@/lib/api/types/defects";

export interface DefectInventoryPickerProps {
  department: string;
  selected: DefectLocation | null;
  onSelect: (location: DefectLocation | null) => void;
  onAdvance: () => void;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isOverOneYear(defectiveAt: string): boolean {
  return Date.now() - new Date(defectiveAt).getTime() > ONE_YEAR_MS;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) return `${diffMonths}개월 전`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}년 전`;
}

export function DefectInventoryPicker({
  department,
  selected,
  onSelect,
  onAdvance,
}: DefectInventoryPickerProps) {
  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    defectsApi
      .listDefects(department)
      .then(setLocations)
      .finally(() => setLoading(false));
  }, [department]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-[16px] border py-12"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
      >
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
          불러오는 중…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {locations.length === 0 ? (
        <div
          className="rounded-[14px] border px-6 py-8 text-center"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
        >
          <p className="text-base font-bold">해당 부서에 격리된 재고가 없습니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((loc, idx) => {
            const isSelected =
              selected !== null &&
              selected.item_id === loc.item_id &&
              selected.department === loc.department;
            const warn = isOverOneYear(loc.defective_at);

            return (
              <button
                key={`${loc.item_id}-${idx}`}
                type="button"
                onClick={() => onSelect(isSelected ? null : loc)}
                className="w-full rounded-[16px] border px-5 py-4 text-left transition-all hover:brightness-105"
                style={{
                  background: isSelected
                    ? tint(LEGACY_COLORS.red, 8)
                    : LEGACY_COLORS.s1,
                  borderColor: isSelected
                    ? LEGACY_COLORS.red
                    : LEGACY_COLORS.border,
                  borderWidth: isSelected ? 2 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className="text-base font-black leading-tight"
                      style={{ color: LEGACY_COLORS.text }}
                    >
                      {loc.item_name}
                    </span>
                    <span
                      className="text-xs font-bold"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      {loc.item_code}
                    </span>
                    <div
                      className="mt-0.5 flex flex-wrap items-center gap-2 text-xs"
                      style={{ color: LEGACY_COLORS.muted }}
                    >
                      <span>격리 수량 {formatQty(Number(loc.quantity))}개</span>
                      <span>{formatRelative(loc.defective_at)}</span>
                      {loc.reason_category && (
                        <span
                          className="rounded-full px-2 py-0.5 font-bold"
                          style={{
                            background: tint(LEGACY_COLORS.red, 12),
                            color: LEGACY_COLORS.red,
                          }}
                        >
                          {loc.reason_category}
                        </span>
                      )}
                      {warn && (
                        <span
                          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 font-black text-white"
                          style={{ background: "#ef4444", fontSize: "10px" }}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" />
                          1년 초과
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onAdvance}
        disabled={selected === null}
        className="flex w-full shrink-0 items-center justify-between rounded-[12px] border px-4 py-3 text-sm font-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: selected !== null ? LEGACY_COLORS.red : LEGACY_COLORS.s2,
          borderColor: selected !== null ? LEGACY_COLORS.red : LEGACY_COLORS.border,
          color: selected !== null ? "#fff" : LEGACY_COLORS.muted2,
        }}
      >
        {selected !== null ? (
          <>
            <span>{selected.item_name}</span>
            <span className="flex items-center gap-1.5">
              다음 단계로
              <ArrowRight className="h-4 w-4" />
            </span>
          </>
        ) : (
          <span className="ml-auto flex items-center gap-1.5">
            다음 단계로
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </button>
    </div>
  );
}
