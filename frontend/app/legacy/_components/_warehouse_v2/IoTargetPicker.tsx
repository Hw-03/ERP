"use client";

import { PackagePlus, Search } from "lucide-react";
import type { IoWorkType, Item, ShipPackage } from "./types";
import { canPickPackages } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";

interface Props {
  workType: IoWorkType;
  items: Item[];
  packages: ShipPackage[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddItem: (item: Item, sourceKind?: "direct_item" | "manual") => void;
  onAddPackage: (pkg: ShipPackage) => void;
  busy?: boolean;
}

function itemMatches(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.item_name,
    item.erp_code,
    item.barcode,
    item.spec,
    item.legacy_model,
    item.legacy_part,
    item.legacy_item_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

export function IoTargetPicker({
  workType,
  items,
  packages,
  search,
  onSearchChange,
  onAddItem,
  onAddPackage,
  busy,
}: Props) {
  const filteredItems = items.filter((item) => itemMatches(item, search)).slice(0, 30);
  const filteredPackages = packages
    .filter((pkg) => `${pkg.package_code} ${pkg.name}`.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">대상 선택</h2>
          <p className="text-xs font-medium text-slate-500">
            BOM/패키지는 선택과 동시에 실제 반영 품목으로 펼쳐집니다.
          </p>
        </div>
        <label className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="품목, ERP 코드, 패키지 검색"
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
      </div>

      {canPickPackages(workType) && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">패키지</div>
          <div className="grid gap-2 md:grid-cols-2">
            {filteredPackages.map((pkg) => (
              <button
                key={pkg.package_id}
                type="button"
                disabled={busy}
                onClick={() => onAddPackage(pkg)}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-blue-300 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-black text-slate-900">{pkg.name}</span>
                  <span className="block text-xs font-semibold text-slate-500">
                    {pkg.package_code} · 구성 {pkg.items.length}개
                  </span>
                </span>
                <PackagePlus className="h-5 w-5 text-blue-600" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">품목</div>
      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {filteredItems.map((item) => (
          <div
            key={item.item_id}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-slate-900">{item.item_name}</span>
              <span className="block truncate text-xs font-semibold text-slate-500">
                {item.erp_code || "ERP 미지정"} · 창고 {formatQty(item.warehouse_qty)} · 총 {formatQty(item.quantity)}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAddItem(item)}
                className="rounded-full bg-blue-600 px-2 py-1 text-xs font-black text-white disabled:opacity-50"
              >
                기준
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAddItem(item, "manual")}
                className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 disabled:opacity-50"
              >
                수동
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
