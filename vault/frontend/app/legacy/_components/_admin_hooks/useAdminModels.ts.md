---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_hooks/useAdminModels.ts
status: active
updated: 2026-04-27
source_sha: 9745d236c9a3
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useAdminModels.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_hooks/useAdminModels.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `2317` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_hooks/_admin_hooks|frontend/app/legacy/_components/_admin_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// AdminModelsSection 전용 hook.

import { useState } from "react";
import type { ProductModel } from "@/lib/api";
import { api } from "@/lib/api";

export type UseAdminModelsArgs = {
  productModels: ProductModel[];
  setProductModels: (updater: (prev: ProductModel[]) => ProductModel[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
};

export type AdminModelsState = {
  productModels: ProductModel[];
  modelAddName: string;
  setModelAddName: (v: string) => void;
  modelAddSymbol: string;
  setModelAddSymbol: (v: string) => void;
  addModel: () => void;
  deleteModel: (slot: number) => void;
};

export function useAdminModels({
  productModels,
  setProductModels,
  onStatusChange,
  onError,
}: UseAdminModelsArgs): AdminModelsState {
  const [modelAddName, setModelAddName] = useState("");
  const [modelAddSymbol, setModelAddSymbol] = useState("");

  function _addModel() {
    if (!modelAddName.trim()) return;
    void api
      .createModel({ model_name: modelAddName.trim(), symbol: modelAddSymbol.trim() || undefined })
      .then((created) => {
        setProductModels((prev) => [...prev, created]);
        setModelAddName("");
        setModelAddSymbol("");
        onStatusChange(`'${created.model_name}' 모델을 추가했습니다.`);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "모델 추가 실패"));
  }

  function _deleteModel(slot: number) {
    const model = productModels.find((m) => m.slot === slot);
    if (!model) return;
    if (
      !confirm(
        `'${model.model_name}' 모델을 삭제하시겠습니까?\n이 모델을 사용하는 품목이 있으면 삭제되지 않습니다.`,
      )
    ) {
      return;
    }
    void api
      .deleteModel(slot)
      .then(() => {
        setProductModels((prev) => prev.filter((m) => m.slot !== slot));
        onStatusChange(`'${model.model_name}' 모델을 삭제했습니다.`);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "삭제 실패"));
  }

  return {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel: _addModel,
    deleteModel: _deleteModel,
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
