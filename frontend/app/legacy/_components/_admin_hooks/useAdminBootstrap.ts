"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type BOMDetailEntry,
  type DepartmentMaster,
  type Employee,
  type Item,
  type ProductModel,
  type ShipPackage,
} from "@/lib/api";

/**
 * 관리자 화면의 5개 도메인 부트스트랩 + BOM 새로고침 훅.
 *
 * Round-8 (R8-1) 추출. DesktopAdminView 의 6 useState + 2 useEffect (exhaustive-deps
 * disable Cat-C 2건) 를 1 hook 으로 묶고 useCallback 으로 deps 정상화.
 *
 * fetch 타이밍 / API 호출 횟수 변화 0:
 *   - unlocked + globalSearch 변화 시 5 도메인 fetch (Promise.all)
 *   - unlocked 변화 시 BOM 별도 fetch
 */
export interface UseAdminBootstrapOptions {
  unlocked: boolean;
  globalSearch: string;
  onError: (message: string) => void;
}

export interface UseAdminBootstrapResult {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  packages: ShipPackage[];
  setPackages: React.Dispatch<React.SetStateAction<ShipPackage[]>>;
  productModels: ProductModel[];
  setProductModels: React.Dispatch<React.SetStateAction<ProductModel[]>>;
  departments: DepartmentMaster[];
  setDepartments: React.Dispatch<React.SetStateAction<DepartmentMaster[]>>;
  allBomRows: BOMDetailEntry[];
  setAllBomRows: React.Dispatch<React.SetStateAction<BOMDetailEntry[]>>;
  loadData: () => Promise<void>;
  refreshAllBom: () => void;
}

export function useAdminBootstrap(opts: UseAdminBootstrapOptions): UseAdminBootstrapResult {
  const { unlocked, globalSearch, onError } = opts;

  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [allBomRows, setAllBomRows] = useState<BOMDetailEntry[]>([]);
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);

  const loadData = useCallback(async () => {
    const [nextItems, nextEmployees, nextPackages, nextModels, nextDepts] = await Promise.all([
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getEmployees({ activeOnly: false }),
      api.getShipPackages(),
      api.getModels(),
      api.getDepartments(),
    ]);
    setItems(nextItems);
    setEmployees(nextEmployees);
    setPackages(nextPackages);
    setProductModels(nextModels);
    setDepartments(nextDepts);
  }, [globalSearch]);

  const refreshAllBom = useCallback(() => {
    void api.getAllBOM().then(setAllBomRows).catch(() => setAllBomRows([]));
  }, []);

  // 5 도메인 부트스트랩 — unlocked + globalSearch 변화 시
  useEffect(() => {
    if (!unlocked) return;
    void loadData().catch((nextError) =>
      onError(nextError instanceof Error ? nextError.message : "관리자 데이터를 불러오지 못했습니다."),
    );
  }, [unlocked, loadData, onError]);

  // BOM — unlocked 변화 시 별도 fetch
  useEffect(() => {
    if (!unlocked) return;
    refreshAllBom();
  }, [unlocked, refreshAllBom]);

  return {
    items, setItems,
    employees, setEmployees,
    packages, setPackages,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows, setAllBomRows,
    loadData,
    refreshAllBom,
  };
}
