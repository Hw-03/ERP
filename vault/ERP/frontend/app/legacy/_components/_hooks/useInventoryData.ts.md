---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/useInventoryData.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useInventoryData.ts — useInventoryData.ts 설명

## 이 파일은 무엇을 책임지나

`useInventoryData.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useInventoryData`
- `Item`
- `UseInventoryDataOptions`
- `UseInventoryDataResult`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
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
```
