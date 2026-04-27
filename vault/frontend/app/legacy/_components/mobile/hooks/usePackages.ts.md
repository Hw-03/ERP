---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/hooks/usePackages.ts
status: active
updated: 2026-04-27
source_sha: 3662eba5ed5e
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# usePackages.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/hooks/usePackages.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `836` bytes

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
import { api, type ShipPackage } from "@/lib/api";

export function usePackages() {
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    return api
      .getShipPackages()
      .then((data) => {
        setPackages(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "패키지를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { packages, loading, error, refetch };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
