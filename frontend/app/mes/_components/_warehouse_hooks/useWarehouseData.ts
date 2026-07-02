"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Employee, type Item, type ProductModel } from "@/lib/api";
import { useModelsQuery } from "@/lib/queries/useModelsQuery";

const EMPTY_MODELS: ProductModel[] = [];

type Args = {
  globalSearch: string;
  onStatusChange: (status: string) => void;
};

export function useWarehouseData({ globalSearch, onStatusChange }: Args) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: productModels, error: modelsError } = useModelsQuery();
  useEffect(() => {
    if (!modelsError) return;
    const msg = modelsError instanceof Error ? modelsError.message : "모델 목록을 불러오지 못했습니다.";
    onStatusChange(msg);
  }, [modelsError, onStatusChange]);

  const loadData = useCallback(() => {
    setLoading(true);
    void Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
    ])
      .then(([nextEmployees, nextItems]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setLoadFailure(null);
      })
      .catch((nextError) => {
        const msg = nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.";
        setLoadFailure(msg);
        onStatusChange(msg);
      })
      .finally(() => setLoading(false));
  }, [globalSearch, onStatusChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    window.addEventListener("items", loadData);
    return () => window.removeEventListener("items", loadData);
  }, [loadData]);

  return {
    employees,
    items,
    productModels: productModels ?? EMPTY_MODELS,
    loadFailure,
    loading,
    setItems,
  };
}
