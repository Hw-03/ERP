"use client";

import { Package as PackageIcon } from "lucide-react";
import type { ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../../tokens";
import { EmptyState } from "../../../primitives";
import { useDeptWizard } from "../context";

/**
 * Round-13 (#2) 추출 — DeptWizard ItemsStep 의 패키지 선택 picker.
 */
export function PackagePicker({ packages, loading }: { packages: ShipPackage[]; loading: boolean }) {
  const { state, dispatch } = useDeptWizard();
  if (loading) {
    return (
      <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        패키지를 불러오는 중…
      </div>
    );
  }
  if (packages.length === 0) {
    return <EmptyState icon={PackageIcon} title="등록된 출하 패키지가 없습니다" />;
  }
  const qty = state.items.get("__PACKAGE__") ?? 1;
  return (
    <div className="flex flex-col gap-2">
      {packages.map((pkg) => {
        const selected = state.packageId === pkg.package_id;
        return (
          <button
            key={pkg.package_id}
            type="button"
            onClick={() => {
              dispatch({ type: "SET_PACKAGE", packageId: pkg.package_id });
              dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: 1 });
            }}
            className="flex flex-col gap-1 rounded-[20px] border px-4 py-3 text-left active:scale-[0.99]"
            style={{
              background: selected ? `${LEGACY_COLORS.purple as string}14` : LEGACY_COLORS.s2,
              borderColor: selected ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {pkg.name}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {pkg.package_code}
              </div>
            </div>
            <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              {pkg.items.length}개 구성
            </div>
          </button>
        );
      })}

      {state.packageId ? (
        <div
          className="flex items-center justify-between rounded-[14px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
            출하 수량
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: Math.max(1, qty - 1) })}
              className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
            >
              −
            </button>
            <div
              className={`${TYPO.title} min-w-[48px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.blue }}
            >
              {qty}
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_QTY", itemId: "__PACKAGE__", qty: qty + 1 })}
              className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
              style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
            >
              ＋
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
