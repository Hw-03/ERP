---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_hooks/useAdminBom.ts
status: active
updated: 2026-04-27
source_sha: 13f2ee493945
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useAdminBom.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_hooks/useAdminBom.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `6817` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_hooks/_admin_hooks|frontend/app/legacy/_components/_admin_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// BOM 섹션 전용 hook.
// DesktopAdminView 의 BOM 관련 useState 10개 + 파생 메모 2개 + 액션 3개를
// 한 곳에 모은다. AdminBomProvider 가 이 hook 을 호출해 Context 로 노출한다.

import { useEffect, useMemo, useState } from "react";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { api } from "@/lib/api";

const A_CATS = new Set(["TA", "HA", "VA", "AA"]);
const F_CATS = new Set(["TF", "HF", "VF", "AF"]);

type ChildItemPlus = Item & { alreadyIn: boolean };

export type UseAdminBomArgs = {
  items: Item[];
  allBomRows: BOMDetailEntry[];
  /** allBomRows 재조회 트리거 (DesktopAdminView 에서 보유) */
  refreshAllBom: () => void;
  /** 성공 메시지 */
  onStatusChange: (msg: string) => void;
  /** 에러 메시지 */
  onError: (msg: string) => void;
};

export type AdminBomState = {
  // 기본 상태
  parentId: string;
  setParentId: (id: string) => void;
  bomRows: BOMEntry[];
  bomParentSearch: string;
  setBomParentSearch: (v: string) => void;
  bomParentCat: string;
  setBomParentCat: (v: string) => void;
  bomChildSearch: string;
  setBomChildSearch: (v: string) => void;
  bomChildCat: string;
  setBomChildCat: (v: string) => void;
  pendingChildId: string | null;
  setPendingChildId: (v: string | null) => void;
  pendingChildQty: string;
  setPendingChildQty: (v: string) => void;
  editingBomId: string | null;
  setEditingBomId: (v: string | null) => void;
  editingQty: string;
  setEditingQty: (v: string) => void;

  // 외부 데이터 (props 로 받은 그대로 노출)
  items: Item[];
  allBomRows: BOMDetailEntry[];

  // 파생
  bomParentItems: Item[];
  bomChildItems: ChildItemPlus[];

  // Phase 5: Where-Used (선택된 parent 가 어떤 다른 parent 의 child 로 들어가는지)
  whereUsedRows: BOMDetailEntry[];

  // 액션
  addBomRow: (childId: string, qty: number) => void;
  saveBomQty: (row: BOMEntry) => void;
  deleteBomRow: (bomId: string) => void;
};

export function useAdminBom({
  items,
  allBomRows,
  refreshAllBom,
  onStatusChange,
  onError,
}: UseAdminBomArgs): AdminBomState {
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [bomParentSearch, setBomParentSearch] = useState("");
  const [bomParentCat, setBomParentCat] = useState("ALL");
  const [bomChildSearch, setBomChildSearch] = useState("");
  const [bomChildCat, setBomChildCat] = useState("ALL");
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [pendingChildQty, setPendingChildQty] = useState("1");
  const [editingBomId, setEditingBomId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");

  useEffect(() => {
    if (!parentId) {
      setBomRows([]);
      return;
    }
    void api.getBOM(parentId).then(setBomRows).catch(() => setBomRows([]));
  }, [parentId]);

  // Phase 5: Where-Used (이 parent 품목이 다른 BOM 의 child 로 들어가는 곳)
  const [whereUsedRows, setWhereUsedRows] = useState<BOMDetailEntry[]>([]);
  useEffect(() => {
    if (!parentId) {
      setWhereUsedRows([]);
      return;
    }
    void api
      .getBOMWhereUsed(parentId)
      .then(setWhereUsedRows)
      .catch(() => setWhereUsedRows([]));
  }, [parentId]);

  const bomParentItems = useMemo(() => {
    let pool = items.filter((i) => i.category !== "RM");
    if (bomParentCat !== "ALL") pool = pool.filter((i) => i.category === bomParentCat);
    const kw = bomParentSearch.trim().toLowerCase();
    if (kw) pool = pool.filter((i) => `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw));
    return pool.slice(0, 100);
  }, [items, bomParentSearch, bomParentCat]);

  const bomChildItems = useMemo<ChildItemPlus[]>(() => {
    const kw = bomChildSearch.trim().toLowerCase();
    const existingIds = new Set(bomRows.map((r) => r.child_item_id));
    return items
      .filter((i) => i.item_id !== parentId)
      .filter((i) => {
        if (bomChildCat === "RM") return i.category === "RM";
        if (bomChildCat === "?A") return A_CATS.has(i.category);
        if (bomChildCat === "?F") return F_CATS.has(i.category);
        return true;
      })
      .filter((i) => !kw || `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw))
      .slice(0, 60)
      .map((i) => ({ ...i, alreadyIn: existingIds.has(i.item_id) }));
  }, [items, parentId, bomChildSearch, bomChildCat, bomRows]);

  async function addBomRow(childId: string, qty: number) {
    if (!parentId) return;
    try {
      // 의도적 pessimistic — API 성공 후에만 setBomRows. 실패 시 UI 가 잘못 보이지 않음.
      const created = await api.createBOM({
        parent_item_id: parentId,
        child_item_id: childId,
        quantity: qty,
        unit: "EA",
      });
      setBomRows((current) => [...current, created]);
      setPendingChildId(null);
      setPendingChildQty("1");
      refreshAllBom();
      onStatusChange("BOM 항목을 추가했습니다.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "추가에 실패했습니다.");
    }
  }

  async function saveBomQty(row: BOMEntry) {
    const qty = parseFloat(editingQty);
    setEditingBomId(null);
    if (!qty || qty === row.quantity) return;
    try {
      const updated = await api.updateBOM(row.bom_id, { quantity: qty });
      setBomRows((current) => current.map((r) => (r.bom_id === updated.bom_id ? updated : r)));
      refreshAllBom();
      onStatusChange("수량을 변경했습니다.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "수량 변경에 실패했습니다.");
    }
  }

  async function deleteBomRow(bomId: string) {
    try {
      await api.deleteBOM(bomId);
      setBomRows((current) => current.filter((e) => e.bom_id !== bomId));
      refreshAllBom();
    } catch (err) {
      onError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return {
    parentId,
    setParentId,
    bomRows,
    bomParentSearch,
    setBomParentSearch,
    bomParentCat,
    setBomParentCat,
    bomChildSearch,
    setBomChildSearch,
    bomChildCat,
    setBomChildCat,
    pendingChildId,
    setPendingChildId,
    pendingChildQty,
    setPendingChildQty,
    editingBomId,
    setEditingBomId,
    editingQty,
    setEditingQty,
    items,
    allBomRows,
    bomParentItems,
    bomChildItems,
    whereUsedRows,
    addBomRow: (childId, qty) => void addBomRow(childId, qty),
    saveBomQty: (row) => void saveBomQty(row),
    deleteBomRow: (bomId) => void deleteBomRow(bomId),
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
