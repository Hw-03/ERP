"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { useAdminPackagesContext } from "./AdminPackagesContext";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { PackageDetailPanel } from "./_packages_parts/PackageDetailPanel";

/**
 * Round-11A (#2) 분해 — 좌측 묶음 목록은 본 파일, 우측 상세는 PackageDetailPanel.
 *
 * Props 없음. 모든 상태/액션은 AdminPackagesProvider 의 Context 에서 읽는다.
 */
export function AdminPackagesSection() {
  const {
    packages,
    selectedPackage,
    setSelectedPackage,
    setPkgRenaming,
    createSimplePackage: onCreateSimplePackage,
    deletePackage: onDeletePackage,
  } = useAdminPackagesContext();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <div className="grid h-full gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* 좌측: 묶음 목록 */}
        <div className="flex min-h-0 flex-col gap-3">
          <button
            onClick={onCreateSimplePackage}
            className="w-full shrink-0 rounded-[18px] px-4 py-3 text-sm font-bold text-white"
            style={{ background: LEGACY_COLORS.blue }}
          >
            새 출하묶음 생성
          </button>
          <div
            className="min-h-0 overflow-y-auto rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            {packages.length === 0 && (
              <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                출하묶음이 없습니다.
              </div>
            )}
            {packages.map((pkg, index) => (
              <div
                key={pkg.package_id}
                className="flex items-center gap-2 px-4 py-3"
                style={{
                  borderBottom: index === packages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                  background:
                    selectedPackage?.package_id === pkg.package_id
                      ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 10%, transparent)`
                      : "transparent",
                }}
              >
                <button
                  onClick={() => {
                    setSelectedPackage(pkg);
                    setPkgRenaming(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-semibold">{pkg.name}</div>
                  <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {pkg.package_code} · {pkg.items.length}종
                  </div>
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: pkg.package_id, name: pkg.name })}
                  className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-red-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.red }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 우측: 묶음 상세 */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <PackageDetailPanel />
        </div>
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="묶음 삭제"
        tone="danger"
        confirmLabel="삭제"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeletePackage(deleteTarget.id);
          setDeleteTarget(null);
        }}
      >
        &apos;{deleteTarget?.name}&apos; 묶음을 삭제할까요?
      </ConfirmModal>
    </>
  );
}
