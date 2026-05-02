"use client";

import { useState } from "react";
import { Check, Search, Trash2, X } from "lucide-react";
import { LEGACY_COLORS, buildItemSearchLabel } from "../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { PKG_CATEGORY_OPTIONS } from "./adminShared";
import { useAdminPackagesContext } from "./AdminPackagesContext";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";

// Props 없음. 모든 상태/액션은 AdminPackagesProvider 의 Context 에서 읽는다.
// 기존 18-prop drilling → 0.
export function AdminPackagesSection() {
  const ctx = useAdminPackagesContext();
  const {
    packages,
    selectedPackage,
    setSelectedPackage,
    pkgRenaming,
    setPkgRenaming,
    pkgNameDraft,
    setPkgNameDraft,
    pkgItemSearch,
    setPkgItemSearch,
    pkgItemCategory,
    setPkgItemCategory,
    pkgItemQtyMap,
    setPkgItemQtyMap,
    filteredPkgItems,
    createSimplePackage: onCreateSimplePackage,
    addPackageItem: onAddPackageItem,
    renamePackage: onRenamePackage,
    removePackageItem: onRemovePackageItem,
    deletePackage: onDeletePackage,
  } = ctx;

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
        {selectedPackage ? (
          <>
            {/* 묶음 이름 */}
            <div
              className="rounded-[28px] border p-5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              {pkgRenaming ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={pkgNameDraft}
                    onChange={(e) => setPkgNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onRenamePackage();
                      if (e.key === "Escape") setPkgRenaming(false);
                    }}
                    className="flex-1 rounded-[14px] border px-3 py-2 text-base font-bold outline-none"
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.purple, color: LEGACY_COLORS.text }}
                  />
                  <button
                    onClick={onRenamePackage}
                    className="rounded-[14px] px-3 py-2 text-sm font-bold text-white"
                    style={{ background: LEGACY_COLORS.purple }}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPkgRenaming(false)}
                    className="rounded-[14px] px-3 py-2 text-sm"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xl font-black">{selectedPackage.name}</div>
                    <div className="mt-0.5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                      {selectedPackage.package_code}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPkgNameDraft(selectedPackage.name);
                      setPkgRenaming(true);
                    }}
                    className="rounded-[14px] border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/10"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                  >
                    이름 변경
                  </button>
                </div>
              )}
            </div>

            {/* 구성 요약 */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[20px] border p-4"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  구성 품목
                </div>
                <div className="mt-1 text-2xl font-black" style={{ color: LEGACY_COLORS.purple }}>
                  {selectedPackage.items.length}종
                </div>
              </div>
              <div
                className="rounded-[20px] border p-4"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  총 수량
                </div>
                <div className="mt-1 text-2xl font-black" style={{ color: LEGACY_COLORS.green }}>
                  {formatQty(selectedPackage.items.reduce((sum, item) => sum + Number(item.quantity), 0))}
                </div>
              </div>
            </div>

            {/* 현재 구성 품목 */}
            <div
              className="rounded-[28px] border p-5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                구성 품목 ({selectedPackage.items.length}종)
              </div>
              {selectedPackage.items.length === 0 ? (
                <div className="py-3 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                  아직 품목이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPackage.items.map((item) => (
                    <div
                      key={item.package_item_id}
                      className="flex items-center gap-3 rounded-[18px] border px-4 py-3"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{item.item_name}</div>
                        <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {formatQty(item.quantity)} {item.item_unit}
                        </div>
                      </div>
                      <button
                        onClick={() => onRemovePackageItem(item.package_item_id)}
                        className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-red-500/20"
                      >
                        <X className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.red }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 품목 추가 */}
            <div
              className="rounded-[28px] border p-5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
                품목 추가
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {PKG_CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPkgItemCategory(opt.value)}
                    className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-all"
                    style={{
                      background:
                        pkgItemCategory === opt.value
                          ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 14%, transparent)`
                          : LEGACY_COLORS.s1,
                      borderColor: pkgItemCategory === opt.value ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
                      color: pkgItemCategory === opt.value ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div
                className="mb-3 flex items-center gap-2 rounded-[14px] border px-3 py-2"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                <input
                  value={pkgItemSearch}
                  onChange={(e) => setPkgItemSearch(e.target.value)}
                  placeholder="품목명·코드 검색"
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: LEGACY_COLORS.text }}
                />
                {pkgItemSearch && (
                  <button onClick={() => setPkgItemSearch("")} style={{ color: LEGACY_COLORS.muted2 }}>✕</button>
                )}
              </div>
              <div className="space-y-2">
                {filteredPkgItems.map((item) => (
                  <div
                    key={item.item_id}
                    className="flex items-center gap-2 rounded-[18px] border px-3 py-2.5"
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                  >
                    <div className="min-w-0 flex-1 text-sm">{buildItemSearchLabel(item)}</div>
                    <input
                      type="number"
                      min="1"
                      value={pkgItemQtyMap[item.item_id] ?? 1}
                      onChange={(e) =>
                        setPkgItemQtyMap((prev) => ({
                          ...prev,
                          [item.item_id]: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      className="w-14 rounded-[10px] border px-2 py-1 text-center text-sm outline-none"
                      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    />
                    <button
                      onClick={() => onAddPackageItem(item.item_id)}
                      className="shrink-0 rounded-[10px] px-3 py-1.5 text-xs font-bold text-white"
                      style={{ background: LEGACY_COLORS.blue }}
                    >
                      추가
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div
            className="flex h-full items-center justify-center rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              왼쪽 목록에서 출하묶음을 선택해 주세요.
            </div>
          </div>
        )}
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
