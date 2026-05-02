"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Item, type ShipPackage } from "@/lib/api";
import { BottomSheet } from "@/features/mes/shared/BottomSheet";
import type { ToastState } from "@/features/mes/shared/Toast";
import { LEGACY_COLORS } from "../../../legacyUi";
import { buildItemSearchLabel } from "@/lib/mes/item";
import { formatQty } from "@/lib/mes/format";
export function AdminPackagesSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ package_code: "", name: "", notes: "" });
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    Promise.all([api.getShipPackages(), api.getItems({ limit: 2000 })]).then(([nextPackages, nextItems]) => {
      setPackages(nextPackages);
      setItems(nextItems);
    });
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = itemSearch.trim().toLowerCase();
    if (!keyword) return items.slice(0, 30);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 30);
  }, [itemSearch, items]);

  async function createPackage() {
    try {
      const created = await api.createShipPackage(createForm);
      setPackages((current) => [...current, created]);
      setCreateOpen(false);
      setCreateForm({ package_code: "", name: "", notes: "" });
      showToast({ message: "출하 묶음을 생성했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "출하 묶음을 생성하지 못했습니다.", type: "error" });
    }
  }

  async function addItem() {
    if (!selectedPackage || !itemId || !Number(quantity)) return;
    const updated = await api.addShipPackageItem(selectedPackage.package_id, { item_id: itemId, quantity: Number(quantity) });
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
    setItemSearch("");
    setItemId("");
    setQuantity("1");
  }

  async function removeItem(packageItemId: string) {
    if (!selectedPackage) return;
    const updated = await api.deleteShipPackageItem(selectedPackage.package_id, packageItemId);
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
  }

  async function removePackage(packageId: string) {
    await api.deleteShipPackage(packageId);
    setPackages((current) => current.filter((entry) => entry.package_id !== packageId));
    if (selectedPackage?.package_id === packageId) setSelectedPackage(null);
  }

  return (
    <>
      <button
        onClick={() => setCreateOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        + 출하묶음 생성
      </button>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {packages.map((pkg, index) => (
          <div key={pkg.package_id} className="flex items-center justify-between gap-3 px-[14px] py-3" style={{ borderBottom: index === packages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{pkg.name}</div>
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {pkg.package_code} · {pkg.items.length}종
              </div>
            </div>
            <button onClick={() => setSelectedPackage(pkg)} className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>편집</button>
            <button onClick={() => void removePackage(pkg.package_id)} className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>삭제</button>
          </div>
        ))}
      </div>

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="출하묶음 생성">
        <div className="space-y-3 px-5 pb-6">
          {(
            [
              ["package_code", "묶음 코드"],
              ["name", "이름"],
              ["notes", "비고"],
            ] as [keyof typeof createForm, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
              <input value={createForm[key]} onChange={(event) => setCreateForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
            </div>
          ))}
          <button onClick={() => void createPackage()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>생성</button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!selectedPackage} onClose={() => setSelectedPackage(null)} title={selectedPackage?.name || "출하묶음"}>
        <div className="space-y-3 px-5 pb-6">
          {selectedPackage?.items.map((item) => (
            <div key={item.package_item_id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: LEGACY_COLORS.s2 }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.item_name}</div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatQty(item.quantity)} {item.item_unit}
                </div>
              </div>
              <button onClick={() => void removeItem(item.package_item_id)} className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>삭제</button>
            </div>
          ))}
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>품목 추가</div>
            <input value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setItemId(""); }} placeholder="품목 검색" className="mb-2 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
            {itemSearch && !itemId ? (
              <div className="mb-2 max-h-36 overflow-y-auto rounded-[11px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                {filteredItems.map((item, index) => (
                  <button key={item.item_id} onClick={() => { setItemId(item.item_id); setItemSearch(buildItemSearchLabel(item)); }} className="block w-full px-[14px] py-2 text-left text-sm" style={{ borderBottom: index === filteredItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                    {item.item_name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
              <button onClick={() => void addItem()} className="rounded-xl py-[13px] text-sm font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>추가</button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
