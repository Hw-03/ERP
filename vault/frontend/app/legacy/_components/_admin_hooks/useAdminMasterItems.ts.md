---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_hooks/useAdminMasterItems.ts
status: active
updated: 2026-04-27
source_sha: c2b3e9fca439
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useAdminMasterItems.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_hooks/useAdminMasterItems.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `4210` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_hooks/_admin_hooks|frontend/app/legacy/_components/_admin_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// AdminMasterItemsSection 전용 hook.
// 품목 마스터 검색/선택/추가/필드 저장 상태와 액션을 한 곳에 모은다.

import { useMemo, useState } from "react";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { EMPTY_ADD_FORM, type AddForm } from "../_admin_sections/adminShared";

export type UseAdminMasterItemsArgs = {
  items: Item[];
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  globalSearch: string;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  /** 짧은 토스트(상단 우측 비공식 메시지) — DesktopAdminView 의 showSave 와 호환 */
  onShowSave?: (msg: string) => void;
};

export type AdminMasterItemsState = {
  selectedItem: Item | null;
  setSelectedItem: (i: Item | null) => void;
  itemSearch: string;
  setItemSearch: (v: string) => void;
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  addForm: AddForm;
  setAddForm: (updater: (f: AddForm) => AddForm) => void;
  visibleItems: Item[];
  addItem: () => void;
  saveItemField: (
    field: "item_name" | "spec" | "barcode" | "legacy_model" | "supplier",
    value: string,
  ) => void;
};

export function useAdminMasterItems({
  items,
  setItems,
  globalSearch,
  onStatusChange,
  onError,
  onShowSave,
}: UseAdminMasterItemsArgs): AdminMasterItemsState {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM);

  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${itemSearch}`.trim().toLowerCase();
    if (!keyword) return items.slice(0, 200);
    return items
      .filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword))
      .slice(0, 200);
  }, [globalSearch, itemSearch, items]);

  async function _addItem() {
    if (!addForm.item_name.trim()) {
      onError("품목명을 입력하세요.");
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
      setSelectedItem(created);
      setAddMode(false);
      setAddForm(() => EMPTY_ADD_FORM);
      onStatusChange(`'${created.item_name}' 품목이 추가됐습니다. (${created.erp_code})`);
      onShowSave?.(`'${created.item_name}' 품목이 추가됐습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "품목 추가에 실패했습니다.");
    }
  }

  async function _saveItemField(
    field: "item_name" | "spec" | "barcode" | "legacy_model" | "supplier",
    value: string,
  ) {
    if (!selectedItem) return;
    try {
      const updated = await api.updateItem(selectedItem.item_id, { [field]: value || undefined });
      setItems((current) => current.map((item) => (item.item_id === updated.item_id ? updated : item)));
      setSelectedItem(updated);
      onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
      onShowSave?.("저장됐습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  return {
    selectedItem,
    setSelectedItem,
    itemSearch,
    setItemSearch,
    addMode,
    setAddMode,
    addForm,
    setAddForm,
    visibleItems,
    addItem: () => void _addItem(),
    saveItemField: (f, v) => void _saveItemField(f, v),
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
