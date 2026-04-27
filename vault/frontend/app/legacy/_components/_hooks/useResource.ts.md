---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_hooks/useResource.ts
status: active
updated: 2026-04-27
source_sha: add123b8916d
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useResource.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_hooks/useResource.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `2540` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_hooks/_hooks|frontend/app/legacy/_components/_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// 외부 라이브러리(SWR/React Query) 미도입 정책 하에서
// 로딩/에러/리트라이 모양을 통일하기 위한 자체 hook.
// 5.5-F: AbortController 옵션 추가 — fetcher 가 signal 받으면 자동 abort 처리.

import { useCallback, useEffect, useRef, useState } from "react";

export type Resource<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** 강제 재조회. 에러 후 사용자가 "다시 시도" 버튼을 누르는 경로. */
  reload: () => Promise<void>;
};

/**
 * 단일 fetcher 의 결과를 data/loading/error 모양으로 노출한다.
 * deps 가 바뀌면 재조회한다.
 *
 * fetcher 가 signal 인자를 받도록 정의하면 race 자동 처리:
 *   const inv = useResource((signal) => api.getInventorySummary({ signal }), []);
 * 받지 않아도 호환 (signal 옵셔널):
 *   const inv = useResource(() => api.getInventorySummary(), []);
 *
 * 사용 예시:
 *   const inv = useResource(() => api.getInventorySummary(), []);
 *   if (inv.loading) return <LoadingSkeleton />;
 *   if (inv.error)  return <LoadFailureCard message={inv.error} onRetry={inv.reload} />;
 *   const data = inv.data!;
 */
export function useResource<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[],
  options?: { initial?: T },
): Resource<T> {
  const [data, setData] = useState<T | undefined>(options?.initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const activeCtrlRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    activeCtrlRef.current?.abort();
    const ctrl = new AbortController();
    activeCtrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const next = await fetcherRef.current(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setData(next);
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => activeCtrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
