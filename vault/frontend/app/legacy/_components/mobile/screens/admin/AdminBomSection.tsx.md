---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/admin/AdminBomSection.tsx
status: active
updated: 2026-04-27
source_sha: ce749dd42bcf
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminBomSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/admin/AdminBomSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `7162` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/admin/admin|frontend/app/legacy/_components/mobile/screens/admin]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type BOMEntry, type Item } from "@/lib/api";
import type { ToastState } from "../../../Toast";
import { LEGACY_COLORS, buildItemSearchLabel, formatNumber } from "../../../legacyUi";

export function AdminBomSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [childSearch, setChildSearch] = useState("");
  const [childId, setChildId] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    void api.getItems({ limit: 2000 }).then((nextItems) => {
      setItems(nextItems);
      if (nextItems[0]) setParentId(nextItems[0].item_id);
    });
  }, []);

  useEffect(() => {
    if (!parentId) return;
    void api.getBOM(parentId).then(setBomRows).catch(() => setBomRows([]));
  }, [parentId]);

  const filteredChildren = useMemo(() => {
    const keyword = childSearch.trim().toLowerCase();
    if (!keyword) return items.slice(0, 30);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 30);
  }, [childSearch, items]);

  async function addRow() {
    if (!parentId || !childId || !Number(quantity)) return;
    try {
      const created = await api.createBOM({
        parent_item_id: parentId,
        child_item_id: childId,
        quantity: Number(quantity),
        unit: "EA",
      });
      setBomRows((current) => [...current, created]);
      setChildId("");
      setChildSearch("");
      setQuantity("1");
      showToast({ message: "BOM 항목을 추가했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "BOM 항목을 추가하지 못했습니다.", type: "error" });
    }
  }

  async function removeRow(bomId: string) {
    await api.deleteBOM(bomId);
    setBomRows((current) => current.filter((row) => row.bom_id !== bomId));
  }

  return (
    <div>
      <div className="mb-3">
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
          상위 품목
        </div>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          {items.map((item) => (
            <option key={item.item_id} value={item.item_id}>
              {item.erp_code} · {item.item_name}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3 rounded-[14px] border px-[14px] py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 품목 추가
        </div>
        <input value={childSearch} onChange={(event) => { setChildSearch(event.target.value); setChildId(""); }} placeholder="하위 품목 검색" className="mb-2 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
        {childSearch && !childId ? (
          <div className="mb-2 max-h-36 overflow-y-auto rounded-[11px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
            {filteredChildren.map((item, index) => (
              <button key={item.item_id} onClick={() => { setChildId(item.item_id); setChildSearch(buildItemSearchLabel(item)); }} className="block w-full px-[14px] py-2 text-left text-sm" style={{ borderBottom: index === filteredChildren.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                {item.item_name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mb-2 grid grid-cols-[1fr_100px] gap-2">
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
          <button onClick={() => void addRow()} className="rounded-xl py-[13px] text-sm font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>
            추가
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {bomRows.length === 0 ? (
          <div className="px-[14px] py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            등록된 BOM이 없습니다.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_56px_56px_52px] border-b px-[14px] py-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
              <span>자재명</span>
              <span className="text-right">소요</span>
              <span className="text-right">현재고</span>
              <span className="text-right">가능</span>
            </div>
            {bomRows.map((row, index) => {
              const childItem = items.find((item) => item.item_id === row.child_item_id);
              const stock = Number(childItem?.quantity ?? 0);
              const capacity = row.quantity > 0 ? Math.floor(stock / row.quantity) : 0;
              return (
                <div key={row.bom_id} className="grid grid-cols-[1fr_56px_56px_52px] items-center px-[14px] py-3" style={{ borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{childItem?.item_name || row.child_item_id}</div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      <span>{childItem?.erp_code}</span>
                      <button onClick={() => void removeRow(row.bom_id)} className="font-bold" style={{ color: LEGACY_COLORS.red }}>삭제</button>
                    </div>
                  </div>
                  <div className="text-right text-xs">{formatNumber(row.quantity)}</div>
                  <div className="text-right text-xs font-bold" style={{ color: stock > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>{formatNumber(stock)}</div>
                  <div className="text-right text-xs font-bold" style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}>{formatNumber(capacity)}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
