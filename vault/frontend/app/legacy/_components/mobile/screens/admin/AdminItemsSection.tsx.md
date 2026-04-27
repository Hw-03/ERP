---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/admin/AdminItemsSection.tsx
status: active
updated: 2026-04-27
source_sha: 78d9b9db55bb
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminItemsSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/admin/AdminItemsSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `13502` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/admin/admin|frontend/app/legacy/_components/mobile/screens/admin]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 234줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Item } from "@/lib/api";
import { BottomSheet } from "../../../BottomSheet";
import type { ToastState } from "../../../Toast";
import { LEGACY_COLORS } from "../../../legacyUi";
import { CATEGORY_OPTIONS, EMPTY_ADD_FORM, MODEL_SLOTS, UNIT_OPTIONS } from "./_shared";

export function AdminItemsSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [editForm, setEditForm] = useState({
    item_name: "",
    spec: "",
    unit: "",
    barcode: "",
    legacy_part: "",
    legacy_item_type: "",
    legacy_model: "",
    supplier: "",
    min_stock: "",
  });

  useEffect(() => {
    void api.getItems({ limit: 2000 }).then(setItems);
  }, []);

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items.slice(0, 120);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 120);
  }, [items, search]);

  function openEdit(item: Item) {
    setSelected(item);
    setEditForm({
      item_name: item.item_name,
      spec: item.spec || "",
      unit: item.unit,
      barcode: item.barcode || "",
      legacy_part: item.legacy_part || "",
      legacy_item_type: item.legacy_item_type || "",
      legacy_model: item.legacy_model || "",
      supplier: item.supplier || "",
      min_stock: item.min_stock != null ? String(item.min_stock) : "",
    });
  }

  async function save() {
    if (!selected) return;
    try {
      const updated = await api.updateItem(selected.item_id, {
        item_name: editForm.item_name,
        spec: editForm.spec || undefined,
        unit: editForm.unit,
        barcode: editForm.barcode || undefined,
        legacy_part: editForm.legacy_part || undefined,
        legacy_item_type: editForm.legacy_item_type || undefined,
        legacy_model: editForm.legacy_model || undefined,
        supplier: editForm.supplier || undefined,
        min_stock: editForm.min_stock ? Number(editForm.min_stock) : undefined,
      });
      setItems((current) => current.map((item) => (item.item_id === selected.item_id ? { ...item, ...updated } : item)));
      setSelected(null);
      showToast({ message: "상품 정보를 저장했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "저장하지 못했습니다.", type: "error" });
    }
  }

  async function addItem() {
    if (!addForm.item_name.trim()) {
      showToast({ message: "품목명을 입력하세요.", type: "error" });
      return;
    }
    try {
      const created = await api.createItem({
        item_name: addForm.item_name.trim(),
        category: addForm.category,
        spec: addForm.spec || undefined,
        unit: addForm.unit || "EA",
        model_slots: addForm.model_slots.length > 0 ? addForm.model_slots : undefined,
        option_code: addForm.option_code || undefined,
        legacy_item_type: addForm.legacy_item_type || undefined,
        supplier: addForm.supplier || undefined,
        min_stock: addForm.min_stock ? Number(addForm.min_stock) : undefined,
        initial_quantity: addForm.initial_quantity ? Number(addForm.initial_quantity) : undefined,
      });
      setItems((current) => [created, ...current]);
      setAddOpen(false);
      setAddForm(EMPTY_ADD_FORM);
      showToast({ message: `'${created.item_name}' 품목이 추가됐습니다. (${created.erp_code})`, type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "품목 추가에 실패했습니다.", type: "error" });
    }
  }

  const inputStyle = { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text };
  const labelStyle = { color: LEGACY_COLORS.muted2 };

  return (
    <>
      <button
        onClick={() => setAddOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold transition-colors hover:bg-white/[0.08]"
        style={{ borderColor: LEGACY_COLORS.green, color: LEGACY_COLORS.green }}
      >
        + 품목 추가
      </button>

      <div className="mb-2 flex items-center gap-2 rounded-[11px] border px-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <span>🔍</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품 검색" className="w-full bg-transparent py-[10px] text-sm outline-none" style={{ color: LEGACY_COLORS.text }} />
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {visibleItems.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>품목이 없습니다.</div>
        )}
        {visibleItems.map((item, index) => (
          <button key={item.item_id} onClick={() => openEdit(item)} className="flex w-full items-center justify-between px-[14px] py-3 text-left transition-colors hover:bg-white/[0.12]" style={{ borderBottom: index === visibleItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
            <div>
              <div className="text-sm font-semibold">{item.item_name}</div>
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.erp_code} · {item.legacy_part || "-"} · {item.legacy_model || "공용"}
              </div>
            </div>
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>
              편집
            </div>
          </button>
        ))}
      </div>

      <BottomSheet open={addOpen} onClose={() => { setAddOpen(false); setAddForm(EMPTY_ADD_FORM); }} title="새 품목 추가">
        <div className="space-y-3 px-5 pb-6">
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>품목명 *</div>
            <input value={addForm.item_name} onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))} placeholder="예: 텅스텐 필라멘트" className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>카테고리 *</div>
            <select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value as Item["category"] }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle}>
              {CATEGORY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
            </select>
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>현재 수량</div>
            <input type="number" min={0} value={addForm.initial_quantity} onChange={(e) => setAddForm((f) => ({ ...f, initial_quantity: e.target.value }))} placeholder="0" className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>규격</div>
            <input value={addForm.spec} onChange={(e) => setAddForm((f) => ({ ...f, spec: e.target.value }))} placeholder="예: Ø0.3 × L50" className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>단위</div>
            <select value={addForm.unit} onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle}>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>사용 제품 (ERP 기호)</div>
            <div className="flex flex-wrap gap-2">
              {MODEL_SLOTS.map(({ slot, label, symbol }) => {
                const checked = addForm.model_slots.includes(slot);
                return (
                  <button key={slot} type="button" onClick={() => setAddForm((f) => ({ ...f, model_slots: checked ? f.model_slots.filter((s) => s !== slot) : [...f.model_slots, slot].sort() }))} className="rounded-full border px-3 py-1.5 text-xs font-bold transition-colors" style={{ background: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.s2, borderColor: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.border, color: checked ? "#fff" : LEGACY_COLORS.muted2 }}>
                    {label} ({symbol})
                  </button>
                );
              })}
            </div>
            {addForm.model_slots.length > 0 && (
              <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.purple }}>
                ERP 기호: {MODEL_SLOTS.filter((m) => addForm.model_slots.includes(m.slot)).map((m) => m.symbol).sort().join("")}
              </div>
            )}
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>옵션/스펙 코드</div>
            <input type="text" value={addForm.option_code} onChange={(e) => setAddForm((f) => ({ ...f, option_code: e.target.value.toUpperCase() }))} placeholder="예: BG (블랙 유광)" maxLength={10} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>자재분류</div>
            <input value={addForm.legacy_item_type} onChange={(e) => setAddForm((f) => ({ ...f, legacy_item_type: e.target.value }))} placeholder="예: 필라멘트, 애자" className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>공급사</div>
            <input value={addForm.supplier} onChange={(e) => setAddForm((f) => ({ ...f, supplier: e.target.value }))} placeholder="예: 삼성특수금속" className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>안전재고</div>
            <input type="number" min={0} value={addForm.min_stock} onChange={(e) => setAddForm((f) => ({ ...f, min_stock: e.target.value }))} placeholder="0" className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={inputStyle} />
          </div>
          <div className="pt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            품번은 카테고리 기반으로 자동 부여됩니다. (예: RM-00972)
          </div>
          <button onClick={() => void addItem()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white transition-all hover:brightness-110" style={{ background: LEGACY_COLORS.green }}>
            추가
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected?.item_name || "상품 편집"}>
        <div className="space-y-3 px-5 pb-6">
          {(
            [
              ["item_name", "품명"],
              ["spec", "사양"],
              ["unit", "단위"],
              ["barcode", "바코드"],
              ["legacy_part", "파트"],
              ["legacy_item_type", "분류"],
              ["legacy_model", "모델"],
              ["supplier", "공급처"],
              ["min_stock", "안전재고"],
            ] as [keyof typeof editForm, string][]
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
