---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_hooks/useAdminPackages.ts
status: active
updated: 2026-04-27
source_sha: bfefdadca877
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useAdminPackages.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_hooks/useAdminPackages.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `6622` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_hooks/_admin_hooks|frontend/app/legacy/_components/_admin_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// AdminPackagesSection 전용 hook.
// DesktopAdminView 의 Packages 관련 useState 6개 + 파생(filteredPkgItems) + 액션 5개를 흡수.
// AdminPackagesProvider 가 이 hook 을 호출해 Context 로 노출.

import { useMemo, useState } from "react";
import type { Item, ShipPackage } from "@/lib/api";
import { api } from "@/lib/api";

const A_SET = new Set(["TA", "HA", "VA", "AA"]);
const F_SET = new Set(["TF", "HF", "VF", "AF"]);

export type UseAdminPackagesArgs = {
  items: Item[];
  packages: ShipPackage[];
  setPackages: (updater: (prev: ShipPackage[]) => ShipPackage[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
};

export type AdminPackagesState = {
  // 외부 데이터 그대로 노출
  packages: ShipPackage[];

  // 기본 상태
  selectedPackage: ShipPackage | null;
  setSelectedPackage: (p: ShipPackage | null) => void;
  pkgRenaming: boolean;
  setPkgRenaming: (v: boolean) => void;
  pkgNameDraft: string;
  setPkgNameDraft: (v: string) => void;
  pkgItemSearch: string;
  setPkgItemSearch: (v: string) => void;
  pkgItemCategory: string;
  setPkgItemCategory: (v: string) => void;
  pkgItemQtyMap: Record<string, number>;
  setPkgItemQtyMap: (updater: (prev: Record<string, number>) => Record<string, number>) => void;

  // 파생
  filteredPkgItems: Item[];

  // 액션
  createSimplePackage: () => void;
  addPackageItem: (itemId: string) => void;
  renamePackage: () => void;
  removePackageItem: (packageItemId: string) => void;
  deletePackage: (packageId: string) => void;
};

export function useAdminPackages({
  items,
  packages,
  setPackages,
  onStatusChange,
  onError,
}: UseAdminPackagesArgs): AdminPackagesState {
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [pkgRenaming, setPkgRenaming] = useState(false);
  const [pkgNameDraft, setPkgNameDraft] = useState("");
  const [pkgItemSearch, setPkgItemSearch] = useState("");
  const [pkgItemCategory, setPkgItemCategory] = useState("ALL");
  const [pkgItemQtyMap, setPkgItemQtyMap] = useState<Record<string, number>>({});

  const filteredPkgItems = useMemo(() => {
    const kw = pkgItemSearch.trim().toLowerCase();
    return items
      .filter((i) => {
        if (pkgItemCategory === "ALL") return true;
        if (pkgItemCategory === "?A") return A_SET.has(i.category);
        if (pkgItemCategory === "?F") return F_SET.has(i.category);
        return i.category === pkgItemCategory;
      })
      .filter((i) => !kw || `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw))
      .slice(0, 40);
  }, [items, pkgItemSearch, pkgItemCategory]);

  async function _createSimplePackage() {
    try {
      // 의도적 pessimistic — API 성공 후에만 setPackages. 실패 시 UI 가 잘못 보이지 않음.
      // 진정한 optimistic 이 필요하면 snapshot → set → catch → restore 패턴 도입.
      const created = await api.createShipPackage({
        package_code: `PKG-${Date.now()}`,
        name: `출하묶음 ${packages.length + 1}`,
      });
      const newPkg = { ...created, items: [] as ShipPackage["items"] };
      setPackages((current) => [...current, newPkg]);
      setSelectedPackage(newPkg);
      onStatusChange(`${created.name} 출하묶음을 생성했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "출하묶음 생성에 실패했습니다.");
    }
  }

  async function _addPackageItem(itemId: string) {
    if (!selectedPackage) return;
    const qty = pkgItemQtyMap[itemId] ?? 1;
    try {
      const updated = await api.addShipPackageItem(selectedPackage.package_id, {
        item_id: itemId,
        quantity: qty,
      });
      setPackages((current) =>
        current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)),
      );
      setSelectedPackage(updated);
      onStatusChange(`${updated.name}에 품목을 추가했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "품목 추가에 실패했습니다.");
    }
  }

  async function _renamePackage() {
    if (!selectedPackage || !pkgNameDraft.trim()) return;
    try {
      const updated = await api.updateShipPackage(selectedPackage.package_id, {
        name: pkgNameDraft.trim(),
      });
      const newPkg = { ...updated, items: selectedPackage.items };
      setPackages((current) =>
        current.map((entry) => (entry.package_id === newPkg.package_id ? newPkg : entry)),
      );
      setSelectedPackage(newPkg);
      setPkgRenaming(false);
      onStatusChange(`출하묶음 이름을 '${newPkg.name}'으로 변경했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "이름 변경에 실패했습니다.");
    }
  }

  async function _removePackageItem(packageItemId: string) {
    if (!selectedPackage) return;
    try {
      const updated = await api.deleteShipPackageItem(selectedPackage.package_id, packageItemId);
      setPackages((current) =>
        current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)),
      );
      setSelectedPackage(updated);
      onStatusChange("품목을 출하묶음에서 제거했습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "품목 제거에 실패했습니다.");
    }
  }

  async function _deletePackage(packageId: string) {
    try {
      await api.deleteShipPackage(packageId);
      setPackages((current) => current.filter((entry) => entry.package_id !== packageId));
      if (selectedPackage?.package_id === packageId) setSelectedPackage(null);
      onStatusChange("출하묶음을 삭제했습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "출하묶음 삭제에 실패했습니다.");
    }
  }

  return {
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
    createSimplePackage: () => void _createSimplePackage(),
    addPackageItem: (id) => void _addPackageItem(id),
    renamePackage: () => void _renamePackage(),
    removePackageItem: (id) => void _removePackageItem(id),
    deletePackage: (id) => void _deletePackage(id),
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
