"use client";

import { Check } from "lucide-react";
import type { ShipPackage } from "@/lib/api";
import { EmptyState } from "../../common/EmptyState";
import { LEGACY_COLORS } from "../../legacyUi";

/**
 * ItemPickStep 의 패키지 출고 모드 리스트.
 *
 * Round-10B (#2) 추출. items 테이블과 형제 위치였던 패키지 리스트를
 * 별도 sub-component 로 분리. 시각/렌더 트리 변경 0.
 */

interface Props {
  packages: ShipPackage[];
  selectedPackage: ShipPackage | null;
  onSelectPackage: (pkg: ShipPackage | null) => void;
  searchTerm: string;
}

export function ItemPickPackageList({
  packages,
  selectedPackage,
  onSelectPackage,
  searchTerm,
}: Props) {
  return (
    <ul className="space-y-1.5 p-2">
      {packages.map((pkg) => {
        const active = selectedPackage?.package_id === pkg.package_id;
        return (
          <li key={pkg.package_id}>
            <button
              onClick={() => onSelectPackage(active ? null : pkg)}
              className="flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:brightness-110"
              style={{
                background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s1,
                borderLeft: `3px solid ${active ? LEGACY_COLORS.purple : "transparent"}`,
              }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {pkg.name}
                </div>
                <div className="mt-0.5 truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {pkg.package_code} · {pkg.items.length}종
                </div>
              </div>
              {active && <Check className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.purple }} />}
            </button>
          </li>
        );
      })}
      {packages.length === 0 && (
        <li>
          <EmptyState
            variant={searchTerm ? "no-search-result" : "no-data"}
            compact
            description={searchTerm ? "검색어를 다시 확인해 주세요." : "등록된 패키지가 없습니다."}
          />
        </li>
      )}
    </ul>
  );
}
