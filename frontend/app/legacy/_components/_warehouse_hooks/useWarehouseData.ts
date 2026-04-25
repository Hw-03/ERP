"use client";

import { useEffect, useState } from "react";
import { api, type Employee, type Item, type ProductModel, type ShipPackage } from "@/lib/api";

type Args = {
  globalSearch: string;
  onStatusChange: (status: string) => void;
};

export function useWarehouseData({ globalSearch, onStatusChange }: Args) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getModels()
      .then((models) => setProductModels(models))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "모델 목록을 불러오지 못했습니다.";
        onStatusChange(msg);
      });
  }, [onStatusChange]);

  useEffect(() => {
    void Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getShipPackages(),
    ])
      .then(([nextEmployees, nextItems, nextPackages]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setPackages(nextPackages);
        setLoadFailure(null);
        onStatusChange(`입출고 준비 완료: 직원 ${nextEmployees.length}명, 품목 ${nextItems.length}건`);
      })
      .catch((nextError) => {
        const msg = nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.";
        setLoadFailure(msg);
        onStatusChange(msg);
      });
  }, [globalSearch, onStatusChange]);

  return {
    employees,
    items,
    packages,
    productModels,
    loadFailure,
    setItems,
  };
}
