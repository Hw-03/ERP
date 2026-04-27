---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_hooks/useWarehouseFilters.ts
status: active
updated: 2026-04-27
source_sha: 27ef6915518e
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useWarehouseFilters.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_hooks/useWarehouseFilters.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `3158` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_hooks/_warehouse_hooks|frontend/app/legacy/_components/_warehouse_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item, ShipPackage } from "@/lib/api";
import { PAGE_SIZE, matchesSearch } from "../_warehouse_steps";

type Args = {
  items: Item[];
  packages: ShipPackage[];
  selectedItems: Map<string, number>;
  globalSearch: string;
  isPackageMode: boolean;
};

export function useWarehouseFilters({
  items,
  packages,
  selectedItems,
  globalSearch,
  isPackageMode,
}: Args) {
  const [localSearch, setLocalSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  const searchKeyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          if (dept === "ALL") return true;
          if (dept === "창고") return (item.warehouse_qty ?? 0) > 0;
          return item.locations?.some((loc) => loc.department === dept && loc.quantity > 0) ?? false;
        })
        .filter((item) => modelFilter === "전체" || item.legacy_model === modelFilter)
        .filter((item) => {
          if (categoryFilter === "ALL") return true;
          if (categoryFilter === "RM") return item.category === "RM";
          if (categoryFilter === "A") return ["TA", "HA", "VA", "AA"].includes(item.category);
          if (categoryFilter === "F") return ["TF", "HF", "VF", "AF"].includes(item.category);
          if (categoryFilter === "FG") return item.category === "FG";
          return true;
        })
        .filter((item) => matchesSearch(item, searchKeyword)),
    [items, dept, modelFilter, categoryFilter, searchKeyword],
  );

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filteredItems]);

  const filteredPackages = useMemo(
    () =>
      packages.filter((pkg) =>
        searchKeyword ? `${pkg.name} ${pkg.package_code}`.toLowerCase().includes(searchKeyword) : true,
      ),
    [packages, searchKeyword],
  );

  const filteredItemIds = useMemo(
    () => new Set(filteredItems.map((it) => it.item_id)),
    [filteredItems],
  );

  const hiddenSelectedCount = useMemo(
    () =>
      isPackageMode
        ? 0
        : Array.from(selectedItems.keys()).filter((id) => !filteredItemIds.has(id)).length,
    [selectedItems, filteredItemIds, isPackageMode],
  );

  const hasActiveFilter =
    !isPackageMode
    && (dept !== "ALL" || modelFilter !== "전체" || categoryFilter !== "ALL" || !!localSearch);

  function clearFilters() {
    setDept("ALL");
    setModelFilter("전체");
    setCategoryFilter("ALL");
    setLocalSearch("");
  }

  return {
    localSearch,
    setLocalSearch,
    dept,
    setDept,
    modelFilter,
    setModelFilter,
    categoryFilter,
    setCategoryFilter,
    displayLimit,
    setDisplayLimit,
    searchKeyword,
    filteredItems,
    filteredPackages,
    hiddenSelectedCount,
    hasActiveFilter,
    clearFilters,
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
