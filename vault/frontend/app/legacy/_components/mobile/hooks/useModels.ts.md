---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/hooks/useModels.ts
status: active
updated: 2026-04-27
source_sha: 4af0fca61f81
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useModels.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/hooks/useModels.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `1044` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/hooks/hooks|frontend/app/legacy/_components/mobile/hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ProductModel } from "@/lib/api";

export function useModels() {
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getModels()
      .then((data) => {
        if (!cancelled) {
          setModels(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "모델을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refetch();
    return cleanup;
  }, [refetch]);

  return { models, loading, error, refetch };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
