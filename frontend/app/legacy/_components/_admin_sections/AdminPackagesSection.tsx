"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, PackageOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { FilterChip } from "../common/FilterChip";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminPackagesContext } from "./AdminPackagesContext";
import { PKG_CATEGORY_OPTIONS } from "./adminShared";
import { buildItemSearchLabel } from "@/lib/mes/item";

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
    createSimplePackage,
    addPackageItem,
    renamePackage,
    removePackageItem,
    deletePackage,
  } = ctx;

  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages
      .filter((p) => {
        if (usageFilter === "used" && p.items.length === 0) return false;
        if (usageFilter === "unused" && p.items.length > 0) return false;
        return true;
      })
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.package_code.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [packages, search, usageFilter]);

  const stats = useMemo(() => {
    const used = packages.filter((p) => p.items.length > 0).length;
    const totalItems = packages.reduce((s, p) => s + p.items.length, 0);
    const lastUpdate = packages
      .map((p) => p.updated_at)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    return { used, totalItems, lastUpdate };
  }, [packages]);

  // 첫 패키지 자동 선택
  useEffect(() => {
    if (selectedPackage) return;
    if (filteredPackages.length === 0) return;
    setSelectedPackage(filteredPackages[0]);
  }, [selectedPackage, filteredPackages, setSelectedPackage]);

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    deletePackage(deleteTarget.id);
    setDeleteTarget(null);
  }

  function handleExport(pkg: ShipPackage) {
    const headers = ["품목 코드", "품명", "단위", "수량"];
    const rows = pkg.items.map((it) => [
      it.erp_code ?? "",
      it.item_name,
      it.item_unit ?? "EA",
      String(it.quantity),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pkg.package_code}_${pkg.name}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex min-h-0 flex-col">
        <AdminPageHeader
          icon={PackageOpen}
          title="출하묶음 관리"
          description="패키지 구성 관리 및 포함 품목을 등록·관리할 수 있습니다."
          actions={
            <button
              type="button"
              onClick={createSimplePackage}
              className="flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:brightness-110"
              style={{ background: LEGACY_COLORS.blue }}
            >
              <Plus className="h-4 w-4" />
              패키지 추가
            </button>
          }
        />

        <AdminKpiBar
          items={[
            { key: "all", label: "전체 패키지", value: packages.length, hint: "등록된 패키지", tone: LEGACY_COLORS.blue },
            { key: "used", label: "사용 중", value: stats.used, hint: "구성 품목 보유", tone: LEGACY_COLORS.green },
            { key: "last", label: "최근 수정", value: stats.lastUpdate ? formatDate(stats.lastUpdate) : "—", hint: "마지막 변경일", tone: LEGACY_COLORS.cyan },
            { key: "items", label: "총 구성 품목", value: stats.totalItems, hint: "전체 품목 합계", tone: LEGACY_COLORS.purple },
          ]}
        />

        <div className="flex min-h-0 flex-1 gap-4">
          <AdminListPanel
            title="패키지 목록"
            countLabel={`${filteredPackages.length}건`}
            width={320}
            searchValue={search}
            searchPlaceholder="패키지명·코드 검색"
            onSearchChange={setSearch}
            filters={
              <>
                <FilterChip active={usageFilter === "all"} label="전체" onClick={() => setUsageFilter("all")} size="sm" />
                <FilterChip active={usageFilter === "used"} label="사용 중" onClick={() => setUsageFilter("used")} size="sm" tone={LEGACY_COLORS.green} />
                <FilterChip active={usageFilter === "unused"} label="미사용" onClick={() => setUsageFilter("unused")} size="sm" />
              </>
            }
            items={filteredPackages}
            emptyState={
              <EmptyState
                variant={search ? "no-search-result" : "no-data"}
                compact
                title={search ? "검색 결과가 없습니다." : "등록된 패키지가 없습니다."}
              />
            }
            renderItem={(pkg) => {
              const active = selectedPackage?.package_id === pkg.package_id;
              return (
                <button
                  key={pkg.package_id}
                  type="button"
                  onClick={() => {
                    setSelectedPackage(pkg);
                    setPkgRenaming(false);
                  }}
                  className="flex w-full flex-col gap-1 rounded-[10px] border px-3 py-2 text-left transition-colors hover:brightness-[1.04]"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                      : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black"
                      style={{
                        background: active
                          ? LEGACY_COLORS.blue
                          : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 16%, transparent)`,
                        color: active ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
                      }}
                    >
                      {pkg.package_code}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[13px] font-bold"
                      style={{ color: LEGACY_COLORS.text }}
                    >
                      {pkg.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    <span>포함 {pkg.items.length}종</span>
                    {pkg.updated_at && <span>{formatDate(pkg.updated_at)}</span>}
                  </div>
                </button>
              );
            }}
          />

          <AdminDetailCard
            title={
              selectedPackage ? (
                pkgRenaming ? (
                  <RenameInput
                    value={pkgNameDraft}
                    onChange={setPkgNameDraft}
                    onConfirm={renamePackage}
                    onCancel={() => setPkgRenaming(false)}
                  />
                ) : (
                  selectedPackage.name
                )
              ) : (
                "패키지를 선택하세요"
              )
            }
            subtitle={selectedPackage?.package_code}
            status={
              selectedPackage ? (
                <StatusPill
                  label={selectedPackage.items.length > 0 ? "사용 중" : "미사용"}
                  tone={selectedPackage.items.length > 0 ? "success" : "neutral"}
                />
              ) : null
            }
            actions={
              selectedPackage && !pkgRenaming ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPkgNameDraft(selectedPackage.name);
                      setPkgRenaming(true);
                    }}
                    className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                    style={{
                      background: LEGACY_COLORS.s2,
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.text,
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport(selectedPackage)}
                    className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                    style={{
                      background: LEGACY_COLORS.s2,
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.text,
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ id: selectedPackage.package_id, name: selectedPackage.name })
                    }
                    className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
                      borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
                      color: LEGACY_COLORS.red,
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                </>
              ) : null
            }
          >
            {selectedPackage ? (
              <PackageDetailContent
                pkg={selectedPackage}
                pkgItemSearch={pkgItemSearch}
                setPkgItemSearch={setPkgItemSearch}
                pkgItemCategory={pkgItemCategory}
                setPkgItemCategory={setPkgItemCategory}
                pkgItemQtyMap={pkgItemQtyMap}
                setPkgItemQtyMap={setPkgItemQtyMap}
                filteredPkgItems={filteredPkgItems}
                addPackageItem={addPackageItem}
                removePackageItem={removePackageItem}
              />
            ) : (
              <EmptyState
                variant="no-data"
                title="좌측에서 패키지를 선택하세요"
                description="패키지를 클릭하면 포함 품목을 확인하고 편집할 수 있습니다."
              />
            )}
          </AdminDetailCard>
        </div>
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="패키지 삭제"
        tone="danger"
        cautionMessage={`'${deleteTarget?.name}' 패키지를 영구 삭제합니다. 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

function RenameInput({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        className="rounded-[10px] border px-2.5 py-1.5 text-[14px] font-bold outline-none focus:border-[var(--c-blue)]"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.blue,
          color: LEGACY_COLORS.text,
        }}
      />
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-[8px] p-1.5 text-white"
        style={{ background: LEGACY_COLORS.blue }}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[8px] p-1.5"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface PackageDetailContentProps {
  pkg: ShipPackage;
  pkgItemSearch: string;
  setPkgItemSearch: (v: string) => void;
  pkgItemCategory: string;
  setPkgItemCategory: (v: string) => void;
  pkgItemQtyMap: Record<string, number>;
  setPkgItemQtyMap: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  filteredPkgItems: ReturnType<typeof useAdminPackagesContext>["filteredPkgItems"];
  addPackageItem: (id: string) => void;
  removePackageItem: (id: string) => void;
}

function PackageDetailContent({
  pkg,
  pkgItemSearch,
  setPkgItemSearch,
  pkgItemCategory,
  setPkgItemCategory,
  pkgItemQtyMap,
  setPkgItemQtyMap,
  filteredPkgItems,
  addPackageItem,
  removePackageItem,
}: PackageDetailContentProps) {
  const totalQty = pkg.items.reduce((s, it) => s + Number(it.quantity), 0);
  return (
    <div className="flex flex-col gap-5">
      {/* 메타 카드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetaCell label="패키지 코드" value={pkg.package_code} mono />
        <MetaCell label="포함 품목" value={`${pkg.items.length}종`} tone={LEGACY_COLORS.blue} />
        <MetaCell label="총 수량" value={formatQty(totalQty)} tone={LEGACY_COLORS.green} />
        <MetaCell label="최근 수정" value={pkg.updated_at ? formatDate(pkg.updated_at) : "—"} />
      </div>

      {/* 포함 품목 표 */}
      <div>
        <div className="mb-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          포함 품목 ({pkg.items.length}종)
        </div>
        <div
          className="overflow-hidden rounded-[12px] border"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div
            className="grid items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-[0.08em]"
            style={{
              gridTemplateColumns: "100px 1fr 70px 90px 40px",
              background: LEGACY_COLORS.s3,
              color: LEGACY_COLORS.muted2,
            }}
          >
            <span>품목 코드</span>
            <span>품명</span>
            <span>단위</span>
            <span className="text-right">수량</span>
            <span />
          </div>
          {pkg.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
              아직 품목이 없습니다. 아래 검색에서 추가해 주세요.
            </div>
          ) : (
            pkg.items.map((it, idx) => (
              <div
                key={it.package_item_id}
                className="grid items-center gap-2 px-4 py-2 text-[13px]"
                style={{
                  gridTemplateColumns: "100px 1fr 70px 90px 40px",
                  borderTop: idx === 0 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <span
                  className="rounded-md px-2 py-0.5 font-mono text-[11px] font-bold"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 14%, transparent)`,
                    color: LEGACY_COLORS.muted,
                  }}
                >
                  {it.erp_code ?? "—"}
                </span>
                <span className="truncate" style={{ color: LEGACY_COLORS.text }}>
                  {it.item_name}
                </span>
                <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {it.item_unit ?? "EA"}
                </span>
                <span className="text-right font-bold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                  {formatQty(it.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => removePackageItem(it.package_item_id)}
                  className="ml-auto rounded p-1 hover:bg-red-500/10"
                  style={{ color: LEGACY_COLORS.red }}
                  title="제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 품목 추가 */}
      <div>
        <div className="mb-2 text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          품목 추가
        </div>
        <div
          className="rounded-[12px] border p-3"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PKG_CATEGORY_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                active={pkgItemCategory === opt.value}
                label={opt.label}
                onClick={() => setPkgItemCategory(opt.value)}
                size="sm"
                tone={LEGACY_COLORS.cyan}
              />
            ))}
          </div>
          <div
            className="mb-2 flex items-center gap-2 rounded-[10px] border px-3 py-1.5"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <Search className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.muted2 }} />
            <input
              value={pkgItemSearch}
              onChange={(e) => setPkgItemSearch(e.target.value)}
              placeholder="품목명·코드 검색"
              className="flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
          </div>
          <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
            {filteredPkgItems.length === 0 ? (
              <div className="py-3 text-center text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                후보가 없습니다. 카테고리·검색을 조정해 보세요.
              </div>
            ) : (
              filteredPkgItems.map((item) => (
                <div
                  key={item.item_id}
                  className="flex items-center gap-2 rounded-[10px] border px-3 py-1.5"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="min-w-0 flex-1 truncate text-[12px]">
                    {buildItemSearchLabel(item)}
                  </div>
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
                    className="w-14 rounded-[8px] border px-2 py-1 text-center text-[12px] outline-none"
                    style={{
                      background: LEGACY_COLORS.s2,
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.text,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addPackageItem(item.item_id)}
                    className="rounded-[8px] px-3 py-1 text-[11px] font-bold text-white transition-colors hover:brightness-110"
                    style={{ background: LEGACY_COLORS.blue }}
                  >
                    추가
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaCell({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div
      className="rounded-[12px] border px-3 py-2.5"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div
        className={`mt-0.5 text-[14px] font-black ${mono ? "font-mono" : ""}`}
        style={{ color: tone ?? LEGACY_COLORS.text }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}
