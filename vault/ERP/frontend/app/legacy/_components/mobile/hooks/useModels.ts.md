---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/useModels.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useModels.ts — useModels.ts 설명

## 이 파일은 무엇을 책임지나

`useModels.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useModels`
- `ProductModel`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/hooks/📁_hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
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
```
