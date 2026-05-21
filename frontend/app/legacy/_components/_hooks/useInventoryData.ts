"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Item } from "@/lib/api";

/**
 * Inventory 페이지의 items fetch 상태 + selected item 동기화 훅.
 *
 * Round-7 (R7-HOOK2) 추출. DesktopInventoryView 의 items/loading/error
 * 상태와 loadItems 함수만 묶었다. selectedItem 은 컴포넌트 외부 (UI 상호작용)
 * 와 결합도가 높아 그대로 둔다 — 다만 setSelectedItem 호출이 필요하므로
 * 외부에서 setter 를 전달.
 *
 * fetch 타이밍은 기존과 동일 (globalSearch / onStatusChange 변화 시).
 */
export interface UseInventoryDataOptions {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onSelectedSync?: (next: Item[]) => void;
}

export interface UseInventoryDataResult {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  loading: boolean;
  error: string | null;
  loadItems: () => Promise<void>;
}

export function useInventoryData(opts: UseInventoryDataOptions): UseInventoryDataResult {
  const { globalSearch, onStatusChange, onSelectedSync } = opts;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextItems = await api.getItems({
        limit: 2000,
        search: globalSearch.trim() || undefined,
      });
      setItems(nextItems);
      // selected item 의 최신 본문 동기화는 호출자가 처리 (selectedItem 의존)
      onSelectedSync?.(nextItems);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "재고 데이터를 불러오지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setLoading(false);
    }
  }, [globalSearch, onStatusChange, onSelectedSync]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  return { items, setItems, loading, error, loadItems };
}
